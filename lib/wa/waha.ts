// WhatsApp via WAHA (doc 34) — self-hosted WhatsApp HTTP API
// (github.com/devlikeapro/waha). NULL-SAFE: wahaConfigured() is false without
// WAHA_BASE_URL + WAHA_API_KEY, and callers degrade (cadence WA steps stay
// queued, routes 503) instead of throwing. Fill the env keys to turn it on.

export function wahaConfigured(): boolean {
  return Boolean(process.env.WAHA_BASE_URL && process.env.WAHA_API_KEY);
}

export function wahaSession(): string {
  return process.env.WAHA_SESSION || "default";
}

function base(): string {
  return (process.env.WAHA_BASE_URL ?? "").replace(/\/$/, "");
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
