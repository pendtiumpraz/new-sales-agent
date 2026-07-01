import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { DOCS } from "@/lib/docs/content";

export const runtime = "nodejs";

// GET /api/superadmin/docs?doc=HLA|FEATURES — full markdown of an embedded doc.
// Superadmin only (the tenant-facing /documentation page is separate + admin-free).
export async function GET(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  const doc = new URL(req.url).searchParams.get("doc") ?? "HLA";
  return handle(async () => {
    const entry = DOCS[doc];
    if (!entry) return fail("Dokumen tidak ditemukan", 404, "not_found");
    return ok(entry);
  }, "api/superadmin/docs GET");
}
