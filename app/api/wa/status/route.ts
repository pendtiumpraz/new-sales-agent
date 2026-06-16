import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import { wahaStatus } from "@/lib/wa/waha";

export const runtime = "nodejs";

// GET /api/wa/status (doc 34) → WAHA session health for the UI (configured?
// linked?). campaign.manage-guarded.
export async function GET() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  return NextResponse.json(await wahaStatus());
}
