import { and, eq, isNull, isNotNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  contactsTable,
  companyTable,
  personTable,
  dealsTable,
  cadencesTable,
  quoteTable,
  productTable,
  kbTable,
  workspaceTable,
} from "@/lib/db/schema";

// Soft-delete + restore (doc 49). User-facing business entities carry a nullable
// deleted_at; "delete" sets it, "restore" clears it, and list reads filter it out
// (or show ONLY archived rows when asked). One registry → one generic endpoint +
// one read filter, instead of bespoke handlers per table.
export const ARCHIVABLE = {
  contact: contactsTable,
  company: companyTable,
  person: personTable,
  deal: dealsTable,
  cadence: cadencesTable,
  quote: quoteTable,
  product: productTable,
  kb: kbTable,
  workspace: workspaceTable,
} as const;

export type ArchivableEntity = keyof typeof ARCHIVABLE;

export function isArchivable(x: string): x is ArchivableEntity {
  return Object.prototype.hasOwnProperty.call(ARCHIVABLE, x);
}

/** Set or clear deleted_at for one row in the caller's tenant. Returns true if a
 *  row matched. `any` on the table dodges drizzle's union-of-tables TS friction. */
export async function setArchived(ctx: TenantContext, entity: ArchivableEntity, id: string, archived: boolean): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table: any = ARCHIVABLE[entity];
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(table)
      .set({ deletedAt: archived ? new Date() : null })
      .where(and(eq(table.id, id), eq(table.tenantId, ctx.tenantId)))
      .returning({ id: table.id }),
  );
  return rows.length > 0;
}

/** Drizzle predicate to drop into a list query's WHERE. `archived` flips it to
 *  show ONLY the trash. Pass the table's deletedAt column. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notDeleted(deletedAtCol: any) {
  return isNull(deletedAtCol);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onlyDeleted(deletedAtCol: any) {
  return isNotNull(deletedAtCol);
}
