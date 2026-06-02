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

  // Deals
  moveDeal: (id: string, stage: DealStage) => void;

  // Products
  addProduct: (p: Omit<EnrichmentProduct, "id">) => void;
  updateProduct: (id: string, patch: Partial<Omit<EnrichmentProduct, "id">>) => void;
  removeProduct: (id: string) => void;
  resetProducts: () => void;
}

// Seeded from mock deals; drag-drop changes persist for the session (build.md §11).
export const usePipelineStore = create<PipelineState>((set) => ({
  deals: seed.map((d) => ({ ...d })),
  products: seedProducts.map((p) => ({ ...p })),
  analyses: seedAnalyses.map((a) => ({ ...a })),

  moveDeal: (id, stage) =>
    set((s) => {
      const deals = s.deals.map((d) =>
        d.id === id ? { ...d, stage } : d,
      );
      // Keep analyses' stage in sync with the underlying deal for accurate filters.
      const analyses = s.analyses.map((a) =>
        a.dealId === id ? { ...a, stage } : a,
      );
      return { deals, analyses };
    }),

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
