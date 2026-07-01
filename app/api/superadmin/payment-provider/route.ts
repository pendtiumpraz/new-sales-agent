import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { getPaymentProvider, setPaymentProvider, PAYMENT_PROVIDERS, type PaymentProvider } from "@/lib/billing/payments";

export const runtime = "nodejs";

// GET → the active payment provider + the options. Superadmin.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(
    async () => ok({ provider: await getPaymentProvider(), options: PAYMENT_PROVIDERS }),
    "api/superadmin/payment-provider GET",
  );
}

// POST { provider } → set the active gateway (none | stripe | xendit | tripay | midtrans).
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { provider?: string };
    if (!body.provider) return fail("provider wajib", 400, "validation");
    await setPaymentProvider(body.provider as PaymentProvider);
    return ok({ provider: body.provider });
  }, "api/superadmin/payment-provider POST");
}
