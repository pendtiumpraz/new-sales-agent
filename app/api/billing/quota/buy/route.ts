import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { packByKey } from "@/lib/billing/quota-packs";
import { getPaymentProvider, createCheckout } from "@/lib/billing/payments";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

// POST /api/billing/quota/buy { packKey } — self-serve buy a top-up pack.
// Provider "none" → INSTANT grant (demo). A configured gateway → checkout redirect
// (scaffolded → 501 until the gateway + webhook are wired). Requires tenant.billing.
export async function POST(req: Request) {
  const g = await requirePermission("tenant.billing");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle<{ mode: string; grant?: unknown; provider?: string; url?: string; ref?: string }>(async () => {
    const body = (await req.json().catch(() => ({}))) as { packKey?: string };
    const pack = body.packKey ? packByKey(body.packKey) : undefined;
    if (!pack) return fail("Pack tidak ditemukan", 400, "validation");

    const provider = await getPaymentProvider();

    // Provider "none" → instant grant (demo), active immediately.
    if (provider === "none") {
      const grant = await tenantService.grantQuota(
        g.ctx,
        { metric: pack.metric, amount: pack.amount, days: pack.days, source: "purchase", provider: "none", status: "active", note: pack.key },
        g.ctx.userId,
      );
      return ok({ mode: "instant", grant });
    }

    // Gateway: start checkout FIRST (throws 501/502 on config/gateway error → no
    // orphan grant), then record a PENDING grant the webhook activates on payment.
    const orderId = "ord_" + crypto.randomUUID();
    const checkout = await createCheckout(provider, {
      tenantId: g.ctx.tenantId,
      packKey: pack.key,
      amountIdr: pack.priceIdr,
      label: pack.label,
      orderId,
    });
    await tenantService.grantQuota(
      g.ctx,
      { metric: pack.metric, amount: pack.amount, days: pack.days, source: "purchase", provider, externalRef: orderId, status: "pending", note: pack.key },
      g.ctx.userId,
    );
    return ok({ mode: "redirect", provider, url: checkout.url, ref: orderId });
  }, "api/billing/quota/buy POST");
}
