import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { contentService, type CreateTemplateInput } from "@/modules/content/service";

export const runtime = "nodejs";

// GET /api/content/templates → list the tenant's live template konten. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await contentService.listTemplates(g.ctx)), "api/content/templates GET");
}

// POST /api/content/templates → create a template konten. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateTemplateInput;
    return ok(await contentService.createTemplate(g.ctx, body), { status: 201 });
  }, "api/content/templates POST");
}
