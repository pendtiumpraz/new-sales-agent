import { createHash, randomBytes } from "node:crypto";

import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { apiKeyRepo } from "./repo";
import type { ApiKeyRow, ApiKeyScope } from "./schema";

/**
 * apiKeyService — per-account (BYOA) API keys. Business logic + audit live here;
 * routes stay thin.
 *
 * KEY FORMAT: `msk_live_<43 url-safe chars>` (32 random bytes, base64url). We store
 * ONLY the sha256 hex of the full key (`key_hash`, unique) + a short display prefix
 * (`key_prefix`). The plaintext is returned to the creator ONCE (`create`) and is
 * NEVER retrievable again — there is no code path that returns or logs it after.
 */

const KEY_SCOPES: readonly ApiKeyScope[] = ["read", "write"];
const KEY_PLAINTEXT_PREFIX = "msk_live_";
const KEY_DISPLAY_PREFIX_LEN = 12; // e.g. "msk_live_ab…"

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** A row as surfaced to the client — NEVER the hash, NEVER the plaintext. */
export interface ApiKeyPublic {
  id: string;
  label: string;
  keyPrefix: string;
  scope: ApiKeyScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function toPublic(row: ApiKeyRow): ApiKeyPublic {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    scope: row.scope as ApiKeyScope,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export interface CreateApiKeyInput {
  label: string;
  scope: ApiKeyScope;
}

/** Result of `create` — the ONLY time the plaintext key is ever returned. */
export interface CreatedApiKey extends ApiKeyPublic {
  /** Plaintext key — shown ONCE, store it now; unrecoverable afterward. */
  key: string;
}

/** What `resolveKey` returns to the auth layer (getTenantContext). */
export interface ResolvedApiKey {
  id: string;
  tenantId: string;
  userId: string;
  scope: ApiKeyScope;
}

export const apiKeyService = {
  /** List the tenant's keys (public shape — no hash, no plaintext). */
  async list(ctx: TenantContext): Promise<ApiKeyPublic[]> {
    const rows = await apiKeyRepo.listByTenant(ctx);
    return rows.map(toPublic);
  },

  /**
   * Create a new key. Generates `msk_live_<random>`, stores sha256(key) + prefix,
   * and returns the PLAINTEXT key ONCE (never retrievable again). Audit
   * `apikey.create`.
   */
  async create(ctx: TenantContext, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const label = input.label?.trim();
    if (!label) throw new ServiceError("Label wajib diisi", 400, "validation");
    if (label.length > 80) throw new ServiceError("Label maksimal 80 karakter", 400, "validation");
    const scope = input.scope;
    if (!KEY_SCOPES.includes(scope)) throw new ServiceError("Scope tidak valid", 400, "validation");

    const key = KEY_PLAINTEXT_PREFIX + randomBytes(32).toString("base64url");
    const keyHash = sha256Hex(key);
    const keyPrefix = key.slice(0, KEY_DISPLAY_PREFIX_LEN);

    const row = await apiKeyRepo.insert(ctx, {
      id: "akey_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      label,
      keyHash,
      keyPrefix,
      scope,
    });

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "apikey.create",
      targetType: "api_key",
      targetId: row.id,
      meta: { label, scope, keyPrefix },
    });

    return { ...toPublic(row), key };
  },

  /** Revoke a key (set revoked_at). 404 when it isn't a live key in this tenant. */
  async revoke(ctx: TenantContext, id: string): Promise<ApiKeyPublic> {
    const row = await apiKeyRepo.revoke(ctx, id);
    if (!row) throw new ServiceError("API key tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "apikey.revoke",
      targetType: "api_key",
      targetId: row.id,
      meta: { label: row.label, keyPrefix: row.keyPrefix },
    });
    return toPublic(row);
  },

  /**
   * AUTH-TIME resolution. sha256 the raw key → look up a LIVE (not revoked, not
   * deleted) row by hash. Returns { id, tenantId, userId, scope } or null. Best-
   * effort stamps `last_used_at`. Tenant-UNSCOPED (the key identifies the tenant),
   * done via the repo's superadmin-context lookup. NEVER logs/returns the key.
   */
  async resolveKey(rawKey: string): Promise<ResolvedApiKey | null> {
    const key = rawKey?.trim();
    if (!key || !key.startsWith(KEY_PLAINTEXT_PREFIX)) return null;
    const row = await apiKeyRepo.findByHash(sha256Hex(key));
    if (!row) return null;
    // Best-effort — a stamp failure must never break an otherwise-valid request.
    apiKeyRepo.touchLastUsed(row.id).catch(() => {});
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      scope: row.scope as ApiKeyScope,
    };
  },
};
