// WA auto-reply rate limit (C3 + C6) — anti-abuse / cost cap. Serverless-safe:
// counts outbound messages from messagesTable in a window (no extra counter
// store, no race). Caps are in BUBBLES (one reply = a few bubbles).
//
// C6 — caps come from the tenant's PLAN, with an env override (global) and a
// per-tenant setting override (`wa_rl:<tenantId>` = "lead,daily"). Plan tiers
// roughly track the token budget; the HARD cap stays the credit balance (when
// it hits $0, meteredGenerateText throws → graceful holding).

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { messagesTable } from "@/lib/db/schema";
import { getSetting } from "@/lib/wa/store";

// Per-plan defaults (bubbles): per-lead/hour (anti-iseng) + per-tenant/day (spend ceiling).
const PLAN_CAPS: Record<string, { lead: number; daily: number }> = {
  starter: { lead: 30, daily: 800 },
  growth: { lead: 60, daily: 4000 },
  enterprise: { lead: 120, daily: 20000 },
};

// Global env override (0/unset = use plan/per-tenant).
const ENV_LEAD = Number(process.env.WA_RL_LEAD_HOURLY ?? 0);
const ENV_DAILY = Number(process.env.WA_RL_TENANT_DAILY ?? 0);

export interface RateCheck {
  ok: boolean;
  reason?: "lead" | "tenant";
}

// Resolve caps: per-tenant setting > env > plan default.
async function capsFor(tenantId: string, plan: string): Promise<{ lead: number; daily: number }> {
  const base = PLAN_CAPS[plan] ?? PLAN_CAPS.starter;
  let lead = ENV_LEAD || base.lead;
  let daily = ENV_DAILY || base.daily;
  const raw = await getSetting(`wa_rl:${tenantId}`);
  if (raw) {
    const [l, d] = raw.split(",").map((x) => Number(x.trim()));
    if (l > 0) lead = l;
    if (d > 0) daily = d;
  }
  return { lead, daily };
}

async function outboundSince(where: ReturnType<typeof and>): Promise<number> {
  const [row] = await db.select({ c: count() }).from(messagesTable).where(where);
  return Number(row?.c ?? 0);
}

/** True (ok) when both the per-lead-hourly and per-tenant-daily caps have room. */
export async function checkWaRateLimit(
  tenantId: string,
  conversationId: string,
  plan = "starter",
): Promise<RateCheck> {
  const caps = await capsFor(tenantId, plan);
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
  if (leadCount >= caps.lead) return { ok: false, reason: "lead" };

  // Per-tenant (daily spend ceiling): outbound across the tenant today.
  const tenantCount = await outboundSince(
    and(
      eq(messagesTable.tenantId, tenantId),
      eq(messagesTable.direction, "out"),
      gte(messagesTable.timestamp, dayStart),
    ),
  );
  if (tenantCount >= caps.daily) return { ok: false, reason: "tenant" };

  return { ok: true };
}
