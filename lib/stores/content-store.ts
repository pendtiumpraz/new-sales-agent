import { create } from "zustand";

import { content as seed } from "@/lib/api-mock/data";
import type { ContentItem, ContentStatus } from "@/lib/types";

interface ContentState {
  items: ContentItem[];
  add: (item: ContentItem) => void;
  update: (id: string, patch: Partial<ContentItem>) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: ContentStatus) => void;
  schedule: (id: string, scheduledFor: string) => void;
}

// In-memory only (build.md hard rule). Seeded from content.json; create / edit /
// status changes persist for the session.
export const useContentStore = create<ContentState>((set) => ({
  items: seed.map((i) => ({ ...i })),
  add: (item) => set((s) => ({ items: [item, ...s.items] })),
  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, ...patch, updatedAt: new Date().toISOString() }
          : i,
      ),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  setStatus: (id, status) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status, updatedAt: new Date().toISOString() }
          : i,
      ),
    })),
  schedule: (id, scheduledFor) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              scheduledFor,
              status: "scheduled",
              updatedAt: new Date().toISOString(),
            }
          : i,
      ),
    })),
}));
