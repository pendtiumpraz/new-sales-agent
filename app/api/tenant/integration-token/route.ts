import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";

// GET /api/tenant/integration-token (doc 40) → the LinkedIn ingest token to paste
// into the browser extension/userscript. tenant.settings.manage-guarded (admins
// only). Per-tenant signed tokens are a production hardening (doc 21).
export async function GET() {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const token = process.env.LINKEDIN_INGEST_TOKEN ?? "";
  return NextResponse.json({ token, configured: Boolean(token) });
}
