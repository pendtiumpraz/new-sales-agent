// WA auto-reply rate limit (C3) — anti-abuse / cost cap. Serverless-safe: counts
// outbound messages from messagesTable in a time window (no extra counter store,
// no race). Caps are in BUBBLES (one reply = a few bubbles).

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { messagesTable } from "@/lib/db/schema";

// Defaults; overridable via env. Per-lead is the anti-iseng cap; per-tenant is
// the daily spend ceiling. (Per-plan config is C6 — still open.)
const PER_LEAD_HOURLY = Number(process.env.WA_RL_LEAD_HOURLY ?? 40); // ~10 replies/lead/hour
const TENANT_DAILY = Number(process.env.WA_RL_TENANT_DAILY ?? 2000); // tenant-wide/day

export interface RateCheck {
  ok: boolean;
  reason?: "lead" | "tenant";
}

async function outboundSince(
  where: ReturnType<typeof and>,
): Promise<number> {
  const [row] = await db.select({ c: count() }).from(messagesTable).where(where);
  return Number(row?.c ?? 0);
}

/** True (ok) when both the per-lead-hourly and per-tenant-daily caps have room. */
export async function checkWaRateLimit(
  tenantId: string,
  conversationId: string,
): Promise<RateCheck> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  // Per-lead (anti-iseng): outbound to THIS conversation in the last hour.
  const leadCount = await outboundSince(
    and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.direction, "out"),
      gte(messagesTable.timestamp, hourAgo),
    ),
  );
  if (leadCount >= PER_LEAD_HOURLY) return { ok: false, reason: "lead" };

  // Per-tenant (daily spend ceiling): outbound across the tenant today.
  const tenantCount = await outboundSince(
    and(
      eq(messagesTable.tenantId, tenantId),
      eq(messagesTable.direction, "out"),
      gte(messagesTable.timestamp, dayStart),
    ),
  );
  if (tenantCount >= TENANT_DAILY) return { ok: false, reason: "tenant" };

  return { ok: true };
}
