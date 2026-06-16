import { NextResponse } from "next/server";
import { eq, isNull, isNotNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { companyTable, contactPointTable, personTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// GET /api/db/companies → tenant's companies, each with its company-level contact
// points and a people count (doc 20). RLS-scoped via withTenant.
// ?archived=1 returns ONLY soft-deleted companies (the Arsip view, doc 49).
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  try {
    const { companies, cps, persons } = await withTenant(ctx, async (tx) => {
      const companies = await tx
        .select()
        .from(companyTable)
        .where(archived ? isNotNull(companyTable.deletedAt) : isNull(companyTable.deletedAt));
      const cps = await tx
        .select()
        .from(contactPointTable)
        .where(eq(contactPointTable.ownerType, "company"));
      const persons = await tx
        .select({ companyId: personTable.companyId })
        .from(personTable);
      return { companies, cps, persons };
    });

    const cpByOwner = new Map<string, typeof cps>();
    for (const cp of cps) {
      const list = cpByOwner.get(cp.ownerId) ?? [];
      list.push(cp);
      cpByOwner.set(cp.ownerId, list);
    }
    const peopleCount = new Map<string, number>();
    for (const p of persons) {
      if (p.companyId) peopleCount.set(p.companyId, (peopleCount.get(p.companyId) ?? 0) + 1);
    }

    const data = companies.map((c) => ({
      ...c,
      contacts: cpByOwner.get(c.id) ?? [],
      peopleCount: peopleCount.get(c.id) ?? 0,
    }));
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/db/companies GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
