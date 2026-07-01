import { NextResponse } from "next/server";
import { sql, eq, desc } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { conversationsTable, messagesTable, tenantsTable } from "@/lib/db/schema";
import { gatewayTokenOk, ownerOfSession, enqueue, waReplyAllowed, getSetting } from "@/lib/wa/store";
import { buildWaReply } from "@/lib/wa/orchestrator";
import { loadStage, saveStage } from "@/lib/sales/stage-store";
import { loadMarketFit } from "@/lib/market-fit/store";
import { loadSalesPlay } from "@/lib/sales-play/store";
import { checkWaRateLimit } from "@/lib/wa/rate-limit";
import { saveDraft } from "@/lib/wa/draft-store";
import { saveReadiness } from "@/lib/sales/predictive-store";
import { detectOutcome, recordOutcome, loadOutcome } from "@/lib/sales/outcome-store";
import type { SalesPlay } from "@/lib/types/sales-play";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";

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
  // Hoist the guarded values to locals so their non-null narrowing survives
  // inside the withTenant() closures below (TS drops property narrowing there).
  const from = b.from;
  const body = b.body;

  const owner = await ownerOfSession(b.sessionId);
  if (!owner) return NextResponse.json({ error: "session tidak dikenal" }, { status: 404 });

  // Pin the tenant GUC (defense-in-depth, ready for RLS) on every DB write/read.
  // The gateway's machine token resolves to a session owner; that owner IS the
  // tenant grain. One short withTenant() per statement (not one long tx) keeps the
  // tenant set in Postgres without holding a transaction across the LLM call.
  const ctx: TenantContext = {
    tenantId: owner.tenantId,
    userId: owner.userId === "platform" ? "platform" : owner.userId,
    role: "member",
  };

  const contactName = b.name?.trim() || b.from;
  const convoId = `wa_${b.sessionId}_${b.from}`.replace(/[^a-zA-Z0-9_:+-]/g, "");
  const now = new Date().toISOString();

  try {
    // Upsert the conversation (attributed to the owning rep) + mark unread.
    await withTenant(ctx, (tx) =>
      tx
        .insert(conversationsTable)
        .values({
          id: convoId,
          tenantId: owner.tenantId,
          contactId: from,
          contactName,
          channel: "whatsapp",
          lastMessage: body,
          lastTimestamp: now,
          unread: 1,
          assignedTo: owner.userId === "platform" ? null : owner.userId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: conversationsTable.id,
          set: {
            lastMessage: body,
            lastTimestamp: now,
            unread: sql`${conversationsTable.unread} + 1`,
            updatedAt: new Date(),
          },
        }),
    );

    await withTenant(ctx, (tx) =>
      tx.insert(messagesTable).values({
        id: "msg_" + crypto.randomUUID(),
        tenantId: owner.tenantId,
        conversationId: convoId,
        direction: "in",
        body,
        timestamp: now,
        status: "received",
      }),
    );

    // Optional AI auto-reply (gated + reply-only allowlist). Emits HUMANIZED
    // bubbles: one paced "send" job per bubble so the gateway can type + delay
    // like a person, instead of one wall-of-text message.
    let replied = false;
    if (
      process.env.WA_AUTO_REPLY === "1" &&
      (await waReplyAllowed(owner.tenantId, b.from))
    ) {
      // C3/C6 rate-limit (anti-iseng + cost cap, per-plan). Over cap → STOP
      // auto-replying and leave the convo unread so a human takes over.
      const [tenantRow] = await withTenant(ctx, (tx) =>
        tx
          .select({ plan: tenantsTable.plan })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, owner.tenantId))
          .limit(1),
      );
      const rate = await checkWaRateLimit(owner.tenantId, convoId, tenantRow?.plan ?? "starter");
      if (rate.ok) {

      // Recent turns (incl. the message just logged) so the reply isn't amnesiac
      // and the state machine can read the conversation.
      const recent = await withTenant(ctx, (tx) =>
        tx
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, convoId))
          .orderBy(desc(messagesTable.timestamp))
          .limit(6),
      );
      const history = recent.reverse().map((m) => ({
        role: m.direction === "in" ? ("customer" as const) : ("us" as const),
        text: m.body,
      }));

      // Market-fit type (drives which closing techniques are offered). Resolve
      // from the conversation's workspace, else a per-tenant default workspace
      // setting (wa_default_workspace:<tenantId>); undefined → orchestrator uses
      // "mix" (all techniques).
      let marketType: "B2B" | "B2C" | "mix" | undefined;
      let salesPlay: SalesPlay | undefined;
      const [convoRow] = await withTenant(ctx, (tx) =>
        tx
          .select({ workspaceId: conversationsTable.workspaceId })
          .from(conversationsTable)
          .where(eq(conversationsTable.id, convoId))
          .limit(1),
      );
      const wsId = convoRow?.workspaceId ?? (await getSetting(`wa_default_workspace:${owner.tenantId}`));
      if (wsId) {
        const mf = await loadMarketFit(wsId);
        marketType = mf?.marketType;
        salesPlay = (await loadSalesPlay(wsId)) ?? undefined;
      }

      // Stage-aware: load the persisted stage, let the machine advance it, save.
      const stage = await loadStage(convoId);
      const result = await buildWaReply(ctx, { contactName, message: b.body, history, stage, marketType, salesPlay });
      await saveStage(convoId, result.nextStage);
      await saveReadiness(convoId, result.readiness);

      // G7 training loop: auto-capture a HIGH-PRECISION won/lost signal (explicit
      // "sudah transfer" / "gak jadi") with the readiness at that moment, so the
      // calibration log grows on its own. Never overwrite a rep's manual mark.
      const autoOutcome = detectOutcome(b.body);
      if (autoOutcome) {
        const existing = await loadOutcome(convoId);
        if (!existing || existing.source !== "manual") {
          await recordOutcome(owner.tenantId, {
            conversationId: convoId,
            outcome: autoOutcome,
            score: result.readiness.score,
            band: result.readiness.band,
            source: "auto",
            ts: new Date().toISOString(),
            workspaceId: wsId ?? undefined,
          });
        }
      }

      // Semi-auto gate: hold as a draft for rep approval, else auto-send now.
      const semi = (await getSetting(`wa_reply_mode:${owner.tenantId}`)) === "semi";
      if (semi) {
        await saveDraft(convoId, {
          sessionId: b.sessionId,
          to: b.from,
          bubbles: result.bubbles.map((x) => ({ text: x.text, delayMs: x.delayMs })),
        });
        // replied stays false — a rep approves the draft to actually send.
      } else {
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
          await withTenant(ctx, (tx) =>
            tx.insert(messagesTable).values({
              id: "msg_" + crypto.randomUUID(),
              tenantId: owner.tenantId,
              conversationId: convoId,
              direction: "out",
              body: bubble.text,
              timestamp: new Date().toISOString(),
              status: "queued",
            }),
          );
        }
        // Graceful holding/handoff path leaves the convo unread for a rep.
        replied = result.action === "send";
      }
      }
    }

    return NextResponse.json({ ok: true, conversationId: convoId, assignedTo: owner.userId, replied });
  } catch (err) {
    console.error("[api/wa/gateway/inbound POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
