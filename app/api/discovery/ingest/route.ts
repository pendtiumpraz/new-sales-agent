import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import type { TenantContext } from "@/lib/db/tenant-context";
import { resolveRepByToken } from "@/lib/team/rep-account";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type IngestGraphInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

// POST /api/discovery/ingest — CHANNEL-AGNOSTIC Company→People graph sink.
//
// The extension (or MCP / a logged-in session) extracts a graph from ANY channel
// and POSTs it here with `{ channel, sourceUrl, companies[], people[] }`. The
// backend upserts the company + person nodes into CRM (company_v2 / contact),
// stamping channel + source on each, links people to their `companyRef`, and —
// when `analyze` is on — runs taxonomy classify (industry / occupation) per node.
// Idempotent (dedup on company domain/name + person name-in-company), so a
// re-crawl updates instead of duplicating.
//
// Auth mirrors the legacy /api/ingest: a per-rep ingest token (auto-attributes
// leads to that rep), the platform LINKEDIN_INGEST_TOKEN env token (→ a default
// tenant), or a session with data.write. Keys/credit stay server-side; classify
// goes through the metered AI path and degrades gracefully on $0 credit.
export async function POST(req: Request) {
  const token = req.headers.get("x-ingest-token");
  let ctx: TenantContext;
  let ownerUserId: string | null = null; // per-rep attribution when a rep token is used

  const rep = token ? await resolveRepByToken(token) : null;
  const ingestToken = await getSecret("LINKEDIN_INGEST_TOKEN");
  if (rep) {
    ctx = { tenantId: rep.tenantId, userId: rep.userId, role: "member" };
    ownerUserId = rep.userId;
  } else if (token && ingestToken && token === ingestToken) {
    ctx = {
      tenantId: (await getSecret("LINKEDIN_INGEST_TENANT")) || "t_default",
      userId: "extension",
      role: "member",
    };
  } else {
    const g = await requirePermission("data.write");
    if ("error" in g) return fail("Forbidden", 403, "forbidden");
    ctx = g.ctx;
  }

  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");

  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Partial<IngestGraphInput>;
    if (!body.channel || !body.channel.trim()) {
      return fail("channel wajib diisi", 400, "validation");
    }
    const result = await enrichmentService.ingestGraph(ctx, {
      channel: body.channel,
      query: body.query ?? null,
      sourceUrl: body.sourceUrl ?? null,
      workspaceId: body.workspaceId ?? null,
      ownerUserId: body.ownerUserId ?? ownerUserId,
      origin: body.origin ?? (rep || token ? "extension" : "manual"),
      posture: body.posture,
      companies: body.companies ?? [],
      people: body.people ?? [],
      analyze: body.analyze ?? false,
    });
    return ok(result, { status: 201 });
  }, "api/discovery/ingest POST");
}
