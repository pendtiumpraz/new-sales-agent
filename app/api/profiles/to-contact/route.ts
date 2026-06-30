import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { personTable, companyTable, contactPointTable, contactsTable, cadenceEnrollmentsTable, cadencesTable } from "@/lib/db/schema";
import { stableId } from "@/lib/profiling/dedup";

export const runtime = "nodejs";

// POST /api/profiles/to-contact (doc 22/46) — turn a crawled person (personTable)
// into a CRM contact (contactsTable) so it can enter a cadence (enrollment is
// contact-based). Idempotent: the contact id is derived from the person id, so
// re-running refreshes instead of duplicating. With { cadenceId } it also enrolls.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { personId?: string; cadenceId?: string };
  if (!body.personId) return NextResponse.json({ ok: false, error: "personId required" }, { status: 400 });
  const T = ctx.tenantId;

  try {
    const result = await withTenant(ctx, async (tx) => {
      const rows = await tx.select().from(personTable).where(and(eq(personTable.id, body.personId!), eq(personTable.tenantId, T))).limit(1);
      const p = rows[0];
      if (!p) return { error: "not found" } as const;

      const companyName = p.companyId
        ? (await tx.select({ name: companyTable.name }).from(companyTable).where(eq(companyTable.id, p.companyId)).limit(1))[0]?.name ?? null
        : null;
      const cps = await tx.select().from(contactPointTable).where(and(eq(contactPointTable.ownerType, "person"), eq(contactPointTable.ownerId, p.id)));
      const email = cps.find((c) => c.channel === "email")?.value ?? null;
      const phone = cps.find((c) => c.channel === "phone" || c.channel === "wa" || c.channel === "whatsapp")?.value ?? null;

      const contactId = stableId("ct", `${T}:person:${p.id}`);
      await tx
        .insert(contactsTable)
        .values({
          id: contactId,
          tenantId: T,
          name: p.fullName,
          title: p.title ?? null,
          companyId: p.companyId ?? null,
          company: companyName,
          city: p.location ?? null,
          email,
          phone,
          channelPreference: phone ? "whatsapp" : email ? "email" : null,
          consent: "unknown",
          source: "profile",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: contactsTable.id,
          set: { name: p.fullName, title: p.title ?? null, company: companyName, city: p.location ?? null, email, phone, updatedAt: new Date() },
        });

      let enrolled = false;
      if (body.cadenceId) {
        const existing = await tx
          .select({ id: cadenceEnrollmentsTable.id })
          .from(cadenceEnrollmentsTable)
          .where(and(eq(cadenceEnrollmentsTable.cadenceId, body.cadenceId), eq(cadenceEnrollmentsTable.contactId, contactId)))
          .limit(1);
        if (!existing[0]) {
          await tx.insert(cadenceEnrollmentsTable).values({ id: crypto.randomUUID(), cadenceId: body.cadenceId, contactId, currentStepIdx: 0, status: "aktif", tenantId: T });
          await tx.update(cadencesTable).set({ enrolled: sql`${cadencesTable.enrolled} + 1`, updatedAt: new Date() }).where(eq(cadencesTable.id, body.cadenceId));
          enrolled = true;
        }
      }
      return { contactId, enrolled } as const;
    });

    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true, ...result, source: "db" });
  } catch (err) {
    console.error("[api/profiles/to-contact]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
