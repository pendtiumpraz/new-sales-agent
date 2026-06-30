import { NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { companyTable, personTable } from "@/lib/db/schema";
import { classifyLead, type ClassifyInput } from "@/lib/engagement/classify";

export const runtime = "nodejs";

// POST /api/profiles/classify (doc 40) — classify a person as B2C-customer vs
// B2B-partner and persist lead_type / lead_reason / lead_score.
//   { personId } → classify one
//   { all: true } → classify up to 50 still-unclassified people this call
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => ({}))) as { personId?: string; all?: boolean };

  try {
    const coName = new Map<string, { name: string | null; industry: string | null }>();
    const result = await withTenant(ctx, async (tx) => {
      const companies = await tx
        .select({ id: companyTable.id, name: companyTable.name, industry: companyTable.industry })
        .from(companyTable);
      for (const c of companies) coName.set(c.id, { name: c.name, industry: c.industry });

      const targets = body.personId
        ? await tx.select().from(personTable).where(eq(personTable.id, body.personId))
        : await tx
            .select()
            .from(personTable)
            .where(or(isNull(personTable.leadType), eq(personTable.leadType, "unknown")))
            .limit(50);

      const out: { id: string; leadType: string; reason: string; score: number }[] = [];
      for (const p of targets) {
        const co = p.companyId ? coName.get(p.companyId) : undefined;
        const input: ClassifyInput = {
          fullName: p.fullName,
          title: p.title,
          company: co?.name ?? null,
          industry: co?.industry ?? null,
          experience: (p.experience as ClassifyInput["experience"]) ?? [],
        };
        const c = await classifyLead(ctx, input);
        await tx
          .update(personTable)
          .set({ leadType: c.leadType, leadReason: c.reason, leadScore: c.score, updatedAt: new Date() })
          .where(and(eq(personTable.id, p.id), eq(personTable.tenantId, ctx.tenantId)));
        out.push({ id: p.id, leadType: c.leadType, reason: c.reason, score: c.score });
      }
      return out;
    });

    return NextResponse.json({ ok: true, count: result.length, results: result, source: "db" });
  } catch (err) {
    console.error("[api/profiles/classify POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
