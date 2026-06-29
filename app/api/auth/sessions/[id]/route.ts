import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { authService } from "@/modules/auth/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE /api/auth/sessions/[id] (doc §4.2) — revoke one of the caller's OWN
// sessions (the service 404s if the session belongs to another user). Self-scoped.
export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await getTenantContext();
  if (!ctx) return fail("Unauthorized", 401, "unauthorized");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await authService.revokeSession(params.id, ctx.userId);
    return ok({ id: params.id, revoked: true });
  }, "api/auth/sessions/[id] DELETE");
}
