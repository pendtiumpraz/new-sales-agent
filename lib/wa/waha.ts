// WhatsApp via WAHA (doc 34) — self-hosted WhatsApp HTTP API
// (github.com/devlikeapro/waha). NULL-SAFE: wahaConfigured() is false without
// WAHA_BASE_URL + WAHA_API_KEY, and callers degrade (cadence WA steps stay
// queued, routes 503) instead of throwing. Fill the env keys to turn it on.

import { getSecret } from "@/lib/config/secrets";

// Accept either WAHA_BASE_URL (existing convention) or WAHA_URL (what WAHA's own
// docs/quickstart use) so the env "just works" whichever the operator set.
// WAHA_BASE_URL/WAHA_API_KEY/WAHA_SESSION resolve DB-first via getSecret; WAHA_URL
// stays env-only (alias, not a managed secret).
export async function wahaConfigured(): Promise<boolean> {
  return Boolean(((await getSecret("WAHA_BASE_URL")) || process.env.WAHA_URL) && (await getSecret("WAHA_API_KEY")));
}

export async function wahaSession(): Promise<string> {
  return (await getSecret("WAHA_SESSION")) || "default";
}

async function base(): Promise<string> {
  return ((await getSecret("WAHA_BASE_URL")) || process.env.WAHA_URL || "").replace(/\/$/, "");
}

async function headers(): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", "X-Api-Key": (await getSecret("WAHA_API_KEY")) ?? "" };
}

/**
 * Normalize a phone to a WAHA chatId (`<digits>@c.us`). Indonesian local
 * numbers (08xx) are rewritten to international (628xx). Returns null when the
 * input has no digits.
 */
export function toChatId(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
  return `${intl}@c.us`;
}

/** Send a WhatsApp text via WAHA. Returns the provider message id. */
export async function sendWhatsApp(opts: { to: string; text: string }): Promise<string> {
  if (!(await wahaConfigured())) {
    throw new Error("WAHA belum dikonfigurasi (WAHA_BASE_URL/WAHA_API_KEY)");
  }
  const chatId = toChatId(opts.to);
  if (!chatId) throw new Error("Nomor WhatsApp tidak valid");

  const res = await fetch(`${await base()}/api/sendText`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ session: await wahaSession(), chatId, text: opts.text }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string | { _serialized?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(`waha ${res.status}: ${json.message ?? JSON.stringify(json).slice(0, 200)}`);
  }
  if (typeof json.id === "object") return json.id?._serialized ?? "";
  return json.id ?? "";
}

export interface WahaStatus {
  configured: boolean;
  session: string;
  status?: string; // WORKING | SCAN_QR_CODE | STARTING | FAILED | STOPPED …
  error?: string;
}

/** Session health — lets the UI show whether WhatsApp is actually linked. */
export async function wahaStatus(): Promise<WahaStatus> {
  const session = await wahaSession();
  if (!(await wahaConfigured())) return { configured: false, session };
  try {
    const res = await fetch(`${await base()}/api/sessions/${session}`, { headers: await headers() });
    const json = (await res.json().catch(() => ({}))) as { status?: string };
    if (!res.ok) return { configured: true, session, error: `waha ${res.status}` };
    return { configured: true, session, status: json.status };
  } catch (e) {
    return { configured: true, session, error: String(e) };
  }
}

/* -------------------------------------------------------------------------- */
/* Per-account sessions (closing-flow) — ONE WAHA session per rep/platform, so  */
/* each account links its OWN number (1 account = 1 QR). The single-session     */
/* helpers above (wahaSession/sendWhatsApp) stay for cadence/manual sends.       */
/* -------------------------------------------------------------------------- */

// Our sessionId ("rep:<userId>" / "platform:<tenantId>") → a WAHA-safe session
// name ([a-zA-Z0-9_-] only). The inbound webhook carries the real sessionId, so
// this never needs reversing.
export function wahaSessionName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// "628123@c.us" → "628123".
export function bareNumber(jid: string): string {
  return String(jid || "").split("@")[0];
}

export interface WahaSessionInfo {
  status: string; // STARTING | SCAN_QR_CODE | WORKING | FAILED | STOPPED …
  me?: { id?: string; pushName?: string } | null;
}

export async function getSessionInfo(name: string): Promise<WahaSessionInfo | null> {
  if (!(await wahaConfigured())) return null;
  try {
    const r = await fetch(`${await base()}/api/sessions/${encodeURIComponent(name)}`, { headers: await headers() });
    if (!r.ok) return null;
    return (await r.json()) as WahaSessionInfo;
  } catch {
    return null;
  }
}

// Create the session with its inbound webhook, or (if it already exists) refresh
// the webhook + (re)start it. Idempotent — safe to call on every "Connect".
export async function upsertSession(name: string, webhookUrl: string): Promise<void> {
  const config = { webhooks: [{ url: webhookUrl, events: ["message"] }] };
  const b = await base();
  const h = await headers();
  const created = await fetch(`${b}/api/sessions`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name, start: true, config }),
  });
  if (!created.ok) {
    await fetch(`${b}/api/sessions/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ config }),
    }).catch(() => {});
    await fetch(`${b}/api/sessions/${encodeURIComponent(name)}/start`, {
      method: "POST",
      headers: h,
    }).catch(() => {});
  }
}

// Raw QR string (preferred — crisp render) with a PNG data-URL fallback for WAHA
// builds that only return an image.
export async function getQr(name: string): Promise<string | null> {
  const b = await base();
  const h = await headers();
  try {
    const r = await fetch(`${b}/api/${encodeURIComponent(name)}/auth/qr?format=raw`, { headers: h });
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as { value?: string } | null;
      if (j?.value) return j.value;
    }
  } catch {
    /* fall through to image */
  }
  try {
    const r = await fetch(`${b}/api/${encodeURIComponent(name)}/auth/qr?format=image`, { headers: h });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "image/png";
      const buf = Buffer.from(await r.arrayBuffer());
      return `data:${ct};base64,${buf.toString("base64")}`;
    }
  } catch {
    /* give up */
  }
  return null;
}

export async function logoutSession(name: string): Promise<void> {
  const b = await base();
  const h = await headers();
  await fetch(`${b}/api/sessions/${encodeURIComponent(name)}/logout`, { method: "POST", headers: h }).catch(() => {});
  await fetch(`${b}/api/sessions/${encodeURIComponent(name)}/stop`, { method: "POST", headers: h }).catch(() => {});
}

// Send within a SPECIFIC session (per-account), unlike sendWhatsApp which uses the
// single shared WAHA_SESSION.
export async function sendTextSession(name: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`${await base()}/api/sendText`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ session: name, chatId, text }),
  });
  if (!r.ok) throw new Error(`waha sendText ${r.status}: ${await r.text().catch(() => "")}`);
}

export async function startTyping(name: string, chatId: string): Promise<void> {
  await fetch(`${await base()}/api/startTyping`, { method: "POST", headers: await headers(), body: JSON.stringify({ session: name, chatId }) }).catch(() => {});
}
export async function stopTyping(name: string, chatId: string): Promise<void> {
  await fetch(`${await base()}/api/stopTyping`, { method: "POST", headers: await headers(), body: JSON.stringify({ session: name, chatId }) }).catch(() => {});
}
