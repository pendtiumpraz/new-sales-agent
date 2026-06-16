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

  // Deals
  moveDeal: (id: string, stage: DealStage) => void;

  // Products
  addProduct: (p: Omit<EnrichmentProduct, "id">) => void;
  updateProduct: (id: string, patch: Partial<Omit<EnrichmentProduct, "id">>) => void;
  removeProduct: (id: string) => void;
  resetProducts: () => void;
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

  moveDeal: (id, stage) => {
    set((s) => {
      const deals = s.deals.map((d) =>
        d.id === id ? { ...d, stage } : d,
      );
      return { deals, analyses: deriveAnalyses(deals, s.products) };
    });
    persistDeals();
  },

  addProduct: (p) =>
    set((s) => {
      const id = `pd_user_${Date.now().toString(36)}`;
      const products = [...s.products, { id, ...p }];
      // Rebuild analyses' matched products against the new product set.
      const analyses = deriveAnalyses(s.deals, products);
      return { products, analyses };
    }),

  updateProduct: (id, patch) =>
    set((s) => {
      const products = s.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      const analyses = deriveAnalyses(s.deals, products);
      return { products, analyses };
    }),

  removeProduct: (id) =>
    set((s) => {
      const products = s.products.filter((p) => p.id !== id);
      const analyses = deriveAnalyses(s.deals, products);
      return { products, analyses };
    }),

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
