import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac/guard";
import { getSetting, setSetting } from "@/lib/platform/settings";
import type { HandoffConfig } from "@/lib/types/handoff";

export const runtime = "nodejs";

// Tenant handoff config (doc — AI handoff). Persisted in the generic
// platform_setting key/value store under a per-tenant key, so no new table /
// migration is needed. The Zustand store hydrates from GET and auto-saves via PUT
// — fixes the bug where threshold/timeout/topics/auto-reply were lost on reload.
const keyFor = (tenantId: string) => `handoff_config:${tenantId}`;

export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx || !hasDb()) return NextResponse.json({ config: null, source: "mock" });
  try {
    const raw = await getSetting(keyFor(ctx.tenantId));
    return NextResponse.json({ config: raw ? (JSON.parse(raw) as HandoffConfig) : null, source: "db" });
  } catch (err) {
    console.error("[api/tenant/handoff GET]", err);
    return NextResponse.json({ config: null, source: "error" });
  }
}

export async function PUT(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json().catch(() => ({}))) as { config?: Partial<HandoffConfig> };
    const c = body?.config ?? {};
    // Sanitize — never trust the client; clamp ranges, cap topic list.
    const clean: HandoffConfig = {
      sentimentThreshold: Math.max(0, Math.min(100, Math.round(Number(c.sentimentThreshold ?? 30)))),
      timeoutMinutes: Math.max(1, Math.round(Number(c.timeoutMinutes ?? 15))),
      complexityTopics: Array.isArray(c.complexityTopics)
        ? [...new Set(c.complexityTopics.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()))].slice(0, 50)
        : [],
      autoReplyEnabled: Boolean(c.autoReplyEnabled),
    };
    await setSetting(keyFor(ctx.tenantId), JSON.stringify(clean));
    return NextResponse.json({ ok: true, config: clean, source: "db" });
  } catch (err) {
    console.error("[api/tenant/handoff PUT]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
