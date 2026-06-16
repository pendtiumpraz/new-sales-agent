import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  seedCandidates,
  seedFlows,
  seedKpi,
} from "@/lib/api-mock/retention";
import type {
  RetentionCandidate,
  RetentionFlow,
  RetentionKpi,
  RetentionStatus,
  RetentionStep,
} from "@/lib/types/retention";

interface RetentionState {
  flows: RetentionFlow[];
  candidates: RetentionCandidate[];
  kpi: RetentionKpi;

  // Flow-level
  toggleStatus: (id: string) => void;
  setStatus: (id: string, status: RetentionStatus) => void;
  updateFlow: (
    id: string,
    patch: Partial<Omit<RetentionFlow, "id" | "steps">>,
  ) => void;

  // Step-level
  setSteps: (flowId: string, steps: RetentionStep[]) => void;
  updateStep: (
    flowId: string,
    stepId: string,
    patch: Partial<RetentionStep>,
  ) => void;
  addStep: (flowId: string, step: RetentionStep) => void;
  removeStep: (flowId: string, stepId: string) => void;

  // Candidates
  enrollCandidate: (contactId: string) => void;

  reset: () => void;
}

const now = () => new Date().toISOString();

export const useRetentionStore = create<RetentionState>()(
  persist(
    (set) => ({
  flows: seedFlows.map((f) => ({ ...f, steps: f.steps.map((s) => ({ ...s })) })),
  candidates: seedCandidates.map((c) => ({ ...c })),
  kpi: { ...seedKpi },

  toggleStatus: (id) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === id
          ? {
              ...f,
              status: f.status === "aktif" ? "jeda" : "aktif",
              updatedAt: now(),
            }
          : f,
      ),
    })),

  setStatus: (id, status) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === id ? { ...f, status, updatedAt: now() } : f,
      ),
    })),

  updateFlow: (id, patch) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === id ? { ...f, ...patch, updatedAt: now() } : f,
      ),
    })),

  setSteps: (flowId, steps) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === flowId ? { ...f, steps, updatedAt: now() } : f,
      ),
    })),

  updateStep: (flowId, stepId, patch) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === flowId
          ? {
              ...f,
              steps: f.steps.map((st) =>
                st.id === stepId ? { ...st, ...patch } : st,
              ),
              updatedAt: now(),
            }
          : f,
      ),
    })),

  addStep: (flowId, step) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === flowId
          ? { ...f, steps: [...f.steps, step], updatedAt: now() }
          : f,
      ),
    })),

  removeStep: (flowId, stepId) =>
    set((s) => ({
      flows: s.flows.map((f) =>
        f.id === flowId
          ? {
              ...f,
              steps: f.steps.filter((st) => st.id !== stepId),
              updatedAt: now(),
            }
          : f,
      ),
    })),

  enrollCandidate: (contactId) =>
    set((s) => ({
      candidates: s.candidates.filter((c) => c.contactId !== contactId),
      flows: s.flows.map((f) => {
        const target = s.candidates.find((c) => c.contactId === contactId);
        return target && target.recommendedFlowId === f.id
          ? { ...f, enrolled: f.enrolled + 1, updatedAt: now() }
          : f;
      }),
    })),

  reset: () =>
    set(() => ({
      flows: seedFlows.map((f) => ({
        ...f,
        steps: f.steps.map((s) => ({ ...s })),
      })),
      candidates: seedCandidates.map((c) => ({ ...c })),
      kpi: { ...seedKpi },
    })),
    }),
    {
      name: "maira-retention-v1",
      // only persist data, not the action fns
      partialize: (s) => ({ flows: s.flows, candidates: s.candidates, kpi: s.kpi }),
    },
  ),
);

/** Convenience labels for type badges (Bahasa Indonesia). */
export const FLOW_TYPE_LABEL: Record<
  RetentionFlow["type"],
  { label: string; variant: "default" | "secondary" | "warning" }
> = {
  "repeat-order": { label: "Pesanan berulang", variant: "default" },
  upsell: { label: "Upsell", variant: "warning" },
  "after-sales": { label: "After-sales", variant: "secondary" },
};

export const FLOW_STATUS_LABEL: Record<
  RetentionStatus,
  { label: string; variant: "success" | "warning" | "muted" }
> = {
  aktif: { label: "Aktif", variant: "success" },
  jeda: { label: "Jeda", variant: "warning" },
  draft: { label: "Draf", variant: "muted" },
};
