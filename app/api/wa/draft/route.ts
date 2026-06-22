import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { conversationsTable, messagesTable } from "@/lib/db/schema";
import { enqueue } from "@/lib/wa/store";
import { loadDraft, clearDraft } from "@/lib/wa/draft-store";

export const runtime = "nodejs";

async function ownsConversation(ctx: TenantContext, conversationId: string): Promise<boolean> {
  const [c] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          or(eq(conversationsTable.tenantId, ctx.tenantId), isNull(conversationsTable.tenantId)),
        ),
      )
      .limit(1),
  );
  return !!c;
}

// GET /api/wa/draft?conversationId= → pending semi-auto AI draft for review.
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ draft: null, source: "mock" });

  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId wajib" }, { status: 400 });
  if (!(await ownsConversation(ctx, conversationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = await loadDraft(conversationId);
  return NextResponse.json({ draft });
}

// POST /api/wa/draft → { conversationId, action: "approve" | "discard" }.
// approve: enqueue the paced bubbles + log + clear. discard: just clear.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => null)) as { conversationId?: string; action?: string } | null;
  if (!body?.conversationId || (body.action !== "approve" && body.action !== "discard")) {
    return NextResponse.json({ error: "conversationId + action (approve|discard) wajib" }, { status: 400 });
  }
  if (!(await ownsConversation(ctx, body.conversationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = await loadDraft(body.conversationId);
  if (!draft) return NextResponse.json({ error: "Tidak ada draf untuk percakapan ini" }, { status: 404 });

  if (body.action === "discard") {
    await clearDraft(body.conversationId);
    return NextResponse.json({ ok: true, action: "discard" });
  }

  let seq = 0;
  for (const bubble of draft.bubbles) {
    await enqueue(ctx.tenantId, draft.sessionId, "send", {
      to: draft.to,
      body: bubble.text,
      delayMs: bubble.delayMs,
      typing: true,
      seq: seq++,
    });
    await db.insert(messagesTable).values({
      id: "msg_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      conversationId: body.conversationId,
      direction: "out",
      body: bubble.text,
      timestamp: new Date().toISOString(),
      status: "queued",
    });
  }
  await clearDraft(body.conversationId);
  return NextResponse.json({ ok: true, action: "approve", sent: draft.bubbles.length });
}
