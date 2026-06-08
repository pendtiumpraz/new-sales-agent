import { create } from "zustand";

import { deals as seed } from "@/lib/api-mock/data";
import {
  seedAnalyses,
  seedProducts,
  buildAnalyses,
} from "@/lib/api-mock/enrichment";
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
  analyses: seedAnalyses.map((a) => ({ ...a })),

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
          set((s) => {
            // Keep analyses' stage in sync with whatever the DB says.
            const stageById = new Map(body.data.map((d) => [d.id, d.stage]));
            const analyses = s.analyses.map((a) =>
              stageById.has(a.dealId)
                ? { ...a, stage: stageById.get(a.dealId) as DealStage }
                : a,
            );
            return { deals: body.data, analyses, dealsHydrated: true };
          });
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
      // Keep analyses' stage in sync with the underlying deal for accurate filters.
      const analyses = s.analyses.map((a) =>
        a.dealId === id ? { ...a, stage } : a,
      );
      return { deals, analyses };
    });
    persistDeals();
  },

  addProduct: (p) =>
    set((s) => {
      const id = `pd_user_${Date.now().toString(36)}`;
      const products = [...s.products, { id, ...p }];
      // Rebuild analyses' matched products against the new product set.
      const analyses = buildAnalyses(products);
      return { products, analyses };
    }),

  updateProduct: (id, patch) =>
    set((s) => {
      const products = s.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      const analyses = buildAnalyses(products);
      return { products, analyses };
    }),

  removeProduct: (id) =>
    set((s) => {
      const products = s.products.filter((p) => p.id !== id);
      const analyses = buildAnalyses(products);
      return { products, analyses };
    }),

  resetProducts: () =>
    set(() => ({
      products: seedProducts.map((p) => ({ ...p })),
      analyses: seedAnalyses.map((a) => ({ ...a })),
    })),
}));

export const STAGES: { key: DealStage; label: string }[] = [
  { key: "prospek", label: "Prospek" },
  { key: "kualifikasi", label: "Kualifikasi" },
  { key: "penawaran", label: "Penawaran" },
  { key: "negosiasi", label: "Negosiasi" },
  { key: "tutup", label: "Tutup" },
];
