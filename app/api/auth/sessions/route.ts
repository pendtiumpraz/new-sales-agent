import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { authService } from "@/modules/auth/service";

export const runtime = "nodejs";

// GET /api/auth/sessions (doc §4.2) — the caller's own active (non-revoked)
// sessions. Self-scoped: any authenticated user, no special permission.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return fail("Unauthorized", 401, "unauthorized");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await authService.listSessions(ctx.userId)), "api/auth/sessions GET");
}
