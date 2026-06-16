import { create } from "zustand";
import { persist } from "zustand/middleware";

// Active-workspace context (doc 44, workspace-first nav). Persisted so the chosen
// workspace survives reloads. Scoped feature pages read this to filter; the gate
// blocks scoped routes until a workspace is selected.
export interface ActiveWorkspace {
  id: string;
  name: string;
  type?: string;
}

interface WorkspaceState {
  active: ActiveWorkspace | null;
  setActive: (ws: ActiveWorkspace | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      active: null,
      setActive: (ws) => set({ active: ws }),
    }),
    { name: "maira-active-workspace-v1" },
  ),
);
