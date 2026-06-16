import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getOrCreateRepAccount, updateRepAccount, regenerateToken } from "@/lib/team/rep-account";

export const runtime = "nodejs";

const LIVE_MS = 10 * 60 * 1000;

function shape(rep: Awaited<ReturnType<typeof getOrCreateRepAccount>>) {
  const last = rep.lastSeenAt ? new Date(rep.lastSeenAt as unknown as string) : null;
  return {
    token: rep.token,
    linkedinUrl: rep.linkedinUrl,
    instagram: rep.instagram,
    lastSeenAt: last ? last.toISOString() : null,
    connected: last ? Date.now() - last.getTime() < LIVE_MS : false,
    version: rep.extVersion,
  };
}

// GET /api/rep/account (doc 41 §4) — the logged-in rep's own account: per-rep
// ingest token + registered LinkedIn/IG + extension last-seen. Created on first
// access. Any data.read user (incl. managers, who also sell) gets their own.
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ token: "", configured: false, source: "mock" });
  const rep = await getOrCreateRepAccount(guard.ctx);
  return NextResponse.json({ ...shape(rep), configured: true, source: "db" });
}

// PATCH — register/update LinkedIn URL + Instagram handle.
export async function PATCH(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { linkedinUrl?: string; instagram?: string };
  const rep = await updateRepAccount(guard.ctx, {
    linkedinUrl: body.linkedinUrl?.trim() || null,
    instagram: body.instagram?.trim().replace(/^@/, "") || null,
  });
  return NextResponse.json({ ok: true, ...shape(rep) });
}

// POST { regenerate: true } — rotate the per-rep token.
export async function POST(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { regenerate?: boolean };
  if (!body.regenerate) return NextResponse.json({ error: "nothing to do" }, { status: 400 });
  const rep = await regenerateToken(guard.ctx);
  return NextResponse.json({ ok: true, ...shape(rep) });
}
