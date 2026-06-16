import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { publishMany } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/publish (doc 41 §6) — list company/person(s) to the pool.
// Single: { entityType, entityId } · Bulk: { entityType, entityIds[], category }.
// Person opted-out (explicit or cross-pool) is skipped; consent shown on listing.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  if (!(await marketplaceEnabled())) return NextResponse.json({ error: "Marketplace nonaktif (mode on-prem)" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    entityType?: string;
    entityId?: string;
    entityIds?: string[];
    category?: string;
    priceIdr?: number;
  };
  const ids = b.entityIds?.length ? b.entityIds : b.entityId ? [b.entityId] : [];
  if ((b.entityType !== "company" && b.entityType !== "person") || ids.length === 0) {
    return NextResponse.json({ error: "entityType (company|person) + entityId/entityIds wajib" }, { status: 400 });
  }
  try {
    const result = await publishMany(guard.ctx, { entityType: b.entityType, entityIds: ids, category: b.category, priceIdr: b.priceIdr });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/marketplace/publish]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
