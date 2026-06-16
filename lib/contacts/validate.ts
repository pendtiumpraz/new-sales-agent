// Email validation for imported contacts (doc 21). REAL checks, no dummy:
// 1) RFC-ish syntax, 2) disposable-domain block, 3) live MX DNS lookup (the
// domain must actually be able to receive mail). Domain MX results are cached so
// validating thousands of contacts across a few hundred domains stays fast.
// (If HUNTER_API_KEY is set, a deeper SMTP-level verify could be layered on top.)

import { resolveMx } from "node:dns/promises";
import { inArray, isNull, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { contactsTable } from "@/lib/db/schema";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
const DISPOSABLE = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
]);

const mxCache = new Map<string, boolean>();
async function domainHasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const records = await resolveMx(domain);
    ok = Array.isArray(records) && records.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

export interface ValidateSummary {
  checked: number;
  valid: number;
  invalidSyntax: number;
  invalidDomain: number;
  risky: number;
  remaining: number;
}

/** Validate one batch of still-unchecked contacts; returns counts + remaining. */
export async function validateContacts(ctx: TenantContext, limit = 300): Promise<ValidateSummary> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: contactsTable.id, email: contactsTable.email })
      .from(contactsTable)
      .where(isNull(contactsTable.emailStatus))
      .limit(limit),
  );

  const buckets: Record<string, string[]> = {
    valid: [],
    invalid_syntax: [],
    invalid_domain: [],
    risky: [],
  };

  for (const r of rows) {
    const email = (r.email ?? "").trim().toLowerCase();
    const m = email.match(EMAIL_RE);
    let status: keyof typeof buckets;
    if (!m) status = "invalid_syntax";
    else if (DISPOSABLE.has(m[1])) status = "risky";
    else if (!(await domainHasMx(m[1]))) status = "invalid_domain";
    else status = "valid";
    buckets[status].push(r.id);
  }

  const now = new Date();
  await withTenant(ctx, async (tx) => {
    for (const [status, ids] of Object.entries(buckets)) {
      if (ids.length) {
        await tx
          .update(contactsTable)
          .set({ emailStatus: status, emailCheckedAt: now })
          .where(inArray(contactsTable.id, ids));
      }
    }
  });

  const remainingRows = await withTenant(ctx, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(contactsTable)
      .where(isNull(contactsTable.emailStatus)),
  );

  return {
    checked: rows.length,
    valid: buckets.valid.length,
    invalidSyntax: buckets.invalid_syntax.length,
    invalidDomain: buckets.invalid_domain.length,
    risky: buckets.risky.length,
    remaining: remainingRows[0]?.n ?? 0,
  };
}

/** Distribution of email_status across all contacts (for the UI). */
export async function validationStats(ctx: TenantContext): Promise<Record<string, number>> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ status: contactsTable.emailStatus, n: sql<number>`count(*)::int` })
      .from(contactsTable)
      .groupBy(contactsTable.emailStatus),
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status ?? "unchecked"] = r.n;
  return out;
}
