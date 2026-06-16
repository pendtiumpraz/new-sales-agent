import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { isManager } from "@/lib/team/members";
import { getWaMode, sessionIdFor, getOrCreateSession, getSession, setSessionStatus, enqueue } from "@/lib/wa/store";

export const runtime = "nodejs";

// Browser-facing WhatsApp session control (doc 41). GET = poll status+QR, POST =
// connect (enqueue start_session for the gateway), DELETE = disconnect.
function shape(s: Awaited<ReturnType<typeof getOrCreateSession>> | null, mode: string) {
  return s
    ? { mode, sessionId: s.id, status: s.status, qr: s.qr, waNumber: s.waNumber }
    : { mode, sessionId: null, status: "idle", qr: null, waNumber: null };
}

export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ mode: "per_platform", status: "idle", source: "mock" });
  const mode = await getWaMode();
  const s = await getSession(sessionIdFor(guard.ctx, mode));
  return NextResponse.json({ ...shape(s, mode), source: "db" });
}

export async function POST() {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const mode = await getWaMode();
  // In per_platform mode only a manager may link the shared number.
  if (mode === "per_platform" && !isManager(guard.ctx.role)) {
    return NextResponse.json({ error: "Mode per-platform — hanya manajer yang boleh hubungkan nomor" }, { status: 403 });
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
  await setSessionStatus(id, "disconnected", null);
  await enqueue(guard.ctx.tenantId, id, "logout");
  return NextResponse.json({ ok: true });
}
