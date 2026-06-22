import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { acquire, MarketplaceError } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/acquire (doc 41 §6) — buy a listing → copy the entity
// (+ contact points) into your tenant. Disabled outside SaaS mode.
export async function POST(req: Request) {
  const guard = await requirePermission("tenant.members.manage"); // manager-only
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  if (!(await marketplaceEnabled())) return NextResponse.json({ error: "Marketplace nonaktif (mode on-prem)" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { listingId?: string };
  if (!b.listingId) return NextResponse.json({ error: "listingId wajib" }, { status: 400 });
  try {
    const r = await acquire(guard.ctx, b.listingId);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof MarketplaceError) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    console.error("[api/marketplace/acquire]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
