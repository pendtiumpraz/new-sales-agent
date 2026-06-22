import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { setListingStatus } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/delist (doc audit #6) — withdraw your own listing
// (status → delisted) or re-list it ({ relist: true }). Was a dead-end before:
// once published, a listing could never be unpublished from the UI.
export async function POST(req: Request) {
  const guard = await requirePermission("tenant.members.manage"); // manager-only
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { listingId?: string; relist?: boolean };
  if (!body.listingId) return NextResponse.json({ ok: false, error: "listingId wajib" }, { status: 400 });
  const status = body.relist ? "active" : "delisted";
  const ok = await setListingStatus(guard.ctx, body.listingId, status);
  if (!ok) return NextResponse.json({ ok: false, error: "Listing tidak ditemukan / bukan milikmu" }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}
