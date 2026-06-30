import { and, count, desc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  authSessionTable,
  passwordResetTable,
  type AuthSessionRow,
  type PasswordResetRow,
} from "./schema";

/**
 * auth domain repo — the ONLY place that touches the `auth_session` /
 * `password_reset` tables. Services call the repo; routes call services.
 *
 * Both tables are GLOBAL (keyed by user, no tenant scoping) → plain `db`. They
 * are append-only style with a state column instead of soft delete:
 *  - auth_session: revoke via `revoked_at` (an active session = revoked_at IS NULL).
 *  - password_reset: consume via `used_at` (one-shot token).
 *
 * Identity tables (`app_user`, `membership`, `tenant`) are owned by the tenant
 * domain — this repo NEVER reaches into them; the service goes through
 * `tenantService` for any user/membership/tenant read or write.
 */
export const authRepo = {
  // ── auth_session (revocable session record) ──────────────────────
  async listSessionsForUser(userId: string): Promise<AuthSessionRow[]> {
    return db
      .select()
      .from(authSessionTable)
      .where(and(eq(authSessionTable.userId, userId), isNull(authSessionTable.revokedAt)))
      .orderBy(desc(authSessionTable.createdAt));
  },

  /**
   * Does this user hold at least one usable session — i.e. not revoked and not
   * past `expires_at` (null = no explicit expiry)? Drives the per-request
   * "session-not-revoked" gate in `getTenantContext()` (audit #7): when a user
   * revokes ALL their sessions ("log out everywhere"), every subsequent request
   * is denied immediately instead of waiting for the JWT to expire. Counts in SQL
   * (no row materialization) since it runs on the request hot path.
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ n: count() })
      .from(authSessionTable)
      .where(
        and(
          eq(authSessionTable.userId, userId),
          isNull(authSessionTable.revokedAt),
          or(isNull(authSessionTable.expiresAt), gt(authSessionTable.expiresAt, new Date())),
        ),
      );
    return (row?.n ?? 0) > 0;
  },

  /**
   * Total session rows EVER recorded for a user (revoked or not). Lets the
   * per-request revocation gate (audit #7) tell "this user has sessions, all of
   * them revoked → reject" apart from "no session rows were ever written for this
   * user" (the current reality, since login does not yet call `recordSession`) →
   * must NOT reject, or every login breaks. Pairs with `hasActiveSession`.
   */
  async countSessionsForUser(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(authSessionTable)
      .where(eq(authSessionTable.userId, userId));
    return row?.n ?? 0;
  },

  async getSession(id: string): Promise<AuthSessionRow | undefined> {
    const [row] = await db
      .select()
      .from(authSessionTable)
      .where(eq(authSessionTable.id, id))
      .limit(1);
    return row;
  },

  async insertSession(values: {
    id: string;
    userId: string;
    activeTenantId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    expiresAt?: Date | null;
  }): Promise<AuthSessionRow> {
    const [row] = await db
      .insert(authSessionTable)
      .values({
        id: values.id,
        userId: values.userId,
        activeTenantId: values.activeTenantId ?? null,
        ip: values.ip ?? null,
        userAgent: values.userAgent ?? null,
        expiresAt: values.expiresAt ?? null,
      })
      .returning();
    return row;
  },

  /** Revoke an active session; only matches a session that is not yet revoked. */
  async revokeSession(id: string): Promise<boolean> {
    const rows = await db
      .update(authSessionTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessionTable.id, id), isNull(authSessionTable.revokedAt)))
      .returning({ id: authSessionTable.id });
    return rows.length > 0;
  },

  // ── password_reset (one-shot token) ──────────────────────────────
  async insertReset(values: {
    id: string;
    userId: string;
    token: string;
    expiresAt?: Date | null;
  }): Promise<PasswordResetRow> {
    const [row] = await db
      .insert(passwordResetTable)
      .values({
        id: values.id,
        userId: values.userId,
        token: values.token,
        expiresAt: values.expiresAt ?? null,
      })
      .returning();
    return row;
  },

  /** A reset is usable only while it has not been consumed (`used_at IS NULL`). */
  async getUnusedReset(token: string): Promise<PasswordResetRow | undefined> {
    const [row] = await db
      .select()
      .from(passwordResetTable)
      .where(and(eq(passwordResetTable.token, token), isNull(passwordResetTable.usedAt)))
      .limit(1);
    return row;
  },

  /** Consume a token; only matches an unused token (one-shot guard). */
  async markResetUsed(id: string): Promise<boolean> {
    const rows = await db
      .update(passwordResetTable)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTable.id, id), isNull(passwordResetTable.usedAt)))
      .returning({ id: passwordResetTable.id });
    return rows.length > 0;
  },

  // ── retention sweep (audit #51 — neither table is otherwise purged) ──
  /**
   * Hard-delete auth_session rows that are no longer usable as of `cutoff`:
   * already revoked, or past their `expires_at`. Active, non-expiring sessions
   * (`expires_at IS NULL`, not revoked) are kept. Returns the number purged.
   */
  async purgeExpiredSessions(cutoff: Date): Promise<number> {
    const rows = await db
      .delete(authSessionTable)
      .where(
        or(
          isNotNull(authSessionTable.revokedAt),
          and(isNotNull(authSessionTable.expiresAt), lt(authSessionTable.expiresAt, cutoff)),
        ),
      )
      .returning({ id: authSessionTable.id });
    return rows.length;
  },

  /**
   * Hard-delete one-shot password_reset tokens that are spent as of `cutoff`:
   * already consumed (`used_at` set), or past `expires_at`. Returns the count.
   */
  async purgeExpiredResets(cutoff: Date): Promise<number> {
    const rows = await db
      .delete(passwordResetTable)
      .where(
        or(
          isNotNull(passwordResetTable.usedAt),
          and(isNotNull(passwordResetTable.expiresAt), lt(passwordResetTable.expiresAt, cutoff)),
        ),
      )
      .returning({ id: passwordResetTable.id });
    return rows.length;
  },
};
