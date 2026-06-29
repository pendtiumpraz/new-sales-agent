import { count, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  auditLogTable,
  platformSettingTable,
  type AuditLogRow,
  type PlatformSettingRow,
} from "./schema";

/**
 * superadmin / platform repo — the ONLY place that touches the platform tables
 * (`audit_log_v2`, `platform_setting_v2`).
 *
 * `audit_log_v2` is append-only (no soft delete); `platform_setting_v2` is a
 * global key/value store. Cross-tenant reads over `tenant` / `app_user` are NOT
 * here — those tables are owned by the tenant domain, so the superadmin SERVICE
 * composes them through `tenantService` (modular-monolith ownership rule).
 */
export const platformRepo = {
  // ── audit_log_v2 (append-only) ───────────────────────────────────
  async insertAudit(values: {
    tenantId?: string | null;
    actorUserId?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    await db.insert(auditLogTable).values({
      id: "aud_" + crypto.randomUUID(),
      tenantId: values.tenantId ?? null,
      actorUserId: values.actorUserId ?? null,
      action: values.action,
      targetType: values.targetType ?? null,
      targetId: values.targetId ?? null,
      meta: values.meta ?? null,
    });
  },

  async recentAudit(tenantId: string | null, limit = 50): Promise<AuditLogRow[]> {
    const where = tenantId ? eq(auditLogTable.tenantId, tenantId) : undefined;
    return db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.at))
      .limit(limit);
  },

  /** Total audit rows (optionally scoped to a tenant) — drives the overview. */
  async countAudit(tenantId: string | null): Promise<number> {
    const where = tenantId ? eq(auditLogTable.tenantId, tenantId) : undefined;
    const [row] = await db.select({ n: count() }).from(auditLogTable).where(where);
    return row?.n ?? 0;
  },

  // ── platform_setting_v2 (global key/value) ───────────────────────
  async listSettings(): Promise<PlatformSettingRow[]> {
    return db.select().from(platformSettingTable).orderBy(platformSettingTable.key);
  },

  async getSetting(key: string): Promise<PlatformSettingRow | undefined> {
    const [row] = await db
      .select()
      .from(platformSettingTable)
      .where(eq(platformSettingTable.key, key))
      .limit(1);
    return row;
  },

  async setSetting(key: string, value: string): Promise<PlatformSettingRow> {
    const [row] = await db
      .insert(platformSettingTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: platformSettingTable.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return row;
  },
};
