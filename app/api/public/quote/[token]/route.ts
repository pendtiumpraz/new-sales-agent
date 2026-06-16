import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { getQuoteByToken, markViewed, respondToQuote } from "@/lib/quotes/store";

export const runtime = "nodejs";

// Public, NO auth — the prospect opens /q/<token>. GET marks viewed + returns a
// safe subset; POST {action:"accept"|"reject"} records the decision.
function publicView(q: NonNullable<Awaited<ReturnType<typeof getQuoteByToken>>>) {
  return {
    number: q.number,
    title: q.title,
    currency: q.currency,
    items: q.items,
    subtotal: q.subtotal,
    taxRate: q.taxRate,
    taxAmount: q.taxAmount,
    total: q.total,
    validUntil: q.validUntil,
    notes: q.notes,
    customerName: q.customerName,
    customerCompany: q.customerCompany,
    status: q.status,
  };
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!hasDb()) return NextResponse.json({ error: "no db" }, { status: 503 });
  const q = await getQuoteByToken(params.token);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  await markViewed(params.token);
  return NextResponse.json({ data: publicView(q) });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!hasDb()) return NextResponse.json({ error: "no db" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "accept" ? "accept" : body.action === "reject" ? "reject" : null;
  if (!action) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  const q = await respondToQuote(params.token, action);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data: { status: q.status } });
}
