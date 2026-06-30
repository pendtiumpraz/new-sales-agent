import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, parseLimit, type Page } from "@/modules/_shared/api";
import { crmService, type CreateContactInput } from "@/modules/crm/service";
import type { ContactRow } from "@/modules/crm/schema";

export const runtime = "nodejs";

// GET /api/contacts → one keyset page of the tenant's live contacts (newest first)
// + a `nextCursor`. Supports ?workspaceId= / ?companyId= / ?segment= filters and
// ?limit= / ?cursor= pagination. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  const empty: Page<ContactRow> = { items: [], nextCursor: null };
  if (!hasDb()) return ok(empty);
  const sp = new URL(req.url).searchParams;
  const filter = {
    workspaceId: sp.get("workspaceId") ?? undefined,
    companyId: sp.get("companyId") ?? undefined,
    segment: sp.get("segment") ?? undefined,
  };
  const page = { limit: parseLimit(sp.get("limit")), cursor: sp.get("cursor") ?? undefined };
  return handle(
    async () => ok(await crmService.pageContacts(g.ctx, filter, page)),
    "api/contacts GET",
  );
}

// POST /api/contacts → create a contact (segment b2c|b2b|unknown + enrichment +
// fit_score + workspace_id). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateContactInput;
    return ok(await crmService.createContact(g.ctx, body), { status: 201 });
  }, "api/contacts POST");
}
