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
    const checkout = await createCheckout(provider, {
      tenantId: g.ctx.tenantId,
      packKey: pack.key,
      amountIdr: pack.priceIdr,
      label: pack.label,
    });

    if (checkout.mode === "instant") {
      const grant = await tenantService.grantQuota(
        g.ctx,
        {
          metric: pack.metric,
          amount: pack.amount,
          days: pack.days,
          source: "purchase",
          provider: "none",
          note: `Beli pack ${pack.key} (instan)`,
        },
        g.ctx.userId,
      );
      return ok({ mode: "instant", grant });
    }
    // Gateway checkout (redirect) — the pack is granted by the provider's webhook.
    return ok({ mode: "redirect", provider, url: checkout.url, ref: checkout.ref });
  }, "api/billing/quota/buy POST");
}
