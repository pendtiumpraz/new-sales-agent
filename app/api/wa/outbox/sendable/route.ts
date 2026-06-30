import { hasDb } from "@/lib/db/client";
import { gatewayTokenOk, ownerOfSession } from "@/lib/wa/store";
import type { TenantContext } from "@/lib/db/tenant-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService } from "@/modules/wa/service";

export const runtime = "nodejs";

// GET /api/wa/outbox/sendable?sessionId=… → the external gateway (extension/WAHA)
// polls this for queued rows whose pacing delay has elapsed (scheduled_at ≤ now),
// oldest first. ?limit= caps the batch.
//
// Authed by the scoped MACHINE token (x-wa-gateway-token), NOT a human session —
// this is an outbound-only poller with no user cookie. The required ?sessionId=
// resolves the owning tenant (like the inbound route), so the read stays scoped
// to that tenant instead of leaking across tenants.
export async function GET(req: Request) {
  if (!gatewayTokenOk(req.headers.get("x-wa-gateway-token"))) {
    return fail("Unauthorized", 401, "unauthorized");
  }
  if (!hasDb()) return ok([]);

  const params = new URL(req.url).searchParams;
  const sessionId = params.get("sessionId");
  if (!sessionId) return fail("sessionId wajib", 400, "validation");

  const owner = await ownerOfSession(sessionId);
  if (!owner) return fail("session tidak dikenal", 404, "not_found");

  const raw = params.get("limit");
  const limit = raw ? Math.min(Math.max(Number(raw) || 0, 1), 100) : 20;
  const ctx: TenantContext = { tenantId: owner.tenantId, userId: owner.userId, role: "member" };
  return handle(async () => ok(await waService.listSendable(ctx, limit)), "api/wa/outbox/sendable GET");
}
