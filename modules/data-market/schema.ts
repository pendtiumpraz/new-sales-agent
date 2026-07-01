import { pgTable, text, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * data-market domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: the INTER-TENANT COMPANY-DATA MARKETPLACE ("Jual-beli data perusahaan
 * antar-tenant"). A tenant packages the FIRMOGRAPHIC company data it crawled into
 * its CRM graph (`company_v2`) as a LISTING; another tenant buys the listing and
 * the companies are imported into ITS OWN CRM graph. This closes the loop with the
 * AI crawl → AI CRM engine. Owns two tables:
 *   - `data_listing`  — a dataset a SELLER puts on the public shelf: a filter
 *                       (`industry_key` / `segment`) snapshotted at publish into a
 *                       `company_count`, a names-only `sample` (2-3), and the FULL
 *                       firmographic `companies` payload (the deliverable). A flat
 *                       IDR `price`, a `status` (active|paused|sold).
 *   - `data_purchase` — an APPEND-ONLY ledger row: a BUYER bought a listing; how
 *                       many companies it snapshotted vs actually `imported_count`
 *                       (after dedup), and the `amount` recorded (MVP: no real
 *                       payment — see service TODO).
 *
 * COMPLIANCE (UU PDP / GDPR): ONLY company-level (firmographic) rows are ever
 * listed or transferred. No `contact` / personal data is snapshotted, sold, or
 * copied — the `companies` payload carries firmographic fields only.
 *
 * Conventions:
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — `listing_id` / `*_tenant_id` are plain text soft refs;
 *    integrity is enforced in the service layer.
 *  - Grain = the SELLER tenant for `data_listing` (`seller_tenant_id`), the BUYER
 *    tenant for `data_purchase` (`buyer_tenant_id`). Unlike other rebuild tables
 *    these DELIBERATELY have NO plain `tenant_id`: the marketplace BROWSE is
 *    intentionally CROSS-TENANT (you see OTHER tenants' active listings), so RLS
 *    uses bespoke policies (drizzle/rls/enable-rls.sql) — a public-shelf SELECT
 *    for active listings + a seller-only write guard — NOT the standard
 *    `tenant_id = app.tenant_id` loop.
 *  - `data_listing` has `deleted_at` (SOFT DELETE); `data_purchase` is an
 *    immutable ledger (append-only, no soft delete / update).
 */

// ── data_listing (SELLER — a company dataset on the public shelf) ─────────────
export const dataListingTable = pgTable(
  "data_listing",
  {
    id: text("id").primaryKey(), // dlst_…
    sellerTenantId: text("seller_tenant_id").notNull(), // the owning (selling) tenant
    title: text("title").notNull(),
    description: text("description"),
    industryKey: text("industry_key"), // nullable company filter (taxonomy id or free-text industry)
    segment: text("segment").notNull().default("all"), // b2b|b2c|all (derived from the companies' contacts at publish)
    companyCount: integer("company_count").notNull().default(0), // snapshot: # companies matching the filter at publish
    price: real("price").notNull().default(0), // flat IDR
    // Names-only preview shown on the shelf (2-3 sample company names). No PII.
    sample: jsonb("sample").$type<string[]>().notNull().default([]),
    // The DELIVERABLE — the full firmographic snapshot copied to the buyer at
    // purchase. Firmographic company fields ONLY (no contacts / personal data).
    // Snapshotted at publish so the buyer gets exactly what was previewed and no
    // cross-tenant read of the seller's live `company_v2` is needed (RLS-safe).
    companies: jsonb("companies").$type<ListingCompany[]>().notNull().default([]),
    status: text("status").notNull().default("active"), // active|paused|sold
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    sellerIdx: index("data_listing_seller_idx").on(t.sellerTenantId),
    // The cross-tenant "public shelf" read: active + live listings, newest first.
    shelfIdx: index("data_listing_shelf_idx")
      .on(t.status, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
  }),
);

// ── data_purchase (BUYER — append-only purchase ledger) ──────────────────────
export const dataPurchaseTable = pgTable(
  "data_purchase",
  {
    id: text("id").primaryKey(), // dpur_…
    buyerTenantId: text("buyer_tenant_id").notNull(), // the purchasing tenant
    listingId: text("listing_id").notNull(), // soft ref → data_listing.id
    sellerTenantId: text("seller_tenant_id").notNull(), // denormalized for seller-side reads
    companyCount: integer("company_count").notNull().default(0), // # in the snapshot at purchase
    importedCount: integer("imported_count").notNull().default(0), // # actually copied (after dedup)
    amount: real("amount").notNull().default(0), // IDR recorded (MVP: no real charge)
    status: text("status").notNull().default("completed"), // completed (MVP has no failure/refund states)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    buyerIdx: index("data_purchase_buyer_idx").on(t.buyerTenantId),
    sellerIdx: index("data_purchase_seller_idx").on(t.sellerTenantId),
    listingIdx: index("data_purchase_listing_idx").on(t.listingId),
  }),
);

/**
 * One company in a listing's firmographic snapshot. FIRMOGRAPHIC FIELDS ONLY —
 * mirrors `company_v2` minus every id / owner / personal ref. Never carries a
 * contact, email, phone, or person.
 */
export interface ListingCompany {
  name: string;
  domain: string | null;
  industry: string | null;
  industryId: string | null;
  size: string | null;
  hqCountry: string | null;
  hqCity: string | null;
  website: string | null;
  summary: string | null;
  techStack: string[];
  socials: Record<string, string> | null;
}

export type DataListingRow = typeof dataListingTable.$inferSelect;
export type DataListingInsert = typeof dataListingTable.$inferInsert;
export type DataPurchaseRow = typeof dataPurchaseTable.$inferSelect;
export type DataPurchaseInsert = typeof dataPurchaseTable.$inferInsert;
