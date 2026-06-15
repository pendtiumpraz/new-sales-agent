import { and, eq, inArray, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { contactsTable, personTable, contactPointTable, suppressionTable } from "@/lib/db/schema";
import { stableId } from "@/lib/profiling/dedup";
import { recordAudit } from "./audit";

// DSAR — Data Subject Access Request (doc 25). Find / export / erase everything
// tied to a subject email across tenant tables. Erase keeps an opt-out
// suppression so the subject is never re-contacted.

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function gather(tx: Tx, email: string) {
  const e = email.trim().toLowerCase();

  // contact_points carrying this email (and the people who own them).
  const emailCps = await tx.select().from(contactPointTable).where(eq(contactPointTable.value, e));
  const personIds = [...new Set(emailCps.filter((c) => c.ownerType === "person").map((c) => c.ownerId))];

  const persons = personIds.length
    ? await tx.select().from(personTable).where(inArray(personTable.id, personIds))
    : [];
  const personCps = personIds.length
    ? await tx
        .select()
        .from(contactPointTable)
        .where(and(eq(contactPointTable.ownerType, "person"), inArray(contactPointTable.ownerId, personIds)))
    : [];
  // legacy flat contacts (case-insensitive email match).
  const contacts = await tx.select().from(contactsTable).where(sql`lower(${contactsTable.email}) = ${e}`);
  const suppression = await tx.select().from(suppressionTable).where(eq(suppressionTable.email, e));

  const contactPoints = [...new Map([...emailCps, ...personCps].map((c) => [c.id, c])).values()];
  return { email: e, contacts, persons, contactPoints, suppression };
}

export async function exportSubject(ctx: TenantContext, email: string) {
  const bundle = await withTenant(ctx, (tx) => gather(tx, email));
  await recordAudit(ctx, "dsar.export", bundle.email, {
    contacts: bundle.contacts.length,
    persons: bundle.persons.length,
    contactPoints: bundle.contactPoints.length,
  });
  return bundle;
}

export async function deleteSubject(ctx: TenantContext, email: string) {
  const e = email.trim().toLowerCase();
  const deleted = await withTenant(ctx, async (tx) => {
    const g = await gather(tx, email);
    const out = { contacts: 0, persons: 0, contactPoints: 0 };

    if (g.contactPoints.length) {
      const ids = g.contactPoints.map((c) => c.id);
      await tx.delete(contactPointTable).where(inArray(contactPointTable.id, ids));
      out.contactPoints = ids.length;
    }
    if (g.persons.length) {
      const ids = g.persons.map((p) => p.id);
      await tx.delete(personTable).where(inArray(personTable.id, ids));
      out.persons = ids.length;
    }
    if (g.contacts.length) {
      const ids = g.contacts.map((c) => c.id);
      await tx.delete(contactsTable).where(inArray(contactsTable.id, ids));
      out.contacts = ids.length;
    }
    // Keep an opt-out record so the erased subject is never re-ingested/contacted.
    await tx
      .insert(suppressionTable)
      .values({ id: stableId("sup", `${ctx.tenantId}:${e}`), tenantId: ctx.tenantId, email: e, reason: "dsar_delete" })
      .onConflictDoNothing();
    return out;
  });
  await recordAudit(ctx, "dsar.delete", e, deleted);
  return deleted;
}
