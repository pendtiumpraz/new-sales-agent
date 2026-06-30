import type { TenantContext } from "@/lib/db/tenant-context";
import { meteredGenerateText } from "@/lib/ai/meter";
import { SAFETY_RULES, wrapUntrusted } from "@/lib/ai/safety";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { taxonomyRepo } from "./repo";
import type {
  IndustryRow,
  OccupationRow,
  TaxonomyKind,
} from "./schema";

/**
 * taxonomy domain service — the master-data CRUD + the AI CLASSIFY step that
 * maps a crawled company/person onto the right `industry` / `occupation`.
 *
 * CLASSIFY policy (the differentiator): the AI is asked to fit the entity into
 * an EXISTING candidate (global base ∪ tenant rows) FIRST, and only propose a
 * NEW label when confident none fit. Then a deterministic VALID guard decides
 * what actually gets written:
 *   1. matchId returned → reuse that existing row (after verifying it's live).
 *   2. else proposedNew → normalize its name; if it collides (alias / same slug)
 *      with an existing candidate → REUSE that one (no dup).
 *   3. else if confidence ≥ THRESHOLD → upsertBySlug a new source="ai" row in
 *      the TENANT namespace (concurrency-safe; revives a soft-deleted twin).
 *   4. else → UNCLASSIFIED (null) — better an empty cell than a hallucinated tag.
 *
 * The model is ALWAYS reached through `meteredGenerateText` (lib/ai/meter) —
 * never a provider directly — and ANY failure (no key, credit out, bad JSON)
 * degrades to UNCLASSIFIED rather than throwing, so a crawl pipeline never dies
 * on a classify hiccup.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo
 * reads the global∪tenant union and writes only the tenant's own rows.
 */

// Minimum model confidence to MINT a brand-new taxonomy row (below this we'd
// rather leave the entity unclassified than pollute the catalog). Reusing an
// existing match has no threshold — that's always safe.
export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.6;

type Source = "seed" | "ai" | "manual";

// ── input shapes ─────────────────────────────────────────────────────────────
/** The crawled signals we hand the classifier. All optional — more is better. */
export interface ClassifyEntity {
  /** Company/person display name. */
  name?: string | null;
  /** Free-text the crawler captured (about/bio/headline/description). */
  description?: string | null;
  /** Person's job title / headline (drives occupation). */
  title?: string | null;
  /** Company name (context for an occupation; the subject for an industry). */
  companyName?: string | null;
  /** Website / domain (a strong industry hint). */
  website?: string | null;
  /** Anything else the crawler has, as labelled strings. */
  signals?: Record<string, string> | null;
}

export interface ClassifyInput {
  kind: TaxonomyKind; // "industry" | "occupation"
  entity: ClassifyEntity;
}

/** What CLASSIFY resolves to. `id` null = unclassified. */
export interface ClassifyResult {
  id: string | null;
  created: boolean; // true only when a new source="ai" row was minted this call
  /** Why — surfaced for audit/debug, never shown raw to a customer. */
  reasoning: string;
  confidence: number;
  /** The resolved row when `id` is non-null (handy for the caller to label). */
  row?: IndustryRow | OccupationRow;
}

export interface CreateTaxonomyInput {
  name: string;
  nameEn?: string | null;
  parentId?: string | null;
  industryId?: string | null; // occupation only
  description?: string | null;
  source?: Source; // defaults "manual" for the CRUD UI
  confidence?: number | null;
}

export interface UpdateTaxonomyInput {
  name?: string;
  nameEn?: string | null;
  parentId?: string | null;
  industryId?: string | null; // occupation only
  description?: string | null;
}

// ── validation helpers ───────────────────────────────────────────────────────
function assertName(name: string | undefined | null): string {
  const v = (name ?? "").trim();
  if (!v) throw new ServiceError("Nama wajib diisi", 400, "validation");
  if (v.length > 160) throw new ServiceError("Nama terlalu panjang (maks 160)", 400, "validation");
  return v;
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, x));
}

// ── AI classify JSON contract ────────────────────────────────────────────────
// The model returns EXACTLY this shape. We parse defensively (untrusted output).
interface ClassifyJson {
  matchId: string | null;
  proposedNew: { name: string; nameEn?: string } | null;
  confidence: number;
  reasoning: string;
}

/** Tolerant JSON extraction — pulls the first {...} block and shapes it. */
function parseClassifyJson(text: string): ClassifyJson | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const matchId =
    typeof parsed.matchId === "string" && parsed.matchId.trim() ? parsed.matchId.trim() : null;
  let proposedNew: { name: string; nameEn?: string } | null = null;
  const pn = parsed.proposedNew as Record<string, unknown> | null | undefined;
  if (pn && typeof pn === "object" && typeof pn.name === "string" && pn.name.trim()) {
    proposedNew = {
      name: pn.name.trim(),
      nameEn: typeof pn.nameEn === "string" && pn.nameEn.trim() ? pn.nameEn.trim() : undefined,
    };
  }
  return {
    matchId,
    proposedNew,
    confidence: clamp01(parsed.confidence),
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "",
  };
}

function entityBlob(entity: ClassifyEntity): string {
  const parts: string[] = [];
  if (entity.name) parts.push(`Nama: ${entity.name}`);
  if (entity.title) parts.push(`Jabatan/headline: ${entity.title}`);
  if (entity.companyName) parts.push(`Perusahaan: ${entity.companyName}`);
  if (entity.website) parts.push(`Website: ${entity.website}`);
  if (entity.description) parts.push(`Deskripsi: ${entity.description}`);
  if (entity.signals) {
    for (const [k, v] of Object.entries(entity.signals)) {
      if (v && v.trim()) parts.push(`${k}: ${v.trim()}`);
    }
  }
  return parts.join("\n").slice(0, 2000); // bound the prompt
}

export const taxonomyService = {
  CLASSIFY_CONFIDENCE_THRESHOLD,

  // ═══════════════════════ master-data CRUD ═════════════════════════
  async listIndustries(ctx: TenantContext): Promise<IndustryRow[]> {
    return taxonomyRepo.industry.list(ctx);
  },
  async listOccupations(ctx: TenantContext): Promise<OccupationRow[]> {
    return taxonomyRepo.occupation.list(ctx);
  },
  async listTrashedIndustries(ctx: TenantContext): Promise<IndustryRow[]> {
    return taxonomyRepo.industry.listTrashed(ctx);
  },
  async listTrashedOccupations(ctx: TenantContext): Promise<OccupationRow[]> {
    return taxonomyRepo.occupation.listTrashed(ctx);
  },

  async getIndustry(ctx: TenantContext, id: string): Promise<IndustryRow> {
    const row = await taxonomyRepo.industry.getById(ctx, id);
    if (!row) throw new ServiceError("Industri tidak ditemukan", 404, "not_found");
    return row;
  },
  async getOccupation(ctx: TenantContext, id: string): Promise<OccupationRow> {
    const row = await taxonomyRepo.occupation.getById(ctx, id);
    if (!row) throw new ServiceError("Pekerjaan tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Manual CREATE for the master-data UI. Normalizes the slug and dedups via
   * `upsertBySlug` (so typing a name that already exists reuses it instead of
   * 409-ing). Defaults source="manual".
   */
  async createIndustry(ctx: TenantContext, input: CreateTaxonomyInput): Promise<IndustryRow> {
    const name = assertName(input.name);
    const slug = taxonomyRepo.normalizeSlug(name);
    if (!slug) throw new ServiceError("Nama tidak valid", 400, "validation");
    const { row, created } = await taxonomyRepo.industry.upsertBySlug(ctx, {
      name,
      slug,
      nameEn: input.nameEn ?? null,
      parentId: input.parentId ?? null,
      description: input.description ?? null,
      source: input.source ?? "manual",
      confidence: input.confidence ?? null,
    });
    if (created) await this.audit(ctx, "taxonomy.industry.create", "industry", row.id, { slug });
    return row;
  },

  async createOccupation(ctx: TenantContext, input: CreateTaxonomyInput): Promise<OccupationRow> {
    const name = assertName(input.name);
    const slug = taxonomyRepo.normalizeSlug(name);
    if (!slug) throw new ServiceError("Nama tidak valid", 400, "validation");
    // Integrity: a referenced industry_id must be live in the namespace.
    if (input.industryId) await this.getIndustry(ctx, input.industryId);
    const { row, created } = await taxonomyRepo.occupation.upsertBySlug(ctx, {
      name,
      slug,
      nameEn: input.nameEn ?? null,
      parentId: input.parentId ?? null,
      industryId: input.industryId ?? null,
      description: input.description ?? null,
      source: input.source ?? "manual",
      confidence: input.confidence ?? null,
    });
    if (created) await this.audit(ctx, "taxonomy.occupation.create", "occupation", row.id, { slug });
    return row;
  },

  /**
   * UPDATE / RENAME. Renaming re-normalizes the slug; we guard against renaming
   * onto a slug that ALREADY belongs to another live row in the tenant namespace
   * (that's what `merge` is for). Only the tenant's OWN rows are editable — the
   * global base is read-only (the update no-ops with a 404 if you target it).
   */
  async updateIndustry(
    ctx: TenantContext,
    id: string,
    input: UpdateTaxonomyInput,
  ): Promise<IndustryRow> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = assertName(input.name);
      const slug = taxonomyRepo.normalizeSlug(name);
      if (!slug) throw new ServiceError("Nama tidak valid", 400, "validation");
      const clash = await taxonomyRepo.industry.getBySlug(ctx, slug);
      if (clash && clash.id !== id && clash.tenantId === ctx.tenantId) {
        throw new ServiceError(
          "Industri dengan nama itu sudah ada — gunakan gabung (merge)",
          409,
          "conflict",
        );
      }
      patch.name = name;
      patch.slug = slug;
    }
    if (input.nameEn !== undefined) patch.nameEn = input.nameEn;
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    if (input.description !== undefined) patch.description = input.description;
    const row = await taxonomyRepo.industry.update(ctx, id, patch);
    if (!row) {
      throw new ServiceError("Industri tidak ditemukan atau bukan milik tenant", 404, "not_found");
    }
    await this.audit(ctx, "taxonomy.industry.update", "industry", id, { fields: Object.keys(patch) });
    return row;
  },

  async updateOccupation(
    ctx: TenantContext,
    id: string,
    input: UpdateTaxonomyInput,
  ): Promise<OccupationRow> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = assertName(input.name);
      const slug = taxonomyRepo.normalizeSlug(name);
      if (!slug) throw new ServiceError("Nama tidak valid", 400, "validation");
      const clash = await taxonomyRepo.occupation.getBySlug(ctx, slug);
      if (clash && clash.id !== id && clash.tenantId === ctx.tenantId) {
        throw new ServiceError(
          "Pekerjaan dengan nama itu sudah ada — gunakan gabung (merge)",
          409,
          "conflict",
        );
      }
      patch.name = name;
      patch.slug = slug;
    }
    if (input.nameEn !== undefined) patch.nameEn = input.nameEn;
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    if (input.industryId !== undefined) {
      if (input.industryId) await this.getIndustry(ctx, input.industryId);
      patch.industryId = input.industryId;
    }
    if (input.description !== undefined) patch.description = input.description;
    const row = await taxonomyRepo.occupation.update(ctx, id, patch);
    if (!row) {
      throw new ServiceError("Pekerjaan tidak ditemukan atau bukan milik tenant", 404, "not_found");
    }
    await this.audit(ctx, "taxonomy.occupation.update", "occupation", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  // ── soft-delete / restore / purge (industry) ─────────────────────────────
  async softDeleteIndustry(ctx: TenantContext, id: string): Promise<void> {
    const ok = await taxonomyRepo.industry.softDelete(ctx, id);
    if (!ok) throw new ServiceError("Industri tidak ditemukan atau bukan milik tenant", 404, "not_found");
    await this.audit(ctx, "taxonomy.industry.delete", "industry", id);
  },
  async restoreIndustry(ctx: TenantContext, id: string): Promise<IndustryRow> {
    const ok = await taxonomyRepo.industry.restore(ctx, id);
    if (!ok) throw new ServiceError("Industri tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "taxonomy.industry.restore", "industry", id);
    return this.getIndustry(ctx, id);
  },
  async hardDeleteIndustry(ctx: TenantContext, id: string): Promise<void> {
    const ok = await taxonomyRepo.industry.hardDelete(ctx, id);
    if (!ok) throw new ServiceError("Industri tidak ditemukan atau bukan milik tenant", 404, "not_found");
    await this.audit(ctx, "taxonomy.industry.purge", "industry", id);
  },

  // ── soft-delete / restore / purge (occupation) ───────────────────────────
  async softDeleteOccupation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await taxonomyRepo.occupation.softDelete(ctx, id);
    if (!ok) throw new ServiceError("Pekerjaan tidak ditemukan atau bukan milik tenant", 404, "not_found");
    await this.audit(ctx, "taxonomy.occupation.delete", "occupation", id);
  },
  async restoreOccupation(ctx: TenantContext, id: string): Promise<OccupationRow> {
    const ok = await taxonomyRepo.occupation.restore(ctx, id);
    if (!ok) throw new ServiceError("Pekerjaan tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "taxonomy.occupation.restore", "occupation", id);
    return this.getOccupation(ctx, id);
  },
  async hardDeleteOccupation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await taxonomyRepo.occupation.hardDelete(ctx, id);
    if (!ok) throw new ServiceError("Pekerjaan tidak ditemukan atau bukan milik tenant", 404, "not_found");
    await this.audit(ctx, "taxonomy.occupation.purge", "occupation", id);
  },

  // ── merge ────────────────────────────────────────────────────────────────
  /** Merge `fromId` INTO `toId`: re-point refs, soft-delete the merged-away row. */
  async mergeIndustry(ctx: TenantContext, fromId: string, toId: string): Promise<IndustryRow> {
    if (fromId === toId) throw new ServiceError("Tidak bisa gabung ke dirinya sendiri", 400, "validation");
    await this.getIndustry(ctx, fromId); // both must be live + visible
    await this.getIndustry(ctx, toId);
    const survivor = await taxonomyRepo.industry.merge(ctx, fromId, toId);
    if (!survivor) throw new ServiceError("Gagal menggabungkan industri", 500, "internal");
    await this.audit(ctx, "taxonomy.industry.merge", "industry", toId, { fromId });
    return survivor;
  },
  async mergeOccupation(ctx: TenantContext, fromId: string, toId: string): Promise<OccupationRow> {
    if (fromId === toId) throw new ServiceError("Tidak bisa gabung ke dirinya sendiri", 400, "validation");
    await this.getOccupation(ctx, fromId);
    await this.getOccupation(ctx, toId);
    const survivor = await taxonomyRepo.occupation.merge(ctx, fromId, toId);
    if (!survivor) throw new ServiceError("Gagal menggabungkan pekerjaan", 500, "internal");
    await this.audit(ctx, "taxonomy.occupation.merge", "occupation", toId, { fromId });
    return survivor;
  },

  // ═══════════════════════ AI classify ══════════════════════════════
  /**
   * Classify a crawled entity into an `industry` or `occupation`. Loads the live
   * candidate list (global ∪ tenant), asks the model to FIT an existing one (or
   * propose a new label only if confident), then runs the deterministic VALID
   * guard. Returns the resolved id (or null = unclassified) + whether a new row
   * was minted. NEVER throws on an AI failure — degrades to unclassified.
   */
  async classify(ctx: TenantContext, input: ClassifyInput): Promise<ClassifyResult> {
    const { kind, entity } = input;
    if (kind !== "industry" && kind !== "occupation") {
      throw new ServiceError("kind harus 'industry' atau 'occupation'", 400, "validation");
    }
    const facade = taxonomyRepo.for(kind);
    const candidates = (await facade.list(ctx)) as Array<IndustryRow | OccupationRow>;

    const blob = entityBlob(entity);
    if (!blob.trim()) {
      return { id: null, created: false, reasoning: "Tidak ada sinyal untuk diklasifikasi.", confidence: 0 };
    }

    // Compact candidate menu for the prompt (id + bilingual label). Bound to keep
    // the context small; a tenant's curated list is the realistic case.
    const menu = candidates
      .slice(0, 400)
      .map((c) => `${c.id} :: ${c.name}${c.nameEn ? ` / ${c.nameEn}` : ""}`)
      .join("\n");
    const label = kind === "industry" ? "industri (line of business perusahaan)" : "pekerjaan (job family seseorang)";

    let parsed: ClassifyJson | null = null;
    try {
      const system =
        `Kamu mengklasifikasi sebuah entitas ke daftar ${label} yang SUDAH ADA. ` +
        "UTAMAKAN mencocokkan ke salah satu kandidat yang ada (kembalikan matchId-nya). " +
        "HANYA usulkan label BARU (proposedNew) bila kamu yakin tidak ada kandidat yang cocok. " +
        "Balas HANYA satu objek JSON valid dengan kunci persis: " +
        '{"matchId": string|null, "proposedNew": {"name": string, "nameEn": string}|null, "confidence": number (0..1), "reasoning": string}. ' +
        "matchId HARUS salah satu id dari daftar kandidat (atau null). Tanpa teks lain di luar JSON. " +
        SAFETY_RULES;
      const prompt =
        `Kandidat ${label} (format "id :: nama / nameEn"):\n` +
        (menu || "(daftar kosong)") +
        "\n\n" +
        wrapUntrusted("entitas", blob) +
        "\n\nKlasifikasikan entitas di atas. Balas JSON saja.";

      const { text } = await meteredGenerateText(ctx, {
        feature: `taxonomy-classify-${kind}`,
        system,
        prompt,
        // Reasoning models are floored to ≥1200 by the meter; this is the visible-
        // answer budget for the small JSON object.
        maxOutputTokens: 400,
      });
      parsed = parseClassifyJson(text);
    } catch (err) {
      // No key / credit out / provider error → unclassified, never throw.
      console.error("[taxonomy.classify] AI call failed:", err);
      return {
        id: null,
        created: false,
        reasoning: "Klasifikasi AI tidak tersedia (degradasi aman).",
        confidence: 0,
      };
    }

    if (!parsed) {
      return { id: null, created: false, reasoning: "Output AI tidak bisa diparse.", confidence: 0 };
    }
    const { confidence, reasoning } = parsed;

    // 1) matchId → reuse, but VERIFY it's a real live candidate in the namespace.
    if (parsed.matchId) {
      const match = candidates.find((c) => c.id === parsed!.matchId);
      if (match) {
        return { id: match.id, created: false, reasoning, confidence, row: match };
      }
      // Hallucinated id — fall through to the proposedNew / threshold path.
    }

    // 2) proposedNew → normalize + collision-check against existing candidates.
    if (parsed.proposedNew) {
      const proposedName = parsed.proposedNew.name.trim();
      const slug = taxonomyRepo.normalizeSlug(proposedName);
      if (slug) {
        const collision = candidates.find(
          (c) => taxonomyRepo.normalizeSlug(c.name) === slug || c.slug === slug,
        );
        if (collision) {
          // Alias collision → REUSE the existing row (no dup).
          return { id: collision.id, created: false, reasoning, confidence, row: collision };
        }
        // 3) Confident enough → mint a new source="ai" row (concurrency-safe).
        if (confidence >= CLASSIFY_CONFIDENCE_THRESHOLD) {
          const { row, created } = await facade.upsertBySlug(ctx, {
            name: proposedName,
            slug,
            nameEn: parsed.proposedNew.nameEn ?? null,
            source: "ai",
            confidence,
          } as never);
          if (created) {
            await this.audit(ctx, `taxonomy.${kind}.ai_create`, kind, row.id, {
              slug,
              confidence,
            });
          }
          return { id: row.id, created, reasoning, confidence, row };
        }
      }
    }

    // 4) Nothing fit + not confident enough → unclassified.
    return { id: null, created: false, reasoning, confidence };
  },

  // ═══════════════════════ internal ═════════════════════════════════
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string,
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
