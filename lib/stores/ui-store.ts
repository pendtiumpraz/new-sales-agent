import { create } from "zustand";

export type Locale = "id" | "en";

interface UiState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;

  inboxPanelOpen: boolean;
  toggleInboxPanel: () => void;
}

// In-memory only (build.md hard rule: no localStorage in the prototype).
export const useUiStore = create<UiState>((set) => ({
  locale: "id",
  setLocale: (locale) => set({ locale }),
  toggleLocale: () =>
    set((s) => ({ locale: s.locale === "id" ? "en" : "id" })),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  aiPanelOpen: false,
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),

  inboxPanelOpen: true,
  toggleInboxPanel: () =>
    set((s) => ({ inboxPanelOpen: !s.inboxPanelOpen })),
}));
