import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { withTenant } from "@/lib/db/tenant-context";
import { conversationsTable } from "@/lib/db/schema";
import { loadReadiness } from "@/lib/sales/predictive-store";
import { recordOutcome, loadOutcome, type Outcome } from "@/lib/sales/outcome-store";

export const runtime = "nodejs";

const OUTCOMES: Outcome[] = ["won", "lost", "stalled"];

// The conversation (scoped to the caller's tenant) or null — also carries its
// workspaceId so the outcome can be filtered per-workspace later.
async function convScope(ctx: Parameters<typeof withTenant>[0], conversationId: string) {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: conversationsTable.id, workspaceId: conversationsTable.workspaceId })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          or(eq(conversationsTable.tenantId, ctx.tenantId), isNull(conversationsTable.tenantId)),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

// GET /api/sales/outcome?conversationId=... → the conversation's recorded outcome.
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ outcome: null, source: "mock" });
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId wajib" }, { status: 400 });
  if (!(await convScope(guard.ctx, conversationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ outcome: await loadOutcome(conversationId) });
}

// POST /api/sales/outcome { conversationId, outcome } — a rep marks how the chat
// ended. The score/band at outcome are taken from the last saved readiness so the
// calibration log captures what the model predicted vs. what happened.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const b = (await req.json().catch(() => ({}))) as { conversationId?: string; outcome?: string };
  if (!b.conversationId || !b.outcome || !OUTCOMES.includes(b.outcome as Outcome)) {
    return NextResponse.json({ error: "conversationId + outcome (won|lost|stalled) wajib" }, { status: 400 });
  }
  const scope = await convScope(guard.ctx, b.conversationId);
  if (!scope) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const r = await loadReadiness(b.conversationId);
  await recordOutcome(guard.ctx.tenantId, {
    conversationId: b.conversationId,
    outcome: b.outcome as Outcome,
    score: r?.score ?? 0,
    band: r?.band ?? "dingin",
    source: "manual",
    ts: new Date().toISOString(),
    workspaceId: scope.workspaceId ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
