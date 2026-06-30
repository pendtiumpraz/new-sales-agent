import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { validateContacts, validationStats } from "@/lib/contacts/validate";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Email validation for imported contacts (doc 21).
//   GET  → status distribution (valid / invalid_domain / invalid_syntax / risky / unchecked)
//   POST → validate one batch (live MX lookup), returns counts + remaining
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ stats: {}, source: "mock" });
  try {
    return NextResponse.json({ stats: await validationStats(guard.ctx), source: "db" });
  } catch (err) {
    console.error("[api/tenant/contacts/validate GET]", err);
    return NextResponse.json({ stats: {}, source: "error" });
  }
}

export async function POST() {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const summary = await validateContacts(guard.ctx, 500);
    await recordAudit(guard.ctx, "contacts.validate", "batch", summary as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[api/tenant/contacts/validate POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
