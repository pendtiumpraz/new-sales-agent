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
  (t) => ({
    tokenIdx: index("password_reset_token_idx").on(t.token),
  }),
);

export type AuthSessionRow = typeof authSessionTable.$inferSelect;
export type PasswordResetRow = typeof passwordResetTable.$inferSelect;
