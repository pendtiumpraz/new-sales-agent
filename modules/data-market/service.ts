import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { crmRepo } from "@/modules/crm/repo";
import { tenantRepo } from "@/modules/tenant/repo";
import { platformRepo } from "@/modules/superadmin/repo";
import { notificationService } from "@/modules/notification/service";
import type { CompanyRow } from "@/modules/crm/schema";

import { dataMarketRepo, type DataListingLite } from "./repo";
import type { DataPurchaseRow, ListingCompany } from "./schema";

/**
 * data-market service — the inter-tenant company-data marketplace brain. Routes
 * stay thin: parse → call a method → wrap in the {ok,error} envelope.
 *
 * SELLER: `createListing` snapshots the seller's OWN firmographic companies
 * (matching an industry/segment filter) into the listing at publish; `preview`
 * previews that count without writing; `pause`/`delete` manage it.
 *
 * BUYER: `browse` lists OTHER tenants' active listings; `purchase` copies the
 * listing's firmographic snapshot into the buyer's CRM (`company_v2`) with dedup.
 *
 * DESIGN NOTE — why a publish-time SNAPSHOT (not a live cross-tenant read):
 *   The buyer is NOT a superadmin, so it must NOT mint an RLS-bypass context to
 *   read the seller's live `company_v2` (see modules/superadmin targetCtx: an
 *   RLS-bypass token may only come from a proven-superadmin caller). Instead the
 *   seller's firmographic rows are snapshotted onto the (cross-tenant-readable)
 *   listing at publish; purchase copies from that snapshot under the BUYER's own
 *   `withTenant`. Consequence: a listing is point-in-time — companies the seller
 *   crawls AFTER publishing are not included until it re-publishes. That is the
 *   correct "you buy the advertised dataset" semantics and needs zero RLS bypass.
 *
 * COMPLIANCE: only firmographic COMPANY fields are ever snapshotted / copied. No
 * `contact` / personal data crosses tenants (`segment` uses contacts only to
 * SELECT which companies match — it never transfers them).
 */

const SEGMENTS = ["all", "b2b", "b2c"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface ListingFilterInput {
  industryKey?: string | null;
  segment?: string | null;
}
export interface CreateListingInput extends ListingFilterInput {
  title: string;
  description?: string | null;
  price?: number;
}

// ── browse / row view shapes ─────────────────────────────────────────────────
/** A shelf listing enriched with the seller tenant's display name. */
export interface BrowseListing extends DataListingLite {
  sellerName: string;
}
export interface PreviewResult {
  companyCount: number;
  sample: string[];
}
export interface PurchaseResult {
  purchase: DataPurchaseRow;
  companyCount: number;
  importedCount: number;
  skippedCount: number;
}
export interface DataMarketStats {
  activeListings: number;
  companiesSold: number;
  myPurchases: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function normSegment(v: string | null | undefined): "all" | "b2b" | "b2c" {
  const s = (v ?? "all").toLowerCase();
  return (SEGMENTS as readonly string[]).includes(s) ? (s as "all" | "b2b" | "b2c") : "all";
}

function normDomain(d: string | null | undefined): string {
  return (d ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
function normName(n: string | null | undefined): string {
  return (n ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** FIRMOGRAPHIC projection — the ONLY fields that ever leave a tenant. */
function toListingCompany(c: CompanyRow): ListingCompany {
  return {
    name: c.name,
    domain: c.domain ?? null,
    industry: c.industry ?? null,
    industryId: c.industryId ?? null,
    size: c.size ?? null,
    hqCountry: c.hqCountry ?? null,
    hqCity: c.hqCity ?? null,
    website: c.website ?? null,
    summary: c.summary ?? null,
    techStack: c.techStack ?? [],
    socials: c.socials ?? null,
  };
}

export const dataMarketService = {
  // ═══════════════════════ seller: build / preview snapshot ═══════════

  /**
   * Resolve the seller's OWN live companies matching an industry/segment filter.
   * `segment` (b2b|b2c) selects companies that have ≥1 live contact of that
   * segment — contacts are used ONLY to pick companies, never transferred.
   */
  async matchCompanies(ctx: TenantContext, filter: ListingFilterInput): Promise<CompanyRow[]> {
    const industryKey = filter.industryKey?.trim() || null;
    const segment = normSegment(filter.segment);

    let companies = await crmRepo.listCompanies(ctx);

    if (industryKey) {
      const key = industryKey.toLowerCase();
      companies = companies.filter(
        (c) => c.industryId === industryKey || (c.industry ?? "").toLowerCase() === key,
      );
    }

    if (segment !== "all") {
      const contacts = await crmRepo.listContacts(ctx, { segment });
      const withSegment = new Set(contacts.map((k) => k.companyId).filter(Boolean) as string[]);
      companies = companies.filter((c) => withSegment.has(c.id));
    }

    return companies;
  },

  async preview(ctx: TenantContext, filter: ListingFilterInput): Promise<PreviewResult> {
    const matched = await this.matchCompanies(ctx, filter);
    return { companyCount: matched.length, sample: matched.slice(0, 3).map((c) => c.name) };
  },

  async createListing(ctx: TenantContext, input: CreateListingInput): Promise<DataListingLite> {
    const title = input.title?.trim();
    if (!title) throw new ServiceError("Judul listing wajib diisi", 400, "validation");
    const price = input.price ?? 0;
    if (!Number.isFinite(price) || price < 0) {
      throw new ServiceError("Harga tidak valid", 400, "validation");
    }
    const industryKey = input.industryKey?.trim() || null;
    const segment = normSegment(input.segment);

    const matched = await this.matchCompanies(ctx, { industryKey, segment });
    if (matched.length === 0) {
      throw new ServiceError(
        "Tidak ada perusahaan yang cocok dengan filter ini — sesuaikan filter atau tambah data dulu",
        400,
        "empty_filter",
      );
    }

    const companies = matched.map(toListingCompany);
    const row = await dataMarketRepo.insertListing(ctx, {
      id: "dlst_" + crypto.randomUUID(),
      sellerTenantId: ctx.tenantId,
      title,
      description: input.description?.trim() || null,
      industryKey,
      segment,
      companyCount: companies.length,
      price,
      sample: companies.slice(0, 3).map((c) => c.name),
      companies,
      status: "active",
      createdBy: ctx.userId,
    });
    await this.audit(ctx.tenantId, ctx.userId, "data_market.listing.create", row.id, {
      title,
      companyCount: companies.length,
      price,
      segment,
      industryKey,
    });
    return row;
  },

  // ═══════════════════════ seller: manage listings ════════════════════
  async listMyListings(ctx: TenantContext): Promise<DataListingLite[]> {
    return dataMarketRepo.listMyListings(ctx);
  },

  async listMyTrashed(ctx: TenantContext): Promise<DataListingLite[]> {
    return dataMarketRepo.listMyTrashed(ctx);
  },

  /** Pause (active→paused) or resume (paused→active) one of MY listings. */
  async setStatus(ctx: TenantContext, id: string, status: string): Promise<DataListingLite> {
    if (status !== "active" && status !== "paused") {
      throw new ServiceError("Status harus 'active' atau 'paused'", 400, "validation");
    }
    const row = await dataMarketRepo.setListingStatus(ctx, id, status);
    if (!row) throw new ServiceError("Listing tidak ditemukan", 404, "not_found");
    await this.audit(ctx.tenantId, ctx.userId, "data_market.listing.status", id, { status });
    return row;
  },

  async softDeleteListing(ctx: TenantContext, id: string): Promise<void> {
    const ok = await dataMarketRepo.softDeleteListing(ctx, id);
    if (!ok) throw new ServiceError("Listing tidak ditemukan", 404, "not_found");
    await this.audit(ctx.tenantId, ctx.userId, "data_market.listing.delete", id);
  },

  async restoreListing(ctx: TenantContext, id: string): Promise<void> {
    const ok = await dataMarketRepo.restoreListing(ctx, id);
    if (!ok) throw new ServiceError("Listing tidak ada di sampah", 404, "not_found");
    await this.audit(ctx.tenantId, ctx.userId, "data_market.listing.restore", id);
  },

  async hardDeleteListing(ctx: TenantContext, id: string): Promise<void> {
    const ok = await dataMarketRepo.hardDeleteListing(ctx, id);
    if (!ok) throw new ServiceError("Listing tidak ditemukan", 404, "not_found");
    await this.audit(ctx.tenantId, ctx.userId, "data_market.listing.purge", id);
  },

  // ═══════════════════════ buyer: browse + purchase ═══════════════════

  /** The cross-tenant shelf, enriched with each seller's display name. */
  async browse(ctx: TenantContext): Promise<BrowseListing[]> {
    const rows = await dataMarketRepo.browseListings(ctx);
    const names = new Map<string, string>();
    for (const id of new Set(rows.map((r) => r.sellerTenantId))) {
      const t = await tenantRepo.getTenant(id);
      names.set(id, t?.name ?? "Tenant lain");
    }
    return rows.map((r) => ({ ...r, sellerName: names.get(r.sellerTenantId) ?? "Tenant lain" }));
  },

  /**
   * PURCHASE — copy a listing's firmographic snapshot into the buyer's CRM.
   * Dedup against the buyer's existing companies by normalized domain (strong
   * key) then name, and within the snapshot itself. Records an append-only
   * `data_purchase` ledger row + audits BOTH tenants (buyer purchase, seller
   * sale).
   *
   * TODO(billing): this MVP only RECORDS `amount` on the ledger — it does not
   * charge. Wire tenant credit / Stripe here (debit buyer, credit/settle seller)
   * before this goes live with real money. See lib/billing/ + the ai meter's
   * credit model for the metering pattern.
   */
  async purchase(ctx: TenantContext, listingId: string): Promise<PurchaseResult> {
    const listing = await dataMarketRepo.getActiveListing(ctx, listingId);
    if (!listing) throw new ServiceError("Listing tidak tersedia", 404, "not_found");
    if (listing.sellerTenantId === ctx.tenantId) {
      throw new ServiceError("Ini listing milikmu sendiri", 400, "own_listing");
    }

    const snapshot = listing.companies ?? [];

    // Dedup keys from the buyer's existing live companies (one read).
    const existing = await crmRepo.listCompanies(ctx);
    const seenDomains = new Set(existing.map((c) => normDomain(c.domain)).filter(Boolean));
    const seenNames = new Set(existing.map((c) => normName(c.name)).filter(Boolean));

    let imported = 0;
    for (const c of snapshot) {
      const dom = normDomain(c.domain);
      const nm = normName(c.name);
      if (!nm) continue; // skip nameless junk
      if ((dom && seenDomains.has(dom)) || seenNames.has(nm)) continue; // dedup
      await crmRepo.insertCompany(ctx, {
        id: "cmp_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        name: c.name,
        domain: c.domain ?? null,
        industry: c.industry ?? null,
        industryId: c.industryId ?? null,
        size: c.size ?? null,
        hqCountry: c.hqCountry ?? null,
        hqCity: c.hqCity ?? null,
        website: c.website ?? null,
        summary: c.summary ?? null,
        techStack: c.techStack ?? [],
        socials: c.socials ?? null,
        status: "active",
        source: "marketplace",
      });
      if (dom) seenDomains.add(dom);
      seenNames.add(nm);
      imported++;
    }

    const purchase = await dataMarketRepo.insertPurchase(ctx, {
      id: "dpur_" + crypto.randomUUID(),
      buyerTenantId: ctx.tenantId,
      listingId: listing.id,
      sellerTenantId: listing.sellerTenantId,
      companyCount: snapshot.length,
      importedCount: imported,
      amount: listing.price,
      status: "completed",
    });

    // Audit BOTH sides (each row is written under its own tenant's RLS context).
    await this.audit(ctx.tenantId, ctx.userId, "data_market.purchase", listing.id, {
      sellerTenantId: listing.sellerTenantId,
      companyCount: snapshot.length,
      importedCount: imported,
      amount: listing.price,
    });
    await this.audit(listing.sellerTenantId, ctx.userId, "data_market.sale", listing.id, {
      buyerTenantId: ctx.tenantId,
      companyCount: snapshot.length,
      importedCount: imported,
      amount: listing.price,
    });

    // Persistent notifications for BOTH sides (each written under its own tenant's
    // RLS context, mirroring the dual audit above). Tenant-wide; best-effort.
    await notificationService.emit(ctx, {
      type: "marketplace",
      title: "Pembelian data berhasil",
      body: `${imported} perusahaan diimpor dari "${listing.title}".`,
      link: "/marketplace",
      meta: { listingId: listing.id, importedCount: imported, amount: listing.price },
    });
    await notificationService.emit(
      { tenantId: listing.sellerTenantId, userId: ctx.userId, role: "member" },
      {
        type: "marketplace",
        title: "Data Anda terjual",
        body: `Listing "${listing.title}" dibeli (${snapshot.length} perusahaan).`,
        link: "/marketplace",
        meta: { listingId: listing.id, companyCount: snapshot.length, amount: listing.price },
      },
    );

    return {
      purchase,
      companyCount: snapshot.length,
      importedCount: imported,
      skippedCount: snapshot.length - imported,
    };
  },

  async listMyPurchases(ctx: TenantContext): Promise<DataPurchaseRow[]> {
    return dataMarketRepo.listMyPurchases(ctx);
  },

  async stats(ctx: TenantContext): Promise<DataMarketStats> {
    const [activeListings, companiesSold, myPurchases] = await Promise.all([
      dataMarketRepo.countMyActiveListings(ctx),
      dataMarketRepo.sumCompaniesSold(ctx),
      dataMarketRepo.countMyPurchases(ctx),
    ]);
    return { activeListings, companiesSold, myPurchases };
  },

  // ═══════════════════════ internal ═══════════════════════════════════
  /** Tenant-scoped audit row (written under the given tenant's context). */
  async audit(
    tenantId: string,
    actorUserId: string,
    action: string,
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId,
      actorUserId,
      action,
      targetType: "data_listing",
      targetId,
      meta: meta ?? null,
    });
  },
};
