import { and, eq, gte } from "drizzle-orm";

import type { TenantContext } from "@/lib/db/tenant-context";
import { withTenant } from "@/lib/db/tenant-context";
import {
  aiProviderTable,
  aiModelTable,
  aiCredentialTable,
  tenantActiveModelTable,
  aiUsageTable,
  sendingAccountTable,
  sendJobTable,
} from "@/lib/db/schema";
import { platformKey } from "@/lib/ai/adapters";
import { mailProviderConfigured } from "@/lib/mail/oauth";
import { espConfigured } from "@/lib/mail/esp";
import { jakartaDayStart } from "@/lib/mail/send";
import { configuredPlanKeys, stripeConfigured } from "@/lib/billing/stripe";
import { creditEnforced, tenantCreditBalance } from "@/lib/billing/credit";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { tenantService } from "@/modules/tenant/service";
import { settingsRepo } from "./repo";
import type { KnowledgeBaseRow, TenantSettingsRow } from "./schema";

/**
 * settings domain service — the Settings-cluster FACADE for the rebuild.
 *
 * REUSE-HEAVY by design. The Settings screens read/write four things that the
 * platform already implements; this service is the thin surface that composes
 * them (it does NOT rebuild any of them):
 *
 *   - tenant AI config (active model + BYOK status + usage rollup) — reads the
 *     existing `ai_provider`/`ai_model`/`ai_credential`/`tenant_active_model`
 *     tables (the same surface `lib/ai/registry.resolveActiveModel` resolves at
 *     call time). NO new AI tables. Writing the active model upserts
 *     `tenant_active_model`. AI is NEVER called here — that only happens through
 *     `lib/ai/meter`.
 *   - mailbox config — reads `sending_account` + the `lib/mail/*` "is configured"
 *     flags (SMTP/OAuth/ESP). Connect/disconnect stay on the existing
 *     `/api/tenant/mailboxes*` handlers; this exposes the read for the facade.
 *   - billing summary — delegates to `lib/billing/*` (plan/usage/credit) the same
 *     way the existing `/api/tenant/billing` route does.
 *   - team / members — delegates to `modules/tenant` (memberships).
 *
 * The only tables this module OWNS are `knowledge_base` + `tenant_settings`
 * (compliance + misc per-tenant config). KB gets full soft-delete + trash/
 * restore/purge; tenant_settings is an idempotent k/v store.
 *
 * Grain = TENANT. Every method takes the caller's `TenantContext`; the repo +
 * `withTenant` scope all reads/writes to `ctx.tenantId`.
 */

const KB_SCOPES = ["general", "product", "objection", "compliance", "persona"] as const;
export type KbScope = (typeof KB_SCOPES)[number];

const COMPLIANCE_PREFIX = "compliance.";

// BYOA source-of-AI mode (Fase 2). Stored as a tenant_settings k/v row under this
// key (category "ai") — NO new table. `platform` = the platform DeepSeek call
// (default); `byoa` = the tenant's own agent fulfills generations via the
// agent_task queue. Read by the autopilot lifecycle (outreachService.advanceRun).
const AI_MODE_KEY = "ai.mode";
const AI_MODES = ["platform", "byoa"] as const;
export type AiMode = (typeof AI_MODES)[number];

/** Start of the current month in Asia/Jakarta (UTC+7) as a UTC Date — AI usage
 *  is windowed to this so the rollup is the manageable current-month spend, not
 *  an ever-growing lifetime total (mirrors the legacy /api/tenant/ai route). */
function jakartaMonthStart(now: Date = new Date()): Date {
  const j = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1, 0, 0, 0) - 7 * 3_600_000);
}

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateKbInput {
  title: string;
  body: string;
  scope?: string;
  tags?: string[];
  pinned?: boolean;
  sort?: number;
}
export type UpdateKbInput = Partial<CreateKbInput>;

export interface AiConfig {
  models: (typeof aiModelTable.$inferSelect)[];
  providers: {
    id: string;
    key: string;
    displayName: string;
    hasPlatformKey: boolean;
    hasTenantKey: boolean;
  }[];
  activeModelId: string | null;
  usage: { tokensIn: number; tokensOut: number; cost: number; calls: number };
  /** Source of AI: `platform` (platform DeepSeek call) | `byoa` (tenant's own agent). */
  aiMode: AiMode;
}

export interface MailboxConfig {
  mailboxes: {
    id: string;
    type: string;
    fromEmail: string;
    fromName: string | null;
    status: string;
    dailyLimit: number;
    sentToday: number;
  }[];
  providers: { google: boolean; microsoft: boolean; esp: boolean };
}

export interface BillingSummary {
  credit: Awaited<ReturnType<typeof tenantCreditBalance>> & { enforced: boolean };
  stripe: { configured: boolean; purchasablePlanKeys: string[] };
}

export const settingsService = {
  // ═══════════════════════ knowledge_base (owned) ═══════════════════
  async listKb(ctx: TenantContext, filter?: { scope?: string }): Promise<KnowledgeBaseRow[]> {
    if (filter?.scope && !(KB_SCOPES as readonly string[]).includes(filter.scope)) {
      throw new ServiceError(`scope harus salah satu dari: ${KB_SCOPES.join(", ")}`, 400, "validation");
    }
    return settingsRepo.listKb(ctx, filter);
  },

  async listTrashedKb(ctx: TenantContext): Promise<KnowledgeBaseRow[]> {
    return settingsRepo.listTrashedKb(ctx);
  },

  async getKb(ctx: TenantContext, id: string): Promise<KnowledgeBaseRow> {
    const row = await settingsRepo.getKb(ctx, id);
    if (!row) throw new ServiceError("Artikel KB tidak ditemukan", 404, "not_found");
    return row;
  },

  async createKb(ctx: TenantContext, input: CreateKbInput): Promise<KnowledgeBaseRow> {
    const title = input.title?.trim();
    if (!title) throw new ServiceError("Judul KB wajib diisi", 400, "validation");
    const body = input.body?.trim();
    if (!body) throw new ServiceError("Isi KB wajib diisi", 400, "validation");
    const scope = input.scope?.trim() || "general";
    if (!(KB_SCOPES as readonly string[]).includes(scope)) {
      throw new ServiceError(`scope harus salah satu dari: ${KB_SCOPES.join(", ")}`, 400, "validation");
    }

    const row = await settingsRepo.insertKb(ctx, {
      id: "kb_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      title,
      body,
      scope,
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      sort: input.sort ?? 0,
    });
    await this.audit(ctx, "settings.kb.create", "knowledge_base", row.id, { scope });
    return row;
  },

  async updateKb(ctx: TenantContext, id: string, input: UpdateKbInput): Promise<KnowledgeBaseRow> {
    await this.getKb(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new ServiceError("Judul KB wajib diisi", 400, "validation");
      patch.title = title;
    }
    if (input.body !== undefined) {
      const body = input.body?.trim();
      if (!body) throw new ServiceError("Isi KB wajib diisi", 400, "validation");
      patch.body = body;
    }
    if (input.scope !== undefined) {
      const scope = input.scope?.trim() || "general";
      if (!(KB_SCOPES as readonly string[]).includes(scope)) {
        throw new ServiceError(`scope harus salah satu dari: ${KB_SCOPES.join(", ")}`, 400, "validation");
      }
      patch.scope = scope;
    }
    for (const f of ["tags", "pinned", "sort"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await settingsRepo.updateKb(ctx, id, patch);
    if (!row) throw new ServiceError("Artikel KB tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "settings.kb.update", "knowledge_base", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteKb(ctx: TenantContext, id: string): Promise<void> {
    const ok = await settingsRepo.softDeleteKb(ctx, id);
    if (!ok) throw new ServiceError("Artikel KB tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "settings.kb.delete", "knowledge_base", id);
  },

  async restoreKb(ctx: TenantContext, id: string): Promise<KnowledgeBaseRow> {
    const ok = await settingsRepo.restoreKb(ctx, id);
    if (!ok) throw new ServiceError("Artikel KB tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "settings.kb.restore", "knowledge_base", id);
    return this.getKb(ctx, id);
  },

  async hardDeleteKb(ctx: TenantContext, id: string): Promise<void> {
    const ok = await settingsRepo.hardDeleteKb(ctx, id);
    if (!ok) throw new ServiceError("Artikel KB tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "settings.kb.purge", "knowledge_base", id);
  },

  // ═══════════════════════ compliance settings (tenant_settings) ════
  /** All compliance flags/values for the tenant, keyed by their short key
   *  (the `compliance.` prefix stripped). */
  async getCompliance(ctx: TenantContext): Promise<Record<string, unknown>> {
    const rows = await settingsRepo.listSettings(ctx, { category: "compliance" });
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      const short = r.key.startsWith(COMPLIANCE_PREFIX)
        ? r.key.slice(COMPLIANCE_PREFIX.length)
        : r.key;
      out[short] = r.value;
    }
    return out;
  },

  /** Set a single compliance setting. `key` is namespaced under `compliance.`. */
  async setCompliance(ctx: TenantContext, key: string, value: unknown): Promise<TenantSettingsRow> {
    const short = key?.trim();
    if (!short) throw new ServiceError("Key wajib diisi", 400, "validation");
    const fullKey = short.startsWith(COMPLIANCE_PREFIX) ? short : COMPLIANCE_PREFIX + short;
    const row = await settingsRepo.upsertSetting(ctx, fullKey, {
      value,
      category: "compliance",
    });
    await this.audit(ctx, "settings.compliance.update", "tenant_settings", row.id, { key: fullKey });
    return row;
  },

  /** Bulk-set compliance settings (one upsert per key). */
  async setComplianceBulk(
    ctx: TenantContext,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    for (const [key, value] of Object.entries(patch)) {
      const short = key.trim();
      if (!short) continue;
      const fullKey = short.startsWith(COMPLIANCE_PREFIX) ? short : COMPLIANCE_PREFIX + short;
      await settingsRepo.upsertSetting(ctx, fullKey, { value, category: "compliance" });
    }
    await this.audit(ctx, "settings.compliance.update", "tenant_settings", null, {
      keys: Object.keys(patch),
    });
    return this.getCompliance(ctx);
  },

  /** Generic misc k/v get/set (the facade's catch-all config store). */
  async getSetting(ctx: TenantContext, key: string): Promise<unknown> {
    const row = await settingsRepo.getSetting(ctx, key);
    return row?.value ?? null;
  },

  async setSetting(
    ctx: TenantContext,
    key: string,
    value: unknown,
    category = "misc",
  ): Promise<TenantSettingsRow> {
    const k = key?.trim();
    if (!k) throw new ServiceError("Key wajib diisi", 400, "validation");
    const row = await settingsRepo.upsertSetting(ctx, k, { value, category });
    await this.audit(ctx, "settings.misc.update", "tenant_settings", row.id, { key: k });
    return row;
  },

  // ═══════════════════════ AI config (REUSE lib/ai) ═════════════════
  /**
   * Tenant AI config surface — the catalog (global) + this tenant's active model,
   * BYOK key status per provider, and the current-month usage rollup. Reads the
   * SAME tables `lib/ai/registry.resolveActiveModel` resolves at call time; NO new
   * AI tables are introduced. Read-only — no provider is contacted here.
   */
  async getAiConfig(ctx: TenantContext): Promise<AiConfig> {
    const data = await withTenant(ctx, async (tx) => {
      const providers = await tx.select().from(aiProviderTable);
      const models = await tx.select().from(aiModelTable);
      const active = await tx
        .select()
        .from(tenantActiveModelTable)
        .where(eq(tenantActiveModelTable.tenantId, ctx.tenantId))
        .limit(1);
      const creds = await tx
        .select({ providerId: aiCredentialTable.providerId })
        .from(aiCredentialTable)
        .where(eq(aiCredentialTable.tenantId, ctx.tenantId));
      const usageRows = await tx
        .select({
          tokensIn: aiUsageTable.tokensIn,
          tokensOut: aiUsageTable.tokensOut,
          cost: aiUsageTable.cost,
        })
        .from(aiUsageTable)
        .where(and(eq(aiUsageTable.tenantId, ctx.tenantId), gte(aiUsageTable.at, jakartaMonthStart())));
      return { providers, models, active, creds, usageRows };
    });

    const tenantCredProviders = new Set(data.creds.map((c) => c.providerId));
    const providers = data.providers.map((p) => ({
      id: p.id,
      key: p.key,
      displayName: p.displayName,
      hasPlatformKey: !!platformKey(p.key),
      hasTenantKey: tenantCredProviders.has(p.id),
    }));
    const usage = data.usageRows.reduce<AiConfig["usage"]>(
      (a, r) => ({
        tokensIn: a.tokensIn + r.tokensIn,
        tokensOut: a.tokensOut + r.tokensOut,
        cost: a.cost + Number(r.cost),
        calls: a.calls + 1,
      }),
      { tokensIn: 0, tokensOut: 0, cost: 0, calls: 0 },
    );

    const aiMode = await this.getAiMode(ctx);
    return { models: data.models, providers, activeModelId: data.active[0]?.modelId ?? null, usage, aiMode };
  },

  /**
   * Source-of-AI mode for the tenant (BYOA, Fase 2). `platform` (default) → the
   * platform DeepSeek call; `byoa` → the tenant's own agent fulfills generations
   * via the agent_task queue. Reads the `ai.mode` tenant_settings row; an unknown/
   * missing value falls back to `platform`.
   */
  async getAiMode(ctx: TenantContext): Promise<AiMode> {
    const row = await settingsRepo.getSetting(ctx, AI_MODE_KEY);
    return row?.value === "byoa" ? "byoa" : "platform";
  },

  /** Set the tenant's source-of-AI mode (`platform` | `byoa`). Idempotent upsert. */
  async setAiMode(ctx: TenantContext, mode: string): Promise<{ aiMode: AiMode }> {
    if (!AI_MODES.includes(mode as AiMode)) {
      throw new ServiceError(`aiMode harus salah satu dari: ${AI_MODES.join(", ")}`, 400, "validation");
    }
    await settingsRepo.upsertSetting(ctx, AI_MODE_KEY, { value: mode, category: "ai", label: "Sumber AI" });
    await this.audit(ctx, "settings.ai.set_mode", "tenant_settings", null, { aiMode: mode });
    return { aiMode: mode as AiMode };
  },

  /**
   * Set the tenant's ONE active model (upsert `tenant_active_model`). Validates
   * the model exists in the catalog (app-level integrity — no FK). The model is
   * then resolved at call time by `lib/ai/registry`; nothing here calls AI.
   */
  async setActiveModel(ctx: TenantContext, modelId: string): Promise<{ activeModelId: string }> {
    const id = modelId?.trim();
    if (!id) throw new ServiceError("modelId wajib diisi", 400, "validation");
    const exists = await withTenant(ctx, (tx) =>
      tx.select({ id: aiModelTable.id }).from(aiModelTable).where(eq(aiModelTable.id, id)).limit(1),
    );
    if (!exists[0]) throw new ServiceError("Model tidak ada di katalog", 404, "not_found");

    await withTenant(ctx, (tx) =>
      tx
        .insert(tenantActiveModelTable)
        .values({ tenantId: ctx.tenantId, modelId: id })
        .onConflictDoUpdate({
          target: tenantActiveModelTable.tenantId,
          set: { modelId: id, updatedAt: new Date() },
        }),
    );
    await this.audit(ctx, "settings.ai.set_active_model", "tenant_active_model", id, { modelId: id });
    return { activeModelId: id };
  },

  // ═══════════════════════ mailbox config (REUSE lib/mail) ══════════
  /**
   * Mailbox config surface — the tenant's sending identities (NO secrets) with
   * each mailbox's emails-sent-today (derived from the send log, Asia/Jakarta
   * day, so it matches the cap `processSendJobs` enforces) + the `lib/mail/*`
   * "is configured" flags driving the connect buttons. Connect/disconnect stay on
   * the existing `/api/tenant/mailboxes*` handlers.
   */
  async getMailboxes(ctx: TenantContext): Promise<MailboxConfig> {
    const dayStart = jakartaDayStart();
    const data = await withTenant(ctx, async (tx) => {
      const rows = await tx
        .select({
          id: sendingAccountTable.id,
          type: sendingAccountTable.type,
          fromEmail: sendingAccountTable.fromEmail,
          fromName: sendingAccountTable.fromName,
          status: sendingAccountTable.status,
          dailyLimit: sendingAccountTable.dailyLimit,
        })
        .from(sendingAccountTable)
        .where(eq(sendingAccountTable.tenantId, ctx.tenantId));
      const jobs = await tx
        .select({ accId: sendJobTable.sendingAccountId, status: sendJobTable.status, sentAt: sendJobTable.sentAt })
        .from(sendJobTable)
        .where(and(eq(sendJobTable.tenantId, ctx.tenantId), eq(sendJobTable.status, "sent")));
      return { rows, jobs };
    });

    const byAcc = new Map<string, number>();
    for (const j of data.jobs) {
      if (!j.accId || !j.sentAt || (j.sentAt as Date) < dayStart) continue;
      byAcc.set(j.accId, (byAcc.get(j.accId) ?? 0) + 1);
    }
    const mailboxes = data.rows.map((r) => ({ ...r, sentToday: byAcc.get(r.id) ?? 0 }));

    return {
      mailboxes,
      providers: {
        google: mailProviderConfigured("google"),
        microsoft: mailProviderConfigured("microsoft"),
        esp: espConfigured(),
      },
    };
  },

  // ═══════════════════════ billing summary (REUSE lib/billing) ══════
  /**
   * Billing summary — the tenant's AI-credit balance + Stripe wiring flags. The
   * full plan/usage/quota composition lives on `/api/tenant/billing`; this is the
   * facade-level summary (credit balance + purchasable plans), delegated to
   * `lib/billing/*`. NO billing logic is reimplemented here.
   */
  async getBillingSummary(ctx: TenantContext): Promise<BillingSummary> {
    const credit = await tenantCreditBalance(ctx);
    return {
      credit: { ...credit, enforced: creditEnforced() },
      stripe: { configured: stripeConfigured(), purchasablePlanKeys: configuredPlanKeys() },
    };
  },

  // ═══════════════════════ team (REUSE modules/tenant) ══════════════
  /** Team / members surface — delegates to the tenant domain (it owns
   *  `membership`). Returns the tenant's live memberships. */
  async getTeam(ctx: TenantContext) {
    return tenantService.listMemberships(ctx);
  },

  // ═══════════════════════ overview (compose everything) ════════════
  /** One-shot read for the Settings landing page — composes every surface. */
  async overview(ctx: TenantContext): Promise<{
    ai: AiConfig;
    mailboxes: MailboxConfig;
    billing: BillingSummary;
    compliance: Record<string, unknown>;
    kbCount: number;
  }> {
    const [ai, mailboxes, billing, compliance, kb] = await Promise.all([
      this.getAiConfig(ctx),
      this.getMailboxes(ctx),
      this.getBillingSummary(ctx),
      this.getCompliance(ctx),
      this.listKb(ctx),
    ]);
    return { ai, mailboxes, billing, compliance, kbCount: kb.length };
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a settings mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      targetType,
      targetId,
      meta: meta ?? null,
    });
  },
};
