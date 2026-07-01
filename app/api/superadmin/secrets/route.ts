import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { listSecretStatus, setSecret } from "@/lib/config/secrets";

export const runtime = "nodejs";

// GET /api/superadmin/secrets — catalog + status (setInDb / hasEnv / masked preview).
// NEVER returns full secret values. Superadmin only.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(async () => ok({ secrets: await listSecretStatus(), hasMasterKey: !!process.env.SECRETS_KEY }), "api/superadmin/secrets GET");
}

// POST /api/superadmin/secrets { key, value } — set (encrypt) or clear (empty value →
// falls back to env). Requires SECRETS_KEY in env. Superadmin only.
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { key?: string; value?: string };
    if (!body.key) return fail("key wajib", 400, "validation");
    await setSecret(body.key, body.value ?? "");
    return ok({ key: body.key, saved: true });
  }, "api/superadmin/secrets POST");
}
