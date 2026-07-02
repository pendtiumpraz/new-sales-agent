import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { agentTaskRepo } from "./repo";
import type { AgentTaskRow, AgentTaskType } from "./schema";

/**
 * agentTaskService — the BYOA (bring-your-own-agent) generation queue (Fase 2).
 *
 * FLOW: platform (in `byoa` mode) `enqueue`s a task → the tenant's own agent
 * `claim`s the oldest N (write-scope API key) → generates with ITS OWN model →
 * POSTs `submitResult` → `applyResult` DISPATCHES on `type` to apply the work
 * (finish the autopilot run / classify the contact / store the generation).
 *
 * applyResult is BEST-EFFORT — it is wrapped in try/catch and NEVER throws back to
 * the agent's POST (a dispatch failure must not make the agent think its result
 * was rejected; the result is already durably stored on the task row).
 */

const AGENT_TASK_TYPES: readonly AgentTaskType[] = [
  "draft_reply",
  "classify",
  "generate_quote",
  "generate",
];
const LISTABLE_STATUSES = ["queued", "claimed", "done", "failed"] as const;
const CLAIM_MAX = 50;
const CLAIM_DEFAULT = 5;

export interface EnqueueInput {
  type: AgentTaskType;
  payload: Record<string, unknown>;
  refType?: string | null;
  refId?: string | null;
}

/** Lean shape handed to the polling agent (its own tenant data — no secrets). */
export interface ClaimedTask {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  refType: string | null;
  refId: string | null;
}

export interface SubmitResultInput {
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export const agentTaskService = {
  /**
   * Enqueue a `queued` task for the tenant's agent to pick up. Called by the
   * platform when the tenant is in BYOA mode (e.g. autopilot advanceRun). Returns
   * the inserted row.
   */
  async enqueue(ctx: TenantContext, input: EnqueueInput): Promise<AgentTaskRow> {
    if (!AGENT_TASK_TYPES.includes(input.type)) {
      throw new ServiceError("Tipe task tidak valid", 400, "validation");
    }
    const row = await agentTaskRepo.insert(ctx, {
      id: "atsk_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      type: input.type,
      status: "queued",
      payload: input.payload ?? {},
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    });
    await this.audit(ctx, "agent_task.enqueue", row.id, { type: input.type, refType: input.refType ?? null });
    return row;
  },

  /**
   * Atomically claim up to `limit` (default 5, max 50) of the oldest queued tasks.
   * `claimed_by` is stamped from `ctx.userId` (the API key's user — the agent's
   * identity). Concurrent pollers get disjoint sets (FOR UPDATE SKIP LOCKED).
   */
  async claim(ctx: TenantContext, limit = CLAIM_DEFAULT): Promise<ClaimedTask[]> {
    const n = Math.min(Math.max(1, Math.trunc(limit) || CLAIM_DEFAULT), CLAIM_MAX);
    const rows = await agentTaskRepo.claim(ctx, n, ctx.userId);
    if (rows.length) {
      await this.audit(ctx, "agent_task.claim", null, { count: rows.length });
    }
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      refType: r.refType,
      refId: r.refId,
    }));
  },

  /**
   * Finish a CLAIMED task with the agent's `result` (→ done) or `error` (→ failed),
   * then dispatch `applyResult` (best-effort). Rejects a task that isn't currently
   * claimed (404 unknown / 409 already-finished / 409 not-claimed).
   */
  async submitResult(
    ctx: TenantContext,
    id: string,
    input: SubmitResultInput,
  ): Promise<AgentTaskRow> {
    const task = await agentTaskRepo.getById(ctx, id);
    if (!task) throw new ServiceError("Task tidak ditemukan", 404, "not_found");
    if (task.status === "done" || task.status === "failed") {
      throw new ServiceError("Task sudah selesai", 409, "already_finished");
    }
    if (task.status !== "claimed") {
      throw new ServiceError("Task harus di-claim dulu sebelum kirim hasil", 409, "not_claimed");
    }

    const status: "done" | "failed" = input.error ? "failed" : "done";
    const finished = await agentTaskRepo.finish(ctx, id, {
      status,
      result: input.result ?? null,
      error: input.error ?? null,
    });
    // Lost the race (another poller/finish beat us) — surface as already-finished.
    if (!finished) throw new ServiceError("Task sudah selesai", 409, "already_finished");

    await this.audit(ctx, "agent_task.result", id, { type: finished.type, status });

    // Dispatch — best-effort; a dispatch failure never rejects the agent's POST.
    await this.applyResult(ctx, finished);
    return finished;
  },

  /** Recent tasks for the tenant (debug/admin view). */
  async list(ctx: TenantContext, filter?: { status?: string }): Promise<AgentTaskRow[]> {
    if (filter?.status && !LISTABLE_STATUSES.includes(filter.status as (typeof LISTABLE_STATUSES)[number])) {
      throw new ServiceError(
        `status harus salah satu dari: ${LISTABLE_STATUSES.join(", ")}`,
        400,
        "validation",
      );
    }
    return agentTaskRepo.list(ctx, filter);
  },

  /**
   * DISPATCHER — act on a completed (done|failed) task by `type`. BEST-EFFORT:
   * everything is wrapped so a side-effect failure never throws back to the caller
   * (submitResult). The task row already holds the durable result/error.
   *
   *  - draft_reply    → finish the linked autopilot run (append the drafted bubbles
   *                     to its log; mode `auto` also persists them as outbound
   *                     message_v2 queued; mode `suggest` leaves them as a draft in
   *                     the log). A failed task finishes the run as `error` so the
   *                     autopilot lifecycle never dead-loops on "running".
   *  - classify       → update the contact's segment / fitScore / fitReason.
   *  - generate_quote / generate → result is retrievable on the task row; best-
   *                     effort no-op beyond that (documented follow-up to write it
   *                     onto a specific ref).
   */
  async applyResult(ctx: TenantContext, task: AgentTaskRow): Promise<void> {
    try {
      switch (task.type) {
        case "draft_reply":
          await applyDraftReply(ctx, task);
          break;
        case "classify":
          await applyClassify(ctx, task);
          break;
        case "generate_quote":
        case "generate":
          // Result is already stored on the task row (retrievable via GET
          // /api/agent/tasks). Writing it onto a specific ref is a follow-up.
          break;
        default:
          break;
      }
    } catch (err) {
      // Never let a dispatch failure bubble into the agent's result POST.
      console.error("[agent_task.applyResult]", task.type, task.id, err);
    }
  },

  /** Tenant-scoped audit row for an agent-task mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetId: string | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      targetType: "agent_task",
      targetId,
      meta: meta ?? null,
    });
  },
};

// ── dispatch helpers ─────────────────────────────────────────────────────────

/** Normalize an agent result into a list of paced bubbles. Accepts either
 *  `result.bubbles: ({text,delayMs?}|string)[]` or a single `result.reply`/
 *  `result.text` string. */
function normalizeBubbles(result: Record<string, unknown> | null): { text: string; delayMs?: number }[] {
  if (!result) return [];
  const raw = result.bubbles;
  if (Array.isArray(raw)) {
    return raw
      .map((b) => {
        if (typeof b === "string") return { text: b.trim() };
        const o = b as { text?: unknown; delayMs?: unknown };
        return {
          text: String(o?.text ?? "").trim(),
          delayMs: typeof o?.delayMs === "number" ? o.delayMs : undefined,
        };
      })
      .filter((b) => b.text.length > 0);
  }
  const single = result.reply ?? result.text;
  if (typeof single === "string" && single.trim()) return [{ text: single.trim() }];
  return [];
}

async function applyDraftReply(ctx: TenantContext, task: AgentTaskRow): Promise<void> {
  const payload = (task.payload ?? {}) as {
    conversationId?: string;
    mode?: string;
    runId?: string;
  };
  const runId = task.refId ?? payload.runId;
  if (!runId) return; // no run to feed — nothing to do.

  const { outreachService } = await import("@/modules/outreach/service");

  // Agent reported a failure → finish the run as error so it doesn't dead-loop.
  if (task.status === "failed") {
    await outreachService.updateRun(ctx, runId, {
      status: "error",
      error: task.error ?? "Agent BYOA gagal menghasilkan balasan.",
      logEntries: [
        { step: "error", message: `Agent tenant (BYOA) gagal: ${task.error ?? "tidak diketahui"}` },
      ],
    });
    return;
  }

  const mode = payload.mode === "auto" ? "auto" : "suggest";
  const conversationId = payload.conversationId;
  const bubbles = normalizeBubbles(task.result);

  const logEntries: Record<string, unknown>[] = bubbles.map((b, i) => ({
    step: "draft",
    message: `Bubble ${i + 1}: ${b.text}`,
    bubble: i + 1,
    delayMs: b.delayMs,
    source: "byoa",
  }));

  let summary: string;
  if (mode === "auto" && conversationId && bubbles.length) {
    const { inboxService } = await import("@/modules/inbox/service");
    for (const b of bubbles) {
      await inboxService.createMessage(ctx, {
        conversationId,
        direction: "out",
        body: b.text,
        isAiGenerated: true,
        status: "queued",
      });
    }
    logEntries.push({ step: "send", message: `${bubbles.length} balasan dikirim ke percakapan (mode Auto · BYOA).` });
    summary = `Agent tenant (BYOA) membalas ${bubbles.length} bubble — mode Auto.`;
  } else {
    logEntries.push({
      step: "suggest",
      message: `${bubbles.length} saran balasan dari agent tenant dicatat untuk persetujuan rep (mode Saran · BYOA).`,
    });
    summary =
      bubbles.length > 0
        ? `Agent tenant (BYOA) menyarankan ${bubbles.length} balasan — menunggu persetujuan.`
        : `Agent tenant (BYOA) selesai tanpa bubble balasan.`;
  }

  await outreachService.updateRun(ctx, runId, {
    status: "done",
    summary,
    logEntries,
  });
}

async function applyClassify(ctx: TenantContext, task: AgentTaskRow): Promise<void> {
  if (task.status === "failed") return; // classification failed — leave contact as-is.
  const payload = (task.payload ?? {}) as { contactId?: string };
  const contactId = payload.contactId;
  if (!contactId) return;
  const result = (task.result ?? {}) as {
    segment?: unknown;
    fitScore?: unknown;
    fitReason?: unknown;
  };
  const patch: { segment?: string; fitScore?: number | null; fitReason?: string | null } = {};
  if (typeof result.segment === "string") patch.segment = result.segment;
  if (typeof result.fitScore === "number") patch.fitScore = result.fitScore;
  else if (result.fitScore === null) patch.fitScore = null;
  if (typeof result.fitReason === "string") patch.fitReason = result.fitReason;
  if (Object.keys(patch).length === 0) return; // nothing usable to apply.

  const { crmService } = await import("@/modules/crm/service");
  await crmService.updateContact(ctx, contactId, patch);
}
