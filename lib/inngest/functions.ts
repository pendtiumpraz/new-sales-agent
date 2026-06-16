// Inngest functions (doc 31) — scheduled + event-driven background work that
// reuses the same engines the on-demand API routes call. Drop-in for the inline
// "process now" model: once an Inngest app is connected these run on a cron, no
// caller changes needed.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tenantsTable } from "@/lib/db/schema";
import { processCadences } from "@/lib/cadence/processor";
import { processSendJobs } from "@/lib/mail/send";
import { runUpsell } from "@/lib/engagement/upsell";
import { inngest } from "./client";

// Per-tenant system context. superadmin role so the worker is allowed to act
// once RLS is enforced (the policy lets app.role=superadmin through) while writes
// stay scoped to this tenant_id. The engines re-check isTenantActive themselves.
function systemCtx(tenantId: string) {
  return { tenantId, userId: "inngest", role: "superadmin" as const };
}

async function activeTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));
  return rows.map((r) => r.id);
}

// Cron: advance due cadence steps across all active tenants (every 15 min).
// Inngest v4: trigger lives in options.triggers (2-arg createFunction).
export const cadenceCron = inngest.createFunction(
  { id: "cadence-cron", name: "Process due cadence steps", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const tenantIds = await step.run("list-tenants", activeTenantIds);
    const results: Record<string, unknown> = {};
    for (const tenantId of tenantIds) {
      results[tenantId] = await step.run(`cadence-${tenantId}`, () =>
        processCadences(systemCtx(tenantId)),
      );
    }
    return { tenants: tenantIds.length, results };
  },
);

// Cron: drain the email send queue across all active tenants (every 5 min).
export const sendQueueCron = inngest.createFunction(
  { id: "send-queue-cron", name: "Drain email send queue", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const tenantIds = await step.run("list-tenants", activeTenantIds);
    const results: Record<string, unknown> = {};
    for (const tenantId of tenantIds) {
      results[tenantId] = await step.run(`send-${tenantId}`, () =>
        processSendJobs(systemCtx(tenantId)),
      );
    }
    return { tenants: tenantIds.length, results };
  },
);

// Event-driven: process one tenant on demand. Fire with:
//   inngest.send({ name: "cadence/process.requested", data: { tenantId } })
// e.g. right after a bulk-enroll so the first step goes out without waiting.
export const cadenceOnDemand = inngest.createFunction(
  {
    id: "cadence-on-demand",
    name: "Process cadence for one tenant",
    triggers: [{ event: "cadence/process.requested" }],
  },
  async ({ event, step }) => {
    const tenantId = String((event.data as { tenantId?: string })?.tenantId ?? "");
    if (!tenantId) return { skipped: true };
    return step.run(`cadence-${tenantId}`, () => processCadences(systemCtx(tenantId)));
  },
);

// Cron: autonomous upsell + close across all active tenants (daily 09:00 UTC).
// KB-driven offer + Stripe checkout link → email/WA, idempotent per contact+product.
export const upsellCron = inngest.createFunction(
  { id: "upsell-cron", name: "Autonomous upsell + close", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const tenantIds = await step.run("list-tenants", activeTenantIds);
    const results: Record<string, unknown> = {};
    for (const tenantId of tenantIds) {
      results[tenantId] = await step.run(`upsell-${tenantId}`, () =>
        runUpsell(systemCtx(tenantId)),
      );
    }
    return { tenants: tenantIds.length, results };
  },
);

export const functions = [cadenceCron, sendQueueCron, cadenceOnDemand, upsellCron];
