import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, ServiceError } from "@/modules/_shared/api";
import { crmService } from "@/modules/crm/service";
import { crmRepo } from "@/modules/crm/repo";
import { notificationService } from "@/modules/notification/service";

export const runtime = "nodejs";

// POST /api/contacts/import — BULK contact import (B2B & B2C). The single sink the
// CSV upload (Kontak page) AND agents call. Best-effort per row: one bad/duplicate
// row never fails the batch. Writes go through the REBUILD path (crmService.create
// Contact + createCompany) — the SAME graph Kontak / workspaces read, dedup-aware.
// requirePermission("data.write"); envelope { ok, data }.
//
// Body: { workspaceId?, contacts: [{ fullName, segment?, title?, companyName?,
//   whatsapp?, email?, notes? }] } — capped at 1000 rows/request.
// Response data: { created, skipped, errors: [{ row, reason }] }.
//   - skipped  = rows with an empty full_name OR a dedup hit (live contact already
//                has the same whatsapp/phone OR email) → idempotent-ish re-runs.
//   - errors   = rows that threw unexpectedly (row is the 0-based contacts[] index).

const MAX_ROWS = 1000;

// Lenient row schema: every field optional (best-effort per row). fullName is
// validated/skipped in the loop, and segment is coerced there — a single messy
// cell must NOT 400 the whole batch.
const rowSchema = z.object({
  fullName: z.string().optional(),
  segment: z.string().optional(),
  title: z.string().optional(),
  companyName: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

const bodySchema = z.object({
  workspaceId: z.string().optional(),
  contacts: z.array(rowSchema).max(MAX_ROWS),
});

interface ImportError {
  row: number;
  reason: string;
}

export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");

  return handle(async () => {
    const raw = (await req.json().catch(() => null)) as unknown;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const contacts = (raw as { contacts?: unknown } | null)?.contacts;
      if (Array.isArray(contacts) && contacts.length > MAX_ROWS) {
        return fail(
          `Maksimal ${MAX_ROWS} kontak per permintaan — pecah jadi beberapa batch.`,
          400,
          "too_many",
        );
      }
      return fail("Body tidak valid — kirim { contacts: [ { fullName, … } ] }.", 400, "validation");
    }
    const { workspaceId, contacts } = parsed.data;
    const ctx = g.ctx;

    // Batch-level integrity: an invalid workspaceId fails the whole request once
    // (cleaner than erroring every row). createContact re-checks per row too.
    if (workspaceId) await crmService.assertWorkspace(ctx, workspaceId);

    // Cache company id per normalized name so N rows in one company do a single
    // lookup/create (and dedup within the batch). Reuses the SAME dedup/create the
    // enrichment ingest uses: findCompanyByDomainOrName → createCompany.
    const companyCache = new Map<string, string>();
    async function resolveCompanyId(name: string): Promise<string> {
      const key = name.toLowerCase();
      const cached = companyCache.get(key);
      if (cached) return cached;
      const existing = await crmRepo.findCompanyByDomainOrName(ctx, null, name);
      const id = existing
        ? existing.id
        : (await crmService.createCompany(ctx, { name, source: "import" })).id;
      companyCache.set(key, id);
      return id;
    }

    let created = 0;
    let skipped = 0;
    const errors: ImportError[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const r = contacts[i];
      const fullName = r.fullName?.trim();
      if (!fullName) {
        skipped++; // empty full_name → intentional skip
        continue;
      }
      try {
        const whatsapp = r.whatsapp?.trim() || null;
        const email = r.email?.trim() || null;

        // Dedup: skip when a live contact already has this whatsapp/phone OR email.
        // (findContactByPhoneOrEmail matches `phone` against both phone & whatsapp
        // columns, so passing whatsapp as `phone` covers WA-only contacts too.)
        if (whatsapp || email) {
          const dup = await crmService.findContactByPhoneOrEmail(ctx, { phone: whatsapp, email });
          if (dup) {
            skipped++;
            continue;
          }
        }

        // Upsert/link the company when a name is given (reuse existing dedup).
        const companyName = r.companyName?.trim();
        const companyId = companyName ? await resolveCompanyId(companyName) : null;

        // Coerce segment → b2b|b2c|unknown (default unknown); never fail on garbage.
        const seg = r.segment?.trim().toLowerCase();
        const segment = seg === "b2b" || seg === "b2c" ? seg : "unknown";

        await crmService.createContact(ctx, {
          fullName,
          segment,
          title: r.title?.trim() || null,
          companyId,
          whatsapp,
          email,
          // No first-class `notes` column on contact — persist the import note in
          // the free-text `summary` field so it isn't lost.
          summary: r.notes?.trim() || null,
          workspaceId: workspaceId ?? null,
          source: "import",
        });
        created++;
      } catch (err) {
        errors.push({
          row: i,
          reason: err instanceof ServiceError ? err.message : "Gagal membuat kontak",
        });
      }
    }

    // Best-effort notification (never throws) on a successful import.
    if (created > 0) {
      await notificationService.emit(ctx, {
        type: "lead",
        title: `${created} kontak diimpor`,
        body: skipped > 0 ? `${created} dibuat, ${skipped} dilewati.` : `${created} kontak baru masuk.`,
        link: "/contacts",
        meta: { created, skipped, errors: errors.length },
      });
    }

    return ok({ created, skipped, errors });
  }, "api/contacts/import POST");
}
