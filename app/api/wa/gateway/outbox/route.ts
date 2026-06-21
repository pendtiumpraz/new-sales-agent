import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { gatewayTokenOk, pollOutbox, ackOutbox } from "@/lib/wa/store";

export const runtime = "nodejs";

// Gateway-facing (doc 41) — the VPS gateway POLLS pending work here and ACKs
// done. Authed by WA_GATEWAY_TOKEN; outbound-only from the gateway so the VPS
// needs no domain. GET = pull pending, POST {ackIds} = mark done.
function auth(req: Request) {
  return gatewayTokenOk(req.headers.get("x-wa-gateway-token"));
}

export async function GET(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ data: [] });
  // Per-rep extension passes ?sessionId=rep:<userId> to pull only its own jobs;
  // a central VPS gateway omits it and gets every session's pending work.
  const sessionId = new URL(req.url).searchParams.get("sessionId") || undefined;
  const data = await pollOutbox(50, sessionId);
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false });
  const body = (await req.json().catch(() => ({}))) as { ackIds?: string[] };
  await ackOutbox(body.ackIds ?? []);
  return NextResponse.json({ ok: true });
}
