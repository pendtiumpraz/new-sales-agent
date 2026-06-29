import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type UpdateContactInput } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/contacts/[id] → one contact. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await crmService.getContact(g.ctx, params.id)), "api/contacts/[id] GET");
}

// PATCH /api/contacts/[id] → update a contact. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateContactInput;
    return ok(await crmService.updateContact(g.ctx, params.id, body));
  }, "api/contacts/[id] PATCH");
}

// DELETE /api/contacts/[id]         → SOFT delete (sets deleted_at, cascades to deals + activities).
// DELETE /api/contacts/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await crmService.hardDeleteContact(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await crmService.softDeleteContact(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/contacts/[id] DELETE");
}
