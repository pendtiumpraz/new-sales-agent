import { lt } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { aiUsageTable, sendJobTable, crawlJobTable } from "@/lib/db/schema";
import { recordAudit } from "./audit";

// Retention/TTL (doc 25): purge ephemeral operational rows older than N days.
// Subject PII (company/person/contact_point) is governed by DSAR, not blanket TTL.
export async function purgeOlderThan(ctx: TenantContext, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const res = await withTenant(ctx, async (tx) => {
    const u = await tx.delete(aiUsageTable).where(lt(aiUsageTable.at, cutoff)).returning({ id: aiUsageTable.id });
    const s = await tx.delete(sendJobTable).where(lt(sendJobTable.createdAt, cutoff)).returning({ id: sendJobTable.id });
    const c = await tx.delete(crawlJobTable).where(lt(crawlJobTable.createdAt, cutoff)).returning({ id: crawlJobTable.id });
    return { aiUsage: u.length, sendJobs: s.length, crawlJobs: c.length };
  });
  await recordAudit(ctx, "retention.purge", `>${days}d`, res);
  return res;
}
