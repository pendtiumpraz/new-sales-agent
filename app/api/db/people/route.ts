import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { companyTable, contactPointTable, personTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// GET /api/db/people → tenant's people, each with company name + person-level
// contact points (doc 20). RLS-scoped via withTenant.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const { persons, companies, cps } = await withTenant(ctx, async (tx) => {
      const persons = await tx.select().from(personTable);
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
