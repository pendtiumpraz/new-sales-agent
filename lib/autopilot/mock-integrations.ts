// Mock integration helpers (foundation) — owned by Agent A.
// Pure functions simulating LinkedIn (Unipile-style), Google Calendar, and
// Recall.ai-style CoS bot side effects. Deterministic from prospectId so the
// same demo run always produces the same outcomes. No network calls.

/** Realistic-feeling async delay used between simulated steps. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Deterministic pseudo-random helpers ----------

/** Stable 32-bit hash of a string — used to derive deterministic outcomes. */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0..1 pseudo-random derived from prospectId + salt. Deterministic. */
function rand01(prospectId: string, salt: string): number {
  const h = hashString(`${prospectId}::${salt}`);
  return (h % 10_000) / 10_000;
}

/** Inclusive integer in [min, max] from deterministic rand. */
function randInt(prospectId: string, salt: string, min: number, max: number) {
  const r = rand01(prospectId, salt);
  return min + Math.floor(r * (max - min + 1));
}

// ---------- LinkedIn (Unipile-style mock) ----------

export interface MockLinkedInRequestResult {
  prospectId: string;
  status: "sent" | "throttled" | "blocked";
  sentAt: string;
}

/**
 * Simulate POSTing a LinkedIn connection request. ~92% "sent",
 * ~6% "throttled", ~2% "blocked" (deterministic per prospect).
 */
export async function mockSendLinkedInRequest(
  prospectId: string,
): Promise<MockLinkedInRequestResult> {
  await sleep(randInt(prospectId, "li-send-delay", 400, 1100));
  const r = rand01(prospectId, "li-send-outcome");
  const status: MockLinkedInRequestResult["status"] =
    r < 0.92 ? "sent" : r < 0.98 ? "throttled" : "blocked";
  return {
    prospectId,
    status,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Simulate polling for an accepted connection. ~65% acceptance rate,
 * delayed 1–3 seconds (deterministic per prospect).
 */
export async function mockTrackLinkedInAcceptance(
  prospectId: string,
): Promise<{ accepted: boolean; atIso: string }> {
  await sleep(randInt(prospectId, "li-accept-delay", 1000, 3000));
  const accepted = rand01(prospectId, "li-accept-outcome") < 0.65;
  return { accepted, atIso: new Date().toISOString() };
}

/**
 * Simulate inbox polling for an intro DM reply. ~35% reply rate, with a
 * sentiment score in -100..+100 leaning positive when a reply happens.
 */
export async function mockTrackIntroReply(
  prospectId: string,
): Promise<{ replied: boolean; sentimentScore: number }> {
  await sleep(randInt(prospectId, "reply-delay", 800, 2400));
  const replied = rand01(prospectId, "reply-outcome") < 0.35;
  // Positive lean when replied (10..85), mildly negative otherwise (-30..+10).
  const sentimentScore = replied
    ? randInt(prospectId, "reply-sentiment-pos", 10, 85)
    : randInt(prospectId, "reply-sentiment-neg", -30, 10);
  return { replied, sentimentScore };
}

// ---------- Meeting scheduling ----------

export interface MockMeetingSlot {
  iso: string;
  /** Bahasa Indonesia label, e.g. "Selasa, 10 Juni · 10:00 WIB". */
  label: string;
}

const DAY_NAMES_ID = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatSlotLabel(d: Date): string {
  const day = DAY_NAMES_ID[d.getDay()];
  const dom = d.getDate();
  const month = MONTH_NAMES_ID[d.getMonth()];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${day}, ${dom} ${month} · ${hh}:${mm} WIB`;
}

/**
 * Propose 3 fake business-hours slots over the next 7 days. Slots fall on
 * weekdays between 09:00 and 16:00, deterministic per prospect.
 */
export async function mockProposeMeetingSlots(
  prospectId: string,
): Promise<MockMeetingSlot[]> {
  await sleep(randInt(prospectId, "slots-delay", 500, 1200));
  const slots: MockMeetingSlot[] = [];
  const now = new Date();
  let dayOffset = randInt(prospectId, "slots-day-start", 1, 2);
  let attempt = 0;

  while (slots.length < 3 && attempt < 20) {
    attempt++;
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(0, 0, 0, 0);

    // Skip weekends.
    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) {
      dayOffset++;
      continue;
    }

    const hour = randInt(prospectId, `slot-hour-${slots.length}`, 9, 16);
    const minute =
      rand01(prospectId, `slot-min-${slots.length}`) < 0.5 ? 0 : 30;
    candidate.setHours(hour, minute, 0, 0);

    slots.push({ iso: candidate.toISOString(), label: formatSlotLabel(candidate) });
    dayOffset += randInt(prospectId, `slot-step-${slots.length}`, 1, 2);
  }
  return slots;
}

// ---------- Calendar booking (Google Calendar mock) ----------

export interface MockCalendarBooking {
  prospectId: string;
  slot: MockMeetingSlot;
  /** Fake Google Meet URL. */
  meetingUrl: string;
  /** Fake .ics download path. */
  icsHref: string;
  bookedAt: string;
}

function fakeMeetCode(prospectId: string, iso: string): string {
  // Google Meet codes look like "abc-defg-hij" — generate something similar.
  const seed = hashString(`${prospectId}::${iso}`).toString(36).padStart(9, "0");
  const a = seed.slice(0, 3);
  const b = seed.slice(3, 7);
  const c = seed.slice(7, 10).padEnd(3, "x");
  return `${a}-${b}-${c}`;
}

/** Simulate booking a Google Calendar event with a Meet link. */
export async function mockBookCalendar(
  prospectId: string,
  slot: MockMeetingSlot,
): Promise<MockCalendarBooking> {
  await sleep(randInt(prospectId, "book-delay", 600, 1400));
  const meetCode = fakeMeetCode(prospectId, slot.iso);
  return {
    prospectId,
    slot,
    meetingUrl: `https://meet.google.com/${meetCode}`,
    icsHref: `/mock/calendar/${prospectId}-${meetCode}.ics`,
    bookedAt: new Date().toISOString(),
  };
}

// ---------- Chief of Staff deployment (Recall.ai-style mock) ----------

export interface MockCosDeployment {
  prospectId: string;
  meetingUrl: string;
  /** Display name of the CoS bot, e.g. "Asisten CoS · Agentic". */
  cosName: string;
  /** Fake prep-doc link. */
  prepDocPath: string;
  deployedAt: string;
}

/** Simulate dispatching a Recall.ai-style note-taking bot to a meeting. */
export async function mockDeployCos(
  prospectId: string,
  meetingUrl: string,
): Promise<MockCosDeployment> {
  await sleep(randInt(prospectId, "cos-delay", 500, 1100));
  return {
    prospectId,
    meetingUrl,
    cosName: "Asisten CoS · Agentic",
    prepDocPath: `/mock/cos/prep/${prospectId}.md`,
    deployedAt: new Date().toISOString(),
  };
}
