// Bahasa Indonesia system prompt builder for the Deepseek-backed AI assistant.
//
// The legacy `composeKbReply` (lib/utils/compose-kb-reply.ts) generates an
// entire mock answer from the KB. This module is different: it produces a
// system prompt that pins the REAL LLM to the same KB, plus light retrieval
// helpers (segment detection + top-K source selection).
//
// Consumed by Agents B–E (chat route, auto-reply, analysis). Keep the exports
// stable.

import { formatIDR } from "@/lib/utils/format-idr";
import { SAFETY_RULES, wrapUntrusted, looksInjected } from "@/lib/ai/safety";
import type {
  KbProduct,
  KbSegment,
  KbSource,
  KnowledgeBase,
} from "@/lib/types/kb";

// ── Public surface ──────────────────────────────────────────────────────────

export interface KbPromptOptions {
  /** Hint a segment so the system prompt prioritises that segment's data. */
  segmentHint?: string; // segment label like "UMKM", "Menengah", "Korporat"
  /** Tune verbosity / register for the surface. */
  surface?: "chat" | "auto-reply" | "analysis";
  /** When true, include the top-K retrieved sources inline (Advanced RAG §4). */
  includeSources?: boolean;
  /** Optional free-text prompt — used to bias retrieval / segment detection. */
  userPrompt?: string;
}

// ── Truncation limits (per spec) ────────────────────────────────────────────

const MAX_PRODUCTS = 6;
const MAX_PRICING_TIERS = 8;
const MAX_SEGMENTS = 4;
const MAX_STRATEGY = 4;
const MAX_UPSELL = 4;
const MAX_RETENTION = 5;
const MAX_SOURCES = 3;

// ── Helpers ─────────────────────────────────────────────────────────────────

function billingSuffix(b: "bulanan" | "tahunan" | "satu-kali"): string {
  if (b === "tahunan") return "/tahun";
  if (b === "bulanan") return "/bulan";
  return " (satu kali)";
}

function findSegmentByHint(
  hint: string | undefined,
  kb: KnowledgeBase,
): KbSegment | null {
  if (!hint) return null;
  const h = hint.trim().toLowerCase();
  return (
    kb.segments.find((s) => s.label.toLowerCase() === h) ??
    kb.segments.find((s) => s.id.toLowerCase() === h) ??
    null
  );
}

// ── Segment detection (mirrors compose-kb-reply heuristics) ─────────────────

/**
 * Heuristic segment detection (UMKM / Menengah / Korporat) from free text.
 * Logic mirrors `compose-kb-reply.ts` so the prompt-builder behaves
 * consistently with the legacy mock answer composer.
 */
export function detectSegmentFromText(
  text: string,
  kb: KnowledgeBase,
): { id: string; label: string } | null {
  if (!text) return null;
  const p = text.toLowerCase();

  const findByLabel = (label: KbSegment["label"]) =>
    kb.segments.find((s) => s.label === label) ?? null;

  if (p.includes("umkm") || p.includes("warung") || p.includes("mikro")) {
    const s = findByLabel("UMKM");
    return s ? { id: s.id, label: s.label } : null;
  }
  if (
    p.includes("korporat") ||
    p.includes("enterprise") ||
    p.includes("perusahaan besar")
  ) {
    const s = findByLabel("Korporat");
    return s ? { id: s.id, label: s.label } : null;
  }
  if (
    p.includes("menengah") ||
    p.includes("startup") ||
    p.includes("tim 15")
  ) {
    const s = findByLabel("Menengah");
    return s ? { id: s.id, label: s.label } : null;
  }

  const headcount = p.match(/(\d{1,4})\s*(orang|karyawan|user|pengguna|sales)/);
  if (headcount) {
    const n = Number(headcount[1]);
    if (n <= 10) {
      const s = findByLabel("UMKM");
      return s ? { id: s.id, label: s.label } : null;
    }
    if (n <= 200) {
      const s = findByLabel("Menengah");
      return s ? { id: s.id, label: s.label } : null;
    }
    const s = findByLabel("Korporat");
    return s ? { id: s.id, label: s.label } : null;
  }
  return null;
}

// ── RAG retrieval (lexical scoring — no real embeddings in demo) ────────────

interface ScoredSource {
  source: KbSource;
  score: number;
}

function tokenize(text: string): string[] {
  // Note: avoid the Unicode property regex (`\p{L}`) so this file compiles
  // under the project's current TS target. We strip only ASCII punctuation
  // and common Indonesian symbols — accented chars survive.
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreSource(source: KbSource, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = [
    source.title,
    source.description ?? "",
    source.ref ?? "",
    source.question ?? "",
    source.answer ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack) return 0;

  let score = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 1;
  }
  // Tie-break: prefer FAQ + indexed + active sources slightly.
  if (source.status === "indexed") score += 0.25;
  if (source.kind === "faq") score += 0.1;
  return score;
}

/**
 * Top-K relevant KB sources for a prompt, scoped by segment if given.
 * Lexical (token-overlap) scoring — the demo doesn't run real embeddings.
 */
export function retrieveSources(
  text: string,
  kb: KnowledgeBase,
  segmentId?: string,
  k: number = MAX_SOURCES,
): { title: string; kind: string; ref?: string }[] {
  const pool = kb.sources.filter((s) => s.active);
  const scoped = segmentId
    ? pool.filter(
        (s) =>
          !s.segmentScope ||
          s.segmentScope.length === 0 ||
          s.segmentScope.includes(segmentId),
      )
    : pool;

  const tokens = tokenize(text);
  const scored: ScoredSource[] = scoped.map((source) => ({
    source,
    score: scoreSource(source, tokens),
  }));

  // If nothing matched lexically, fall back to most-recently-indexed sources.
  const positives = scored.filter((s) => s.score > 0);
  const ranked = (positives.length > 0 ? positives : scored).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Recency tiebreak — newest indexed first.
    return (
      Date.parse(b.source.lastIndexedAt || "") -
      Date.parse(a.source.lastIndexedAt || "")
    );
  });

  return ranked.slice(0, Math.max(0, k)).map(({ source }) => ({
    title: source.title,
    kind: source.kind,
    ref: source.ref,
  }));
}

// ── Prompt section builders ─────────────────────────────────────────────────

function productLine(p: KbProduct, segmentLabel?: string): string {
  const segSuffix = segmentLabel ? ` (segmen: ${segmentLabel})` : "";
  return `- ${p.name} — ${p.description}${segSuffix}`;
}

function buildProductsSection(kb: KnowledgeBase): string[] {
  const active = kb.products.filter((p) => p.active);
  const list = (active.length > 0 ? active : kb.products).slice(0, MAX_PRODUCTS);
  if (list.length === 0) return [];

  // Best-effort segment label per product, derived from priority mapping.
  const segmentOfProduct = (id: string): string | undefined => {
    const mapping = kb.priorityProducts.find((m) =>
      m.productIds.includes(id),
    );
    if (!mapping) return undefined;
    return kb.segments.find((s) => s.id === mapping.segmentId)?.label;
  };

  return [
    "# Produk aktif",
    ...list.map((p) => productLine(p, segmentOfProduct(p.id))),
  ];
}

function buildPricingSection(kb: KnowledgeBase): string[] {
  if (kb.pricing.length === 0) return [];
  const productById = new Map(kb.products.map((p) => [p.id, p]));

  const tiers = [...kb.pricing]
    .sort((a, b) => a.priceIDR - b.priceIDR)
    .slice(0, MAX_PRICING_TIERS);

  const lines = tiers.map((t) => {
    const product = productById.get(t.productId);
    const productName = product?.name ?? "Produk";
    const feats = t.features.slice(0, 3).join(", ");
    const featsPart = feats ? ` — ${feats}` : "";
    return `- ${productName} · ${t.tierName}: ${formatIDR(t.priceIDR)}${billingSuffix(t.billing)}${featsPart}`;
  });
  return ["# Harga (per tier)", ...lines];
}

function buildSegmentsSection(kb: KnowledgeBase): string[] {
  if (kb.segments.length === 0) return [];
  const list = kb.segments.slice(0, MAX_SEGMENTS);
  const lines = list.map((s) => {
    const tp = s.talkingPoints.slice(0, 3).join(" · ");
    const tpPart = tp ? ` — talking points: ${tp}` : "";
    return `- ${s.label} (${s.headcountBand}, ${s.revenueBand})${tpPart}`;
  });
  return ["# Segmen pelanggan", ...lines];
}

function buildStrategySection(kb: KnowledgeBase): string[] {
  if (kb.marketingStrategy.length === 0) return [];
  const segmentById = new Map(kb.segments.map((s) => [s.id, s.label]));
  const list = kb.marketingStrategy.slice(0, MAX_STRATEGY);
  const lines = list.map((n) => {
    const scope = n.segmentId
      ? segmentById.get(n.segmentId) ?? "segmen khusus"
      : "semua segmen";
    return `- "${n.title}" (${scope}) — ${n.body}`;
  });
  return ["# Strategi pemasaran", ...lines];
}

function buildUpsellSection(kb: KnowledgeBase): string[] {
  if (kb.upsellMap.length === 0) return [];
  const productById = new Map(kb.products.map((p) => [p.id, p]));
  const list = kb.upsellMap.slice(0, MAX_UPSELL);

  const lines = list
    .map((rule) => {
      const from = productById.get(rule.fromProductId);
      if (!from) return null;
      const targets = rule.toProductIds
        .map((id) => productById.get(id)?.name)
        .filter((n): n is string => Boolean(n));
      if (targets.length === 0) return null;
      return `- ${from.name} → ${targets.join("/")}: ${rule.rationale}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) return [];
  return ["# Aturan upsell", ...lines];
}

function buildRetentionSection(kb: KnowledgeBase): string[] {
  const active = kb.retentionFlows.filter((f) => f.active);
  const list = (active.length > 0 ? active : kb.retentionFlows).slice(
    0,
    MAX_RETENTION,
  );
  if (list.length === 0) return [];

  const lines = list.map(
    (f) =>
      `- "${f.name}" (${f.type}) — pemicu: ${f.trigger} · aksi: ${f.action} · jeda: ${f.delayDays} hari`,
  );
  return ["# Alur retensi", ...lines];
}

function buildSourcesSection(
  kb: KnowledgeBase,
  userPrompt: string | undefined,
  segmentId: string | undefined,
): string[] {
  const sources = retrieveSources(
    userPrompt ?? "",
    kb,
    segmentId,
    MAX_SOURCES,
  );
  if (sources.length === 0) return [];
  const lines = sources.map((s) => {
    const ref = s.ref ? ` — ${s.ref}` : "";
    return `- [${s.kind}] "${s.title}"${ref}`;
  });
  return ["# Sumber pengetahuan tambahan (RAG)", ...lines];
}

// ── Public entrypoint ───────────────────────────────────────────────────────

/**
 * Build the Bahasa Indonesia system prompt that pins the real Deepseek model
 * to the live KB. The output is meant to be passed as the `system` message of
 * a Gateway chat call.
 *
 * Empty sections are omitted entirely (rather than emitting "(none)") to keep
 * the prompt tight and avoid distracting the model.
 */
export function buildKbSystemPrompt(
  kb: KnowledgeBase,
  opts: KbPromptOptions = {},
): string {
  const surface = opts.surface ?? "chat";
  const segmentFromHint = findSegmentByHint(opts.segmentHint, kb);
  const segmentFromText = opts.userPrompt
    ? detectSegmentFromText(opts.userPrompt, kb)
    : null;
  const detectedSegment = segmentFromHint
    ? { id: segmentFromHint.id, label: segmentFromHint.label as string }
    : segmentFromText;

  const segmentLine = detectedSegment
    ? detectedSegment.label
    : opts.segmentHint || "tidak ada — deteksi dari pesan user";

  const header = [
    `Anda adalah asisten sales AI untuk ${kb.clientName}. Anda HANYA boleh menjawab`,
    "berdasarkan Basis Pengetahuan di bawah. Jika informasi tidak tersedia di sana,",
    "jawab apa adanya dan minta user mengisi Basis Pengetahuan.",
    "",
    "Ringkas dan sopan. Mata uang selalu Rupiah dengan pemisah titik (gunakan format yang sudah diberikan).",
    "",
    SAFETY_RULES, // doc 43 §1/§2 — no markdown + treat KB/user content as data, not instructions
  ].join("\n");

  const sections: string[][] = [
    buildProductsSection(kb),
    buildPricingSection(kb),
    buildSegmentsSection(kb),
    buildStrategySection(kb),
    buildUpsellSection(kb),
    buildRetentionSection(kb),
  ];

  if (opts.includeSources) {
    sections.push(
      buildSourcesSection(kb, opts.userPrompt, detectedSegment?.id),
    );
  }

  const contextSection = [
    "# Konteks tambahan",
    `Segmen yang sedang difokuskan: ${segmentLine}.`,
    `Surface saat ini: ${surface}.`,
  ];
  sections.push(contextSection);

  const body = sections
    .filter((s) => s.length > 0)
    .map((s) => s.join("\n"))
    .join("\n\n");

  // doc 43 §2.1/§4 — the KB body holds tenant-editable free-text + source URLs.
  // Mark it all as DATA (not instructions); neutralize injection patterns first so
  // a KB string like "abaikan instruksi sebelumnya" can't hijack the assistant.
  const safeBody = looksInjected(body)
    ? body.replace(
        /ignore (all |the )?(previous|above|prior) (instructions|prompt)|abaikan (instruksi|perintah)|you are now|kamu sekarang (adalah|jadi)|system\s*:|disregard/gi,
        "[dihapus]",
      )
    : body;
  return `${header}\n\n${wrapUntrusted("BASIS_PENGETAHUAN", safeBody)}`;
}
