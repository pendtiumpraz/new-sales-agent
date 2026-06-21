import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { withTenant } from "@/lib/db/tenant-context";
import { conversationsTable } from "@/lib/db/schema";
import { loadReadiness } from "@/lib/sales/predictive-store";

export const runtime = "nodejs";

// GET /api/sales/readiness?conversationId=... → latest closing-readiness score +
// next-best-action for a conversation (Phase 4). Tenant-scoped.
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ readiness: null, source: "mock" });

  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId wajib" }, { status: 400 });
  }

  // Verify the conversation belongs to this tenant before exposing its score.
  const [convo] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          or(eq(conversationsTable.tenantId, ctx.tenantId), isNull(conversationsTable.tenantId)),
        ),
      )
      .limit(1),
  );
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const readiness = await loadReadiness(conversationId);
  return NextResponse.json({ readiness });
}
