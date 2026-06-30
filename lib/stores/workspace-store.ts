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
  /**
   * Auto-resolve the active workspace from the tenant's list. Picks (and
   * persists) the FIRST workspace when none is selected yet — so a freshly
   * onboarded tenant lands in a working, scoped app without manually choosing.
   * Also re-validates an existing selection: if the persisted active workspace
   * no longer exists (deleted/archived elsewhere), it falls back to the first.
   * Returns the resolved active workspace (or null when the list is empty).
   */
  ensureActive: (list: ActiveWorkspace[]) => ActiveWorkspace | null;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      active: null,
      setActive: (ws) => set({ active: ws }),
      ensureActive: (list) => {
        if (list.length === 0) return get().active;
        const current = get().active;
        const stillValid = current && list.some((w) => w.id === current.id);
        if (stillValid) return current;
        const first = list[0];
        set({ active: first });
        return first;
      },
    }),
    { name: "maira-active-workspace-v1" },
  ),
);
