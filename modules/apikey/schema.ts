import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * api_key — per-account (BYOA) API keys so a tenant's external agent can call the
 * app's {ok,data} data-level API with a Bearer key (scoped, revocable).
 *
 * SECURITY: we NEVER store the plaintext key. `key_hash` is the sha256 hex of the
 * full key (`msk_live_<random>`); the plaintext is returned to the creator ONCE at
 * creation and is unrecoverable thereafter. `key_prefix` is the first ~10 chars
 * (e.g. `msk_live_ab`) kept ONLY for display in the management UI.
 *
 * Conventions (modules/tenant/schema.ts): snake_case SQL / camelCase Drizzle, no
 * FKs (soft refs), tenant-scoped table carries `tenant_id` + a tenant index, soft
 * delete via `deleted_at`. RLS `tenant_isolation` is enabled+FORCED on this table
 * (drizzle/migrations/0048_api_key.sql) — the cross-tenant `resolveKey` lookup runs
 * under a superadmin RLS context (repo `findByHash`), never a caller's tenant pin.
 */
export const apiKeyTable = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(), // akey_…
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(), // soft ref → app_user.id (the creator)
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(), // sha256 hex of the FULL key — NEVER plaintext
    keyPrefix: text("key_prefix").notNull(), // first ~10 chars for display, e.g. msk_live_ab
    scope: text("scope").notNull(), // read | write
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }), // best-effort stamp on use
    revokedAt: timestamp("revoked_at", { withTimezone: true }), // set on revoke
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("api_key_tenant_idx").on(t.tenantId),
    keyHashUq: uniqueIndex("api_key_key_hash_uq").on(t.keyHash),
  }),
);

export type ApiKeyRow = typeof apiKeyTable.$inferSelect;
export type ApiKeyInsert = typeof apiKeyTable.$inferInsert;

export type ApiKeyScope = "read" | "write";
