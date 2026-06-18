import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { marketplaceListingTable, companyTable, personTable, contactPointTable } from "@/lib/db/schema";
import { stableId, companyDedupKey, personDedupKey, contactPointDedupKey } from "@/lib/profiling/dedup";
import { filterOptedOut } from "@/lib/compliance/pool-optout";
import { getDefaultPrices } from "@/lib/platform/settings";
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

// Delist (status → delisted) or re-list (→ active) one of YOUR listings (doc audit
// #6). Scoped to the seller tenant so you can only touch your own.
export async function setListingStatus(ctx: TenantContext, listingId: string, status: "active" | "delisted"): Promise<boolean> {
  const rows = await db
    .update(marketplaceListingTable)
    .set({ status })
    .where(and(eq(marketplaceListingTable.id, listingId), eq(marketplaceListingTable.sellerTenantId, ctx.tenantId)))
    .returning({ id: marketplaceListingTable.id });
  return rows.length > 0;
}

export class MarketplaceError extends Error {
  constructor(public code: string, msg: string) {
    super(msg);
  }
}

// Best consent across a person's contacts (opt-in > legit > unknown).
const CONSENT_RANK = ["opted_in", "legitimate_interest", "unknown"];
function bestConsent(cps: { consentStatus: string | null }[]): string {
  let best = "unknown";
  let rank = 99;
  for (const c of cps) {
    const i = CONSENT_RANK.indexOf(c.consentStatus ?? "unknown");
    if (i >= 0 && i < rank) {
      rank = i;
      best = c.consentStatus ?? "unknown";
    }
  }
  return best;
}
function channelsOf(cps: { channel: string }[]): string[] {
  return [...new Set(cps.map((c) => c.channel))];
}

interface PublishInput {
  entityType: "company" | "person";
  entityIds: string[]; // one or many (bulk)
  category?: string | null;
  priceIdr?: number;
}
export interface PublishResult {
  published: number;
  skipped: { id: string; reason: string }[];
}

export async function publishMany(ctx: TenantContext, input: PublishInput): Promise<PublishResult> {
  const T = ctx.tenantId;
  const out: PublishResult = { published: 0, skipped: [] };
  const defaults = await getDefaultPrices();
  const price = input.priceIdr ?? (input.entityType === "company" ? defaults.company : defaults.person);

  for (const entityId of input.entityIds) {
    try {
      let title = "";
      let summary: string | null = null;
      let consentStatus: string | null = null;
      let category = input.category?.trim() || null;
      let channels: string[] = [];

      if (input.entityType === "company") {
        const [co] = await db
          .select()
          .from(companyTable)
          .where(and(eq(companyTable.id, entityId), eq(companyTable.tenantId, T)))
          .limit(1);
        if (!co) { out.skipped.push({ id: entityId, reason: "tak ditemukan" }); continue; }
        const cps = await db
          .select()
          .from(contactPointTable)
          .where(and(eq(contactPointTable.ownerType, "company"), eq(contactPointTable.ownerId, entityId), eq(contactPointTable.tenantId, T)));
        // Company listing = nama PT + website + email + HP (doc: "kalo perusahaan...")
        channels = channelsOf(cps);
        if (co.domain || co.sourceUrl) channels = [...new Set([...channels, "website"])];
        title = co.name;
        summary = [co.industry, co.domain ?? (co.sourceUrl || null)].filter(Boolean).join(" · ") || null;
        category = category || co.industry || null;
      } else {
        const [pe] = await db
          .select()
          .from(personTable)
          .where(and(eq(personTable.id, entityId), eq(personTable.tenantId, T)))
          .limit(1);
        if (!pe) { out.skipped.push({ id: entityId, reason: "tak ditemukan" }); continue; }
        const cps = await db
          .select()
          .from(contactPointTable)
          .where(and(eq(contactPointTable.ownerType, "person"), eq(contactPointTable.ownerId, entityId), eq(contactPointTable.tenantId, T)));
        // Hard block: opted-out (explicit or cross-pool). Otherwise allow with consent shown.
        if (cps.some((c) => c.consentStatus === "opted_out")) { out.skipped.push({ id: entityId, reason: "opted-out" }); continue; }
        const optedOut = await filterOptedOut(cps.map((c) => c.value));
        if (optedOut.size) { out.skipped.push({ id: entityId, reason: "opt-out lintas pool" }); continue; }
        consentStatus = bestConsent(cps);
        channels = channelsOf(cps); // sosmed + WA + email (doc: "link sosmed dan WA + email")
        if (pe.linkedinUrl) channels = [...new Set([...channels, "linkedin"])];
        if (pe.socials && Object.keys(pe.socials).length) channels = [...new Set([...channels, ...Object.keys(pe.socials)])];
        title = pe.fullName;
        summary = [pe.title, pe.location].filter(Boolean).join(" · ") || null;
        category = category || pe.title || (pe.leadType === "b2b_partner" ? "B2B Partner" : pe.leadType === "b2c_customer" ? "B2C Customer" : null);
      }

      // Deterministic id per (seller, entityType, entity) → re-publishing the same
      // entity refreshes the existing listing instead of flooding duplicates.
      const id = stableId("mkt", `${T}:${input.entityType}:${entityId}`);
      await db
        .insert(marketplaceListingTable)
        .values({
          id,
          sellerTenantId: T,
          entityType: input.entityType,
          entityId,
          title,
          summary,
          category,
          channels,
          priceIdr: price,
          consentStatus,
        })
        .onConflictDoUpdate({
          target: marketplaceListingTable.id,
          set: { title, summary, category, channels, priceIdr: price, consentStatus, status: "active" },
        });
      out.published++;
    } catch (e) {
      out.skipped.push({ id: entityId, reason: String(e) });
    }
  }
  return out;
}

// Marketplace bundle of COMPANIES (doc 41 §6). People can't be sold — bundles are
// company-only. One listing references N companies; pricing is per_bundle (total) or
// per_company (unit × size). Multi-bundle = call this many times with different names.
export interface PublishBundleInput {
  name: string;
  industry?: string | null;
  companyIds: string[];
  pricingMode: "per_bundle" | "per_company";
  unitPrice: number;
}
export async function publishBundle(ctx: TenantContext, input: PublishBundleInput): Promise<{ bundleId: string; count: number }> {
  const T = ctx.tenantId;
  const wanted = [...new Set(input.companyIds)].filter(Boolean);
  if (!wanted.length) throw new MarketplaceError("empty", "Pilih minimal satu perusahaan untuk bundle");
  // Keep only companies that actually belong to the seller tenant.
  const owned = await db.select({ id: companyTable.id }).from(companyTable).where(and(eq(companyTable.tenantId, T), inArray(companyTable.id, wanted)));
  const companyIds = owned.map((c) => c.id);
  if (!companyIds.length) throw new MarketplaceError("empty", "Tidak ada perusahaan valid milik Anda");
  const cps = await db
    .select({ channel: contactPointTable.channel })
    .from(contactPointTable)
    .where(and(eq(contactPointTable.tenantId, T), eq(contactPointTable.ownerType, "company"), inArray(contactPointTable.ownerId, companyIds)));
  const channels = [...new Set(cps.map((c) => c.channel))];
  const bundleId = stableId("mkt", `${T}:bundle:${input.name.trim().toLowerCase()}`);
  const summary = `${companyIds.length} perusahaan${input.industry ? ` · ${input.industry}` : ""}`;
  await db
    .insert(marketplaceListingTable)
    .values({
      id: bundleId,
      sellerTenantId: T,
      entityType: "bundle",
      entityId: bundleId,
      title: input.name.trim(),
      summary,
      category: input.industry?.trim() || null,
      channels,
      priceIdr: Math.max(0, Math.round(input.unitPrice || 0)),
      bundleItems: companyIds,
      pricingMode: input.pricingMode,
      consentStatus: null,
      status: "active",
    })
    .onConflictDoUpdate({
      target: marketplaceListingTable.id,
      set: { title: input.name.trim(), summary, category: input.industry?.trim() || null, channels, priceIdr: Math.max(0, Math.round(input.unitPrice || 0)), bundleItems: companyIds, pricingMode: input.pricingMode, status: "active" },
    });
  return { bundleId, count: companyIds.length };
}

// Copy ONE company (+ contact points) seller→buyer. Returns its name, or null if gone.
async function copyCompany(S: string, B: string, companyId: string): Promise<string | null> {
  const [co] = await db.select().from(companyTable).where(and(eq(companyTable.id, companyId), eq(companyTable.tenantId, S))).limit(1);
  if (!co) return null;
  const newId = stableId("co", companyDedupKey({ tenantId: B, name: co.name, domain: co.domain }));
  await db
    .insert(companyTable)
    .values({ ...co, id: newId, tenantId: B, source: "marketplace", updatedAt: new Date() })
    .onConflictDoUpdate({ target: companyTable.id, set: { name: co.name, updatedAt: new Date() } });
  await copyContactPoints(S, B, "company", companyId, newId);
  return co.name;
}

// Copy the listed entity (+ its contact points) into the buyer's tenant.
export async function acquire(buyer: TenantContext, listingId: string): Promise<{ entityType: string; name: string }> {
  const [listing] = await db.select().from(marketplaceListingTable).where(eq(marketplaceListingTable.id, listingId)).limit(1);
  if (!listing || listing.status !== "active") throw new MarketplaceError("not_found", "Listing tidak tersedia");
  if (listing.sellerTenantId === buyer.tenantId) throw new MarketplaceError("own", "Ini listing milik Anda sendiri");
  const B = buyer.tenantId;
  const S = listing.sellerTenantId;

  if (listing.entityType === "bundle") {
    const ids = (listing.bundleItems ?? []) as string[];
    let count = 0;
    for (const cid of ids) {
      if (await copyCompany(S, B, cid)) count++;
    }
    if (!count) throw new MarketplaceError("gone", "Bundle kosong / sumber sudah tidak ada");
    return { entityType: "bundle", name: `${listing.title} (${count} perusahaan)` };
  }

  if (listing.entityType === "company") {
    const name = await copyCompany(S, B, listing.entityId);
    if (!name) throw new MarketplaceError("gone", "Sumber data sudah tidak ada");
    return { entityType: "company", name };
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
