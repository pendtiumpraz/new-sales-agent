import { NextResponse } from "next/server";
import { sql, eq, desc } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { conversationsTable, messagesTable } from "@/lib/db/schema";
import { gatewayTokenOk, ownerOfSession, enqueue, waReplyAllowed, getSetting } from "@/lib/wa/store";
import { buildWaReply } from "@/lib/wa/orchestrator";
import { loadStage, saveStage } from "@/lib/sales/stage-store";
import { loadMarketFit } from "@/lib/market-fit/store";
import type { TenantContext } from "@/lib/db/tenant-context";

export const runtime = "nodejs";

// POST /api/wa/gateway/inbound (doc 41) — the gateway forwards an inbound WA
// message. We log it (attributed to the session's rep) and, when WA_AUTO_REPLY
// is on, draft a warm AI reply + enqueue it for the gateway to send.
export async function POST(req: Request) {
  if (!gatewayTokenOk(req.headers.get("x-wa-gateway-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const b = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    from?: string;
    body?: string;
    name?: string;
  };
  if (!b.sessionId || !b.from || !b.body) {
    return NextResponse.json({ error: "sessionId + from + body wajib" }, { status: 400 });
  }

  const owner = await ownerOfSession(b.sessionId);
  if (!owner) return NextResponse.json({ error: "session tidak dikenal" }, { status: 404 });

  const contactName = b.name?.trim() || b.from;
  const convoId = `wa_${b.sessionId}_${b.from}`.replace(/[^a-zA-Z0-9_:+-]/g, "");
  const now = new Date().toISOString();

  try {
    // Upsert the conversation (attributed to the owning rep) + mark unread.
    await db
      .insert(conversationsTable)
      .values({
        id: convoId,
        tenantId: owner.tenantId,
        contactId: b.from,
        contactName,
        channel: "whatsapp",
        lastMessage: b.body,
        lastTimestamp: now,
        unread: 1,
        assignedTo: owner.userId === "platform" ? null : owner.userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          lastMessage: b.body,
          lastTimestamp: now,
          unread: sql`${conversationsTable.unread} + 1`,
          updatedAt: new Date(),
        },
      });

    await db.insert(messagesTable).values({
      id: "msg_" + crypto.randomUUID(),
      tenantId: owner.tenantId,
      conversationId: convoId,
      direction: "in",
      body: b.body,
      timestamp: now,
      status: "received",
    });

    // Optional AI auto-reply (gated + reply-only allowlist). Emits HUMANIZED
    // bubbles: one paced "send" job per bubble so the gateway can type + delay
    // like a person, instead of one wall-of-text message.
    let replied = false;
    if (
      process.env.WA_AUTO_REPLY === "1" &&
      (await waReplyAllowed(owner.tenantId, b.from))
    ) {
      const ctx: TenantContext = { tenantId: owner.tenantId, userId: owner.userId, role: "member" };

      // Recent turns (incl. the message just logged) so the reply isn't amnesiac
      // and the state machine can read the conversation.
      const recent = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, convoId))
        .orderBy(desc(messagesTable.timestamp))
        .limit(6);
      const history = recent.reverse().map((m) => ({
        role: m.direction === "in" ? ("customer" as const) : ("us" as const),
        text: m.body,
      }));

      // Market-fit type (drives which closing techniques are offered). Resolve
      // from the conversation's workspace, else a per-tenant default workspace
      // setting (wa_default_workspace:<tenantId>); undefined → orchestrator uses
      // "mix" (all techniques).
      let marketType: "B2B" | "B2C" | "mix" | undefined;
      const [convoRow] = await db
        .select({ workspaceId: conversationsTable.workspaceId })
        .from(conversationsTable)
        .where(eq(conversationsTable.id, convoId))
        .limit(1);
      const wsId = convoRow?.workspaceId ?? (await getSetting(`wa_default_workspace:${owner.tenantId}`));
      if (wsId) {
        const mf = await loadMarketFit(wsId);
        marketType = mf?.marketType;
      }

      // Stage-aware: load the persisted stage, let the machine advance it, save.
      const stage = await loadStage(convoId);
      const result = await buildWaReply(ctx, { contactName, message: b.body, history, stage, marketType });
      await saveStage(convoId, result.nextStage);

      let seq = 0;
      for (const bubble of result.bubbles) {
        // Gateway honors delayMs + typing to pace the send like a human.
        await enqueue(owner.tenantId, b.sessionId, "send", {
          to: b.from,
          body: bubble.text,
          delayMs: bubble.delayMs,
          typing: true,
          seq: seq++,
        });
        await db.insert(messagesTable).values({
          id: "msg_" + crypto.randomUUID(),
          tenantId: owner.tenantId,
          conversationId: convoId,
          direction: "out",
          body: bubble.text,
          timestamp: new Date().toISOString(),
          status: "queued",
        });
      }

      // On the graceful holding/handoff path, leave the convo flagged for a human
      // (unread was already incremented on the inbound) so a rep takes over.
      replied = result.action === "send";
    }

    return NextResponse.json({ ok: true, conversationId: convoId, assignedTo: owner.userId, replied });
  } catch (err) {
    console.error("[api/wa/gateway/inbound POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
