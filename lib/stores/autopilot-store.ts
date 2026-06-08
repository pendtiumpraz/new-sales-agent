// Autopilot Zustand store (foundation) — owned by Agent A.
// In-memory only (build.md hard rule: no localStorage). Holds the current run,
// historical runs from the session, and the config the operator is editing.
import { create } from "zustand";

import {
  DEFAULT_AUTOPILOT_CONFIG,
  type AutopilotRun,
  type AutopilotRunConfig,
  type AutopilotStepEvent,
} from "@/lib/types/autopilot";

export interface AutopilotState {
  /** Run currently executing, paused, or just finished and still visible. */
  currentRun: AutopilotRun | null;
  /** Completed/stopped runs from this session, newest first. */
  history: AutopilotRun[];
  /** Config the operator is editing in the panel (separate from currentRun.config). */
  config: AutopilotRunConfig;

  setConfig: (patch: Partial<AutopilotRunConfig>) => void;
  /**
   * Start a new run. Snapshots the provided (or store) config into
   * currentRun.config and returns the new runId. If a run is already in
   * progress, it is moved to history first.
   */
  startRun: (config?: AutopilotRunConfig) => string;
  /** Append a timeline event to the current run. No-op if no current run. */
  appendEvent: (event: Omit<AutopilotStepEvent, "id" | "runId">) => void;
  /** Patch the most recent event of the current run (e.g. mark it done). */
  updateLastEvent: (patch: Partial<AutopilotStepEvent>) => void;
  /** Set the current run's lifecycle status. */
  setRunStatus: (status: AutopilotRun["status"]) => void;
  /** Increment one of the run-level metrics counters (default by = 1). */
  bumpMetric: (key: keyof AutopilotRun["metrics"], by?: number) => void;
  /** Stop the current run, mark it stopped, and archive it to history. */
  stopRun: () => void;
  /** Clear the current run without archiving (used by "ulangi" reset). */
  resetRun: () => void;
}

/** Stable id generator — crypto.randomUUID if available, else a fallback. */
function makeId(prefix: string): string {
  const g: { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return `${prefix}_${g.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function emptyMetrics(): AutopilotRun["metrics"] {
  return {
    prospectsEngaged: 0,
    liSent: 0,
    liAccepted: 0,
    repliesReceived: 0,
    meetingsBooked: 0,
    cosDeployed: 0,
  };
}

/** Deep-ish clone of a config so mutations to one copy don't leak into others. */
function cloneConfig(c: AutopilotRunConfig): AutopilotRunConfig {
  return {
    ...c,
    guardrails: { ...c.guardrails },
  };
}

export const useAutopilotStore = create<AutopilotState>((set) => ({
  currentRun: null,
  history: [],
  config: cloneConfig(DEFAULT_AUTOPILOT_CONFIG),

  setConfig: (patch) =>
    set((s) => ({
      config: {
        ...s.config,
        ...patch,
        guardrails: {
          ...s.config.guardrails,
          ...(patch.guardrails ?? {}),
        },
      },
    })),

  startRun: (config) => {
    const runId = makeId("run");
    const startedAt = new Date().toISOString();
    let createdRun: AutopilotRun | null = null;
    set((s) => {
      const snapshot = cloneConfig(config ?? s.config);
      const run: AutopilotRun = {
        id: runId,
        startedAt,
        config: snapshot,
        events: [],
        status: "running",
        metrics: emptyMetrics(),
      };
      createdRun = run;
      const archived =
        s.currentRun && s.currentRun.status !== "done"
          ? [
              {
                ...s.currentRun,
                status: "stopped" as const,
                finishedAt:
                  s.currentRun.finishedAt ?? new Date().toISOString(),
              },
              ...s.history,
            ]
          : s.currentRun
            ? [s.currentRun, ...s.history]
            : s.history;
      return { currentRun: run, history: archived };
    });
    // createdRun is assigned synchronously in set() above.
    void createdRun;
    return runId;
  },

  appendEvent: (event) =>
    set((s) => {
      if (!s.currentRun) return s;
      const full: AutopilotStepEvent = {
        ...event,
        id: makeId("evt"),
        runId: s.currentRun.id,
      };
      return {
        currentRun: {
          ...s.currentRun,
          events: [...s.currentRun.events, full],
        },
      };
    }),

  updateLastEvent: (patch) =>
    set((s) => {
      if (!s.currentRun || s.currentRun.events.length === 0) return s;
      const events = s.currentRun.events.slice();
      const last = events[events.length - 1];
      events[events.length - 1] = { ...last, ...patch };
      return { currentRun: { ...s.currentRun, events } };
    }),

  setRunStatus: (status) =>
    set((s) => {
      if (!s.currentRun) return s;
      const finishedAt =
        status === "done" || status === "stopped" || status === "failed"
          ? (s.currentRun.finishedAt ?? new Date().toISOString())
          : s.currentRun.finishedAt;
      return {
        currentRun: { ...s.currentRun, status, finishedAt },
      };
    }),

  bumpMetric: (key, by = 1) =>
    set((s) => {
      if (!s.currentRun) return s;
      return {
        currentRun: {
          ...s.currentRun,
          metrics: {
            ...s.currentRun.metrics,
            [key]: s.currentRun.metrics[key] + by,
          },
        },
      };
    }),

  stopRun: () =>
    set((s) => {
      if (!s.currentRun) return s;
      const stopped: AutopilotRun = {
        ...s.currentRun,
        status: "stopped",
        finishedAt: s.currentRun.finishedAt ?? new Date().toISOString(),
      };
      return {
        currentRun: stopped,
        history: [stopped, ...s.history],
      };
    }),

  resetRun: () => set({ currentRun: null }),
}));
