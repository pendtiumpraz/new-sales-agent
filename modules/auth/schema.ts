import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Module 1 · auth domain schema (rebuild).
 *
 * next-auth (JWT strategy) remains the session mechanism and is REUSED as-is
 * (lib/auth/auth.ts). These tables are the persistent server-side records that
 * a JWT session can't hold: a revocable session/audit log and one-shot reset
 * tokens. Append-only style — no `deleted_at` (use `revoked_at` / `used_at`).
 *
 * New SQL names (`auth_session`, `password_reset`) — no collision with legacy.
 */

// ── auth_session (event-ish; revoke via revoked_at, not soft delete) ──
export const authSessionTable = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(), // session / jwt id
    userId: text("user_id").notNull(), // soft ref → app_user.id
    activeTenantId: text("active_tenant_id"), // currently-selected tenant context
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("auth_session_user_idx").on(t.userId),
    // Partial index for the request hot-path active-session lookup
    // (hasActiveSession / the retention sweep) — only live, un-revoked rows
    // (audit #51). Additive; see 0041_auth_session_active_idx.sql.
    activeUserIdx: index("auth_session_active_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
  }),
);

// ── password_reset (append-only one-shot token) ──
export const passwordResetTable = pgTable(
  "password_reset",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(), // soft ref → app_user.id
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // No extra index on `token`: the `.unique()` above already backs it with a
  // unique index (`password_reset_token_unique`). A second non-unique
  // `password_reset_token_idx` was redundant — dropped (audit #36, see
  // drizzle/migrations/0040_drop_redundant_password_reset_token_idx.sql).
);

export type AuthSessionRow = typeof authSessionTable.$inferSelect;
export type PasswordResetRow = typeof passwordResetTable.$inferSelect;
