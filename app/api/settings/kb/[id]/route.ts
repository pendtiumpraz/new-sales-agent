import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService, type UpdateKbInput } from "@/modules/settings/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/settings/kb/[id] → one KB article. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await settingsService.getKb(g.ctx, params.id)),
    "api/settings/kb/[id] GET",
  );
}

// PATCH /api/settings/kb/[id] → update a KB article. tenant.settings.manage.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateKbInput;
    return ok(await settingsService.updateKb(g.ctx, params.id, body));
  }, "api/settings/kb/[id] PATCH");
}

// DELETE /api/settings/kb/[id]         → SOFT delete (sets deleted_at).
// DELETE /api/settings/kb/[id]?purge=1 → HARD delete (permanent). tenant.settings.manage.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await settingsService.hardDeleteKb(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await settingsService.softDeleteKb(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/settings/kb/[id] DELETE");
}
