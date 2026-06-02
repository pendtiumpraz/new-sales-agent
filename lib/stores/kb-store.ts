import { create } from "zustand";

import { seedKnowledgeBase } from "@/lib/api-mock/kb";
import type {
  KbPricingTier,
  KbProduct,
  KbRetentionFlow,
  KbSegment,
  KbSource,
  KbSourceStatus,
  KbStrategyNote,
  KbUpsellRule,
  KnowledgeBase,
} from "@/lib/types/kb";

// Local counter so IDs in this session are deterministic + unique.
let seq = 1000;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${seq++}`;

interface KbState {
  kb: KnowledgeBase;

  // Products
  addProduct: (p: Omit<KbProduct, "id">) => string;
  updateProduct: (id: string, patch: Partial<KbProduct>) => void;
  removeProduct: (id: string) => void;

  // Pricing
  addPricing: (t: Omit<KbPricingTier, "id">) => string;
  updatePricing: (id: string, patch: Partial<KbPricingTier>) => void;
  removePricing: (id: string) => void;

  // Segments
  addSegment: (s: Omit<KbSegment, "id">) => string;
  updateSegment: (id: string, patch: Partial<KbSegment>) => void;
  removeSegment: (id: string) => void;

  // Priority products (per segment)
  setPriorityProducts: (segmentId: string, productIds: string[]) => void;

  // Strategy notes
  addStrategy: (n: Omit<KbStrategyNote, "id">) => string;
  updateStrategy: (id: string, patch: Partial<KbStrategyNote>) => void;
  removeStrategy: (id: string) => void;

  // Upsell rules
  addUpsell: (r: Omit<KbUpsellRule, "id">) => string;
  updateUpsell: (id: string, patch: Partial<KbUpsellRule>) => void;
  removeUpsell: (id: string) => void;

  // Retention flows
  addRetention: (f: Omit<KbRetentionFlow, "id">) => string;
  updateRetention: (id: string, patch: Partial<KbRetentionFlow>) => void;
  removeRetention: (id: string) => void;
  toggleRetention: (id: string) => void;

  // Sources (Advanced RAG)
  upsertSource: (src: KbSource | Omit<KbSource, "id">) => string;
  removeSource: (id: string) => void;
  toggleSourceActive: (id: string) => void;
  setSourceStatus: (id: string, status: KbSourceStatus) => void;
}

const stamp = (kb: KnowledgeBase): KnowledgeBase => ({
  ...kb,
  lastUpdated: new Date().toISOString(),
});

// Seeded from mock KB; edits persist for the session only (build.md §11).
export const useKbStore = create<KbState>((set) => ({
  kb: {
    ...seedKnowledgeBase,
    products: seedKnowledgeBase.products.map((p) => ({ ...p })),
    pricing: seedKnowledgeBase.pricing.map((p) => ({ ...p })),
    segments: seedKnowledgeBase.segments.map((s) => ({
      ...s,
      talkingPoints: [...s.talkingPoints],
    })),
    priorityProducts: seedKnowledgeBase.priorityProducts.map((m) => ({
      ...m,
      productIds: [...m.productIds],
    })),
    marketingStrategy: seedKnowledgeBase.marketingStrategy.map((n) => ({ ...n })),
    upsellMap: seedKnowledgeBase.upsellMap.map((u) => ({
      ...u,
      toProductIds: [...u.toProductIds],
    })),
    retentionFlows: seedKnowledgeBase.retentionFlows.map((f) => ({
      ...f,
      productIds: [...f.productIds],
      segmentIds: [...f.segmentIds],
    })),
    sources: seedKnowledgeBase.sources.map((s) => ({
      ...s,
      segmentScope: s.segmentScope ? [...s.segmentScope] : [],
    })),
  },

  // ── Products ─────────────────────────────────────────────────────────
  addProduct: (p) => {
    const id = newId("prod");
    set((s) => ({
      kb: stamp({ ...s.kb, products: [...s.kb.products, { id, ...p }] }),
    }));
    return id;
  },
  updateProduct: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        products: s.kb.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }),
    })),
  removeProduct: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        products: s.kb.products.filter((p) => p.id !== id),
        // Cascade: drop pricing tied to this product
        pricing: s.kb.pricing.filter((t) => t.productId !== id),
        // Cascade: drop upsell rules that reference this product
        upsellMap: s.kb.upsellMap
          .filter((u) => u.fromProductId !== id)
          .map((u) => ({
            ...u,
            toProductIds: u.toProductIds.filter((p) => p !== id),
          })),
        priorityProducts: s.kb.priorityProducts.map((m) => ({
          ...m,
          productIds: m.productIds.filter((p) => p !== id),
        })),
        retentionFlows: s.kb.retentionFlows.map((f) => ({
          ...f,
          productIds: f.productIds.filter((p) => p !== id),
        })),
      }),
    })),

  // ── Pricing ──────────────────────────────────────────────────────────
  addPricing: (t) => {
    const id = newId("price");
    set((s) => ({
      kb: stamp({ ...s.kb, pricing: [...s.kb.pricing, { id, ...t }] }),
    }));
    return id;
  },
  updatePricing: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        pricing: s.kb.pricing.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }),
    })),
  removePricing: (id) =>
    set((s) => ({
      kb: stamp({ ...s.kb, pricing: s.kb.pricing.filter((t) => t.id !== id) }),
    })),

  // ── Segments ─────────────────────────────────────────────────────────
  addSegment: (segment) => {
    const id = newId("seg");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        segments: [...s.kb.segments, { id, ...segment }],
        priorityProducts: [
          ...s.kb.priorityProducts,
          { segmentId: id, productIds: [] },
        ],
      }),
    }));
    return id;
  },
  updateSegment: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        segments: s.kb.segments.map((seg) =>
          seg.id === id ? { ...seg, ...patch } : seg,
        ),
      }),
    })),
  removeSegment: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        segments: s.kb.segments.filter((seg) => seg.id !== id),
        priorityProducts: s.kb.priorityProducts.filter((m) => m.segmentId !== id),
        marketingStrategy: s.kb.marketingStrategy.map((n) =>
          n.segmentId === id ? { ...n, segmentId: null } : n,
        ),
        retentionFlows: s.kb.retentionFlows.map((f) => ({
          ...f,
          segmentIds: f.segmentIds.filter((sId) => sId !== id),
        })),
        // Sources: do NOT delete — un-scope so they fall back to "semua segmen".
        sources: s.kb.sources.map((src) => ({
          ...src,
          segmentScope: (src.segmentScope ?? []).filter((sId) => sId !== id),
        })),
      }),
    })),

  setPriorityProducts: (segmentId, productIds) =>
    set((s) => {
      const exists = s.kb.priorityProducts.some((m) => m.segmentId === segmentId);
      const next = exists
        ? s.kb.priorityProducts.map((m) =>
            m.segmentId === segmentId ? { segmentId, productIds } : m,
          )
        : [...s.kb.priorityProducts, { segmentId, productIds }];
      return { kb: stamp({ ...s.kb, priorityProducts: next }) };
    }),

  // ── Strategy notes ───────────────────────────────────────────────────
  addStrategy: (n) => {
    const id = newId("strat");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: [...s.kb.marketingStrategy, { id, ...n }],
      }),
    }));
    return id;
  },
  updateStrategy: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: s.kb.marketingStrategy.map((n) =>
          n.id === id ? { ...n, ...patch } : n,
        ),
      }),
    })),
  removeStrategy: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: s.kb.marketingStrategy.filter((n) => n.id !== id),
      }),
    })),

  // ── Upsell ───────────────────────────────────────────────────────────
  addUpsell: (r) => {
    const id = newId("ups");
    set((s) => ({
      kb: stamp({ ...s.kb, upsellMap: [...s.kb.upsellMap, { id, ...r }] }),
    }));
    return id;
  },
  updateUpsell: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        upsellMap: s.kb.upsellMap.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      }),
    })),
  removeUpsell: (id) =>
    set((s) => ({
      kb: stamp({ ...s.kb, upsellMap: s.kb.upsellMap.filter((u) => u.id !== id) }),
    })),

  // ── Retention ────────────────────────────────────────────────────────
  addRetention: (f) => {
    const id = newId("ret");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: [...s.kb.retentionFlows, { id, ...f }],
      }),
    }));
    return id;
  },
  updateRetention: (id, patch) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      }),
    })),
  removeRetention: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.filter((f) => f.id !== id),
      }),
    })),
  toggleRetention: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.map((f) =>
          f.id === id ? { ...f, active: !f.active } : f,
        ),
      }),
    })),

  // ── Sources (Advanced RAG) ───────────────────────────────────────────
  upsertSource: (src) => {
    if ("id" in src && src.id) {
      const existingId = src.id;
      set((s) => ({
        kb: stamp({
          ...s.kb,
          sources: s.kb.sources.some((x) => x.id === existingId)
            ? s.kb.sources.map((x) => (x.id === existingId ? { ...src } : x))
            : [...s.kb.sources, { ...src }],
        }),
      }));
      return existingId;
    }
    const id = newId("src");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: [...s.kb.sources, { id, ...(src as Omit<KbSource, "id">) }],
      }),
    }));
    return id;
  },
  removeSource: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: s.kb.sources.filter((x) => x.id !== id),
      }),
    })),
  toggleSourceActive: (id) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: s.kb.sources.map((x) =>
          x.id === id ? { ...x, active: !x.active } : x,
        ),
      }),
    })),
  setSourceStatus: (id, status) =>
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: s.kb.sources.map((x) =>
          x.id === id
            ? {
                ...x,
                status,
                // re-stamp the index time when it returns to "indexed"
                lastIndexedAt:
                  status === "indexed" ? new Date().toISOString() : x.lastIndexedAt,
              }
            : x,
        ),
      }),
    })),
}));

// Stable label sets used by the editor UIs.
export const SEGMENT_TIERS = ["UMKM", "Menengah", "Korporat"] as const;
export const PRODUCT_CATEGORIES = ["Inti", "Add-on", "Bundling"] as const;
export const BILLING_OPTIONS: { value: KbPricingTier["billing"]; label: string }[] = [
  { value: "bulanan", label: "Bulanan" },
  { value: "tahunan", label: "Tahunan" },
  { value: "satu-kali", label: "Satu kali" },
];
export const RETENTION_TYPES: {
  value: KbRetentionFlow["type"];
  label: string;
}[] = [
  { value: "repeat-order", label: "Repeat order" },
  { value: "after-sales", label: "After-sales" },
  { value: "loyalty", label: "Loyalty" },
];

export const SOURCE_KINDS: {
  value: KbSource["kind"];
  label: string;
}[] = [
  { value: "pdf", label: "PDF" },
  { value: "url", label: "URL" },
  { value: "faq", label: "FAQ" },
  { value: "doc", label: "Dokumen" },
];
