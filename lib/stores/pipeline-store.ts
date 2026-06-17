import { create } from "zustand";

import { deals as seed } from "@/lib/api-mock/data";
import { seedProducts, deriveAnalyses } from "@/lib/api-mock/enrichment";
import type { Deal, DealStage } from "@/lib/types";
import type {
  EnrichmentDealAnalysis,
  EnrichmentProduct,
} from "@/lib/types/enrichment";

interface PipelineState {
  deals: Deal[];
  products: EnrichmentProduct[];
  analyses: EnrichmentDealAnalysis[];

  // Persistence flag — only the deals slice round-trips to /api/db/deals.
  dealsHydrated: boolean;
  hydrateDeals: () => Promise<void>;
  /** Force a re-fetch (bypasses the hydrated guard) — used after restoring a deal. */
  refreshDeals: () => Promise<void>;

  // Deals
  moveDeal: (id: string, stage: DealStage) => void;
  /** Soft-delete a deal (doc 49): drop it from the board + set deleted_at in the DB. */
  archiveDeal: (id: string) => Promise<void>;

  // Products — now DB-backed via /api/db/products (audit #5).
  productsHydrated: boolean;
  hydrateProducts: () => Promise<void>;
  addProduct: (p: Omit<EnrichmentProduct, "id">) => void;
  updateProduct: (id: string, patch: Partial<Omit<EnrichmentProduct, "id">>) => void;
  removeProduct: (id: string) => void;
  resetProducts: () => void;
}

// Persist one product (create/edit). Fire-and-forget; the store already updated
// optimistically so the UI + AI re-mapping stay instant.
function persistProduct(p: EnrichmentProduct) {
  if (typeof window === "undefined") return;
  fetch("/api/db/products", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: p }) }).catch((e) => console.error("[product persist]", e));
}

// Debounced PUT — collapses rapid drag-drop / inline edits into a single round-trip.
let persistTimeout: ReturnType<typeof setTimeout> | undefined;
function persistDeals() {
  if (typeof window === "undefined") return;
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    const deals = usePipelineStore.getState().deals;
    fetch("/api/db/deals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: deals }),
    }).catch((e) => console.error("[pipeline persist]", e));
  }, 400);
}

// In-flight hydration promise — guards against duplicate fetches when multiple
// components mount simultaneously and all call hydrateDeals().
let hydratePromise: Promise<void> | undefined;

// Seeded from mock deals; drag-drop changes persist via /api/db/deals (build.md §11).
export const usePipelineStore = create<PipelineState>((set, get) => ({
  deals: seed.map((d) => ({ ...d })),
  products: seedProducts.map((p) => ({ ...p })),
  analyses: deriveAnalyses(seed, seedProducts),

  dealsHydrated: false,
  productsHydrated: false,

  hydrateProducts: async () => {
    if (get().productsHydrated || typeof window === "undefined") return;
    try {
      const res = await fetch("/api/db/products");
      if (res.ok) {
        const body = (await res.json()) as { data?: EnrichmentProduct[] };
        if (Array.isArray(body?.data)) {
          set((s) => ({ products: body.data!, analyses: deriveAnalyses(s.deals, body.data!), productsHydrated: true }));
          return;
        }
      }
      set({ productsHydrated: true });
    } catch (err) {
      console.error("[pipeline hydrateProducts]", err);
      set({ productsHydrated: true });
    }
  },

  hydrateDeals: async () => {
    if (get().dealsHydrated) return;
    if (hydratePromise) return hydratePromise;
    if (typeof window === "undefined") return;
    hydratePromise = (async () => {
      try {
        const res = await fetch("/api/db/deals");
        if (!res.ok) throw new Error(`hydrate failed: ${res.status}`);
        const body = (await res.json()) as { data: Deal[] };
        if (Array.isArray(body?.data)) {
          // Analyses derived from the REAL deals (no dummy) — value/stage/updatedAt.
          set((s) => ({ deals: body.data, analyses: deriveAnalyses(body.data, s.products), dealsHydrated: true }));
        } else {
          set({ dealsHydrated: true });
        }
      } catch (err) {
        console.error("[pipeline hydrate]", err);
        // Mark hydrated anyway so we don't loop on a broken backend.
        set({ dealsHydrated: true });
      } finally {
        hydratePromise = undefined;
      }
    })();
    return hydratePromise;
  },

  refreshDeals: async () => {
    if (typeof window === "undefined") return;
    try {
      const res = await fetch("/api/db/deals");
      if (!res.ok) return;
      const body = (await res.json()) as { data: Deal[] };
      if (Array.isArray(body?.data)) set((s) => ({ deals: body.data, analyses: deriveAnalyses(body.data, s.products), dealsHydrated: true }));
    } catch (err) {
      console.error("[pipeline refresh]", err);
    }
  },

  moveDeal: (id, stage) => {
    set((s) => {
      const deals = s.deals.map((d) =>
        d.id === id ? { ...d, stage } : d,
      );
      return { deals, analyses: deriveAnalyses(deals, s.products) };
    });
    persistDeals();
  },

  archiveDeal: async (id) => {
    // Drop from the board immediately (Kanban + table); the debounced PUT never
    // touches deleted_at, so a stale persist can't resurrect it.
    set((s) => {
      const deals = s.deals.filter((d) => d.id !== id);
      return { deals, analyses: deriveAnalyses(deals, s.products) };
    });
    try {
      await fetch("/api/data/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "deal", id }) });
    } catch (err) {
      console.error("[pipeline archive]", err);
    }
  },

  addProduct: (p) => {
    const id = `pd_user_${Date.now().toString(36)}`;
    const product = { id, ...p } as EnrichmentProduct;
    set((s) => {
      const products = [...s.products, product];
      return { products, analyses: deriveAnalyses(s.deals, products) };
    });
    persistProduct(product); // DB-backed (audit #5)
  },

  updateProduct: (id, patch) => {
    set((s) => {
      const products = s.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { products, analyses: deriveAnalyses(s.deals, products) };
    });
    const updated = get().products.find((p) => p.id === id);
    if (updated) persistProduct(updated);
  },

  removeProduct: (id) => {
    set((s) => {
      const products = s.products.filter((p) => p.id !== id);
      return { products, analyses: deriveAnalyses(s.deals, products) };
    });
    if (typeof window !== "undefined") {
      fetch("/api/db/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch((e) => console.error("[product delete]", e));
    }
  },

  resetProducts: () =>
    set((s) => ({
      products: seedProducts.map((p) => ({ ...p })),
      analyses: deriveAnalyses(s.deals, seedProducts),
    })),
}));

export const STAGES: { key: DealStage; label: string }[] = [
  { key: "prospek", label: "Prospek" },
  { key: "kualifikasi", label: "Kualifikasi" },
  { key: "penawaran", label: "Penawaran" },
  { key: "negosiasi", label: "Negosiasi" },
  { key: "tutup", label: "Tutup" },
];
