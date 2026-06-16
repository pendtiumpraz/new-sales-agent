import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { publish, MarketplaceError } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/publish (doc 41 §6) — list a company/person to the pool.
// Person listings are consent-gated. Disabled outside SaaS mode.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  if (!(await marketplaceEnabled())) return NextResponse.json({ error: "Marketplace nonaktif (mode on-prem)" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { entityType?: string; entityId?: string; priceIdr?: number };
  if ((b.entityType !== "company" && b.entityType !== "person") || !b.entityId) {
    return NextResponse.json({ error: "entityType (company|person) + entityId wajib" }, { status: 400 });
  }
  try {
    const listing = await publish(guard.ctx, { entityType: b.entityType, entityId: b.entityId, priceIdr: b.priceIdr });
    return NextResponse.json({ ok: true, listing });
  } catch (err) {
    if (err instanceof MarketplaceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.code === "no_consent" ? 403 : 400 });
    }
    console.error("[api/marketplace/publish]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
