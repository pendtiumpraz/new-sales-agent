import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import { hasDb } from "@/lib/db/client";
import { acceptQuote } from "@/lib/quotes/store";

export const runtime = "nodejs";

// POST /api/quotes/<id>/accept — rep marks a quote ACCEPTED (customer confirmed
// offline). Sets status→accepted and advances the linked CRM deal to the
// pipeline's Won stage. Returns { status, dealWon, dealName } so the UI can toast
// the deal move. data.write.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ error: "DB tidak aktif" }, { status: 400 });
  const res = await acceptQuote(guard.ctx, params.id);
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    data: { status: res.quote.status, dealWon: res.dealWon, dealName: res.dealName ?? null },
  });
}
