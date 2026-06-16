import { NextResponse } from "next/server";
import { and, eq, or, isNull, isNotNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { companyTable, contactPointTable, personTable } from "@/lib/db/schema";
import { isManager } from "@/lib/team/members";

export const runtime = "nodejs";

// GET /api/db/people → tenant's people, each with company name + person-level
// contact points (doc 20). RLS-scoped via withTenant. Per-rep isolation (doc 41
// §2): a sales rep (member) sees only leads assigned to them OR still unassigned
// (the tenant pool); managers see everything.
// ?archived=1 returns ONLY soft-deleted people (the Arsip view, doc 49).
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  const scoped = !isManager(ctx.role);
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  const delPred = archived ? isNotNull(personTable.deletedAt) : isNull(personTable.deletedAt);
  try {
    const { persons, companies, cps } = await withTenant(ctx, async (tx) => {
      const persons = scoped
        ? await tx
            .select()
            .from(personTable)
            .where(and(or(eq(personTable.assignedTo, ctx.userId), isNull(personTable.assignedTo)), delPred))
        : await tx.select().from(personTable).where(delPred);
      const companies = await tx
        .select({ id: companyTable.id, name: companyTable.name })
        .from(companyTable);
      const cps = await tx
        .select()
        .from(contactPointTable)
        .where(eq(contactPointTable.ownerType, "person"));
      return { persons, companies, cps };
    });

    const coName = new Map(companies.map((c) => [c.id, c.name]));
    const cpByOwner = new Map<string, typeof cps>();
    for (const cp of cps) {
      const list = cpByOwner.get(cp.ownerId) ?? [];
      list.push(cp);
      cpByOwner.set(cp.ownerId, list);
    }

    const data = persons.map((p) => ({
      ...p,
      companyName: p.companyId ? coName.get(p.companyId) ?? null : null,
      contacts: cpByOwner.get(p.id) ?? [],
    }));
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/db/people GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
