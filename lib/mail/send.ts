import { and, eq, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { sendJobTable, sendingAccountTable } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/ai/crypto";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { sendViaSmtp, type SmtpConfig } from "./smtp";
import { isSuppressed } from "./suppression";

// DB-backed send queue (doc 23). Dispatch is intentionally abstracted here so it
// can move to Inngest later (doc 28) without touching callers — for now a
// process-on-demand worker. SMTP only in slice 1; OAuth/ESP adapters come later.

export async function enqueueSend(
  ctx: TenantContext,
  opts: { sendingAccountId: string; toEmail: string; subject: string; body: string; feature?: string },
): Promise<string> {
  const id = "send_" + crypto.randomUUID();
  await withTenant(ctx, (tx) =>
    tx.insert(sendJobTable).values({
      id,
      tenantId: ctx.tenantId,
      sendingAccountId: opts.sendingAccountId,
      toEmail: opts.toEmail.trim().toLowerCase(),
      subject: opts.subject,
      body: opts.body,
      feature: opts.feature ?? "manual",
    }),
  );
  return id;
}

function unsubscribeFooter(tenantId: string, email: string): string {
  const base = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const url = `${base}/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(tenantId)}`;
  return `\n\n—\nBerhenti berlangganan email ini: ${url}`;
}

async function setStatus(ctx: TenantContext, id: string, status: string, error?: string) {
  await withTenant(ctx, (tx) =>
    tx.update(sendJobTable).set({ status, error: error ?? null }).where(eq(sendJobTable.id, id)),
  );
}

/**
 * Process pending send jobs: skip suppressed recipients, respect each mailbox's
 * daily cap, inject the unsubscribe footer, send via SMTP, record status.
 * SMTP I/O happens outside the DB transaction (it's slow). Returns a summary.
 */
export async function processSendJobs(ctx: TenantContext, limit = 20) {
  if (!(await isTenantActive(ctx))) {
    return { sent: 0, skipped: 0, failed: 0, picked: 0, suspended: true };
  }
  let sent = 0,
    skipped = 0,
    failed = 0;

  const jobs = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(sendJobTable)
      .where(and(eq(sendJobTable.tenantId, ctx.tenantId), eq(sendJobTable.status, "pending")))
      .limit(limit),
  );

  for (const job of jobs) {
    const info = await withTenant(ctx, async (tx) => {
      const supp = await isSuppressed(tx, ctx.tenantId, job.toEmail);
      const acc = job.sendingAccountId
        ? (await tx.select().from(sendingAccountTable).where(eq(sendingAccountTable.id, job.sendingAccountId)).limit(1))[0]
        : null;
      return { supp, acc };
    });

    if (info.supp) {
      await setStatus(ctx, job.id, "skipped", "suppressed");
      skipped++;
      continue;
    }
    if (!info.acc?.configEnc) {
      await setStatus(ctx, job.id, "failed", "no sending account / config");
      failed++;
      continue;
    }
    if (info.acc.sentToday >= info.acc.dailyLimit) {
      // Daily cap reached — leave pending for the next run.
      continue;
    }

    try {
      const cfg = JSON.parse(decryptSecret(info.acc.configEnc)) as SmtpConfig;
      const from = info.acc.fromName ? `${info.acc.fromName} <${info.acc.fromEmail}>` : info.acc.fromEmail;
      await sendViaSmtp(cfg, {
        from,
        to: job.toEmail,
        subject: job.subject,
        text: job.body + unsubscribeFooter(ctx.tenantId, job.toEmail),
      });
      await withTenant(ctx, async (tx) => {
        await tx.update(sendJobTable).set({ status: "sent", sentAt: new Date() }).where(eq(sendJobTable.id, job.id));
        await tx
          .update(sendingAccountTable)
          .set({ sentToday: sql`${sendingAccountTable.sentToday} + 1` })
          .where(eq(sendingAccountTable.id, info.acc.id));
      });
      sent++;
    } catch (err) {
      await setStatus(ctx, job.id, "failed", String(err).slice(0, 500));
      failed++;
    }
  }

  return { sent, skipped, failed, picked: jobs.length };
}
