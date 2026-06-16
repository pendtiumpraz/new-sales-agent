import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { marketplaceListingTable, companyTable, personTable, contactPointTable } from "@/lib/db/schema";
import { stableId, companyDedupKey, personDedupKey, contactPointDedupKey } from "@/lib/profiling/dedup";
import { SHAREABLE_CONSENT } from "@/lib/platform/settings";
import { filterOptedOut } from "@/lib/compliance/pool-optout";
import type { TenantContext } from "@/lib/db/tenant-context";

// Cross-tenant marketplace store (doc 41 §6). Cross-tenant reads use the raw
// `db` (like lib/auth); writes into the buyer's tenant go through dedup ids.

export type Listing = typeof marketplaceListingTable.$inferSelect;

export async function browse(tenantId: string, type?: string): Promise<Listing[]> {
  const rows = await db
    .select()
    .from(marketplaceListingTable)
    .where(and(eq(marketplaceListingTable.status, "active"), ne(marketplaceListingTable.sellerTenantId, tenantId)));
  return type === "company" || type === "person" ? rows.filter((r) => r.entityType === type) : rows;
}

export async function mine(tenantId: string): Promise<Listing[]> {
  return db.select().from(marketplaceListingTable).where(eq(marketplaceListingTable.sellerTenantId, tenantId));
}

export class MarketplaceError extends Error {
  constructor(public code: string, msg: string) {
    super(msg);
  }
}

export async function publish(
  ctx: TenantContext,
  input: { entityType: "company" | "person"; entityId: string; priceIdr?: number },
): Promise<Listing> {
  const T = ctx.tenantId;
  let title = "";
  let summary: string | null = null;
  let consentStatus: string | null = null;

  if (input.entityType === "company") {
    const [co] = await db
      .select()
      .from(companyTable)
      .where(and(eq(companyTable.id, input.entityId), eq(companyTable.tenantId, T)))
      .limit(1);
    if (!co) throw new MarketplaceError("not_found", "Perusahaan tidak ditemukan di tenant Anda");
    title = co.name;
    summary = [co.industry, co.domain].filter(Boolean).join(" · ") || null;
  } else {
    const [pe] = await db
      .select()
      .from(personTable)
      .where(and(eq(personTable.id, input.entityId), eq(personTable.tenantId, T)))
      .limit(1);
    if (!pe) throw new MarketplaceError("not_found", "Orang tidak ditemukan di tenant Anda");
    // Consent gate (UU PDP): only opted_in / legitimate_interest persons may be listed.
    const cps = await db
      .select()
      .from(contactPointTable)
      .where(and(eq(contactPointTable.ownerType, "person"), eq(contactPointTable.ownerId, input.entityId), eq(contactPointTable.tenantId, T)));
    const consent = cps.find((c) => SHAREABLE_CONSENT.includes(c.consentStatus ?? ""));
    if (!consent) {
      throw new MarketplaceError("no_consent", "Data orang hanya bisa dijual jika ada consent (opt-in/legitimate interest)");
    }
    // Cross-pool opt-out/DSAR (doc 41 §7): never re-list someone who opted out.
    const optedOut = await filterOptedOut(cps.map((c) => c.value));
    if (optedOut.size) {
      throw new MarketplaceError("opted_out", "Orang ini sudah opt-out/DSAR — tidak boleh dijual di pool");
    }
    consentStatus = consent.consentStatus;
    title = pe.fullName;
    summary = [pe.title, pe.location].filter(Boolean).join(" · ") || null;
  }

  const id = "mkt_" + crypto.randomUUID();
  await db.insert(marketplaceListingTable).values({
    id,
    sellerTenantId: T,
    entityType: input.entityType,
    entityId: input.entityId,
    title,
    summary,
    priceIdr: input.priceIdr ?? 0,
    consentStatus,
  });
  const [row] = await db.select().from(marketplaceListingTable).where(eq(marketplaceListingTable.id, id)).limit(1);
  return row;
}

// Copy the listed entity (+ its contact points) into the buyer's tenant.
export async function acquire(buyer: TenantContext, listingId: string): Promise<{ entityType: string; name: string }> {
  const [listing] = await db.select().from(marketplaceListingTable).where(eq(marketplaceListingTable.id, listingId)).limit(1);
  if (!listing || listing.status !== "active") throw new MarketplaceError("not_found", "Listing tidak tersedia");
  if (listing.sellerTenantId === buyer.tenantId) throw new MarketplaceError("own", "Ini listing milik Anda sendiri");
  const B = buyer.tenantId;
  const S = listing.sellerTenantId;

  if (listing.entityType === "company") {
    const [co] = await db.select().from(companyTable).where(eq(companyTable.id, listing.entityId)).limit(1);
    if (!co) throw new MarketplaceError("gone", "Sumber data sudah tidak ada");
    const newId = stableId("co", companyDedupKey({ tenantId: B, name: co.name, domain: co.domain }));
    await db
      .insert(companyTable)
      .values({ ...co, id: newId, tenantId: B, source: "marketplace", updatedAt: new Date() })
      .onConflictDoUpdate({ target: companyTable.id, set: { name: co.name, updatedAt: new Date() } });
    await copyContactPoints(S, B, "company", listing.entityId, newId);
    return { entityType: "company", name: co.name };
  } else {
    const [pe] = await db.select().from(personTable).where(eq(personTable.id, listing.entityId)).limit(1);
    if (!pe) throw new MarketplaceError("gone", "Sumber data sudah tidak ada");
    const newId = stableId("pe", personDedupKey({ tenantId: B, companyId: null, fullName: pe.fullName }));
    await db
      .insert(personTable)
      .values({ ...pe, id: newId, tenantId: B, companyId: null, assignedTo: null, source: "marketplace", updatedAt: new Date() })
      .onConflictDoUpdate({ target: personTable.id, set: { fullName: pe.fullName, updatedAt: new Date() } });
    await copyContactPoints(S, B, "person", listing.entityId, newId);
    return { entityType: "person", name: pe.fullName };
  }
}

async function copyContactPoints(
  sellerTenant: string,
  buyerTenant: string,
  ownerType: "company" | "person",
  fromOwnerId: string,
  toOwnerId: string,
): Promise<void> {
  const cps = await db
    .select()
    .from(contactPointTable)
    .where(and(eq(contactPointTable.ownerType, ownerType), eq(contactPointTable.ownerId, fromOwnerId), eq(contactPointTable.tenantId, sellerTenant)));
  for (const cp of cps) {
    const id = stableId("cp", contactPointDedupKey({ tenantId: buyerTenant, ownerType, ownerId: toOwnerId, channel: cp.channel, value: cp.value }));
    await db
      .insert(contactPointTable)
      .values({ ...cp, id, tenantId: buyerTenant, ownerId: toOwnerId, source: "marketplace", updatedAt: new Date() })
      .onConflictDoNothing();
  }
}
