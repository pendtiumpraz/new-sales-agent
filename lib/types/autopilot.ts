// Autopilot types (foundation) — shared contract for the Autopilot feature.
// Owned by Agent A. Do NOT add these to lib/types.ts (different owner).
// All copy is Bahasa Indonesia, palette neutral, data fully mocked.

/** Ordered keys of the 10-step Autopilot pipeline. */
export type AutopilotStep =
  | "select-audience"
  | "generate-li-notes"
  | "send-li-requests"
  | "track-acceptances"
  | "generate-intro-dms"
  | "send-intro-dms"
  | "track-replies"
  | "propose-meetings"
  | "book-meetings"
  | "deploy-cos";

/** Per-step lifecycle status (used in timeline events and step indicators). */
export type AutopilotStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";

/**
 * Canonical, ordered list of steps with Bahasa Indonesia labels and
 * descriptions. Consumed by the page UI (Agent B), the orchestrator
 * (Agent D), and nav previews (Agent E).
 */
export const AUTOPILOT_STEPS: {
  key: AutopilotStep;
  label: string;
  description: string;
}[] = [
  {
    key: "select-audience",
    label: "Pilih audiens",
    description: "Memilih prospek sesuai segmen dan skor AI",
  },
  {
    key: "generate-li-notes",
    label: "Tulis catatan LinkedIn",
    description: "AI menyusun catatan koneksi personal per prospek",
  },
  {
    key: "send-li-requests",
    label: "Kirim koneksi LinkedIn",
    description: "Mengirim permintaan koneksi (mock — Unipile API)",
  },
  {
    key: "track-acceptances",
    label: "Pantau penerimaan",
    description: "Memantau koneksi yang diterima",
  },
  {
    key: "generate-intro-dms",
    label: "Tulis pesan pembuka",
    description: "AI menyusun pesan intro berbasis Basis Pengetahuan",
  },
  {
    key: "send-intro-dms",
    label: "Kirim pesan pembuka",
    description: "Mengirim DM pembuka via LinkedIn",
  },
  {
    key: "track-replies",
    label: "Pantau balasan",
    description: "Memantau balasan dengan sentimen positif",
  },
  {
    key: "propose-meetings",
    label: "Tawarkan jadwal meeting",
    description: "AI mengusulkan 3 slot waktu",
  },
  {
    key: "book-meetings",
    label: "Booking kalender",
    description: "Booking di Google Calendar (mock)",
  },
  {
    key: "deploy-cos",
    label: "Pasang Chief of Staff",
    description:
      "Bot CoS bergabung ke setiap meeting untuk catat tindak lanjut",
  },
];

/** Configuration the operator picks before pressing the big Autopilot button. */
export interface AutopilotRunConfig {
  /** Filter prospects by business segment. */
  audienceSegment?: "UMKM" | "Menengah" | "Korporat";
  /** Minimum AI lead score (0–100) to be considered. */
  audienceMinScore?: number;
  /** Optional city filter (e.g. "Jakarta"). */
  audienceCity?: string;
  /** Hard cap on prospects engaged this run. */
  audienceCap?: number;
  /** Safety rails for sending operations. */
  guardrails: {
    /** Max LinkedIn requests sent per day. Default 50. */
    maxLiPerDay: number;
    /** Quiet-hours start, "HH:MM" 24h. Default "20:00". */
    quietHoursStart: string;
    /** Quiet-hours end, "HH:MM" 24h. Default "08:00". */
    quietHoursEnd: string;
    /** If true, pipeline pauses before sending DMs (human-in-the-loop). */
    pauseBeforeSendingMessages: boolean;
  };
  /** Overall outcome the operator is optimising for. */
  goal: "book-meeting" | "build-relationship" | "qualify";
}

/** A single entry in the run timeline. */
export interface AutopilotStepEvent {
  id: string;
  runId: string;
  step: AutopilotStep;
  status: AutopilotStepStatus;
  prospectId?: string;
  prospectName?: string;
  prospectCompany?: string;
  /** Short Bahasa Indonesia headline shown in the timeline row. */
  title: string;
  /** Longer description, generated text snippet, or failure detail. */
  detail?: string;
  /** Where the data came from — "real" (AI text route) or "mock" (helpers). */
  source: "real" | "mock";
  startedAt: string;
  finishedAt?: string;
}

/** One Autopilot run, with config snapshot, timeline events, and metrics. */
export interface AutopilotRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  config: AutopilotRunConfig;
  events: AutopilotStepEvent[];
  status: "idle" | "running" | "paused" | "done" | "stopped" | "failed";
  metrics: {
    prospectsEngaged: number;
    liSent: number;
    liAccepted: number;
    repliesReceived: number;
    meetingsBooked: number;
    cosDeployed: number;
  };
}

/** Default config a fresh user sees when opening the Autopilot page. */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotRunConfig = {
  audienceSegment: "UMKM",
  audienceMinScore: 75,
  audienceCity: undefined,
  audienceCap: 12,
  guardrails: {
    maxLiPerDay: 50,
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    pauseBeforeSendingMessages: false,
  },
  goal: "book-meeting",
};
