import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { publishMany } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/publish (doc 41 §6) — list COMPANIES to the pool.
// People may NOT be sold (privacy / UU PDP) — only companies are listable.
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
  // Hard block: only companies. People can never be sold.
  if (b.entityType === "person") {
    return NextResponse.json({ error: "Data orang tidak boleh dijual — hanya perusahaan." }, { status: 400 });
  }
  const ids = b.entityIds?.length ? b.entityIds : b.entityId ? [b.entityId] : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu perusahaan." }, { status: 400 });
  }
  try {
    const result = await publishMany(guard.ctx, { entityType: "company", entityIds: ids, category: b.category, priceIdr: b.priceIdr });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/marketplace/publish]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
