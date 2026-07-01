import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { gatewayTokenOk, setSessionStatus } from "@/lib/wa/store";

export const runtime = "nodejs";

// POST /api/wa/gateway/status (doc 41) — gateway reports session lifecycle
// (qr | connected | disconnected) + the linked number. WA_GATEWAY_TOKEN-authed.
export async function POST(req: Request) {
  if (!(await gatewayTokenOk(req.headers.get("x-wa-gateway-token")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false });
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; status?: string; waNumber?: string };
  if (!body.sessionId || !body.status) return NextResponse.json({ error: "sessionId + status wajib" }, { status: 400 });
  await setSessionStatus(body.sessionId, body.status, body.waNumber ?? null);
  return NextResponse.json({ ok: true });
}
