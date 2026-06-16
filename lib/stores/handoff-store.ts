// Handoff store (Wave 2C) — workspace-level config + per-conversation
// handoff state. In-memory only (build.md hard rule: no localStorage).
import { create } from "zustand";

import {
  DEFAULT_COMPLEXITY_TOPICS,
  conversationSentiments,
  getSentiment,
} from "@/lib/api-mock/handoff";
import type {
  ConversationHandoffState,
  HandoffConfig,
  HandoffTrigger,
} from "@/lib/types/handoff";

interface HandoffStore {
  config: HandoffConfig;
  states: Record<string, ConversationHandoffState>;
  hydrated: boolean;

  /** Load persisted config from the server (once). Call on the settings page mount. */
  hydrate: () => Promise<void>;

  // Config mutators
  setSentimentThreshold: (value: number) => void;
  setTimeoutMinutes: (value: number) => void;
  addComplexityTopic: (topic: string) => void;
  removeComplexityTopic: (topic: string) => void;
  setAutoReplyEnabled: (enabled: boolean) => void;
  toggleAutoReplyForConversation: (conversationId: string) => void;

  // Per-conversation actions
  takeOver: (conversationId: string, agentName: string) => void;
  releaseHandoff: (conversationId: string) => void;

  // Selectors (called from components — derived, not memoized)
  getState: (conversationId: string) => ConversationHandoffState;
  /** Compute which triggers currently fire for a conversation, given config. */
  getActiveTriggers: (conversationId: string) => HandoffTrigger[];
}

/** Compute live triggers from sentiment + config. */
function computeTriggers(
  conversationId: string,
  config: HandoffConfig,
): HandoffTrigger[] {
  const s = getSentiment(conversationId);
  const triggers: HandoffTrigger[] = [];

  // Sentiment threshold: drop below threshold (the threshold is on the
  // positive-leaning 0..100 axis where lower means more negative). We
  // map the raw score (-100..+100) onto 0..100 for comparison.
  const mapped = (s.score + 100) / 2;
  if (mapped < config.sentimentThreshold) triggers.push("sentiment");

  // Timeout: minutes since last AI response > config.timeoutMinutes.
  const elapsedMin =
    (Date.now() - new Date(s.lastAiResponseAt).getTime()) / 60_000;
  if (elapsedMin > config.timeoutMinutes) triggers.push("timeout");

  // Complexity: any conversation topic intersects the configured list.
  const wants = new Set(config.complexityTopics.map((t) => t.toLowerCase()));
  if (s.topics.some((t) => wants.has(t.toLowerCase())))
    triggers.push("complexity");

  return triggers;
}

const initialConfig: HandoffConfig = {
  sentimentThreshold: 30,
  timeoutMinutes: 15,
  complexityTopics: [...DEFAULT_COMPLEXITY_TOPICS],
  autoReplyEnabled: true,
};

/** Seed an entry per known conversation so toggles have something to bind to. */
function seedStates(
  config: HandoffConfig,
): Record<string, ConversationHandoffState> {
  const map: Record<string, ConversationHandoffState> = {};
  for (const s of conversationSentiments) {
    map[s.conversationId] = {
      conversationId: s.conversationId,
      status: "ai",
      activeTriggers: computeTriggers(s.conversationId, config),
    };
  }
  return map;
}

export const useHandoffStore = create<HandoffStore>((set, get) => ({
  config: initialConfig,
  states: seedStates(initialConfig),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const r = await fetch("/api/tenant/handoff");
      if (r.ok) {
        const j = (await r.json()) as { config?: HandoffConfig | null };
        if (j?.config) {
          const merged = { ...initialConfig, ...j.config };
          skipSave = true;
          set({ config: merged, states: seedStates(merged), hydrated: true });
          skipSave = false;
          return;
        }
      }
    } catch {
      /* keep defaults when offline / no DB */
    }
    set({ hydrated: true });
  },

  setSentimentThreshold: (value) =>
    set((s) => ({
      config: { ...s.config, sentimentThreshold: clamp(value, 0, 100) },
    })),

  setTimeoutMinutes: (value) =>
    set((s) => ({
      config: { ...s.config, timeoutMinutes: Math.max(1, Math.round(value)) },
    })),

  addComplexityTopic: (topic) =>
    set((s) => {
      const trimmed = topic.trim();
      if (!trimmed) return s;
      if (
        s.config.complexityTopics.some(
          (t) => t.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return s;
      }
      return {
        config: {
          ...s.config,
          complexityTopics: [...s.config.complexityTopics, trimmed],
        },
      };
    }),

  removeComplexityTopic: (topic) =>
    set((s) => ({
      config: {
        ...s.config,
        complexityTopics: s.config.complexityTopics.filter((t) => t !== topic),
      },
    })),

  setAutoReplyEnabled: (enabled) =>
    set((s) => ({ config: { ...s.config, autoReplyEnabled: enabled } })),

  toggleAutoReplyForConversation: () =>
    // Per-conversation overrides aren't part of this wave — keep the API
    // here so the panel UI can call it; toggles the global flag.
    set((s) => ({
      config: { ...s.config, autoReplyEnabled: !s.config.autoReplyEnabled },
    })),

  takeOver: (conversationId, agentName) =>
    set((s) => ({
      states: {
        ...s.states,
        [conversationId]: {
          conversationId,
          status: "handed-off",
          activeTriggers:
            s.states[conversationId]?.activeTriggers ??
            computeTriggers(conversationId, s.config),
          takenOverBy: agentName,
          takenOverAt: new Date().toISOString(),
        },
      },
    })),

  releaseHandoff: (conversationId) =>
    set((s) => ({
      states: {
        ...s.states,
        [conversationId]: {
          conversationId,
          status: "ai",
          activeTriggers: computeTriggers(conversationId, s.config),
        },
      },
    })),

  getState: (conversationId) => {
    const existing = get().states[conversationId];
    if (existing) return existing;
    return {
      conversationId,
      status: "ai",
      activeTriggers: computeTriggers(conversationId, get().config),
    };
  },

  getActiveTriggers: (conversationId) =>
    computeTriggers(conversationId, get().config),
}));

// Persist config to the server whenever it changes (DB-backed, not localStorage —
// honours the no-localStorage rule). `skipSave` guards the echo during hydrate().
let skipSave = false;
async function saveConfig(config: HandoffConfig): Promise<void> {
  try {
    await fetch("/api/tenant/handoff", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  } catch {
    /* best-effort; UI already reflects the change */
  }
}
useHandoffStore.subscribe((state, prev) => {
  if (skipSave) return;
  if (state.config !== prev.config) void saveConfig(state.config);
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}
