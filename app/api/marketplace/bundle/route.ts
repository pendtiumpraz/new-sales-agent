import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { publishBundle } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// POST /api/marketplace/bundle — create a COMPANY bundle listing (doc 41 §6).
// Body = { name, industry?, companyIds[], pricingMode, unitPrice }. People can't be
// bundled/sold. Multi-bundle: call repeatedly with different names.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  if (!(await marketplaceEnabled())) return NextResponse.json({ error: "Marketplace nonaktif (mode on-prem)" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    industry?: string | null;
    companyIds?: string[];
    pricingMode?: string;
    unitPrice?: number;
  };
  const name = b.name?.trim();
  if (!name) return NextResponse.json({ error: "Nama bundle wajib" }, { status: 400 });
  if (!Array.isArray(b.companyIds) || b.companyIds.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu perusahaan" }, { status: 400 });
  }
  const pricingMode = b.pricingMode === "per_company" ? "per_company" : "per_bundle";
  try {
    const result = await publishBundle(guard.ctx, {
      name,
      industry: b.industry ?? null,
      companyIds: b.companyIds,
      pricingMode,
      unitPrice: Number(b.unitPrice) || 0,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/marketplace/bundle]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
