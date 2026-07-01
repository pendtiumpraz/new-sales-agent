import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { gatewayTokenOk, setSessionQr } from "@/lib/wa/store";

export const runtime = "nodejs";

// POST /api/wa/gateway/qr (doc 41) — gateway relays the latest QR string for a
// session so the browser can render it. WA_GATEWAY_TOKEN-authed.
export async function POST(req: Request) {
  if (!(await gatewayTokenOk(req.headers.get("x-wa-gateway-token")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false });
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; qr?: string };
  if (!body.sessionId || !body.qr) return NextResponse.json({ error: "sessionId + qr wajib" }, { status: 400 });
  await setSessionQr(body.sessionId, body.qr);
  return NextResponse.json({ ok: true });
}
