import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveRepByToken } from "@/lib/team/rep-account";
import { classifyLead, heuristicClassify } from "@/lib/engagement/classify";
import { getWorkspace } from "@/lib/workspace/store";
import { productTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// POST /api/discovery/classify (doc 40) — the extension extracts a LinkedIn/IG
// profile (the server can't log in) and asks the server to CLASSIFY it B2B/B2C.
// The model call runs server-side via classifyLead: METERED (tenant credit), key
// stays server-only, and the scraped text is untrusted-wrapped against injection —
// instead of burning a client-side DeepSeek key that bypasses all cost control.
// Same brain as the ingest fallback, just triggered on demand from the browser.
// Response is shaped to the /api/ingest person fields so the extension can attach
// it directly to the lead it saves next.
export async function POST(req: Request) {
  // Same auth shape as /api/ingest: ingest token (per-rep / LINKEDIN_INGEST_TOKEN)
  // or a session with data.write.
  const token = req.headers.get("x-ingest-token");
  let ctx: TenantContext;
  const rep = token ? await resolveRepByToken(token) : null;
  const ingestToken = await getSecret("LINKEDIN_INGEST_TOKEN");
  if (rep) {
    ctx = { tenantId: rep.tenantId, userId: rep.userId, role: "member" };
  } else if (token && ingestToken && token === ingestToken) {
    ctx = { tenantId: (await getSecret("LINKEDIN_INGEST_TENANT")) || "t_default", userId: "extension", role: "member" };
  } else {
    const guard = await requirePermission("data.write");
    if ("error" in guard) return guard.error;
    ctx = guard.ctx;
  }

  const b = (await req.json().catch(() => ({}))) as {
    profile?: {
      fullName?: string;
      title?: string;
      company?: string;
      companyName?: string;
      location?: string;
      about?: string;
      experience?: { title?: string; company?: string; period?: string }[];
    };
    workspaceId?: string;
  };
  const p = b.profile;
  if (!p?.fullName) return NextResponse.json({ error: "profile.fullName wajib" }, { status: 400 });

  const input = {
    fullName: p.fullName,
    title: p.title ?? null,
    company: p.company ?? p.companyName ?? null,
    experience: p.experience,
  };

  // No DB (pure-mock) → deterministic heuristic so it stays demoable + free.
  if (!hasDb()) {
    const h = heuristicClassify(input);
    return NextResponse.json({ ok: true, leadType: h.leadType, leadScore: h.score, leadReason: h.reason, profileConfidence: h.score, source: "mock" });
  }

  // Ground the B2B/B2C decision in what the workspace sells, when known.
  let product: string | null = null;
  if (b.workspaceId) {
    const ws = await getWorkspace(ctx, b.workspaceId);
    if (ws?.productId) {
      const rows = await withTenant(ctx, (tx) =>
        tx.select({ name: productTable.name }).from(productTable).where(eq(productTable.id, ws.productId!)).limit(1),
      );
      product = rows[0]?.name ?? null;
    }
  }

  const cls = await classifyLead(ctx, { ...input, product });
  return NextResponse.json({
    ok: true,
    leadType: cls.leadType,
    leadScore: cls.score,
    leadReason: cls.reason,
    profileConfidence: cls.score,
    product,
    source: "db",
  });
}
