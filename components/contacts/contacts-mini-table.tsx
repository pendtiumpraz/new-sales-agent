// Read-only contacts mini-table — an embeddable variant of the full Contacts
// table (app/(app)/contacts/page.tsx) for surfaces that just need to SHOW
// contacts consistently (e.g. Workspace › Kontak tab). Same avatar+name, segment
// badge, fit score, enrichment + source cells (shared via ./contact-cells), so it
// looks identical to the main page — minus per-row admin actions (enrich/delete/
// drawer), which live on the full Contacts page. Link there for management.

import { Building2 } from "lucide-react";

import {
  ContactAvatar,
  EnrichmentChip,
  FitCell,
  SegmentBadge,
  SourceBadge,
} from "./contact-cells";

/** The subset of a CRM contact this table needs. `/api/contacts` returns a
 *  superset, so a full ContactRow is structurally assignable to this. */
export interface MiniContact {
  id: string;
  companyId: string | null;
  fullName: string;
  title: string | null;
  segment: string; // b2c | b2b | unknown
  enrichmentStatus: string; // none | pending | enriched | failed
  fitScore: number | null; // 0..1
  source: string | null;
}

export function ContactsMiniTable({
  contacts,
  companyName,
}: {
  contacts: MiniContact[];
  /** Resolve a contact's companyId → company name (contacts only carry the id). */
  companyName?: (companyId: string | null) => string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-semibold">Nama</th>
            <th className="px-3 py-3 font-semibold">Perusahaan</th>
            <th className="px-3 py-3 font-semibold">Segment</th>
            <th className="w-40 px-3 py-3 font-semibold">Skor Fit</th>
            <th className="px-3 py-3 font-semibold">Status Enrichment</th>
            <th className="px-3 py-3 font-semibold">Sumber</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {contacts.map((c) => {
            const company = companyName?.(c.companyId) ?? null;
            return (
              <tr key={c.id} className="transition-colors hover:bg-muted/40">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <ContactAvatar name={c.fullName} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{c.fullName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.title || "Perorangan"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">
                  {company ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/80">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{company}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      — <span className="text-[11px]">(perorangan)</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <SegmentBadge segment={c.segment} />
                </td>
                <td className="px-3 py-3">
                  <FitCell score={c.fitScore} />
                </td>
                <td className="px-3 py-3">
                  <EnrichmentChip status={c.enrichmentStatus} />
                </td>
                <td className="px-3 py-3">
                  <SourceBadge source={c.source} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
