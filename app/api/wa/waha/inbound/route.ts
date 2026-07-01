import { NextResponse } from "next/server";

import { getSecret } from "@/lib/config/secrets";
import { gatewayTokenOk, pollOutbox, ackOutbox } from "@/lib/wa/store";
import {
  wahaConfigured,
  wahaSessionName,
  toChatId,
  sendTextSession,
  startTyping,
  stopTyping,
} from "@/lib/wa/waha";

export const runtime = "nodejs";
// Sending bubbles inline (paced) can take several seconds; let the function run
// long enough on Vercel (Pro). Hobby caps at 10s — keep the humanizer pacing short.
export const maxDuration = 30;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// When WAHA is the gateway there's no VPS bridge draining the outbox, so we send
// the just-enqueued bubbles inline via WAHA — paced (typing + delayMs, capped so
// the serverless function stays within maxDuration). Pacing = ban mitigation.
async function deliverViaWaha(sessionId: string) {
  const jobs = await pollOutbox(20, sessionId);
  const name = wahaSessionName(sessionId);
  for (const job of jobs) {
    if (job.action !== "send") {
      await ackOutbox([job.id]);
      continue;
    }
    const p = (job.payload || {}) as { to?: string; body?: string; delayMs?: number; typing?: boolean };
    const chatId = toChatId(String(p.to ?? ""));
    if (!chatId) {
      await ackOutbox([job.id]); // unsendable target → drop, don't retry forever
      continue;
    }
    const delay = Math.min(Math.max(0, Number(p.delayMs) || 0), 3500);
    try {
      if (p.typing) await startTyping(name, chatId);
      await sleep(delay);
      await sendTextSession(name, chatId, p.body ?? "");
      if (p.typing) await stopTyping(name, chatId);
      await ackOutbox([job.id]);
    } catch (e) {
      console.error("[waha inbound deliver]", job.id, e); // leave un-acked → retried
    }
  }
}

// WAHA adapter — inbound (doc 41 / wa-gateway-waha). WAHA (waha.devlike.pro, now
// 100% free + open-source) pushes a webhook on every incoming WA message. Its
// payload shape differs from our generic gateway, so this route NORMALIZES it
// and forwards to /api/wa/gateway/inbound — the single source of truth for the
// orchestrator (humanizer, stage-machine, guardrails). No logic duplicated here.
//
// Wire WAHA's webhook to:
//   POST {APP_URL}/api/wa/waha/inbound?token=<WA_GATEWAY_TOKEN>&sessionId=rep:<userId>
// The sessionId binds this WAHA session to one of our rep/platform sessions.
// (WAHA can also send the token as the `x-wa-gateway-token` header instead.)

interface WahaWebhook {
  event?: string;
  session?: string;
  payload?: {
    from?: string;
    body?: string;
    fromMe?: boolean;
    notifyName?: string;
    _data?: { notifyName?: string; pushName?: string };
  };
}

// "628123@c.us" → "628123"; leaves already-bare numbers untouched.
function bareNumber(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  // Accept the shared secret from the header OR a ?token= query param (WAHA's
  // webhook config is just a URL, so the query form is the easy path).
  const token = req.headers.get("x-wa-gateway-token") || url.searchParams.get("token");
  if (!(await gatewayTokenOk(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query wajib (mis. rep:u_rep)" }, { status: 400 });
  }

  const hook = (await req.json().catch(() => ({}))) as WahaWebhook;

  // Only act on real incoming chat messages. WAHA also emits message.any
  // (includes our own outgoing), session.status, etc. — ignore those.
  if (hook.event && hook.event !== "message") {
    return NextResponse.json({ ok: true, skipped: "event" });
  }
  const p = hook.payload ?? {};
  if (p.fromMe) return NextResponse.json({ ok: true, skipped: "fromMe" });

  const fromJid = p.from ?? "";
  // Skip groups (@g.us), broadcast/status (@broadcast, status@...) — reply-only
  // to 1:1 chats.
  if (!fromJid || fromJid.endsWith("@g.us") || fromJid.includes("broadcast") || fromJid.startsWith("status")) {
    return NextResponse.json({ ok: true, skipped: "non-direct" });
  }
  const body = (p.body ?? "").trim();
  if (!body) return NextResponse.json({ ok: true, skipped: "empty" });

  const from = bareNumber(fromJid);
  const name = p._data?.notifyName || p.notifyName || p._data?.pushName || undefined;

  // Forward to the generic inbound handler with the real secret (single brain).
  const r = await fetch(`${url.origin}/api/wa/gateway/inbound`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wa-gateway-token": (await getSecret("WA_GATEWAY_TOKEN")) ?? "",
    },
    body: JSON.stringify({ sessionId, from, body, name }),
  });
  const j = await r.json().catch(() => ({}));

  // No bridge on the WAHA path → deliver the enqueued reply bubbles ourselves.
  if (await wahaConfigured()) {
    try {
      await deliverViaWaha(sessionId);
    } catch (e) {
      console.error("[api/wa/waha/inbound deliver]", e);
    }
  }

  return NextResponse.json(j, { status: r.status });
}
