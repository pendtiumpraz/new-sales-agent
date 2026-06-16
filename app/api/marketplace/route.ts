import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { marketplaceEnabled } from "@/lib/platform/settings";
import { browse, mine } from "@/lib/marketplace/store";

export const runtime = "nodejs";

// GET /api/marketplace (doc 41 §6) — browse other tenants' shared listings, or
// ?scope=mine for your own. Disabled outside SaaS mode.
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ enabled: false, data: [], source: "mock" });
  if (!(await marketplaceEnabled())) return NextResponse.json({ enabled: false, data: [] });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const type = url.searchParams.get("type") ?? undefined;
  const data = scope === "mine" ? await mine(guard.ctx.tenantId) : await browse(guard.ctx.tenantId, type);
  return NextResponse.json({ enabled: true, data, source: "db" });
}
