import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, parseJson } from "@/modules/_shared/api";
import { apiKeyService, type CreateApiKeyInput } from "@/modules/apikey/service";

export const runtime = "nodejs";

// GET /api/settings/api-keys → list the tenant's API keys (public shape — no hash,
// no plaintext). MANAGING keys is an admin action done with a SESSION, so this is
// gated on tenant.settings.manage (NOT reachable via an API key — a key is capped
// to data.read/data.write in the guard).
export async function GET() {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await apiKeyService.list(g.ctx)), "api/settings/api-keys GET");
}

// POST /api/settings/api-keys → create a key. Returns the PLAINTEXT key ONCE in
// `data.key` (unrecoverable afterward). tenant.settings.manage (session).
export async function POST(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = await parseJson<CreateApiKeyInput>(req);
    const created = await apiKeyService.create(g.ctx, body);
    return ok(created, { status: 201 });
  }, "api/settings/api-keys POST");
}
