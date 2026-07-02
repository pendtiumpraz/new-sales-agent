import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { fail } from "@/modules/_shared/api";
import { crmService } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/contacts/export — stream the tenant's live contacts as a text/csv
// download. Columns match the IMPORT template EXACTLY so an export can be re-imported
// losslessly: full_name,segment,title,company_name,whatsapp,email,notes.
//   - ?segment=b2b|b2c|all  (also accepts the raw "unknown" segment; anything else
//                            → all). Honors the Kontak page's active segment filter.
//   - ?workspaceId=         (optional — scope to one workspace).
// company_name is resolved via the company join (same as the Kontak page: contacts
// carry only companyId). requirePermission("data.read"); capped at EXPORT_CAP rows.
const EXPORT_CAP = 5000;

// RFC-4180-ish cell: quote when the value contains a comma/quote/newline; "" escapes.
function csvCell(v: string | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");

  const sp = new URL(req.url).searchParams;
  const segRaw = (sp.get("segment") ?? "all").trim().toLowerCase();
  // "all" (or garbage) → no segment filter; b2b|b2c|unknown pass through.
  const segment = ["b2b", "b2c", "unknown"].includes(segRaw) ? segRaw : undefined;
  const workspaceId = sp.get("workspaceId")?.trim() || undefined;

  try {
    // listContacts returns ALL live contacts (no keyset cap) filtered by
    // segment/workspace; listCompanies resolves companyId → name (the join).
    const [contacts, companies] = await Promise.all([
      crmService.listContacts(g.ctx, { segment, workspaceId }),
      crmService.listCompanies(g.ctx),
    ]);
    const companyName = new Map(companies.map((c) => [c.id, c.name]));

    const header = "full_name,segment,title,company_name,whatsapp,email,notes";
    const rows = contacts.slice(0, EXPORT_CAP).map((c) =>
      [
        csvCell(c.fullName),
        csvCell(c.segment),
        csvCell(c.title),
        csvCell(c.companyId ? companyName.get(c.companyId) ?? "" : ""),
        csvCell(c.whatsapp),
        csvCell(c.email),
        // No first-class notes column — the import note is stored in `summary`.
        csvCell(c.summary),
      ].join(","),
    );
    // Leading BOM so Excel reads UTF-8 (Indonesian characters); CRLF line endings.
    const csv = "﻿" + [header, ...rows].join("\r\n") + "\r\n";

    const date = new Date().toISOString().slice(0, 10);
    const filename = `kontak-${segment ?? "all"}-${date}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Gagal mengekspor kontak", 500, "export_failed");
  }
}
