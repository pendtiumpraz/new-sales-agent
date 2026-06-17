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

  // Persistence flags / lifecycle
  hydrated: boolean;
  hydrate: () => Promise<void>;

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

// Deep clone the seed so the in-memory KB never shares references with the
// frozen mock module (prevents accidental mutations leaking across stores).
const cloneSeed = (): KnowledgeBase => ({
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
});

// ── Debounced persistence ────────────────────────────────────────────────
// Every store mutation calls persistKb() after set(...). We coalesce bursts of
// edits (e.g. typing in a text field) into a single PUT after 400ms of quiet.
// Server-side calls are a no-op; the route handles the !hasDb() case gracefully.
let persistTimeout: ReturnType<typeof setTimeout> | undefined;
let hydratePromise: Promise<void> | undefined;

function persistKb() {
  if (typeof window === "undefined") return; // server-side no-op
  // Don't persist before hydration completes — otherwise the seed clone would
  // immediately overwrite whatever is in the DB on first load.
  if (!useKbStore.getState().hydrated) return;
  clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    const kb = useKbStore.getState().kb;
    fetch("/api/db/kb", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: kb }),
    }).catch((e) => console.error("[kb-store persist]", e));
  }, 400);
}

// Seeded from mock KB; edits persist via /api/db/kb (Postgres + Vercel).
export const useKbStore = create<KbState>((set, get) => ({
  kb: cloneSeed(),
  hydrated: false,

  // ── Lifecycle ────────────────────────────────────────────────────────
  hydrate: async () => {
    if (typeof window === "undefined") return;
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        const res = await fetch("/api/db/kb", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data?: KnowledgeBase };
          // Real data loaded, OR an OK-but-empty DB (seed is the legit starting
          // point) → safe to mark hydrated and allow persistence.
          set(json?.data ? { kb: json.data, hydrated: true } : { hydrated: true });
        }
        // A non-OK response (auth / 500) does NOT mark hydrated — otherwise the
        // next edit would persistKb() the in-memory SEED over real DB data (#18).
      } catch (e) {
        console.error("[kb-store hydrate]", e);
        // Transient failure — leave hydrated=false so we never clobber the DB.
      } finally {
        // Allow a later hydrate() to retry after a failed load (don't cache the
        // failed attempt). On success, keep the promise so it won't re-run.
        if (!get().hydrated) hydratePromise = undefined;
      }
    })();
    return hydratePromise;
  },

  // ── Products ─────────────────────────────────────────────────────────
  addProduct: (p) => {
    const id = newId("prod");
    set((s) => ({
      kb: stamp({ ...s.kb, products: [...s.kb.products, { id, ...p }] }),
    }));
    persistKb();
    return id;
  },
  updateProduct: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        products: s.kb.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }),
    }));
    persistKb();
  },
  removeProduct: (id) => {
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
    }));
    persistKb();
  },

  // ── Pricing ──────────────────────────────────────────────────────────
  addPricing: (t) => {
    const id = newId("price");
    set((s) => ({
      kb: stamp({ ...s.kb, pricing: [...s.kb.pricing, { id, ...t }] }),
    }));
    persistKb();
    return id;
  },
  updatePricing: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        pricing: s.kb.pricing.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }),
    }));
    persistKb();
  },
  removePricing: (id) => {
    set((s) => ({
      kb: stamp({ ...s.kb, pricing: s.kb.pricing.filter((t) => t.id !== id) }),
    }));
    persistKb();
  },

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
    persistKb();
    return id;
  },
  updateSegment: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        segments: s.kb.segments.map((seg) =>
          seg.id === id ? { ...seg, ...patch } : seg,
        ),
      }),
    }));
    persistKb();
  },
  removeSegment: (id) => {
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
    }));
    persistKb();
  },

  setPriorityProducts: (segmentId, productIds) => {
    set((s) => {
      const exists = s.kb.priorityProducts.some((m) => m.segmentId === segmentId);
      const next = exists
        ? s.kb.priorityProducts.map((m) =>
            m.segmentId === segmentId ? { segmentId, productIds } : m,
          )
        : [...s.kb.priorityProducts, { segmentId, productIds }];
      return { kb: stamp({ ...s.kb, priorityProducts: next }) };
    });
    persistKb();
  },

  // ── Strategy notes ───────────────────────────────────────────────────
  addStrategy: (n) => {
    const id = newId("strat");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: [...s.kb.marketingStrategy, { id, ...n }],
      }),
    }));
    persistKb();
    return id;
  },
  updateStrategy: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: s.kb.marketingStrategy.map((n) =>
          n.id === id ? { ...n, ...patch } : n,
        ),
      }),
    }));
    persistKb();
  },
  removeStrategy: (id) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        marketingStrategy: s.kb.marketingStrategy.filter((n) => n.id !== id),
      }),
    }));
    persistKb();
  },

  // ── Upsell ───────────────────────────────────────────────────────────
  addUpsell: (r) => {
    const id = newId("ups");
    set((s) => ({
      kb: stamp({ ...s.kb, upsellMap: [...s.kb.upsellMap, { id, ...r }] }),
    }));
    persistKb();
    return id;
  },
  updateUpsell: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        upsellMap: s.kb.upsellMap.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      }),
    }));
    persistKb();
  },
  removeUpsell: (id) => {
    set((s) => ({
      kb: stamp({ ...s.kb, upsellMap: s.kb.upsellMap.filter((u) => u.id !== id) }),
    }));
    persistKb();
  },

  // ── Retention ────────────────────────────────────────────────────────
  addRetention: (f) => {
    const id = newId("ret");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: [...s.kb.retentionFlows, { id, ...f }],
      }),
    }));
    persistKb();
    return id;
  },
  updateRetention: (id, patch) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      }),
    }));
    persistKb();
  },
  removeRetention: (id) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.filter((f) => f.id !== id),
      }),
    }));
    persistKb();
  },
  toggleRetention: (id) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        retentionFlows: s.kb.retentionFlows.map((f) =>
          f.id === id ? { ...f, active: !f.active } : f,
        ),
      }),
    }));
    persistKb();
  },

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
      persistKb();
      return existingId;
    }
    const id = newId("src");
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: [...s.kb.sources, { id, ...(src as Omit<KbSource, "id">) }],
      }),
    }));
    persistKb();
    return id;
  },
  removeSource: (id) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: s.kb.sources.filter((x) => x.id !== id),
      }),
    }));
    persistKb();
  },
  toggleSourceActive: (id) => {
    set((s) => ({
      kb: stamp({
        ...s.kb,
        sources: s.kb.sources.map((x) =>
          x.id === id ? { ...x, active: !x.active } : x,
        ),
      }),
    }));
    persistKb();
  },
  setSourceStatus: (id, status) => {
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
    }));
    persistKb();
  },
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
