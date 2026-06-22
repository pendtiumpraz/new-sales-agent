// WhatsApp via WAHA (doc 34) — self-hosted WhatsApp HTTP API
// (github.com/devlikeapro/waha). NULL-SAFE: wahaConfigured() is false without
// WAHA_BASE_URL + WAHA_API_KEY, and callers degrade (cadence WA steps stay
// queued, routes 503) instead of throwing. Fill the env keys to turn it on.

// Accept either WAHA_BASE_URL (existing convention) or WAHA_URL (what WAHA's own
// docs/quickstart use) so the env "just works" whichever the operator set.
export function wahaConfigured(): boolean {
  return Boolean((process.env.WAHA_BASE_URL || process.env.WAHA_URL) && process.env.WAHA_API_KEY);
}

export function wahaSession(): string {
  return process.env.WAHA_SESSION || "default";
}

function base(): string {
  return (process.env.WAHA_BASE_URL || process.env.WAHA_URL || "").replace(/\/$/, "");
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", "X-Api-Key": process.env.WAHA_API_KEY ?? "" };
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
  if (!wahaConfigured()) {
    throw new Error("WAHA belum dikonfigurasi (WAHA_BASE_URL/WAHA_API_KEY)");
  }
  const chatId = toChatId(opts.to);
  if (!chatId) throw new Error("Nomor WhatsApp tidak valid");

  const res = await fetch(`${base()}/api/sendText`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: wahaSession(), chatId, text: opts.text }),
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
  if (!wahaConfigured()) return { configured: false, session: wahaSession() };
  try {
    const res = await fetch(`${base()}/api/sessions/${wahaSession()}`, { headers: headers() });
    const json = (await res.json().catch(() => ({}))) as { status?: string };
    if (!res.ok) return { configured: true, session: wahaSession(), error: `waha ${res.status}` };
    return { configured: true, session: wahaSession(), status: json.status };
  } catch (e) {
    return { configured: true, session: wahaSession(), error: String(e) };
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
  if (!wahaConfigured()) return null;
  try {
    const r = await fetch(`${base()}/api/sessions/${encodeURIComponent(name)}`, { headers: headers() });
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
  const created = await fetch(`${base()}/api/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, start: true, config }),
  });
  if (!created.ok) {
    await fetch(`${base()}/api/sessions/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ config }),
    }).catch(() => {});
    await fetch(`${base()}/api/sessions/${encodeURIComponent(name)}/start`, {
      method: "POST",
      headers: headers(),
    }).catch(() => {});
  }
}

// Raw QR string (preferred — crisp render) with a PNG data-URL fallback for WAHA
// builds that only return an image.
export async function getQr(name: string): Promise<string | null> {
  try {
    const r = await fetch(`${base()}/api/${encodeURIComponent(name)}/auth/qr?format=raw`, { headers: headers() });
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as { value?: string } | null;
      if (j?.value) return j.value;
    }
  } catch {
    /* fall through to image */
  }
  try {
    const r = await fetch(`${base()}/api/${encodeURIComponent(name)}/auth/qr?format=image`, { headers: headers() });
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
  await fetch(`${base()}/api/sessions/${encodeURIComponent(name)}/logout`, { method: "POST", headers: headers() }).catch(() => {});
  await fetch(`${base()}/api/sessions/${encodeURIComponent(name)}/stop`, { method: "POST", headers: headers() }).catch(() => {});
}

// Send within a SPECIFIC session (per-account), unlike sendWhatsApp which uses the
// single shared WAHA_SESSION.
export async function sendTextSession(name: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`${base()}/api/sendText`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: name, chatId, text }),
  });
  if (!r.ok) throw new Error(`waha sendText ${r.status}: ${await r.text().catch(() => "")}`);
}

export async function startTyping(name: string, chatId: string): Promise<void> {
  await fetch(`${base()}/api/startTyping`, { method: "POST", headers: headers(), body: JSON.stringify({ session: name, chatId }) }).catch(() => {});
}
export async function stopTyping(name: string, chatId: string): Promise<void> {
  await fetch(`${base()}/api/stopTyping`, { method: "POST", headers: headers(), body: JSON.stringify({ session: name, chatId }) }).catch(() => {});
}
