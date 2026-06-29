import type { TenantContext } from "@/lib/db/tenant-context";
import { meteredGenerateText } from "@/lib/ai/meter";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { inboxService } from "@/modules/inbox/service";
import { workspaceService } from "@/modules/workspace/service";
import { salesRepo } from "./repo";
import {
  decideStage,
  scoreReadiness,
  normalizeSignals,
  STAGES,
  type Stage,
  type Turn,
} from "./logic";
import { CLOSING_TECHNIQUES_17, recommendTechniques } from "./kb-techniques";
import type {
  ConversationStageRow,
  ClosingReadinessRow,
  KbTechniqueRow,
} from "./schema";

/**
 * sales / closing-flow service — the differentiator's business logic. Routes stay
 * thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns three tables (conversation_stage, closing_readiness, kb_technique).
 * Referential integrity is enforced HERE (app layer), never via DB FKs (none
 * exist): a stage/readiness row's `conversation_id` is validated against a live
 * conversation through the OWNING module's service (`inboxService`, modular-
 * monolith rule — never reach into another module's tables). The closing
 * technique recommendation reads the workspace's `sales_play` / `market_fit`
 * through `workspaceService` to fit the market type (B2B stays consultative).
 *
 * AI is OPTIONAL. The stage-machine + readiness scorer are DETERMINISTIC
 * heuristics (./logic) that ALWAYS work with NO AI keys. When `useAi` is
 * requested AND a transcript is available, the service may refine the stage by
 * calling the model — but ONLY through `meteredGenerateText` (lib/ai/meter), and
 * any failure falls back to the heuristic. No provider is ever called directly.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`. Stage + readiness are
 * additionally scoped 1:1 by `conversation_id` (unique per tenant).
 */

// ── input shapes ─────────────────────────────────────────────────────────────
export interface EvaluateStageInput {
  conversationId: string;
  /** The latest inbound (customer) message that triggered this evaluation. */
  inbound?: string;
  /** Optional transcript (oldest→newest). If omitted, the inbox is read in-app. */
  history?: Turn[];
  workspaceId?: string | null;
  /** Opt-in AI refinement; falls back to the heuristic if the model is unavailable. */
  useAi?: boolean;
}

export interface EvaluateReadinessInput {
  conversationId: string;
  inbound?: string;
  history?: Turn[];
  workspaceId?: string | null;
}

export interface CreateTechniqueInput {
  key?: string;
  name: string;
  inti: string;
  contoh?: string | null;
  cocokUntuk?: string[];
  sinyal?: string[];
  sort?: number;
}
export type UpdateTechniqueInput = Partial<CreateTechniqueInput>;

const MARKET_TO_TECH = { b2b: "b2b", b2c: "b2c", mix: "mix" } as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Build a transcript from the inbox messages when the caller didn't supply one. */
async function transcriptFromInbox(
  ctx: TenantContext,
  conversationId: string,
): Promise<Turn[]> {
  const msgs = await inboxService.listMessages(ctx, { conversationId });
  return msgs.map<Turn>((m) => ({
    role: m.direction === "in" ? "customer" : "us",
    text: m.body,
  }));
}

/** The latest inbound text from a transcript (fallback when `inbound` is absent). */
function latestInbound(history: Turn[], inbound?: string): string {
  if (inbound && inbound.trim()) return inbound.trim();
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "customer") return history[i].text;
  }
  return "";
}

export const salesService = {
  // ═══════════════════════ conversation_stage ═══════════════════════
  async getStage(ctx: TenantContext, conversationId: string): Promise<ConversationStageRow | null> {
    return (await salesRepo.getStage(ctx, conversationId)) ?? null;
  },

  async listStages(ctx: TenantContext): Promise<ConversationStageRow[]> {
    return salesRepo.listStages(ctx);
  },

  async listTrashedStages(ctx: TenantContext): Promise<ConversationStageRow[]> {
    return salesRepo.listTrashedStages(ctx);
  },

  /**
   * Evaluate (and persist) the stage for a conversation. Runs the DETERMINISTIC
   * stage-machine over the transcript; optionally refines the stage with AI when
   * `useAi` is set (falls back to the heuristic on any failure). Upserts the 1:1
   * `conversation_stage` row.
   */
  async evaluateStage(
    ctx: TenantContext,
    input: EvaluateStageInput,
  ): Promise<ConversationStageRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    // Integrity: a stage row must belong to a live conversation in this tenant.
    // Goes through the OWNING module's service (inbox), not its tables.
    const conversation = await inboxService.getConversation(ctx, conversationId);

    const history =
      input.history && input.history.length > 0
        ? input.history
        : await transcriptFromInbox(ctx, conversationId);
    const inbound = latestInbound(history, input.inbound);

    // Carry the previously-stored stage forward (sticky closing) if any.
    const existing = await salesRepo.getStage(ctx, conversationId);
    const decision = decideStage(existing?.stage as Stage | undefined, history, inbound);

    let stage: Stage = decision.stage;
    let source = "heuristic";
    // OPTIONAL AI refinement — only when asked AND there's something to read.
    if (input.useAi && inbound) {
      const refined = await this.refineStageWithAi(ctx, history, inbound, decision.stage).catch(
        () => null,
      );
      if (refined && (STAGES as readonly string[]).includes(refined)) {
        stage = refined as Stage;
        source = "ai";
      }
    }

    const row = await salesRepo.upsertStage(ctx, conversationId, {
      workspaceId: input.workspaceId ?? conversation.workspaceId ?? null,
      stage,
      previousStage: existing?.stage ?? null,
      nextAction: decision.nextAction,
      signals: {
        needIdentified: decision.signals.needIdentified,
        valueDelivered: decision.signals.valueDelivered,
        priceAsked: decision.signals.priceAsked,
        objection: decision.signals.objection,
        closingIntent: decision.signals.closingIntent,
      },
      guidance: decision.guidance,
      source,
      turns: decision.turns,
    });

    await this.audit(ctx, "sales.stage.evaluate", "conversation_stage", row.id, {
      conversationId,
      stage,
      source,
    });
    return row;
  },

  /**
   * OPTIONAL AI stage refinement. Calls the tenant's active model THROUGH the
   * metered wrapper (never a provider directly) and asks for one of the five
   * stages. Returns null when the model is unavailable / unparseable so the
   * caller falls back to the heuristic. The heuristic `fallback` is given to the
   * model as the prior so it only overrides with justification.
   */
  async refineStageWithAi(
    ctx: TenantContext,
    history: Turn[],
    inbound: string,
    fallback: Stage,
  ): Promise<string | null> {
    const context = history
      .slice(-8)
      .map((t) => `${t.role === "customer" ? "Pelanggan" : "Kami"}: ${t.text}`)
      .join("\n");
    const system =
      "Kamu menilai tahap percakapan sales. Tahap yang valid HANYA: " +
      `${STAGES.join(", ")}. Jawab HANYA satu kata (salah satu tahap itu), tanpa penjelasan. ` +
      `Tebakan heuristik saat ini: ${fallback}. Koreksi hanya bila jelas keliru.`;
    const { text } = await meteredGenerateText(ctx, {
      feature: "closing-stage",
      system,
      prompt: `Percakapan:\n${context}\n\nPesan terakhir pelanggan: "${inbound}"\n\nTahap saat ini:`,
      maxOutputTokens: 200,
    });
    const word = (text || "").toLowerCase().match(/rapport|discovery|value|objection|closing/);
    return word ? word[0] : null;
  },

  async softDeleteStage(ctx: TenantContext, conversationId: string): Promise<void> {
    const ok = await salesRepo.softDeleteStage(ctx, conversationId);
    if (!ok) throw new ServiceError("Stage percakapan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.stage.delete", "conversation_stage", conversationId);
  },

  async restoreStage(ctx: TenantContext, conversationId: string): Promise<ConversationStageRow> {
    const ok = await salesRepo.restoreStage(ctx, conversationId);
    if (!ok) throw new ServiceError("Stage tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "sales.stage.restore", "conversation_stage", conversationId);
    const row = await salesRepo.getStage(ctx, conversationId);
    if (!row) throw new ServiceError("Stage percakapan tidak ditemukan", 404, "not_found");
    return row;
  },

  async hardDeleteStage(ctx: TenantContext, conversationId: string): Promise<void> {
    const ok = await salesRepo.hardDeleteStage(ctx, conversationId);
    if (!ok) throw new ServiceError("Stage percakapan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.stage.purge", "conversation_stage", conversationId);
  },

  // ═══════════════════════ closing_readiness ════════════════════════
  async getReadiness(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<ClosingReadinessRow | null> {
    return (await salesRepo.getReadiness(ctx, conversationId)) ?? null;
  },

  async listReadiness(
    ctx: TenantContext,
    filter?: { band?: string },
  ): Promise<ClosingReadinessRow[]> {
    if (filter?.band && !["cold", "warm", "hot"].includes(filter.band)) {
      throw new ServiceError("band harus cold, warm, atau hot", 400, "validation");
    }
    return salesRepo.listReadiness(ctx, filter);
  },

  async listTrashedReadiness(ctx: TenantContext): Promise<ClosingReadinessRow[]> {
    return salesRepo.listTrashedReadiness(ctx);
  },

  /**
   * Evaluate (and persist) the closing-readiness for a conversation. Reuses the
   * stage-machine signals (no recompute when a stage row exists) and runs the
   * DETERMINISTIC heuristic scorer (0..100 + band + NBA). Upserts the 1:1
   * `closing_readiness` row. NO AI — the scorer is purely heuristic.
   */
  async evaluateReadiness(
    ctx: TenantContext,
    input: EvaluateReadinessInput,
  ): Promise<ClosingReadinessRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const conversation = await inboxService.getConversation(ctx, conversationId);

    // Prefer an existing stage row's signals/stage; else compute fresh from the
    // transcript so readiness can be evaluated standalone.
    const stageRow = await salesRepo.getStage(ctx, conversationId);
    let stage: Stage;
    let signals;
    let turns: number;
    if (stageRow) {
      stage = (stageRow.stage as Stage) ?? "rapport";
      signals = normalizeSignals(stageRow.signals);
      turns = stageRow.turns;
    } else {
      const history =
        input.history && input.history.length > 0
          ? input.history
          : await transcriptFromInbox(ctx, conversationId);
      const inbound = latestInbound(history, input.inbound);
      const decision = decideStage(undefined, history, inbound);
      stage = decision.stage;
      signals = decision.signals;
      turns = decision.turns;
    }

    const readiness = scoreReadiness(stage, signals, turns);
    const row = await salesRepo.upsertReadiness(ctx, conversationId, {
      workspaceId: input.workspaceId ?? conversation.workspaceId ?? null,
      score: readiness.score,
      band: readiness.band,
      factors: readiness.factors,
      nbaAction: readiness.nba.action,
      nbaSuggestion: readiness.nba.suggestion,
      stage,
      source: "heuristic",
    });

    await this.audit(ctx, "sales.readiness.evaluate", "closing_readiness", row.id, {
      conversationId,
      score: readiness.score,
      band: readiness.band,
    });
    return row;
  },

  async softDeleteReadiness(ctx: TenantContext, conversationId: string): Promise<void> {
    const ok = await salesRepo.softDeleteReadiness(ctx, conversationId);
    if (!ok) throw new ServiceError("Readiness tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.readiness.delete", "closing_readiness", conversationId);
  },

  async restoreReadiness(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<ClosingReadinessRow> {
    const ok = await salesRepo.restoreReadiness(ctx, conversationId);
    if (!ok) throw new ServiceError("Readiness tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "sales.readiness.restore", "closing_readiness", conversationId);
    const row = await salesRepo.getReadiness(ctx, conversationId);
    if (!row) throw new ServiceError("Readiness tidak ditemukan", 404, "not_found");
    return row;
  },

  async hardDeleteReadiness(ctx: TenantContext, conversationId: string): Promise<void> {
    const ok = await salesRepo.hardDeleteReadiness(ctx, conversationId);
    if (!ok) throw new ServiceError("Readiness tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.readiness.purge", "closing_readiness", conversationId);
  },

  // ═══════════════════════ kb_technique ═════════════════════════════
  async listTechniques(ctx: TenantContext): Promise<KbTechniqueRow[]> {
    return salesRepo.listTechniques(ctx);
  },

  async listTrashedTechniques(ctx: TenantContext): Promise<KbTechniqueRow[]> {
    return salesRepo.listTrashedTechniques(ctx);
  },

  async getTechnique(ctx: TenantContext, id: string): Promise<KbTechniqueRow> {
    const row = await salesRepo.getTechnique(ctx, id);
    if (!row) throw new ServiceError("Teknik closing tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Seed the 17 Teknik Closing for the tenant (idempotent — upserts on
   * (tenant,key), so re-seeding refreshes copy without duplicating). Returns the
   * full live catalog. `force` re-runs even when techniques already exist.
   */
  async seedTechniques(
    ctx: TenantContext,
    opts?: { force?: boolean },
  ): Promise<KbTechniqueRow[]> {
    const existing = await salesRepo.countTechniques(ctx);
    if (existing > 0 && !opts?.force) return salesRepo.listTechniques(ctx);

    let sort = 0;
    for (const t of CLOSING_TECHNIQUES_17) {
      await salesRepo.upsertTechniqueByKey(ctx, {
        key: t.key,
        name: t.name,
        inti: t.inti,
        contoh: t.contoh ?? null,
        cocokUntuk: t.cocokUntuk,
        sinyal: t.sinyal,
        sort: sort++,
      });
    }
    await this.audit(ctx, "sales.technique.seed", "kb_technique", null, {
      count: CLOSING_TECHNIQUES_17.length,
    });
    return salesRepo.listTechniques(ctx);
  },

  async createTechnique(
    ctx: TenantContext,
    input: CreateTechniqueInput,
  ): Promise<KbTechniqueRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama teknik wajib diisi", 400, "validation");
    const inti = input.inti?.trim();
    if (!inti) throw new ServiceError("Inti teknik wajib diisi", 400, "validation");
    const key = (input.key?.trim() ? slugify(input.key) : slugify(name)) || "teknik";

    const dup = await salesRepo.getTechniqueByKey(ctx, key);
    if (dup) throw new ServiceError(`Teknik dengan key "${key}" sudah ada`, 409, "conflict");

    const row = await salesRepo.insertTechnique(ctx, {
      id: "tek_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      key,
      name,
      inti,
      contoh: input.contoh ?? null,
      cocokUntuk: input.cocokUntuk ?? [],
      sinyal: input.sinyal ?? [],
      sort: input.sort ?? 0,
    });
    await this.audit(ctx, "sales.technique.create", "kb_technique", row.id, { key });
    return row;
  },

  async updateTechnique(
    ctx: TenantContext,
    id: string,
    input: UpdateTechniqueInput,
  ): Promise<KbTechniqueRow> {
    await this.getTechnique(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama teknik wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.inti !== undefined) {
      const inti = input.inti?.trim();
      if (!inti) throw new ServiceError("Inti teknik wajib diisi", 400, "validation");
      patch.inti = inti;
    }
    for (const f of ["contoh", "cocokUntuk", "sinyal", "sort"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await salesRepo.updateTechnique(ctx, id, patch);
    if (!row) throw new ServiceError("Teknik closing tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.technique.update", "kb_technique", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /**
   * Recommend closing techniques for a conversation — the differentiator's
   * "which technique now?" answer. Reads the conversation's persisted stage (for
   * the trigger signal) and the workspace's market type (sales_play / market_fit)
   * to fit B2B vs B2C, then ranks the tenant's live catalog (falling back to the
   * seeded 17 when the catalog is empty). HEURISTIC — no AI.
   */
  async recommendForConversation(
    ctx: TenantContext,
    conversationId: string,
    opts?: { max?: number },
  ): Promise<{
    market: "b2b" | "b2c" | "mix";
    stage: Stage | null;
    techniques: KbTechniqueRow[];
  }> {
    const id = conversationId?.trim();
    if (!id) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const conversation = await inboxService.getConversation(ctx, id);

    const stageRow = await salesRepo.getStage(ctx, id);
    const stage = (stageRow?.stage as Stage | undefined) ?? null;
    const signals = normalizeSignals(stageRow?.signals);
    // Derive a trigger signal phrase from the detected signals for ranking.
    const signal = signals.objection
      ? "objection"
      : signals.priceAsked
        ? "ditanya harga"
        : signals.closingIntent
          ? "mau menutup"
          : signals.needIdentified
            ? "kebutuhan belum jelas"
            : undefined;

    // Market fit from the workspace's sales_play / market_fit (consultative B2B).
    let market: "b2b" | "b2c" | "mix" = "mix";
    const workspaceId = stageRow?.workspaceId ?? conversation.workspaceId ?? null;
    if (workspaceId) {
      const mf = await workspaceService.getMarketFit(ctx, workspaceId).catch(() => null);
      const mt = mf?.marketType as keyof typeof MARKET_TO_TECH | undefined;
      if (mt && MARKET_TO_TECH[mt]) market = MARKET_TO_TECH[mt];
    }

    const max = opts?.max ?? 3;
    const live = await salesRepo.listTechniques(ctx);
    if (live.length > 0) {
      const filtered =
        market !== "mix"
          ? live.filter((t) => (t.cocokUntuk ?? []).includes(market))
          : live;
      const ranked = signal
        ? [...filtered].sort((a, b) => {
            const am = (a.sinyal ?? []).some((s) => s.includes(signal) || signal.includes(s))
              ? 1
              : 0;
            const bm = (b.sinyal ?? []).some((s) => s.includes(signal) || signal.includes(s))
              ? 1
              : 0;
            return bm - am;
          })
        : filtered;
      return { market, stage, techniques: ranked.slice(0, max) };
    }

    // Catalog empty — recommend from the seed data (shape-mapped to rows).
    const seeds = recommendTechniques(CLOSING_TECHNIQUES_17, { market, signal, max });
    const now = new Date();
    const techniques: KbTechniqueRow[] = seeds.map((t, i) => ({
      id: "tek_seed_" + t.key,
      tenantId: ctx.tenantId,
      key: t.key,
      name: t.name,
      inti: t.inti,
      contoh: t.contoh ?? null,
      cocokUntuk: t.cocokUntuk,
      sinyal: t.sinyal,
      sort: i,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    return { market, stage, techniques };
  },

  async softDeleteTechnique(ctx: TenantContext, id: string): Promise<void> {
    const ok = await salesRepo.softDeleteTechnique(ctx, id);
    if (!ok) throw new ServiceError("Teknik closing tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.technique.delete", "kb_technique", id);
  },

  async restoreTechnique(ctx: TenantContext, id: string): Promise<KbTechniqueRow> {
    const ok = await salesRepo.restoreTechnique(ctx, id);
    if (!ok) throw new ServiceError("Teknik tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "sales.technique.restore", "kb_technique", id);
    return this.getTechnique(ctx, id);
  },

  async hardDeleteTechnique(ctx: TenantContext, id: string): Promise<void> {
    const ok = await salesRepo.hardDeleteTechnique(ctx, id);
    if (!ok) throw new ServiceError("Teknik closing tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "sales.technique.purge", "kb_technique", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a sales/closing-flow mutation. */
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
