import { NextResponse } from "next/server";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { isManager } from "@/lib/team/members";
import { getWaMode, sessionIdFor, getOrCreateSession, getSession, setSessionStatus, enqueue } from "@/lib/wa/store";
import {
  wahaConfigured,
  wahaSessionName,
  getSessionInfo,
  upsertSession,
  getQr,
  logoutSession,
  bareNumber,
} from "@/lib/wa/waha";

export const runtime = "nodejs";

// Browser-facing WhatsApp session control (doc 41). GET = poll status+QR, POST =
// connect, DELETE = disconnect. When WAHA is configured (WAHA_URL + WAHA_API_KEY)
// the app drives the hosted WAHA server DIRECTLY — one session PER ACCOUNT
// (1 account = 1 QR). Otherwise it falls back to the outbox/VPS-gateway model.
function shape(s: Awaited<ReturnType<typeof getOrCreateSession>> | null, mode: string) {
  return s
    ? { mode, sessionId: s.id, status: s.status, qr: s.qr, waNumber: s.waNumber }
    : { mode, sessionId: null, status: "idle", qr: null, waNumber: null };
}

// WAHA lifecycle status → our status vocabulary (idle|qr|connected|disconnected).
function mapStatus(waha: string): "qr" | "connected" | "disconnected" | "pending" {
  if (waha === "WORKING") return "connected";
  if (waha === "SCAN_QR_CODE") return "qr";
  if (waha === "STARTING") return "pending";
  return "disconnected";
}

export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ mode: "per_platform", status: "idle", source: "mock" });
  const mode = await getWaMode();
  const sid = sessionIdFor(guard.ctx, mode);

  if (await wahaConfigured()) {
    const info = await getSessionInfo(wahaSessionName(sid));
    if (!info) {
      // Not created yet on WAHA → reflect the local row (likely idle).
      const s = await getSession(sid);
      return NextResponse.json({ ...shape(s, mode), source: "waha" });
    }
    const status = mapStatus(info.status);
    const waNumber = status === "connected" && info.me?.id ? bareNumber(info.me.id) : null;
    const qr = status === "qr" ? await getQr(wahaSessionName(sid)) : null;
    // Keep our row in sync so inbound attribution + the rest of the app agree.
    await setSessionStatus(sid, status, waNumber ?? undefined);
    return NextResponse.json({ mode, sessionId: sid, status, qr, waNumber, source: "waha" });
  }

  const s = await getSession(sid);
  return NextResponse.json({ ...shape(s, mode), source: "db" });
}

export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const mode = await getWaMode();
  const gatewayToken = await getSecret("WA_GATEWAY_TOKEN");
  // In per_platform mode only a manager may link the shared number.
  if (mode === "per_platform" && !isManager(guard.ctx.role)) {
    return NextResponse.json({ error: "Mode per-platform — hanya manajer yang boleh hubungkan nomor" }, { status: 403 });
  }

  if (await wahaConfigured()) {
    // The per-session inbound webhook needs the shared secret for /api/wa/waha/inbound.
    if (!gatewayToken) {
      return NextResponse.json({ error: "WA_GATEWAY_TOKEN wajib di-set (auth webhook WAHA)." }, { status: 400 });
    }
    const s = await getOrCreateSession(guard.ctx, mode); // ensure the wa_session row exists for attribution
    const name = wahaSessionName(s.id);
    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const webhookUrl = `${base}/api/wa/waha/inbound?token=${encodeURIComponent(gatewayToken)}&sessionId=${encodeURIComponent(s.id)}`;
    await upsertSession(name, webhookUrl);
    await setSessionStatus(s.id, "qr");
    const qr = await getQr(name);
    return NextResponse.json({ ok: true, mode, sessionId: s.id, status: qr ? "qr" : "pending", qr, waNumber: null, source: "waha" });
  }

  // No gateway configured → fail fast instead of leaving the session stuck on
  // "pending" forever (doc audit #28).
  if (!gatewayToken) {
    return NextResponse.json(
      { error: "Gateway WhatsApp belum dikonfigurasi. Set WAHA_URL+WAHA_API_KEY (hosted) atau WA_GATEWAY_TOKEN + gateway VPS yang nge-poll /api/wa/gateway/outbox." },
      { status: 400 },
    );
  }
  const s = await getOrCreateSession(guard.ctx, mode);
  await setSessionStatus(s.id, "pending");
  await enqueue(guard.ctx.tenantId, s.id, "start_session");
  return NextResponse.json({ ok: true, ...shape({ ...s, status: "pending", qr: null }, mode) });
}

export async function DELETE() {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const mode = await getWaMode();
  const id = sessionIdFor(guard.ctx, mode);
  if (await wahaConfigured()) {
    await logoutSession(wahaSessionName(id));
    await setSessionStatus(id, "disconnected", null);
    return NextResponse.json({ ok: true, source: "waha" });
  }
  await setSessionStatus(id, "disconnected", null);
  await enqueue(guard.ctx.tenantId, id, "logout");
  return NextResponse.json({ ok: true });
}
