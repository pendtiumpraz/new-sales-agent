// Autonomous auto-reply + escalation (doc 36). For conversations awaiting our
// reply, the agent drafts a response, self-assesses confidence, and decides:
// auto-SEND (confident + safe + autosend opted in) or ESCALATE to a human
// (uncertain, sensitive topic, or autosend off). Escalations keep the suggested
// reply so a human can send it in one click. Idempotent per inbound message.
//
// SAFETY: auto-send is OFF by default. Without AUTO_REPLY_AUTOSEND=1 every
// candidate escalates (draft-only) — the agent never sends on its own until the
// operator opts in. Driven on-demand (/api/engagement/auto-reply) or Inngest cron.

import { and, desc, eq, gt } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  autoReplyEventTable,
  contactsTable,
  conversationsTable,
  kbTable,
  messagesTable,
  sendJobTable,
  sendingAccountTable,
} from "@/lib/db/schema";
import type { KnowledgeBase } from "@/lib/types/kb";
import { meteredGenerateText } from "@/lib/ai/meter";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { wrapUntrusted, looksInjected } from "@/lib/ai/safety";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { buildKbSystemPrompt } from "@/lib/utils/kb-system-prompt";
import { sendWhatsApp, wahaConfigured } from "@/lib/wa/waha";
import { salutationFor } from "@/lib/profiling/salutation";

// Topics that always go to a human regardless of AI confidence.
const SENSITIVE =
  /\b(refund|pengembalian|batal|cancel|komplain|complain|kecewa|marah|angry|tuntut|lawyer|hukum|legal|nego|diskon|bicara dengan (orang|manusia|cs|agen)|speak to (a )?(human|agent)|manusia)\b/i;

function autoReplyConfig() {
  const threshold = Number(process.env.AUTO_REPLY_CONFIDENCE ?? "0.7");
  const autoSend = process.env.AUTO_REPLY_AUTOSEND === "1" || process.env.AUTO_REPLY_AUTOSEND === "true";
  return { threshold: Number.isFinite(threshold) ? threshold : 0.7, autoSend };
}

interface Judgment {
  reply: string;
  confidence: number;
  escalate: boolean;
  reason: string;
  category: string;
}

/** Tolerant JSON extraction — model is asked for strict JSON; grab the first object. */
function parseJudgment(text: string): Judgment | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    return {
      reply: stripMarkdown(String(j.reply ?? "")), // client message → clean plain text (doc 43)
      confidence: Number(j.confidence ?? 0),
      escalate: Boolean(j.escalate),
      reason: String(j.reason ?? ""),
      category: String(j.category ?? ""),
    };
  } catch {
    return null;
  }
}

function richestKb(rows: { tenantId: string | null; data: KnowledgeBase | null }[], tenantId: string): KnowledgeBase | null {
  const score = (d: KnowledgeBase | null) => (d?.products?.length ?? 0) + (d?.segments?.length ?? 0);
  return (
    rows
      .slice()
      .sort((a, b) => {
        const ta = a.tenantId === tenantId ? 1 : 0;
        const tb = b.tenantId === tenantId ? 1 : 0;
        if (ta !== tb) return tb - ta;
        return score(b.data) - score(a.data);
      })[0]?.data ?? null
  );
}

export interface AutoReplySummary {
  candidates: number;
  sent: number;
  escalated: number;
  skipped: number;
  failed: number;
  autoSend: boolean;
}

export async function runAutoReply(
  ctx: TenantContext,
  opts?: { limit?: number },
): Promise<AutoReplySummary> {
  const limit = opts?.limit ?? 20;
  const cfg = autoReplyConfig();
  const summary: AutoReplySummary = {
    candidates: 0,
    sent: 0,
    escalated: 0,
    skipped: 0,
    failed: 0,
    autoSend: cfg.autoSend,
  };
  if (!(await isTenantActive(ctx))) return summary;

  const loaded = await withTenant(ctx, async (tx) => {
    const kbRows = await tx.select().from(kbTable);
    const convos = await tx
      .select()
      .from(conversationsTable)
      .where(gt(conversationsTable.unread, 0))
      .limit(limit);
    const accs = await tx.select({ id: sendingAccountTable.id }).from(sendingAccountTable).limit(1);
    return {
      kb: richestKb(kbRows.map((r) => ({ tenantId: r.tenantId, data: r.data as KnowledgeBase | null })), ctx.tenantId),
      convos,
      defaultAccId: accs[0]?.id ?? null,
    };
  });

  const kb = loaded.kb;

  for (const convo of loaded.convos) {
    try {
      const msgs = await withTenant(ctx, (tx) =>
        tx.select().from(messagesTable).where(eq(messagesTable.conversationId, convo.id)),
      );
      if (msgs.length === 0) continue;
      // Newest by ISO timestamp string (sortable).
      const sorted = msgs.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      const last = sorted[sorted.length - 1];
      if (!last || last.direction !== "in") continue; // not awaiting our reply

      // Idempotency — already handled this inbound message?
      const handled = await withTenant(ctx, (tx) =>
        tx
          .select({ id: autoReplyEventTable.id })
          .from(autoReplyEventTable)
          .where(and(eq(autoReplyEventTable.messageId, last.id), eq(autoReplyEventTable.tenantId, ctx.tenantId)))
          .limit(1),
      );
      if (handled.length) continue;

      summary.candidates++;

      const context = sorted
        .slice(-6)
        .map((m) => `${m.direction === "in" ? "Pelanggan" : "Kami"}: ${m.body}`)
        .join("\n");

      // Decision: ask the model for a structured judgment grounded in the KB.
      let judgment: Judgment | null = null;
      // doc 43 §2/§3.4 — an inbound message attempting prompt-injection escalates to a
      // human instead of being fed to the model.
      if (looksInjected(last.body ?? "")) {
        judgment = null; // forces the escalate path below
      } else if (kb) {
        try {
          const sal = salutationFor(convo.contactName ?? "");
          const system =
            buildKbSystemPrompt(kb, { surface: "auto-reply" }) +
            `\n\nSapa pelanggan dengan "${sal.greeting}". Balas dengan hangat, sopan, & ber-empati — ` +
            `seperti manusia yang peduli, BUKAN robot; jangan menyebut dirimu AI.\n` +
            `Balas HANYA dengan JSON valid (tanpa markdown), skema persis:\n` +
            `{"reply": string (balasan ke pelanggan, Bahasa Indonesia, akurat dari Basis Pengetahuan, sapa "${sal.greeting}"), ` +
            `"confidence": number 0..1 (yakin balasan benar & AMAN dikirim otomatis), ` +
            `"escalate": boolean (true bila perlu manusia: komplain/refund/negosiasi/hukum/marah/minta bicara orang, atau kamu ragu), ` +
            `"reason": string singkat, "category": string}.`;
          const { text } = await meteredGenerateText(ctx, {
            feature: "auto-reply",
            system,
            prompt: `Percakapan:\n${wrapUntrusted("PERCAKAPAN", context)}\n\nNilai & balas pesan terakhir pelanggan.`,
            maxOutputTokens: 500,
          });
          judgment = parseJudgment(text);
        } catch {
          judgment = null; // no model / suspended → escalate
        }
      }

      const guardrail = SENSITIVE.test(last.body ?? "");
      const reply = (judgment?.reply ?? "").trim();
      const confidence = judgment?.confidence ?? 0;
      const escalate =
        !judgment || judgment.escalate || guardrail || confidence < cfg.threshold || reply.length === 0;

      // Channel availability for an actual send.
      const channel = convo.channel === "email" ? "email" : "whatsapp";
      const [contact] = convo.contactId
        ? await withTenant(ctx, (tx) =>
            tx.select().from(contactsTable).where(eq(contactsTable.id, convo.contactId as string)).limit(1),
          )
        : [undefined];
      const channelReady =
        channel === "email"
          ? Boolean(contact?.email)
          : Boolean(contact?.phone && wahaConfigured());

      const willSend = !escalate && cfg.autoSend && channelReady;
      let decision: "sent" | "escalated" | "skipped" | "failed" = willSend ? "sent" : "escalated";
      let error: string | null = null;
      const reason =
        guardrail ? "topik sensitif → manusia"
          : !judgment ? "tidak ada penilaian model"
          : escalate ? (judgment.reason || `confidence ${confidence} < ${cfg.threshold}`)
          : !cfg.autoSend ? "autosend off (draft siap)"
          : !channelReady ? "channel belum siap"
          : (judgment.reason || "auto-send");

      if (willSend) {
        try {
          if (channel === "whatsapp") {
            await sendWhatsApp({ to: contact!.phone as string, text: reply });
          } else {
            await withTenant(ctx, (tx) =>
              tx.insert(sendJobTable).values({
                id: "send_" + crypto.randomUUID(),
                tenantId: ctx.tenantId,
                sendingAccountId: loaded.defaultAccId,
                toEmail: (contact!.email as string).toLowerCase(),
                subject: convo.company ? `Re: ${convo.company}` : "Balasan",
                body: reply,
                feature: "auto-reply",
              }),
            );
          }
          // Record outbound message + clear unread.
          await withTenant(ctx, async (tx) => {
            await tx.insert(messagesTable).values({
              id: "msg_" + crypto.randomUUID(),
              tenantId: ctx.tenantId,
              conversationId: convo.id,
              direction: "out",
              body: reply,
              timestamp: new Date().toISOString(),
              status: "sent",
            });
            await tx
              .update(conversationsTable)
              .set({ lastMessage: reply.slice(0, 200), lastTimestamp: new Date().toISOString(), unread: 0, updatedAt: new Date() })
              .where(eq(conversationsTable.id, convo.id));
          });
          summary.sent++;
        } catch (e) {
          decision = "failed";
          error = String(e).slice(0, 300);
          summary.failed++;
        }
      } else {
        summary.escalated++;
      }

      await withTenant(ctx, (tx) =>
        tx.insert(autoReplyEventTable).values({
          id: "arp_" + crypto.randomUUID(),
          tenantId: ctx.tenantId,
          conversationId: convo.id,
          messageId: last.id,
          decision,
          confidence,
          channel,
          reply: reply || null,
          reason,
          category: judgment?.category ?? null,
          error,
        }),
      );
    } catch (err) {
      console.error("[auto-reply] conversation failed", convo.id, err);
      summary.failed++;
    }
  }

  return summary;
}

export async function recentAutoReplyEvents(ctx: TenantContext, limit = 30) {
  return withTenant(ctx, (tx) =>
    tx.select().from(autoReplyEventTable).orderBy(desc(autoReplyEventTable.createdAt)).limit(limit),
  );
}

/**
 * Resolve an escalated auto-reply from the review queue: send the (optionally
 * edited) reply via the conversation's channel, or dismiss it. One-click human
 * handoff for the escalation UI (doc 36).
 */
export async function resolveEscalation(
  ctx: TenantContext,
  eventId: string,
  action: "send" | "dismiss",
  replyOverride?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [ev] = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(autoReplyEventTable)
      .where(and(eq(autoReplyEventTable.id, eventId), eq(autoReplyEventTable.tenantId, ctx.tenantId)))
      .limit(1),
  );
  if (!ev) return { ok: false, error: "tidak ditemukan" };

  if (action === "dismiss") {
    await withTenant(ctx, (tx) =>
      tx.update(autoReplyEventTable).set({ decision: "dismissed" }).where(eq(autoReplyEventTable.id, eventId)),
    );
    return { ok: true };
  }

  const reply = (replyOverride ?? ev.reply ?? "").trim();
  if (!reply) return { ok: false, error: "balasan kosong" };
  if (!ev.conversationId) return { ok: false, error: "tanpa percakapan" };

  const [convo] = await withTenant(ctx, (tx) =>
    tx.select().from(conversationsTable).where(eq(conversationsTable.id, ev.conversationId as string)).limit(1),
  );
  if (!convo) return { ok: false, error: "percakapan tidak ditemukan" };

  const [contact] = convo.contactId
    ? await withTenant(ctx, (tx) =>
        tx.select().from(contactsTable).where(eq(contactsTable.id, convo.contactId as string)).limit(1),
      )
    : [undefined];

  const channel = convo.channel === "email" ? "email" : "whatsapp";
  try {
    if (channel === "whatsapp") {
      if (!contact?.phone || !wahaConfigured()) return { ok: false, error: "WhatsApp belum siap (WAHA/nomor)" };
      await sendWhatsApp({ to: contact.phone, text: reply });
    } else {
      if (!contact?.email) return { ok: false, error: "kontak tanpa email" };
      const accs = await withTenant(ctx, (tx) =>
        tx.select({ id: sendingAccountTable.id }).from(sendingAccountTable).limit(1),
      );
      await withTenant(ctx, (tx) =>
        tx.insert(sendJobTable).values({
          id: "send_" + crypto.randomUUID(),
          tenantId: ctx.tenantId,
          sendingAccountId: accs[0]?.id ?? null,
          toEmail: (contact.email as string).toLowerCase(),
          subject: convo.company ? `Re: ${convo.company}` : "Balasan",
          body: reply,
          feature: "auto-reply",
        }),
      );
    }
    await withTenant(ctx, async (tx) => {
      await tx.insert(messagesTable).values({
        id: "msg_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        conversationId: convo.id,
        direction: "out",
        body: reply,
        timestamp: new Date().toISOString(),
        status: "sent",
      });
      await tx
        .update(conversationsTable)
        .set({ lastMessage: reply.slice(0, 200), lastTimestamp: new Date().toISOString(), unread: 0, updatedAt: new Date() })
        .where(eq(conversationsTable.id, convo.id));
      await tx
        .update(autoReplyEventTable)
        .set({ decision: "sent", reply })
        .where(eq(autoReplyEventTable.id, eventId));
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}
