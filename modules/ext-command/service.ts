import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { extCommandRepo } from "./repo";
import type { ExtensionCommandRow, ExtensionCommandType } from "./schema";

/**
 * extCommandService — the platform/agent → browser-extension COMMAND queue
 * (Fase 3, PART A "DRIVE").
 *
 * FLOW: an agent (write-scope API key) `enqueue`s a command → the tenant's
 * extension (per-rep ingest token) `claim`s the oldest N it may run → dispatches
 * the matching RPA scraper in the rep's browser → POSTs `submitResult`. Crawl
 * OUTPUT lands in the CRM via the normal `/api/ingest` sink — this queue only
 * carries the command lifecycle, so there is no `applyResult` dispatch here
 * (unlike agent_task): the result is just stored on the row for observability.
 */

const COMMAND_TYPES: readonly ExtensionCommandType[] = ["crawl", "enrich", "stop"];
const LISTABLE_STATUSES = ["queued", "claimed", "done", "failed"] as const;
const CLAIM_MAX = 25;
const CLAIM_DEFAULT = 5;

export interface EnqueueCommandInput {
  type: ExtensionCommandType;
  params?: Record<string, unknown>;
  /** null/undefined = any rep in the tenant; set = only that rep's browser. */
  targetUserId?: string | null;
}

/** Lean shape handed to the polling extension (its own tenant data — no secrets). */
export interface ClaimedCommand {
  id: string;
  type: string;
  params: Record<string, unknown>;
}

export interface SubmitCommandResultInput {
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export const extCommandService = {
  /**
   * Enqueue a `queued` command for the tenant's extension to pick up. Called by an
   * authorized agent (write-scope API key) via POST /api/agent/extension/commands.
   * Returns the inserted row.
   */
  async enqueue(ctx: TenantContext, input: EnqueueCommandInput): Promise<ExtensionCommandRow> {
    if (!COMMAND_TYPES.includes(input.type)) {
      throw new ServiceError(`type harus salah satu dari: ${COMMAND_TYPES.join(", ")}`, 400, "validation");
    }
    const row = await extCommandRepo.insert(ctx, {
      id: "xcmd_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      targetUserId: input.targetUserId ?? null,
      type: input.type,
      params: input.params ?? {},
      status: "queued",
    });
    await this.audit(ctx, "ext_command.enqueue", row.id, {
      type: input.type,
      targetUserId: input.targetUserId ?? null,
    });
    return row;
  },

  /**
   * Atomically claim up to `limit` (default 5, max 25) of the oldest queued
   * commands this rep may run (`target_user_id IS NULL OR = userId`). `userId` is
   * the POLLING rep's id (from the ingest-token resolution). Concurrent pollers get
   * disjoint sets (FOR UPDATE SKIP LOCKED).
   */
  async claimForUser(ctx: TenantContext, userId: string, limit = CLAIM_DEFAULT): Promise<ClaimedCommand[]> {
    const n = Math.min(Math.max(1, Math.trunc(limit) || CLAIM_DEFAULT), CLAIM_MAX);
    const rows = await extCommandRepo.claimForUser(ctx, userId, n);
    if (rows.length) {
      await this.audit(ctx, "ext_command.claim", null, { count: rows.length, userId });
    }
    return rows.map((r) => ({ id: r.id, type: r.type, params: (r.params ?? {}) as Record<string, unknown> }));
  },

  /** Non-claiming preview of queued commands this rep may run (heartbeat count). */
  async previewQueuedForUser(ctx: TenantContext, userId: string, limit = 20): Promise<ClaimedCommand[]> {
    const rows = await extCommandRepo.listQueuedForUser(ctx, userId, limit);
    return rows.map((r) => ({ id: r.id, type: r.type, params: (r.params ?? {}) as Record<string, unknown> }));
  },

  /**
   * Finish a CLAIMED command with the extension's `result` (→ done) or `error`
   * (→ failed). Rejects a command that isn't currently claimed
   * (404 unknown / 409 already-finished / 409 not-claimed).
   */
  async submitResult(
    ctx: TenantContext,
    id: string,
    input: SubmitCommandResultInput,
  ): Promise<ExtensionCommandRow> {
    const cmd = await extCommandRepo.getById(ctx, id);
    if (!cmd) throw new ServiceError("Perintah tidak ditemukan", 404, "not_found");
    if (cmd.status === "done" || cmd.status === "failed") {
      throw new ServiceError("Perintah sudah selesai", 409, "already_finished");
    }
    if (cmd.status !== "claimed") {
      throw new ServiceError("Perintah harus di-claim dulu sebelum kirim hasil", 409, "not_claimed");
    }
    const status: "done" | "failed" = input.error ? "failed" : "done";
    const finished = await extCommandRepo.finish(ctx, id, {
      status,
      result: input.result ?? null,
      error: input.error ?? null,
    });
    if (!finished) throw new ServiceError("Perintah sudah selesai", 409, "already_finished");
    await this.audit(ctx, "ext_command.result", id, { type: finished.type, status });
    return finished;
  },

  /** Recent commands for the tenant (debug/admin view). */
  async list(ctx: TenantContext, filter?: { status?: string }): Promise<ExtensionCommandRow[]> {
    if (filter?.status && !LISTABLE_STATUSES.includes(filter.status as (typeof LISTABLE_STATUSES)[number])) {
      throw new ServiceError(`status harus salah satu dari: ${LISTABLE_STATUSES.join(", ")}`, 400, "validation");
    }
    return extCommandRepo.list(ctx, filter);
  },

  /** Tenant-scoped audit row for an ext-command mutation. */
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
      targetType: "extension_command",
      targetId,
      meta: meta ?? null,
    });
  },
};
