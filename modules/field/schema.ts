import {
  pgTable,
  text,
  real,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 9 (secondary) · field domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: field sales — planned VISITS to a customer/prospect site and the
 * geo-stamped CHECK-INS a rep records on arrival/departure. Owns two tables:
 *   - `field_visit`    — a planned/logged VISIT: soft refs to the CRM `contact_id`
 *                        / `company_id` / `deal_id`, the assigned `rep_user_id`, a
 *                        `purpose`, an `address`, a `scheduled_at` time, a `status`
 *                        (planned|en_route|in_progress|completed|cancelled|no_show),
 *                        the visit `outcome`, and a free-text `notes`.
 *   - `field_check_in` — a geo-stamped CHECK-IN/OUT event on a visit: a `kind`
 *                        (check_in|check_out), the `lat`/`lng`/`accuracy`, an
 *                        `address` snapshot, an optional `photo_url`, and the rep
 *                        who recorded it. The audit trail of physical presence.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (visit_id, contact_id, company_id, deal_id,
 *    rep_user_id, workspace_id) is a plain text soft ref; integrity is enforced in
 *    the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`.
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: no legacy twin exists for `field_visit` /
 * `field_check_in`, so they get clean names. The live Neon DB is NOT touched this
 * tick (db:generate only).
 */

// ── field_visit (TENANT — a planned/logged field visit) ──────────────────────
export const fieldVisitTable = pgTable(
  "field_visit",
  {
    id: text("id").primaryKey(), // fvs_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    contactId: text("contact_id"), // soft ref → contact.id (the person visited)
    companyId: text("company_id"), // soft ref → company_v2.id (the account)
    dealId: text("deal_id"), // soft ref → deal.id (opportunity, optional)
    repUserId: text("rep_user_id"), // soft ref → app_user.id (assigned field rep)
    title: text("title").notNull(),
    purpose: text("purpose"), // demo|negotiation|delivery|survey|relationship|other
    address: text("address"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // planned time
    startedAt: timestamp("started_at", { withTimezone: true }), // actual arrival (first check_in)
    endedAt: timestamp("ended_at", { withTimezone: true }), // actual departure (check_out)
    status: text("status").notNull().default("planned"), // planned|en_route|in_progress|completed|cancelled|no_show
    outcome: text("outcome"), // result summary (won|follow_up|lost|…)
    notes: text("notes"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("field_visit_tenant_idx").on(t.tenantId),
    repIdx: index("field_visit_rep_idx").on(t.tenantId, t.repUserId),
    contactIdx: index("field_visit_contact_idx").on(t.tenantId, t.contactId),
    statusIdx: index("field_visit_status_idx").on(t.tenantId, t.status),
    scheduledIdx: index("field_visit_scheduled_idx").on(t.tenantId, t.scheduledAt),
  }),
);

// ── field_check_in (TENANT — a geo-stamped check-in/out on a visit) ──────────
export const fieldCheckInTable = pgTable(
  "field_check_in",
  {
    id: text("id").primaryKey(), // fci_…
    tenantId: text("tenant_id").notNull(),
    visitId: text("visit_id").notNull(), // soft ref → field_visit.id
    repUserId: text("rep_user_id"), // soft ref → app_user.id (who recorded it)
    kind: text("kind").notNull().default("check_in"), // check_in|check_out
    lat: real("lat"), // geo latitude
    lng: real("lng"), // geo longitude
    accuracy: real("accuracy"), // GPS accuracy (meters)
    address: text("address"), // reverse-geocoded snapshot
    photoUrl: text("photo_url"), // optional proof-of-visit photo
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(), // event time
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("field_check_in_tenant_idx").on(t.tenantId),
    visitIdx: index("field_check_in_visit_idx").on(t.tenantId, t.visitId),
    repIdx: index("field_check_in_rep_idx").on(t.tenantId, t.repUserId),
  }),
);

export type FieldVisitRow = typeof fieldVisitTable.$inferSelect;
export type FieldVisitInsert = typeof fieldVisitTable.$inferInsert;
export type FieldCheckInRow = typeof fieldCheckInTable.$inferSelect;
export type FieldCheckInInsert = typeof fieldCheckInTable.$inferInsert;
