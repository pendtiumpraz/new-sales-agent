import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/mailboxes → the tenant's sending identities (NO secrets) with
// each mailbox's emails-sent-today + the lib/mail provider-configured flags.
// REUSE: connect/disconnect stay on the existing /api/tenant/mailboxes* handlers;
// this is the facade read. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb())
    return ok({ mailboxes: [], providers: { google: false, microsoft: false, esp: false } });
  return handle(
    async () => ok(await settingsService.getMailboxes(g.ctx)),
    "api/settings/mailboxes GET",
  );
}
