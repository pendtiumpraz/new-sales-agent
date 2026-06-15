import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { crawlJobTable, companyTable } from "@/lib/db/schema";
import { companyDedupKey, stableId } from "@/lib/profiling/dedup";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// Discovery entry-points (doc 21): user starts a crawl by manual URL, industry,
// bulk company-name list, or auto. Each becomes a crawl_job. The bulk list is
// fulfilled immediately (companies created via dedup). URL/industry/auto enqueue
// pending jobs for the MCP server / extension to fulfill (Fase 6).
const Body = z.object({
  kind: z.enum(["bulk", "url", "industry", "auto"]),
  names: z.array(z.string().min(1)).optional(),
  url: z.string().optional(),
  industry: z.string().optional(),
  posture: z.enum(["compliant", "balanced", "aggressive"]).default("compliant"),
});

export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await withTenant(guard.ctx, (tx) =>
      tx.select().from(crawlJobTable).orderBy(desc(crawlJobTable.createdAt)).limit(30),
    );
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/discovery GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const b = parsed.data;
  const jobId = "crawl_" + crypto.randomUUID();

  try {
    let created = 0;
    let status = "pending";
    const input: Record<string, unknown> = { kind: b.kind };

    await withTenant(ctx, async (tx) => {
      if (b.kind === "bulk") {
        const names = (b.names ?? []).map((n) => n.trim()).filter(Boolean);
        input.names = names;
        for (const name of names) {
          await tx
            .insert(companyTable)
            .values({
              id: stableId("co", companyDedupKey({ tenantId: ctx.tenantId, name, domain: null })),
              tenantId: ctx.tenantId,
              name,
              source: "discovery:bulk",
              capturedMode: b.posture,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({ target: companyTable.id, set: { name, updatedAt: new Date() } });
          created++;
        }
        status = "done";
      } else {
        if (b.url) input.url = b.url;
        if (b.industry) input.industry = b.industry;
      }

      await tx.insert(crawlJobTable).values({
        id: jobId,
        tenantId: ctx.tenantId,
        kind: b.kind,
        input,
        posture: b.posture,
        status,
        result: status === "done" ? { created } : null,
        finishedAt: status === "done" ? new Date() : null,
      });
    });

    await recordAudit(ctx, "discovery.start", b.kind, { posture: b.posture, created });
    return NextResponse.json({ ok: true, jobId, status, created });
  } catch (err) {
    console.error("[api/discovery POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
