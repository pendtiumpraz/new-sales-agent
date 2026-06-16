// Cadence multi-channel processor (Fase 5 slice 2, doc 22/23).
//
// Advances `aktif` enrollments whose next step is due: personalizes the step
// content with the tenant's active AI model (metered; falls back to a
// placeholder-filled template when no model resolves or the tenant is
// suspended), then dispatches per channel. Email steps create a send_job (the
// SMTP worker actually sends them); every channel — including the not-yet-live
// ones (whatsapp/linkedin/instagram/sms/call) — is recorded in cadence_step_run
// so the pipeline is honest about what was sent vs merely scheduled.
//
// Dispatch is process-on-demand for now; the same entrypoint can be driven by
// Inngest later (doc 28) without touching callers.

import { and, desc, eq, isNull, lte, or } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  cadenceEnrollmentsTable,
  cadencesTable,
  cadenceStepRunTable,
  contactsTable,
  sendJobTable,
  sendingAccountTable,
} from "@/lib/db/schema";
import type { CadenceStep } from "@/lib/types";
import { meteredGenerateText } from "@/lib/ai/meter";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { sendWhatsApp, wahaConfigured } from "@/lib/wa/waha";
import { salutationFor } from "@/lib/profiling/salutation";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ContactLite {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}

/** Substitute the cadence placeholders ({nama}, {perusahaan}). {nama} becomes the
 *  proper greeting (Pak/Bu/Mas/Mbak + first name), not a bare name. */
function fillPlaceholders(text: string, c: ContactLite): string {
  const greeting = c.name ? salutationFor(c.name).greeting : "Kak";
  return (text ?? "")
    .replace(/(?:bapak\/ibu|bapak ?\/ ?ibu)\s*\{nama\}/gi, greeting) // collapse "Bapak/Ibu {nama}" → greeting
    .replace(/\{nama\}/gi, greeting)
    .replace(/\{perusahaan\}/gi, c.company ?? "perusahaan Anda");
}

/**
 * Personalize a step body. Prefers the tenant's active model (metered, feature
 * "cadence"); on no-model / suspended / provider error degrades to the
 * placeholder-filled template so the cadence keeps moving.
 */
async function personalize(
  ctx: TenantContext,
  step: CadenceStep,
  c: ContactLite,
): Promise<{ body: string; source: "real" | "template" }> {
  const template = fillPlaceholders(step.content, c);
  try {
    const sal = c.name ? salutationFor(c.name) : null;
    const where = c.company ? ` dari ${c.company}` : "";
    const prompt =
      `Personalisasi pesan ${step.channel} berikut untuk ${sal?.greeting ?? "prospek"}${where}. ` +
      (sal ? `Sapa dengan "${sal.greeting}". ` : "") +
      `Tulis hangat, sopan, dan ber-empati — seperti manusia yang benar-benar peduli, BUKAN robot. ` +
      `Jangan menyebut dirimu AI/asisten. Jangan ada placeholder kurung kurawal. Pertahankan maksud & ajakan (CTA). ` +
      `Bahasa Indonesia, ringkas.\n\nPesan dasar:\n${template}`;
    const { text } = await meteredGenerateText(ctx, {
      feature: "cadence",
      prompt,
      maxOutputTokens: 400,
    });
    const trimmed = (text ?? "").trim();
    if (trimmed) return { body: trimmed, source: "real" };
  } catch {
    // no active model / suspended / provider error → template fallback
  }
  return { body: template, source: "template" };
}

export interface CadenceRunSummary {
  dueEnrollments: number;
  emailQueued: number;
  waSent: number;
  otherQueued: number;
  completed: number;
  skipped: number;
  failed: number;
}

/**
 * Process all due cadence enrollments for a tenant. Idempotent per call in the
 * sense that an enrollment only advances once its step is dispatched; re-running
 * before the next step is due is a no-op for that enrollment.
 */
export async function processCadences(
  ctx: TenantContext,
  opts?: { limit?: number; now?: Date },
): Promise<CadenceRunSummary> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 50;
  const summary: CadenceRunSummary = {
    dueEnrollments: 0,
    emailQueued: 0,
    waSent: 0,
    otherQueued: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
  };

  // Kill-switch: a suspended tenant dispatches nothing.
  if (!(await isTenantActive(ctx))) return summary;

  // Due = aktif AND (nextStepDueAt IS NULL OR nextStepDueAt <= now). A null due
  // date means step 0 just enrolled and is due immediately.
  const due = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(cadenceEnrollmentsTable)
      .where(
        and(
          eq(cadenceEnrollmentsTable.status, "aktif"),
          or(
            isNull(cadenceEnrollmentsTable.nextStepDueAt),
            lte(cadenceEnrollmentsTable.nextStepDueAt, now),
          ),
        ),
      )
      .limit(limit),
  );
  summary.dueEnrollments = due.length;

  // The tenant's first sending account (email channel). Null is fine — the SMTP
  // worker fails that job gracefully ("no sending account / config").
  const accs = await withTenant(ctx, (tx) =>
    tx.select({ id: sendingAccountTable.id }).from(sendingAccountTable).limit(1),
  );
  const defaultAccId = accs[0]?.id ?? null;

  for (const enr of due) {
    try {
      const [cad] = await withTenant(ctx, (tx) =>
        tx.select().from(cadencesTable).where(eq(cadencesTable.id, enr.cadenceId)).limit(1),
      );
      // Skip enrollments whose cadence is gone, draft, or paused.
      if (!cad || cad.status !== "active") {
        summary.skipped++;
        continue;
      }
      const steps = (cad.steps ?? []) as CadenceStep[];
      const idx = enr.currentStepIdx ?? 0;
      const step = steps[idx];

      // Past the last step → mark the enrollment finished.
      if (!step) {
        await withTenant(ctx, (tx) =>
          tx
            .update(cadenceEnrollmentsTable)
            .set({ status: "selesai", lastStepAt: now, nextStepDueAt: null })
            .where(eq(cadenceEnrollmentsTable.id, enr.id)),
        );
        summary.completed++;
        continue;
      }

      const [contactRow] = await withTenant(ctx, (tx) =>
        tx.select().from(contactsTable).where(eq(contactsTable.id, enr.contactId)).limit(1),
      );
      const c: ContactLite = {
        name: contactRow?.name ?? null,
        company: contactRow?.company ?? null,
        email: contactRow?.email ?? null,
        phone: contactRow?.phone ?? null,
      };

      const { body, source } = await personalize(ctx, step, c);
      const subject = step.subject ?? cad.name;

      let status = "queued";
      let sendJobId: string | null = null;
      let error: string | null = null;

      if (step.channel === "email") {
        const toEmail = (c.email ?? "").trim().toLowerCase();
        if (!toEmail) {
          status = "skipped";
          error = "kontak tanpa email";
          summary.skipped++;
        } else {
          sendJobId = "send_" + crypto.randomUUID();
          await withTenant(ctx, (tx) =>
            tx.insert(sendJobTable).values({
              id: sendJobId as string,
              tenantId: ctx.tenantId,
              sendingAccountId: defaultAccId,
              toEmail,
              subject,
              body,
              feature: "cadence",
            }),
          );
          summary.emailQueued++;
        }
      } else if (step.channel === "whatsapp" && wahaConfigured()) {
        // Live WhatsApp via WAHA (doc 34) — send now, record the outcome.
        if (!c.phone) {
          status = "skipped";
          error = "kontak tanpa nomor WhatsApp";
          summary.skipped++;
        } else {
          try {
            await sendWhatsApp({ to: c.phone, text: body });
            status = "sent";
            summary.waSent++;
          } catch (e) {
            status = "failed";
            error = String(e).slice(0, 300);
            summary.failed++;
          }
        }
      } else {
        // Other non-email channels (or WA not configured) — queue + log; their
        // live integrations (LinkedIn/IG/SMS/call) remain cred-blocked.
        summary.otherQueued++;
      }

      await withTenant(ctx, (tx) =>
        tx.insert(cadenceStepRunTable).values({
          id: "csr_" + crypto.randomUUID(),
          tenantId: ctx.tenantId,
          enrollmentId: enr.id,
          cadenceId: enr.cadenceId,
          contactId: enr.contactId,
          stepIdx: idx,
          channel: step.channel,
          subject,
          body,
          status,
          sendJobId,
          aiSource: source,
          error,
        }),
      );

      // Advance the enrollment to the next step (or finish it).
      const nextIdx = idx + 1;
      if (nextIdx >= steps.length) {
        await withTenant(ctx, (tx) =>
          tx
            .update(cadenceEnrollmentsTable)
            .set({ status: "selesai", lastStepAt: now, nextStepDueAt: null })
            .where(eq(cadenceEnrollmentsTable.id, enr.id)),
        );
        summary.completed++;
      } else {
        const delayDays = Math.max(0, steps[nextIdx].delayDays ?? 0);
        const nextDue = new Date(now.getTime() + delayDays * DAY_MS);
        await withTenant(ctx, (tx) =>
          tx
            .update(cadenceEnrollmentsTable)
            .set({ currentStepIdx: nextIdx, lastStepAt: now, nextStepDueAt: nextDue })
            .where(eq(cadenceEnrollmentsTable.id, enr.id)),
        );
      }
    } catch (err) {
      console.error("[cadence] enrollment failed", enr.id, err);
      summary.failed++;
    }
  }

  return summary;
}

/** Recent step-run rows for the dashboard / API (newest first). */
export async function recentStepRuns(ctx: TenantContext, limit = 50) {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(cadenceStepRunTable)
      .orderBy(desc(cadenceStepRunTable.createdAt))
      .limit(limit),
  );
}
