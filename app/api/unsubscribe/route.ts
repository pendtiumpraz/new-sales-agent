import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { addSuppression } from "@/lib/mail/suppression";
import { recordPoolOptOut } from "@/lib/compliance/pool-optout";

export const runtime = "nodejs";

// Public (no session). The unsubscribe link carries tenant + email. NOTE: slice 1
// trusts the link; production should sign it with a token (doc 25).
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { email?: string; tenant?: string };
    if (!b?.email || !b?.tenant) {
      return NextResponse.json({ error: "Missing email/tenant" }, { status: 400 });
    }
    if (!hasDb()) return NextResponse.json({ ok: true, source: "mock" });
    await addSuppression({ tenantId: b.tenant, userId: "unsubscribe", role: "member" }, b.email, "opt_out");
    // Propagate cross-pool (doc 41 §7): honored by every tenant + delists listings.
    await recordPoolOptOut(b.email, "email", "opt_out");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/unsubscribe POST]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
