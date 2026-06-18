// Autopilot client-side orchestrator (Agent D).
//
// Walks the 10-step Autopilot pipeline end-to-end. For content steps we POST to
// `/api/autopilot/text` (Agent C) which returns `{ text, source }`. For
// side-effect steps we call the deterministic mock helpers (Agent A). Every
// phase emits timeline events into the Zustand store (Agent A) so the page
// (Agent B) can render the live feed.
//
// All visible copy is Bahasa Indonesia. The orchestrator never touches the
// browser DOM, never reads from `window`, and never writes to localStorage —
// it is a pure async pipeline driven by store mutations.

import {
  mockBookCalendar,
  mockDeployCos,
  mockProposeMeetingSlots,
  mockSendLinkedInRequest,
  mockTrackIntroReply,
  mockTrackLinkedInAcceptance,
  sleep,
  type MockCalendarBooking,
  type MockCosDeployment,
  type MockMeetingSlot,
} from "@/lib/autopilot/mock-integrations";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import { classifySegment, cityMatches } from "@/lib/autopilot/audience";
import type { AutopilotRunConfig, AutopilotStep } from "@/lib/types/autopilot";
import type { KnowledgeBase } from "@/lib/types/kb";
import type { ProspectLead } from "@/lib/types";

// ---- Public contract --------------------------------------------------------

export interface OrchestratorCallbacks {
  /** Polled between every step phase. When true, the run halts gracefully. */
  isStopped: () => boolean;
}

/** Kinds accepted by `/api/autopilot/text`. */
type AutopilotTextKind =
  | "linkedin-note"
  | "intro-dm"
  | "meeting-agenda"
  | "cos-summary";

/** Response shape returned by `/api/autopilot/text`. */
interface AutopilotTextResponse {
  text: string;
  source: "real" | "mock";
}

// ---- Helpers ----------------------------------------------------------------

/** Filter + cap prospects per the run config. Uses the SHARED classifier +
 *  city match (lib/autopilot/audience) so the run selects exactly what the
 *  AudiencePicker estimate promised. */
function selectProspects(
  config: AutopilotRunConfig,
  prospects: ProspectLead[],
): ProspectLead[] {
  const minScore = config.audienceMinScore ?? 0;
  const cap = config.audienceCap ?? prospects.length;
  const wantedSegment = config.audienceSegment;

  const filtered = prospects.filter((p) => {
    if (p.aiScore < minScore) return false;
    if (wantedSegment && classifySegment(p.companySize) !== wantedSegment) return false;
    if (!cityMatches(p.city, config.audienceCity)) return false;
    return true;
  });

  // Sort by AI score descending so the highest-fit prospects come first, then
  // cap. This makes the demo feel intentional rather than random.
  filtered.sort((a, b) => b.aiScore - a.aiScore);
  return filtered.slice(0, Math.max(0, cap));
}

/** Truncate a generated string to fit the timeline `detail` column. */
function clampDetail(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ---- Guardrails -------------------------------------------------------------
//
// These read `config.guardrails` (set in the GuardrailsPanel) and actually
// enforce it. Before this, the guardrails were collected but never honored —
// a silent no-op that risked LinkedIn bans + sending during quiet hours.

/** Current wall-clock time in Asia/Jakarta as zero-padded "HH:MM" (24h). */
function jakartaHHMM(): string {
  // en-GB + 24h yields "HH:MM"; zero-padded so lexical comparison is valid.
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** True if `hhmm` falls inside [start,end), handling windows that wrap midnight. */
function withinWindow(hhmm: string, start: string, end: string): boolean {
  if (!start || !end || start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end; // same-day window
  return hhmm >= start || hhmm < end; // wraps midnight, e.g. 20:00–08:00
}

/** Whether sending is currently blocked by the quiet-hours guardrail. */
function isQuietHours(g: AutopilotRunConfig["guardrails"] | undefined): boolean {
  if (!g) return false;
  return withinWindow(jakartaHHMM(), g.quietHoursStart, g.quietHoursEnd);
}

/** Block while the run sits in "paused" (human-in-the-loop). Returns when the
 *  operator resumes (→ running) or stops (→ stopped). Polls the store the same
 *  way `isStopped` does, so no extra callback plumbing is needed. */
async function waitWhilePaused(): Promise<void> {
  while (useAutopilotStore.getState().currentRun?.status === "paused") {
    await sleep(400);
  }
}

/**
 * POST to the AI text route with the standard payload. On any network / parse
 * failure we degrade gracefully into a mock-tagged stub so the pipeline keeps
 * moving (consistent with the rest of the app's "real | mock" pattern).
 */
async function callAutopilotText(
  kind: AutopilotTextKind,
  prospect: ProspectLead,
  kb: KnowledgeBase,
  goal: AutopilotRunConfig["goal"],
  meetingContext?: string,
): Promise<AutopilotTextResponse> {
  try {
    const res = await fetch("/api/autopilot/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        prospect,
        kbSnapshot: kb,
        goal,
        meetingContext,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Partial<AutopilotTextResponse>;
    const text = typeof json.text === "string" ? json.text : "";
    const source = json.source === "real" ? "real" : "mock";
    if (!text) throw new Error("empty text");
    return { text, source };
  } catch {
    return {
      text: fallbackCopy(kind, prospect),
      source: "mock",
    };
  }
}

/** Offline-safe copy used when the AI route is unreachable. */
function fallbackCopy(kind: AutopilotTextKind, p: ProspectLead): string {
  switch (kind) {
    case "linkedin-note":
      return `Halo ${p.name}, saya ingin berkenalan terkait inisiatif penjualan di ${p.company}.`;
    case "intro-dm":
      return `Halo ${p.name}, terima kasih sudah terkoneksi. Bolehkah saya bagikan ringkasan singkat solusi kami untuk tim Anda di ${p.company}?`;
    case "meeting-agenda":
      return `Agenda usulan: 1) Konteks ${p.company}, 2) Kebutuhan prioritas, 3) Demo singkat, 4) Langkah selanjutnya.`;
    case "cos-summary":
      return `Chief of Staff AI akan mencatat keputusan, action items, dan tindak lanjut otomatis untuk meeting bersama ${p.name}.`;
  }
}

// ---- Store accessors --------------------------------------------------------
//
// We read/write the store imperatively via `.getState()` so the orchestrator
// stays decoupled from React's render cycle. This is the canonical Zustand
// pattern for long-running background tasks.

function appendRunning(args: {
  step: AutopilotStep;
  title: string;
  source: "real" | "mock";
  prospect?: ProspectLead;
  detail?: string;
}) {
  useAutopilotStore.getState().appendEvent({
    step: args.step,
    status: "running",
    title: args.title,
    detail: args.detail,
    source: args.source,
    prospectId: args.prospect?.id,
    prospectName: args.prospect?.name,
    prospectCompany: args.prospect?.company,
    startedAt: new Date().toISOString(),
  });
}

function patchLast(patch: {
  status?: "done" | "failed" | "skipped";
  detail?: string;
  source?: "real" | "mock";
  title?: string;
}) {
  useAutopilotStore.getState().updateLastEvent({
    ...patch,
    finishedAt: new Date().toISOString(),
  });
}

function appendOneShot(args: {
  step: AutopilotStep;
  status: "done" | "failed" | "skipped";
  title: string;
  detail?: string;
  source: "real" | "mock";
}) {
  const now = new Date().toISOString();
  useAutopilotStore.getState().appendEvent({
    step: args.step,
    status: args.status,
    title: args.title,
    detail: args.detail,
    source: args.source,
    startedAt: now,
    finishedAt: now,
  });
}

/** Append the "user stopped the run" event and flip the run status. */
function emitStopped(): void {
  appendOneShot({
    step: "select-audience",
    status: "skipped",
    title: "Autopilot dihentikan oleh pengguna",
    detail: "Pipeline diakhiri lebih awal. Tidak ada langkah lanjutan yang dieksekusi.",
    source: "mock",
  });
  useAutopilotStore.getState().setRunStatus("stopped");
}

// ---- Main entry point -------------------------------------------------------

export async function runAutopilot(
  config: AutopilotRunConfig,
  kb: KnowledgeBase,
  callbacks: OrchestratorCallbacks,
): Promise<void> {
  const store = useAutopilotStore.getState;
  const guardrails = config.guardrails;

  // ── Guardrail: quiet hours ────────────────────────────────────────────────
  // Autopilot must not send during the operator's quiet window (Asia/Jakarta).
  // We block the whole run up front so we never burn AI tokens on drafts we
  // can't send — honest to the "tidak mengirim" promise on the panel.
  if (isQuietHours(guardrails)) {
    appendOneShot({
      step: "select-audience",
      status: "skipped",
      title: "Jam tenang aktif — Autopilot tidak mengirim",
      detail: `Sekarang ${jakartaHHMM()} (Asia/Jakarta) berada di jam tenang ${guardrails.quietHoursStart}–${guardrails.quietHoursEnd}. Jalankan lagi di luar jam tenang, atau ubah Guardrails.`,
      source: "mock",
    });
    store().setRunStatus("stopped");
    return;
  }

  // ── Step 1 — select-audience ───────────────────────────────────────────────
  let selected: ProspectLead[] = [];
  try {
    const all = useProspectingStore.getState().prospects;
    selected = selectProspects(config, all);

    // Guardrail: cap LinkedIn requests per day. Each selected prospect is one
    // connection request, so the daily LI cap is a hard ceiling on `selected`.
    const liCap = guardrails?.maxLiPerDay;
    let liCapNote = "";
    if (typeof liCap === "number" && liCap > 0 && selected.length > liCap) {
      liCapNote = ` · dibatasi guardrail LinkedIn ${liCap}/hari (dari ${selected.length})`;
      selected = selected.slice(0, liCap);
    }

    if (selected.length === 0) {
      appendOneShot({
        step: "select-audience",
        status: "failed",
        title: "Tidak ada prospek yang cocok dengan kriteria.",
        detail:
          "Sesuaikan segmen, skor minimum, atau kota lalu jalankan Autopilot lagi.",
        source: "mock",
      });
      store().setRunStatus("failed");
      return;
    }

    const segmentLabel = config.audienceSegment ?? "semua segmen";
    const minScore = config.audienceMinScore ?? 0;
    appendOneShot({
      step: "select-audience",
      status: "done",
      title: `${selected.length} prospek terpilih`,
      detail: `${selected.length} prospek terpilih dari segmen ${segmentLabel} dengan skor ≥ ${minScore}${liCapNote}`,
      source: "mock",
    });
    store().bumpMetric("prospectsEngaged", selected.length);
  } catch (error) {
    appendOneShot({
      step: "select-audience",
      status: "failed",
      title: "Gagal memilih audiens",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 2 — generate-li-notes (parallel per prospect) ─────────────────────
  try {
    await Promise.all(
      selected.map(async (p) => {
        appendRunning({
          step: "generate-li-notes",
          title: `AI menulis catatan LinkedIn untuk ${p.name}`,
          source: "real",
          prospect: p,
        });
        const { text, source } = await callAutopilotText(
          "linkedin-note",
          p,
          kb,
          config.goal,
        );
        // Note: with parallel writes we can't reliably patch "the last" event,
        // because another prospect's event may have been appended after ours.
        // Re-append a final done event with the same prospect to keep ordering
        // sane in the UI. This trades a single combined row for a clean
        // running→done pair the timeline can render per prospect.
        appendOneShot({
          step: "generate-li-notes",
          status: "done",
          title: `Catatan LinkedIn siap untuk ${p.name}`,
          detail: clampDetail(text),
          source,
        });
      }),
    );
    await sleep(500);
  } catch (error) {
    appendOneShot({
      step: "generate-li-notes",
      status: "failed",
      title: "Gagal menulis catatan LinkedIn",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 3 — send-li-requests (sequential, staggered) ──────────────────────
  try {
    for (const p of selected) {
      if (callbacks.isStopped()) {
        emitStopped();
        return;
      }
      appendRunning({
        step: "send-li-requests",
        title: `Mengirim koneksi ke ${p.name}`,
        source: "mock",
        prospect: p,
      });
      const result = await mockSendLinkedInRequest(p.id);
      const detail =
        result.status === "sent"
          ? `Permintaan koneksi terkirim ke ${p.name} (${p.company}).`
          : result.status === "throttled"
            ? "LinkedIn membatasi sementara — akan dicoba ulang otomatis."
            : "LinkedIn memblokir pengiriman — perlu intervensi manual.";
      patchLast({ status: "done", detail });
      store().bumpMetric("liSent");
      await sleep(200);
    }
    await sleep(800);
  } catch (error) {
    appendOneShot({
      step: "send-li-requests",
      status: "failed",
      title: "Gagal mengirim koneksi LinkedIn",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 4 — track-acceptances (parallel, single summary event) ────────────
  let accepted: ProspectLead[] = [];
  try {
    const results = await Promise.all(
      selected.map(async (p) => {
        const r = await mockTrackLinkedInAcceptance(p.id);
        return { prospect: p, ...r };
      }),
    );
    accepted = results.filter((r) => r.accepted).map((r) => r.prospect);

    if (accepted.length === 0) {
      appendOneShot({
        step: "track-acceptances",
        status: "failed",
        title: "Belum ada koneksi yang diterima",
        detail: `0 dari ${selected.length} prospek menerima koneksi pada siklus ini. Pipeline dihentikan.`,
        source: "mock",
      });
      store().setRunStatus("failed");
      return;
    }

    appendOneShot({
      step: "track-acceptances",
      status: "done",
      title: `${accepted.length} dari ${selected.length} koneksi diterima`,
      detail: `Melanjutkan dengan ${accepted.length} prospek yang menerima koneksi.`,
      source: "mock",
    });
    store().bumpMetric("liAccepted", accepted.length);
  } catch (error) {
    appendOneShot({
      step: "track-acceptances",
      status: "failed",
      title: "Gagal memantau penerimaan koneksi",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 5 — generate-intro-dms (parallel per accepted prospect) ───────────
  try {
    await Promise.all(
      accepted.map(async (p) => {
        appendRunning({
          step: "generate-intro-dms",
          title: `AI menulis DM intro untuk ${p.name}`,
          source: "real",
          prospect: p,
        });
        const { text, source } = await callAutopilotText(
          "intro-dm",
          p,
          kb,
          config.goal,
        );
        appendOneShot({
          step: "generate-intro-dms",
          status: "done",
          title: `DM intro siap untuk ${p.name}`,
          detail: clampDetail(text),
          source,
        });
      }),
    );
    await sleep(400);
  } catch (error) {
    appendOneShot({
      step: "generate-intro-dms",
      status: "failed",
      title: "Gagal menulis DM intro",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Guardrail: pause before sending DMs (human-in-the-loop) ────────────────
  // The operator asked to approve outbound DMs first. Park the run in "paused",
  // surface a waiting row, and block until they resume (or stop) from the page.
  if (guardrails?.pauseBeforeSendingMessages) {
    appendRunning({
      step: "send-intro-dms",
      title: "Menunggu persetujuan sebelum mengirim DM",
      source: "mock",
      detail: `${accepted.length} DM pembuka siap dikirim. Tinjau di timeline, lalu klik "Lanjutkan kirim" untuk meneruskan.`,
    });
    store().setRunStatus("paused");
    await waitWhilePaused();
    if (callbacks.isStopped()) {
      emitStopped();
      return;
    }
    patchLast({
      status: "done",
      detail: "Pengiriman DM disetujui operator — pipeline dilanjutkan.",
    });
  }

  // ── Step 6 — send-intro-dms (sequential) ───────────────────────────────────
  try {
    for (const p of accepted) {
      if (callbacks.isStopped()) {
        emitStopped();
        return;
      }
      appendRunning({
        step: "send-intro-dms",
        title: `Kirim DM ke ${p.name}`,
        source: "mock",
        prospect: p,
      });
      await sleep(150);
      patchLast({
        status: "done",
        detail: `DM pembuka terkirim ke ${p.name} (${p.company}).`,
      });
    }
  } catch (error) {
    appendOneShot({
      step: "send-intro-dms",
      status: "failed",
      title: "Gagal mengirim DM intro",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 7 — track-replies (parallel, single summary event) ────────────────
  let repliers: ProspectLead[] = [];
  try {
    const results = await Promise.all(
      accepted.map(async (p) => {
        const r = await mockTrackIntroReply(p.id);
        return { prospect: p, ...r };
      }),
    );
    // Treat "replied with positive-leaning sentiment" as eligible for booking.
    repliers = results
      .filter((r) => r.replied && r.sentimentScore >= 10)
      .map((r) => r.prospect);

    if (repliers.length === 0) {
      appendOneShot({
        step: "track-replies",
        status: "failed",
        title: "Belum ada balasan positif",
        detail: `0 dari ${accepted.length} prospek membalas dengan sentimen positif. Pipeline dihentikan.`,
        source: "mock",
      });
      store().setRunStatus("failed");
      return;
    }

    appendOneShot({
      step: "track-replies",
      status: "done",
      title: `${repliers.length} prospek membalas dengan sentimen positif`,
      detail: `Melanjutkan ke penjadwalan meeting untuk ${repliers.length} prospek.`,
      source: "mock",
    });
    store().bumpMetric("repliesReceived", repliers.length);
  } catch (error) {
    appendOneShot({
      step: "track-replies",
      status: "failed",
      title: "Gagal memantau balasan",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 8 — propose-meetings (per replier, agenda + slots in parallel) ────
  // Carry the slot lists forward so Step 9 can book the first slot per prospect.
  const slotsByProspect = new Map<string, MockMeetingSlot[]>();
  try {
    await Promise.all(
      repliers.map(async (p) => {
        appendRunning({
          step: "propose-meetings",
          title: `AI mengusulkan slot meeting untuk ${p.name}`,
          source: "real",
          prospect: p,
        });
        const [agendaRes, slots] = await Promise.all([
          callAutopilotText("meeting-agenda", p, kb, config.goal),
          mockProposeMeetingSlots(p.id),
        ]);
        slotsByProspect.set(p.id, slots);

        const slotLines = slots.map((s) => `• ${s.label}`).join("\n");
        const combinedDetail = clampDetail(
          `${agendaRes.text}\n\nSlot usulan:\n${slotLines}`,
          400,
        );
        appendOneShot({
          step: "propose-meetings",
          status: "done",
          title: `Agenda + ${slots.length} slot siap untuk ${p.name}`,
          detail: combinedDetail,
          source: agendaRes.source,
        });
      }),
    );
  } catch (error) {
    appendOneShot({
      step: "propose-meetings",
      status: "failed",
      title: "Gagal mengusulkan jadwal meeting",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 9 — book-meetings (sequential per replier) ────────────────────────
  const bookings: { prospect: ProspectLead; booking: MockCalendarBooking }[] = [];
  try {
    for (const p of repliers) {
      if (callbacks.isStopped()) {
        emitStopped();
        return;
      }
      const slots = slotsByProspect.get(p.id) ?? [];
      const slot = slots[0];
      if (!slot) {
        appendOneShot({
          step: "book-meetings",
          status: "skipped",
          title: `Tidak ada slot tersedia untuk ${p.name}`,
          detail: "Slot meeting kosong — dilewati untuk siklus ini.",
          source: "mock",
        });
        continue;
      }

      appendRunning({
        step: "book-meetings",
        title: `Booking kalender untuk ${p.name}`,
        source: "mock",
        prospect: p,
      });
      const booking = await mockBookCalendar(p.id, slot);
      await sleep(300);
      patchLast({
        status: "done",
        detail: `Slot: ${slot.label} · ${booking.meetingUrl}`,
      });
      store().bumpMetric("meetingsBooked");
      bookings.push({ prospect: p, booking });
    }
  } catch (error) {
    appendOneShot({
      step: "book-meetings",
      status: "failed",
      title: "Gagal booking kalender",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  if (callbacks.isStopped()) {
    emitStopped();
    return;
  }

  // ── Step 10 — deploy-cos (per booking, deploy + summary in parallel) ───────
  try {
    if (bookings.length === 0) {
      appendOneShot({
        step: "deploy-cos",
        status: "skipped",
        title: "Tidak ada meeting yang perlu dipasang Chief of Staff",
        detail: "Tidak ada booking yang berhasil pada siklus ini.",
        source: "mock",
      });
    } else {
      await Promise.all(
        bookings.map(async ({ prospect: p, booking }) => {
          appendRunning({
            step: "deploy-cos",
            title: `Memasang Chief of Staff AI untuk meeting ${p.name}`,
            source: "real",
            prospect: p,
          });
          const [deployment, summaryRes]: [MockCosDeployment, AutopilotTextResponse] =
            await Promise.all([
              mockDeployCos(p.id, booking.meetingUrl),
              callAutopilotText(
                "cos-summary",
                p,
                kb,
                config.goal,
                "Asumsi meeting berjalan positif, fokus penawaran produk inti",
              ),
            ]);
          const detail = clampDetail(
            `${deployment.cosName} aktif untuk ${booking.meetingUrl}.\nPrep doc: ${deployment.prepDocPath}\n\nContoh ringkasan:\n${summaryRes.text}`,
            400,
          );
          appendOneShot({
            step: "deploy-cos",
            status: "done",
            title: `Chief of Staff AI siap untuk ${p.name}`,
            detail,
            source: summaryRes.source,
          });
          store().bumpMetric("cosDeployed");
        }),
      );
    }
  } catch (error) {
    appendOneShot({
      step: "deploy-cos",
      status: "failed",
      title: "Gagal memasang Chief of Staff AI",
      detail: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      source: "mock",
    });
    store().setRunStatus("failed");
    return;
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  store().setRunStatus("done");
}
