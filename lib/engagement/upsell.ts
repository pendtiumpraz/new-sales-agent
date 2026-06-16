// Autonomous upsell + close engine (doc 35). For each closed-won customer it
// picks the recommended next product from the KB upsell map, drafts a
// personalized offer (metered AI, grounded in the upsell rationale), attaches a
// Stripe checkout link to actually close, and dispatches via the customer's
// channel (email → send queue, WhatsApp → WAHA). Idempotent: an upsell for the
// same (contact, product) inside the dedup window is skipped.
//
// Driven on-demand (/api/engagement/upsell) or by the Inngest daily cron.

import { and, desc, eq, gte } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  contactsTable,
  dealsTable,
  engagementEventTable,
  kbTable,
  sendingAccountTable,
  sendJobTable,
} from "@/lib/db/schema";
import type { KbPricingTier, KbProduct, KnowledgeBase } from "@/lib/types/kb";
import { meteredGenerateText } from "@/lib/ai/meter";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { createCheckoutLink } from "@/lib/billing/checkout-link";
import { sendWhatsApp, wahaConfigured } from "@/lib/wa/waha";
import { formatIDR } from "@/lib/utils/format-idr";

const DEDUP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface UpsellTarget {
  product: KbProduct;
  tier: KbPricingTier | null;
  rationale: string;
}

/** Pick the first viable upsell target from the KB (recommended next product). */
function pickUpsell(kb: KnowledgeBase): UpsellTarget | null {
  for (const rule of kb.upsellMap ?? []) {
    const targetId = rule.toProductIds?.[0];
    if (!targetId) continue;
    const product =
      kb.products.find((p) => p.id === targetId && p.active) ??
      kb.products.find((p) => p.id === targetId);
    if (!product) continue;
    const tier =
      kb.pricing
        .filter((t) => t.productId === product.id)
        .sort((a, b) => a.priceIDR - b.priceIDR)[0] ?? null;
    return { product, tier, rationale: rule.rationale };
  }
  return null;
}

async function composeUpsellMessage(
  ctx: TenantContext,
  args: {
    name: string;
    company: string;
    target: UpsellTarget;
    checkoutUrl: string | null;
  },
): Promise<string> {
  const { name, company, target, checkoutUrl } = args;
  const priceStr = target.tier ? formatIDR(target.tier.priceIDR) : "";
  const template =
    `Halo ${name}${company ? ` dari ${company}` : ""}, terima kasih sudah mempercayai kami. ` +
    `Banyak pelanggan menaikkan hasil dengan ${target.product.name}. ${target.rationale}` +
    `${priceStr ? ` Mulai ${priceStr}.` : ""} Boleh kami bantu aktifkan sekarang?`;

  let body = template;
  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "upsell",
      system: "Kamu asisten sales. Bahasa Indonesia, sopan, ringkas, tanpa placeholder kurung kurawal.",
      prompt:
        `Tulis pesan upsell singkat untuk ${name}${company ? ` (${company})` : ""} ` +
        `menawarkan produk "${target.product.name}". Alasan: ${target.rationale}.` +
        `${priceStr ? ` Harga mulai ${priceStr}.` : ""} ` +
        `Jangan sertakan URL/link apa pun. Maksimal 4 kalimat, akhiri dengan ajakan checkout.`,
      maxOutputTokens: 300,
    });
    if (text?.trim()) body = text.trim();
  } catch {
    // no model / suspended → template
  }
  // Append the close link ourselves so the AI can't hallucinate the URL.
  if (checkoutUrl) body += `\n\nSelesaikan pembayaran di sini: ${checkoutUrl}`;
  return body;
}

export interface UpsellSummary {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  dedup: number;
}

export async function runUpsell(
  ctx: TenantContext,
  opts?: { limit?: number },
): Promise<UpsellSummary> {
  const limit = opts?.limit ?? 25;
  const summary: UpsellSummary = { candidates: 0, sent: 0, skipped: 0, failed: 0, dedup: 0 };
  if (!(await isTenantActive(ctx))) return summary;

  const loaded = await withTenant(ctx, async (tx) => {
    // Several kb rows may exist (per client); pick the richest one for this
    // tenant — an arbitrary limit(1) can land on an empty placeholder KB.
    const kbRows = await tx.select().from(kbTable);
    const score = (d: KnowledgeBase | null | undefined) =>
      (d?.upsellMap?.length ?? 0) * 100 + (d?.products?.length ?? 0);
    const best = kbRows
      .map((r) => ({ tenantId: r.tenantId, data: r.data as KnowledgeBase | null }))
      .sort((a, b) => {
        const ta = a.tenantId === ctx.tenantId ? 1 : 0;
        const tb = b.tenantId === ctx.tenantId ? 1 : 0;
        if (ta !== tb) return tb - ta; // prefer this tenant's KB
        return score(b.data) - score(a.data);
      })[0];
    const wonDeals = await tx
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.stage, "tutup"))
      .limit(limit);
    const accs = await tx.select({ id: sendingAccountTable.id }).from(sendingAccountTable).limit(1);
    return { kb: best?.data ?? null, wonDeals, defaultAccId: accs[0]?.id ?? null };
  });

  const kb = loaded.kb as KnowledgeBase | null;
  if (!kb) return summary;
  const target = pickUpsell(kb);
  if (!target) return summary;

  summary.candidates = loaded.wonDeals.length;
  const since = new Date(Date.now() - DEDUP_DAYS * DAY_MS);

  for (const deal of loaded.wonDeals) {
    try {
      const contactId = deal.contactId;
      if (!contactId) {
        summary.skipped++;
        continue;
      }

      // Idempotency — already upsold this product to this contact recently?
      const dup = await withTenant(ctx, (tx) =>
        tx
          .select({ id: engagementEventTable.id })
          .from(engagementEventTable)
          .where(
            and(
              eq(engagementEventTable.contactId, contactId),
              eq(engagementEventTable.productId, target.product.id),
              eq(engagementEventTable.kind, "upsell"),
              gte(engagementEventTable.createdAt, since),
            ),
          )
          .limit(1),
      );
      if (dup.length) {
        summary.dedup++;
        continue;
      }

      const [contact] = await withTenant(ctx, (tx) =>
        tx.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1),
      );
      const name = contact?.name ?? deal.contactName ?? "Bapak/Ibu";
      const company = contact?.company ?? deal.company ?? "";

      // The close link (null if Stripe off → linkless offer).
      const checkoutUrl = target.tier
        ? await createCheckoutLink({
            productName: target.product.name,
            amountIdr: target.tier.priceIDR,
            tenantId: ctx.tenantId,
            contactId,
            metadata: { kind: "upsell", productId: target.product.id },
          })
        : null;

      const message = await composeUpsellMessage(ctx, { name, company, target, checkoutUrl });

      let channel = "none";
      let status = "queued";
      let sendJobId: string | null = null;
      let error: string | null = null;

      const email = (contact?.email ?? "").trim().toLowerCase();
      if (email) {
        channel = "email";
        sendJobId = "send_" + crypto.randomUUID();
        await withTenant(ctx, (tx) =>
          tx.insert(sendJobTable).values({
            id: sendJobId as string,
            tenantId: ctx.tenantId,
            sendingAccountId: loaded.defaultAccId,
            toEmail: email,
            subject: `Penawaran khusus: ${target.product.name}`,
            body: message,
            feature: "upsell",
          }),
        );
        summary.sent++;
      } else if (contact?.phone && wahaConfigured()) {
        channel = "whatsapp";
        try {
          await sendWhatsApp({ to: contact.phone, text: message });
          status = "sent";
          summary.sent++;
        } catch (e) {
          status = "failed";
          error = String(e).slice(0, 300);
          summary.failed++;
        }
      } else {
        status = "skipped";
        error = "kontak tanpa email/WhatsApp";
        summary.skipped++;
      }

      await withTenant(ctx, (tx) =>
        tx.insert(engagementEventTable).values({
          id: "eng_" + crypto.randomUUID(),
          tenantId: ctx.tenantId,
          kind: "upsell",
          contactId,
          productId: target.product.id,
          channel,
          status,
          checkoutUrl,
          sendJobId,
          message: message.slice(0, 2000),
          error,
        }),
      );
    } catch (err) {
      console.error("[upsell] candidate failed", deal.id, err);
      summary.failed++;
    }
  }

  return summary;
}

export async function recentEngagementEvents(ctx: TenantContext, limit = 30) {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(engagementEventTable)
      .orderBy(desc(engagementEventTable.createdAt))
      .limit(limit),
  );
}
