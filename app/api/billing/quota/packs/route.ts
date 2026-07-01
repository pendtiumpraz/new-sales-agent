import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { QUOTA_PACKS } from "@/lib/billing/quota-packs";
import { getPaymentProvider } from "@/lib/billing/payments";

export const runtime = "nodejs";

// GET /api/billing/quota/packs → buyable packs + the active payment provider, so the
// tenant "Beli quota" UI can render prices + know if checkout is instant or via a gateway.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(
    async () => ok({ packs: QUOTA_PACKS, provider: await getPaymentProvider() }),
    "api/billing/quota/packs GET",
  );
}
