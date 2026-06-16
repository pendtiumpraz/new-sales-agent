import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { recordPoolOptOut, poolOptOutCount } from "@/lib/compliance/pool-optout";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// GET/POST /api/compliance/pool-optout (doc 41 §7) — cross-pool do-not-contact.
// GET → registry size. POST {value, channel?, reason?} → record + propagate
// (flag matching contacts in every tenant + delist their marketplace listings).
export async function GET() {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ count: 0, source: "mock" });
  return NextResponse.json({ count: await poolOptOutCount(), source: "db" });
}

export async function POST(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const b = (await req.json().catch(() => ({}))) as { value?: string; channel?: string; reason?: string };
  if (!b.value?.trim()) return NextResponse.json({ error: "value (email/HP) wajib" }, { status: 400 });
  const reason = b.reason === "dsar_erasure" ? "dsar_erasure" : "opt_out";
  const result = await recordPoolOptOut(b.value, b.channel ?? null, reason);
  await recordAudit(guard.ctx, "compliance.pool_optout", b.value, {
    flaggedContacts: result.flaggedContacts,
    delistedListings: result.delistedListings,
    reason,
  });
  return NextResponse.json({ ok: true, ...result });
}
