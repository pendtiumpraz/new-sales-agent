import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { hasDb } from "@/lib/db/client";
import { addSuppression } from "@/lib/mail/suppression";

export const runtime = "nodejs";

// POST /api/esp/webhook — Resend → us (doc 33). PUBLIC; authenticity via the
// Svix signature when RESEND_WEBHOOK_SECRET is set. On bounce/complaint we add
// the recipient to the tenant's suppression list. The tenant is resolved from
// the `tenant_id` tag we attach on send (best-effort — skipped if absent).

function verifySvix(secret: string, headers: Headers, body: string): boolean {
  try {
    const id = headers.get("svix-id");
    const ts = headers.get("svix-timestamp");
    const sigHeader = headers.get("svix-signature");
    if (!id || !ts || !sigHeader) return false;
    const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const key = Buffer.from(keyB64, "base64");
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
    return sigHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      if (!sig) return false;
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  } catch {
    return false;
  }
}

function tenantFromTags(tags: unknown): string | null {
  if (Array.isArray(tags)) {
    const hit = tags.find((t) => (t as { name?: string })?.name === "tenant_id") as
      | { value?: string }
      | undefined;
    return hit?.value ?? null;
  }
  if (tags && typeof tags === "object") {
    const v = (tags as Record<string, string>).tenant_id;
    return v ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(secret, req.headers, raw)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const type = String(event?.type ?? "");
  if (type !== "email.bounced" && type !== "email.complained") {
    return NextResponse.json({ received: true, ignored: type });
  }

  const data = event.data ?? {};
  const tenantId = tenantFromTags(data.tags);
  const to = data.to;
  const recipients: string[] = Array.isArray(to) ? (to as string[]) : to ? [String(to)] : [];

  if (!tenantId || recipients.length === 0) {
    console.warn("[esp webhook] bounce tanpa tenant/recipient — skip", { type });
    return NextResponse.json({ received: true, note: "no tenant/recipient" });
  }
  if (!hasDb()) return NextResponse.json({ received: true, note: "no db" });

  const reason = type === "email.complained" ? "complaint" : "bounce";
  const sysCtx = { tenantId, userId: "esp-webhook", role: "superadmin" as const };
  try {
    for (const email of recipients) {
      await addSuppression(sysCtx, String(email), reason);
    }
  } catch (err) {
    console.error("[esp webhook] suppression failed:", err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true, suppressed: recipients.length });
}
