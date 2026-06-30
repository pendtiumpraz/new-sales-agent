import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import { composeQuote, type ComposeContext } from "@/lib/quotes/store";

export const runtime = "nodejs";

// POST /api/quotes/compose — AI drafts the quote (title, items, terms, cover email).
export async function POST(req: Request) {
  const guard = await requirePermission("ai.use");
  if ("error" in guard) return guard.error;
  const body = (await req.json().catch(() => ({}))) as ComposeContext;
  try {
    const draft = await composeQuote(guard.ctx, body);
    return NextResponse.json({ data: draft });
  } catch (err) {
    console.error("[api/quotes/compose POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
