import { create } from "zustand";

import { deals as seed } from "@/lib/api-mock/data";
import type { Deal, DealStage } from "@/lib/types";

interface PipelineState {
  deals: Deal[];
  moveDeal: (id: string, stage: DealStage) => void;
}

// Seeded from mock deals; drag-drop changes persist for the session (build.md §11).
export const usePipelineStore = create<PipelineState>((set) => ({
  deals: seed.map((d) => ({ ...d })),
  moveDeal: (id, stage) =>
    set((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, stage } : d)),
    })),
}));

export const STAGES: { key: DealStage; label: string }[] = [
  { key: "prospek", label: "Prospek" },
  { key: "kualifikasi", label: "Kualifikasi" },
  { key: "penawaran", label: "Penawaran" },
  { key: "negosiasi", label: "Negosiasi" },
  { key: "tutup", label: "Tutup" },
];
