import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { conversationsTable, messagesTable } from "@/lib/db/schema";
import { gatewayTokenOk, ownerOfSession, enqueue } from "@/lib/wa/store";
import { meteredGenerateText } from "@/lib/ai/meter";
import { salutationFor } from "@/lib/profiling/salutation";
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

    // Optional AI auto-reply (gated, so it's honest about what's automated).
    let replied = false;
    if (process.env.WA_AUTO_REPLY === "1") {
      const ctx: TenantContext = { tenantId: owner.tenantId, userId: owner.userId, role: "member" };
      const sal = salutationFor(contactName);
      let reply =
        `Halo ${sal.greeting}, terima kasih sudah menghubungi kami. ` +
        `Boleh dijelaskan sedikit kebutuhannya supaya kami bantu lebih tepat?`;
      try {
        const { text } = await meteredGenerateText(ctx, {
          feature: "wa_autoreply",
          system:
            `Kamu sales yang hangat & ber-empati (bukan robot), Bahasa Indonesia, sopan, ringkas. ` +
            `Sapa dengan "${sal.greeting}". Jangan menyebut dirimu AI. Maksimal 3 kalimat.`,
          prompt: `Pesan masuk dari ${sal.greeting} via WhatsApp: "${b.body}". Balas dengan hangat & bantu.`,
          maxOutputTokens: 220,
        });
        if (text?.trim()) reply = text.trim();
      } catch {
        // no model / suspended → template reply
      }
      await enqueue(owner.tenantId, b.sessionId, "send", { to: b.from, body: reply });
      await db.insert(messagesTable).values({
        id: "msg_" + crypto.randomUUID(),
        tenantId: owner.tenantId,
        conversationId: convoId,
        direction: "out",
        body: reply,
        timestamp: new Date().toISOString(),
        status: "queued",
      });
      replied = true;
    }

    return NextResponse.json({ ok: true, conversationId: convoId, assignedTo: owner.userId, replied });
  } catch (err) {
    console.error("[api/wa/gateway/inbound POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
