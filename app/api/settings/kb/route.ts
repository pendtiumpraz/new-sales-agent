import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService, type CreateKbInput } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/kb            → list the tenant's live KB articles/snippets.
// GET /api/settings/kb?scope=…    → filter by scope. data.read.
// GET /api/settings/kb?trashed=1  → soft-deleted KB rows.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const url = new URL(req.url);
  const trashed = url.searchParams.get("trashed");
  const scope = url.searchParams.get("scope") ?? undefined;
  return handle<unknown>(async () => {
    if (trashed === "1" || trashed === "true")
      return ok(await settingsService.listTrashedKb(g.ctx));
    return ok(await settingsService.listKb(g.ctx, scope ? { scope } : undefined));
  }, "api/settings/kb GET");
}

// POST /api/settings/kb → create a KB article/snippet. tenant.settings.manage.
export async function POST(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateKbInput;
    const row = await settingsService.createKb(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/settings/kb POST");
}
