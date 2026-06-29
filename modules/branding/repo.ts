import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { userThemeTable, type UserThemeRow, type UserThemeInsert } from "./schema";

/**
 * branding domain repo — the ONLY place that touches the `user_theme` table.
 * Services call the repo; routes call services.
 *
 * GRAIN = USER. `user_theme` is GLOBAL (keyed by `user_id`, no `tenant_id`) → it
 * runs on the plain `db` client, NOT `withTenant` (theme is per-individual, not
 * tenant-scoped). The table is a satellite of the user: there is no `deleted_at`,
 * so "reset to default" = clear the columns back to defaults (keep/recreate the
 * row), and the user cascade = hard delete the row. There is no trash/restore for
 * this satellite (per docs/rebuild/06 §1.5: "Reverting per-row satellites (theme)
 * = clear columns, not delete").
 */
export const brandingRepo = {
  /** Fetch a user's theme row (undefined if they've never customized). */
  async getByUserId(userId: string): Promise<UserThemeRow | undefined> {
    const [row] = await db
      .select()
      .from(userThemeTable)
      .where(eq(userThemeTable.userId, userId))
      .limit(1);
    return row;
  },

  /**
   * Insert-or-update a user's theme (1:1 on `user_id`). The patch is shallow:
   * only the keys present are written, so a partial PUT preserves untouched
   * columns. `updated_at` is always bumped.
   */
  async upsert(userId: string, patch: Partial<UserThemeInsert>): Promise<UserThemeRow> {
    const insertValues: UserThemeInsert = { ...patch, userId };
    // Never let a caller override the PK or the timestamp via the patch.
    delete (insertValues as Partial<UserThemeInsert>).userId;
    insertValues.userId = userId;

    const [row] = await db
      .insert(userThemeTable)
      .values(insertValues)
      .onConflictDoUpdate({
        target: userThemeTable.userId,
        set: { ...patch, userId, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  /**
   * Reset a user's theme to defaults. We DELETE the row so the next read falls
   * back to the canonical Coral-Sunset defaults the service synthesizes — this is
   * the satellite "revert" (no soft-delete column exists on this table).
   */
  async clear(userId: string): Promise<boolean> {
    const rows = await db
      .delete(userThemeTable)
      .where(eq(userThemeTable.userId, userId))
      .returning({ userId: userThemeTable.userId });
    return rows.length > 0;
  },
};
