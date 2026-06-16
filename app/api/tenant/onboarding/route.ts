import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import {
  crawlJobTable,
  kbTable,
  sendingAccountTable,
  tenantActiveModelTable,
} from "@/lib/db/schema";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";

// GET /api/tenant/onboarding → real completion status of the first-run setup
// steps, computed from the DB (no dummy). Drives the dashboard "Mulai di sini"
// checklist.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx || !hasDb()) return NextResponse.json({ steps: null, source: "mock" });
  try {
    const data = await withTenant(ctx, async (tx) => {
      const [mb] = await tx.select({ n: sql<number>`count(*)::int` }).from(sendingAccountTable);
      const [cr] = await tx.select({ n: sql<number>`count(*)::int` }).from(crawlJobTable);
      const [am] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(tenantActiveModelTable)
        .where(eq(tenantActiveModelTable.tenantId, ctx.tenantId));
      const kbRows = await tx.select({ data: kbTable.data }).from(kbTable);
      return { mb: mb?.n ?? 0, cr: cr?.n ?? 0, am: am?.n ?? 0, kbRows };
    });

    const kbDone = data.kbRows.some(
      (r) => ((r.data as KnowledgeBase | null)?.products?.length ?? 0) > 0,
    );
    const steps = {
      mailbox: data.mb > 0,
      kb: kbDone,
      crawl: data.cr > 0,
      aiModel: data.am > 0,
    };
    const doneCount = Object.values(steps).filter(Boolean).length;
    return NextResponse.json({
      steps,
      doneCount,
      total: Object.keys(steps).length,
      complete: doneCount === Object.keys(steps).length,
      source: "db",
    });
  } catch (err) {
    console.error("[api/tenant/onboarding]", err);
    return NextResponse.json({ steps: null, source: "error" });
  }
}
