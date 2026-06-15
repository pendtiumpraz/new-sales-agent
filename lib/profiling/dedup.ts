// Identity resolution / dedup (Fase 2, doc 20). Pure helpers used by the ingest
// pipeline (doc 21) to avoid duplicate companies/people/contact points across
// crawl sources. Per-tenant keys.
import type { Company, ContactPoint, Person } from "@/lib/types/profiling";

/** Strip scheme, path, query and leading www. → bare host, lowercased. */
export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
  return s || null;
}

/** Collapse whitespace + lowercase for fuzzy name matching. */
export function normalizeName(input?: string | null): string {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Phone/WhatsApp → digits (+ leading plus); others → lowercased/trimmed. */
export function normalizeContactValue(channel: string, value: string): string {
  const v = (value ?? "").trim().toLowerCase();
  if (channel === "phone" || channel === "whatsapp") return v.replace(/[^\d+]/g, "");
  return v;
}

/** Company identity: domain when present, else fuzzy name. Scoped per tenant. */
export function companyDedupKey(
  c: Pick<Company, "tenantId" | "domain" | "name">,
): string {
  const d = normalizeDomain(c.domain);
  return `${c.tenantId}:${d ? `domain:${d}` : `name:${normalizeName(c.name)}`}`;
}

/** Person identity: company + normalized name. Scoped per tenant. */
export function personDedupKey(
  p: Pick<Person, "tenantId" | "companyId" | "fullName">,
): string {
  return `${p.tenantId}:${p.companyId ?? "_"}:${normalizeName(p.fullName)}`;
}

/** Contact point identity: owner + channel + normalized value. Scoped per tenant. */
export function contactPointDedupKey(
  cp: Pick<ContactPoint, "tenantId" | "ownerType" | "ownerId" | "channel" | "value">,
): string {
  return `${cp.tenantId}:${cp.ownerType}:${cp.ownerId}:${cp.channel}:${normalizeContactValue(cp.channel, cp.value)}`;
}
