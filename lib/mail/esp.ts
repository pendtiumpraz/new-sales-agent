// Platform ESP transport (doc 33) — shared sending via Resend for tenants that
// don't connect their own mailbox. NULL-SAFE: espConfigured() is false without
// RESEND_API_KEY, and the send worker fails platform_esp jobs with a clear
// message instead of throwing. Fill RESEND_API_KEY to turn it on.

export function espConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function espProvider(): string {
  return "resend";
}

/**
 * Send one email via the platform ESP. The tenantId is attached as a Resend tag
 * so the bounce/complaint webhook can map an event back to a tenant for
 * suppression (best-effort). Returns the provider message id.
 */
export async function sendViaEsp(msg: {
  from: string;
  to: string;
  subject: string;
  text: string;
  tenantId?: string;
}): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Platform ESP belum dikonfigurasi (RESEND_API_KEY)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: msg.from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.tenantId ? { tags: [{ name: "tenant_id", value: msg.tenantId }] } : {}),
    }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${json.message ?? JSON.stringify(json).slice(0, 200)}`);
  }
  return json.id ?? "";
}
