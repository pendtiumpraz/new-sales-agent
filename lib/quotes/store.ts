import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { quoteTable, dealsTable, type QuoteItem } from "@/lib/db/schema";
import { meteredGenerateText } from "@/lib/ai/meter";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { SAFETY_RULES, wrapUntrusted, looksInjected } from "@/lib/ai/safety";
import { enqueueSend, processSendJobs } from "@/lib/mail/send";

// Penawaran / quote store (doc 45). Quote-to-cash: AI composes, the existing mail
// queue sends, a public token page tracks viewed/accepted, accept advances the deal.

export type Quote = typeof quoteTable.$inferSelect;

export interface QuoteInput {
  title: string;
  items?: QuoteItem[];
  taxRate?: number;
  currency?: string;
  validUntil?: string | null;
  notes?: string | null;
  coverSubject?: string | null;
  coverBody?: string | null;
  dealId?: string | null;
  personId?: string | null;
  contactId?: string | null;
  workspaceId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerCompany?: string | null;
}

export function calcTotals(items: QuoteItem[], taxRate: number) {
  const subtotal = (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const taxAmount = Math.round(subtotal * (Number(taxRate) || 0));
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

const newToken = () => "q_" + crypto.randomUUID().replace(/-/g, "");

async function nextNumber(ctx: TenantContext): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await withTenant(ctx, (tx) =>
    tx.select({ n: sql<number>`count(*)` }).from(quoteTable).where(eq(quoteTable.tenantId, ctx.tenantId)),
  );
  const seq = (Number(rows[0]?.n ?? 0) + 1).toString().padStart(4, "0");
  return `PNW-${year}-${seq}`;
}

export async function listQuotes(ctx: TenantContext, opts?: { workspaceId?: string | null; archived?: boolean }): Promise<Quote[]> {
  return withTenant(ctx, (tx) => {
    const conds = [eq(quoteTable.tenantId, ctx.tenantId)];
    if (opts?.workspaceId) conds.push(eq(quoteTable.workspaceId, opts.workspaceId));
    // doc 49 — hide soft-deleted by default; ?archived shows ONLY the arsip.
    conds.push(opts?.archived ? isNotNull(quoteTable.deletedAt) : isNull(quoteTable.deletedAt));
    return tx.select().from(quoteTable).where(and(...conds)).orderBy(desc(quoteTable.createdAt));
  });
}

export async function getQuote(ctx: TenantContext, id: string): Promise<Quote | null> {
  const rows = await withTenant(ctx, (tx) =>
    tx.select().from(quoteTable).where(and(eq(quoteTable.id, id), eq(quoteTable.tenantId, ctx.tenantId))).limit(1),
  );
  return rows[0] ?? null;
}

export async function createQuote(ctx: TenantContext, input: QuoteInput): Promise<Quote> {
  const items = input.items ?? [];
  const taxRate = input.taxRate ?? 0;
  const { subtotal, taxAmount, total } = calcTotals(items, taxRate);
  const id = "qt_" + crypto.randomUUID();
  // Compute the human number BEFORE the insert → one round-trip, no transient
  // empty-number row visible to a concurrent list query. (A residual race on
  // count(*) under true concurrency would need a unique index on
  // (tenant, number) + retry — out of scope for the prototype.)
  const number = await nextNumber(ctx);
  const rows = await withTenant(ctx, (tx) =>
    tx
      .insert(quoteTable)
      .values({
        id,
        tenantId: ctx.tenantId,
        number,
        ownerUserId: ctx.userId,
        dealId: input.dealId ?? null,
        personId: input.personId ?? null,
        contactId: input.contactId ?? null,
        workspaceId: input.workspaceId ?? null,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerCompany: input.customerCompany ?? null,
        title: input.title,
        currency: input.currency ?? "IDR",
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
        coverSubject: input.coverSubject ?? null,
        coverBody: input.coverBody ?? null,
        status: "draft",
        publicToken: newToken(),
      })
      .returning(),
  );
  return rows[0];
}

/** Commercial / customer-visible fields that get locked once a quote leaves
 *  draft — editing them would silently change what the customer already saw on
 *  the public page (or already accepted). Internal links (dealId/workspaceId)
 *  stay editable. */
const LOCKED_QUOTE_FIELDS: (keyof QuoteInput)[] = [
  "title",
  "items",
  "taxRate",
  "currency",
  "validUntil",
  "notes",
  "coverSubject",
  "coverBody",
  "customerName",
  "customerEmail",
  "customerCompany",
];

/** Returned by updateQuote when a non-draft quote is edited on locked fields. */
export interface QuoteLocked {
  locked: true;
  status: string;
  fields: string[];
}

export async function updateQuote(
  ctx: TenantContext,
  id: string,
  patch: Partial<QuoteInput>,
): Promise<Quote | QuoteLocked | null> {
  const cur = await getQuote(ctx, id);
  if (!cur) return null;
  // Lock the quote once it has been sent/viewed/accepted/rejected — the customer
  // is looking at live fields on /q/<token>, so commercial edits must be blocked
  // (duplicate as a new draft to change). Audit: editor must not mutate a quote
  // the customer already saw or approved.
  if (cur.status !== "draft") {
    const fields = LOCKED_QUOTE_FIELDS.filter((k) => patch[k] !== undefined);
    if (fields.length) return { locked: true, status: cur.status, fields };
  }
  const items = patch.items ?? cur.items;
  const taxRate = patch.taxRate ?? cur.taxRate;
  const { subtotal, taxAmount, total } = calcTotals(items, taxRate);
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(quoteTable)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.items !== undefined ? { items } : {}),
        taxRate,
        subtotal,
        taxAmount,
        total,
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil || null } : {}), // "" → null, not junk
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.coverSubject !== undefined ? { coverSubject: patch.coverSubject } : {}),
        ...(patch.coverBody !== undefined ? { coverBody: patch.coverBody } : {}),
        ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
        ...(patch.customerEmail !== undefined ? { customerEmail: patch.customerEmail } : {}),
        ...(patch.customerCompany !== undefined ? { customerCompany: patch.customerCompany } : {}),
        ...(patch.dealId !== undefined ? { dealId: patch.dealId } : {}),
        ...(patch.workspaceId !== undefined ? { workspaceId: patch.workspaceId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(quoteTable.id, id), eq(quoteTable.tenantId, ctx.tenantId)))
      .returning(),
  );
  return rows[0] ?? null;
}

function appBase(): string {
  return process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

const fmtMoney = (n: number, currency: string) =>
  currency === "IDR" ? "Rp" + Math.round(n).toLocaleString("id-ID") : `${currency} ${n.toLocaleString("en-US")}`;

/** Send the quote via the rep's sending account (existing mail queue). */
export async function sendQuote(
  ctx: TenantContext,
  id: string,
  opts: { sendingAccountId: string; toEmail?: string },
): Promise<{ ok: boolean; error?: string }> {
  const q = await getQuote(ctx, id);
  if (!q) return { ok: false, error: "not found" };
  const to = (opts.toEmail || q.customerEmail || "").trim();
  if (!to) return { ok: false, error: "Email pelanggan kosong" };

  const link = `${appBase()}/q/${q.publicToken}`;
  // doc 43 §1 — client-facing text (email) is clean plain text; strip any markdown
  // even from a rep-edited subject/body before it leaves the platform.
  const subject = stripMarkdown(q.coverSubject?.trim() || `Penawaran ${q.number} — ${q.title}`);
  // Plain-text body (doc 43) — strip any markdown, append the tracked link.
  const intro = stripMarkdown(q.coverBody || `Berikut penawaran ${q.title} untuk Anda.`);
  const body = `${intro}\n\nLihat & konfirmasi penawaran (${fmtMoney(q.total, q.currency)}):\n${link}\n\nBerlaku s/d: ${q.validUntil || "-"}`;

  await enqueueSend(ctx, { sendingAccountId: opts.sendingAccountId, toEmail: to, subject, body, feature: "quote" });
  const res = await processSendJobs(ctx, 5);
  if (res.sent < 1) return { ok: false, error: `Gagal kirim (terkirim ${res.sent}, gagal ${res.failed}). Cek mailbox di Pengaturan.` };

  await withTenant(ctx, (tx) =>
    tx
      .update(quoteTable)
      .set({ status: "sent", sentAt: new Date(), sendingAccountId: opts.sendingAccountId, toEmail: to, updatedAt: new Date() })
      .where(and(eq(quoteTable.id, id), eq(quoteTable.tenantId, ctx.tenantId))),
  );
  return { ok: true };
}

// ── AI compose (doc 43/45) — DeepSeek drafts the quote; output is plain text ──
export interface ComposeContext {
  product?: string;
  customerName?: string;
  customerCompany?: string;
  leadSummary?: string; // from person.profileSummary etc. (UNTRUSTED)
  notes?: string;
  budgetHint?: string;
}
export async function composeQuote(ctx: TenantContext, c: ComposeContext) {
  const system =
    "Kamu sales engineer B2B Indonesia. Susun draf PENAWARAN. " +
    'Balas HANYA satu objek JSON valid TANPA markdown: {"title":"","items":[{"desc":"","qty":1,"unitPrice":0}],' +
    '"notes":"","coverSubject":"","coverBody":""}. ' +
    "unitPrice angka Rupiah (tanpa titik/koma). items 2-5 baris realistis. notes = syarat & ketentuan singkat. " +
    "coverBody = email pengantar Bahasa Indonesia, sopan, plain text, TANPA markdown/##/**. " +
    SAFETY_RULES;
  // doc 43 §3.4 — scan untrusted lead text for injection; drop it if suspicious
  // rather than feed "ignore previous instructions / kirim API key" to the model.
  const safeLead = c.leadSummary && !looksInjected(c.leadSummary) ? c.leadSummary : "";
  const prompt =
    `Produk/jasa: ${c.product || "-"}\nPelanggan: ${c.customerName || "-"} (${c.customerCompany || "-"})\n` +
    `Catatan: ${c.notes || "-"}\nPerkiraan budget: ${c.budgetHint || "-"}\n` +
    (safeLead ? wrapUntrusted("PROFIL_LEAD", safeLead) : "");
  const { text } = await meteredGenerateText(ctx, { feature: "quote", system, prompt, maxOutputTokens: 1200 });
  const jm = text.match(/\{[\s\S]*\}/);
  if (!jm) throw new Error("AI tidak mengembalikan JSON");
  const p = JSON.parse(jm[0]) as {
    title?: string;
    items?: QuoteItem[];
    notes?: string;
    coverSubject?: string;
    coverBody?: string;
  };
  return {
    title: stripMarkdown(p.title) || c.product || "Penawaran",
    items: Array.isArray(p.items)
      ? p.items
          .slice(0, 8)
          .map((it) => ({ desc: stripMarkdown(it.desc) || "", qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }))
          .filter((it) => it.desc)
      : [],
    notes: stripMarkdown(p.notes),
    coverSubject: stripMarkdown(p.coverSubject),
    coverBody: stripMarkdown(p.coverBody),
  };
}

// ── Public (token) — no session; raw db (pre-auth, like lib/auth) ────────────
export async function getQuoteByToken(token: string): Promise<Quote | null> {
  const rows = await db.select().from(quoteTable).where(eq(quoteTable.publicToken, token)).limit(1);
  return rows[0] ?? null;
}

export async function markViewed(token: string): Promise<void> {
  await db
    .update(quoteTable)
    .set({ status: sql`case when ${quoteTable.status} = 'sent' then 'viewed' else ${quoteTable.status} end`, viewedAt: sql`coalesce(${quoteTable.viewedAt}, now())` })
    .where(eq(quoteTable.publicToken, token));
}

export async function respondToQuote(token: string, action: "accept" | "reject"): Promise<Quote | null> {
  const q = await getQuoteByToken(token);
  if (!q) return null;
  if (q.status === "accepted" || q.status === "rejected") return q; // idempotent
  const now = new Date();
  const [updated] = await db
    .update(quoteTable)
    .set(action === "accept" ? { status: "accepted", acceptedAt: now, updatedAt: now } : { status: "rejected", rejectedAt: now, updatedAt: now })
    .where(eq(quoteTable.publicToken, token))
    .returning();
  // Accept is a closing signal → advance the linked deal to "tutup" (won), but
  // NEVER regress one that's already further along. The old code forced
  // "negosiasi" unconditionally, which moved already-won deals backward.
  if (action === "accept" && q.dealId) {
    const STAGE_ORDER = ["prospek", "kualifikasi", "penawaran", "negosiasi", "tutup"];
    const [deal] = await db
      .select({ stage: dealsTable.stage })
      .from(dealsTable)
      .where(eq(dealsTable.id, q.dealId))
      .limit(1);
    const curIdx = deal ? STAGE_ORDER.indexOf(deal.stage) : -1;
    const target = STAGE_ORDER.length - 1; // "tutup"
    if (deal && curIdx >= 0 && curIdx < target) {
      await db.update(dealsTable).set({ stage: "tutup", updatedAt: now }).where(eq(dealsTable.id, q.dealId));
    }
  }
  return updated ?? q;
}
