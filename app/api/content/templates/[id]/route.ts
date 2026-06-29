import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { contentService, type UpdateTemplateInput } from "@/modules/content/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/content/templates/[id] → one template konten. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await contentService.getTemplate(g.ctx, params.id)), "api/content/templates/[id] GET");
}

// PATCH /api/content/templates/[id] → update a template konten. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateTemplateInput;
    return ok(await contentService.updateTemplate(g.ctx, params.id, body));
  }, "api/content/templates/[id] PATCH");
}

// DELETE /api/content/templates/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/content/templates/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await contentService.hardDeleteTemplate(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await contentService.softDeleteTemplate(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/content/templates/[id] DELETE");
}
