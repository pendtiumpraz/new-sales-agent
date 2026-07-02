import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { apiKeyService } from "@/modules/apikey/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE /api/settings/api-keys/[id] → REVOKE the key (sets revoked_at; the key
// stops resolving immediately). tenant.settings.manage (session — not reachable
// via an API key). Revoke is intentionally NOT a hard delete: the row stays for
// the audit trail / list history, just permanently unusable.
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const row = await apiKeyService.revoke(g.ctx, params.id);
    return ok({ id: row.id, revoked: true });
  }, "api/settings/api-keys/[id] DELETE");
}
