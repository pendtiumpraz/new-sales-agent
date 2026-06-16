import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { poolOptOutTable, contactPointTable, marketplaceListingTable } from "@/lib/db/schema";

// Cross-pool opt-out / DSAR (doc 41 §7). A platform-wide do-not-contact list that
// every tenant honors — uses raw `db` (cross-tenant), like lib/auth.

function normalize(value: string): string {
  const v = value.trim();
  return v.includes("@") ? v.toLowerCase() : v.replace(/[^\d+]/g, ""); // email lower, phone digits
}

export async function isPoolOptedOut(value: string): Promise<boolean> {
  const [row] = await db.select().from(poolOptOutTable).where(eq(poolOptOutTable.value, normalize(value))).limit(1);
  return Boolean(row);
}

// Which of these values are opted out (batch — for publish checks).
export async function filterOptedOut(values: string[]): Promise<Set<string>> {
  const norm = [...new Set(values.map(normalize).filter(Boolean))];
  if (!norm.length) return new Set();
  const rows = await db.select({ value: poolOptOutTable.value }).from(poolOptOutTable).where(inArray(poolOptOutTable.value, norm));
  return new Set(rows.map((r) => r.value));
}

export interface OptOutResult {
  value: string;
  flaggedContacts: number; // contact_points marked opted_out (all tenants)
  delistedListings: number; // marketplace listings pulled
}

// Record an opt-out and PROPAGATE it across the whole platform:
//  1) add to the registry, 2) flag every matching contact_point (any tenant)
//  as opted_out, 3) delist any marketplace listing for the affected people.
export async function recordPoolOptOut(value: string, channel?: string | null, reason = "opt_out"): Promise<OptOutResult> {
  const norm = normalize(value);
  if (!norm) return { value: "", flaggedContacts: 0, delistedListings: 0 };

  await db
    .insert(poolOptOutTable)
    .values({ value: norm, channel: channel ?? null, reason })
    .onConflictDoUpdate({ target: poolOptOutTable.value, set: { reason, channel: channel ?? null, at: new Date() } });

  // Matching contact points across ALL tenants (case-insensitive on value).
  const matches = await db
    .select()
    .from(contactPointTable)
    .where(sql`lower(${contactPointTable.value}) = ${norm} OR regexp_replace(${contactPointTable.value}, '[^0-9+]', '', 'g') = ${norm}`);

  let flaggedContacts = 0;
  const personOwnerIds = new Set<string>();
  for (const cp of matches) {
    await db
      .update(contactPointTable)
      .set({ consentStatus: "opted_out", updatedAt: new Date() })
      .where(eq(contactPointTable.id, cp.id));
    flaggedContacts++;
    if (cp.ownerType === "person") personOwnerIds.add(cp.ownerId);
  }

  // Delist any marketplace listing for those people (can't sell an opted-out person).
  let delistedListings = 0;
  if (personOwnerIds.size) {
    const res = await db
      .update(marketplaceListingTable)
      .set({ status: "delisted" })
      .where(and(eq(marketplaceListingTable.entityType, "person"), inArray(marketplaceListingTable.entityId, [...personOwnerIds])))
      .returning({ id: marketplaceListingTable.id });
    delistedListings = res.length;
  }

  return { value: norm, flaggedContacts, delistedListings };
}

export async function poolOptOutCount(): Promise<number> {
  const rows = await db.select({ value: poolOptOutTable.value }).from(poolOptOutTable);
  return rows.length;
}
