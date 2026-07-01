import { NextResponse } from "next/server";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { productTable } from "@/lib/db/schema";
import { crawlWebsite } from "@/lib/crawl/web";
import { hunterConfigured, hunterDomainSearch } from "@/lib/crawl/hunter";
import { planDiscovery } from "@/lib/discovery/plan";
import { enrichmentService } from "@/modules/enrichment/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Discovery URL-scrape entry-point (rebuild data-integrity fix).
//
// PREVIEW-ONLY: this endpoint CRAWLS a public site (+ Hunter people, if
// configured) and RETURNS the extracted Company→People graph. It does NOT write
// to any table. Persistence happens on the frontend's "Simpan ke workspace" step
// → POST /api/discovery/ingest (enrichmentService.ingestGraph), which upserts the
// REBUILD `company_v2` / `contact` tables and records a `discovery_job` (so the
// run shows in the enrichment "Riwayat"). This keeps the preview→select→save gate
// intact AND kills the previous legacy-table writes (company / person /
// contact_point / crawl_job / positioning_insight) that orphaned crawled data
// away from Kontak / Profiles / Master-Data / Riwayat.
//
// Everything runs SYNCHRONOUSLY in this request (no background worker): the crawl
// is done by the time the POST returns.
const Body = z.object({
  kind: z.enum(["bulk", "url", "industry", "auto"]),
  workspaceId: z.string().optional(),
  names: z.array(z.string().min(1)).optional(),
  url: z.string().optional(),
  industry: z.string().optional(),
  posture: z.enum(["compliant", "balanced", "aggressive"]).default("compliant"),
  analyze: z.boolean().optional(), // accepted for back-compat; classify runs on enrich, not here
});

// A person node extracted from a crawl (Hunter). Shape mirrors the ingest
// IngestPersonInput so the frontend can forward it straight to /api/discovery/ingest.
interface PreviewPerson {
  fullName: string;
  title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  channelProfileUrl: string | null;
}

// A company node extracted from a crawl. `phone`/`email` are the FIRST captured
// handles (company_v2 has no contact_point table — it holds one representative
// phone/email in its socials bag on ingest); `emails`/`phones` carry the full
// captured lists so the preview can report honest counts.
interface PreviewCompany {
  name: string;
  domain: string | null;
  industry: string | null;
  summary: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  socials: Record<string, string>;
  emails: string[];
  phones: string[];
  people: PreviewPerson[];
}

const isIdPhone = (v: string): boolean => /^(?:\+?62|0)/.test(v.replace(/[^\d+]/g, ""));

// Crawl one website (homepage + contact/about paths) + Hunter people → a preview
// Company→People node. NO persistence — the caller saves via /api/discovery/ingest.
async function crawlPreview(url: string): Promise<PreviewCompany> {
  const crawl = await crawlWebsite(url);
  const name = crawl.name || crawl.domain || url;
  const socials = Object.fromEntries(
    Object.entries(crawl.socials).filter(([, v]) => Boolean(v)),
  ) as Record<string, string>;

  const people: PreviewPerson[] = [];
  if (hunterConfigured() && crawl.domain) {
    try {
      const h = await hunterDomainSearch(crawl.domain);
      for (const p of h.people) {
        const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email;
        const wa = p.phone && isIdPhone(p.phone);
        people.push({
          fullName,
          title: p.position ?? null,
          phone: p.phone && !wa ? p.phone : null,
          whatsapp: p.phone && wa ? p.phone : null,
          email: p.email ?? null,
          channelProfileUrl: p.linkedin ?? null,
        });
      }
    } catch (e) {
      console.error("[discovery hunter preview]", e);
    }
  }

  return {
    name,
    domain: crawl.domain,
    industry: null,
    summary: crawl.description,
    phone: crawl.phones[0] ?? null,
    email: crawl.emails[0] ?? null,
    address: null,
    socials,
    emails: crawl.emails,
    phones: crawl.phones,
    people,
  };
}

const companyShell = (name: string): PreviewCompany => ({
  name,
  domain: null,
  industry: null,
  summary: null,
  phone: null,
  email: null,
  address: null,
  socials: {},
  emails: [],
  phones: [],
  people: [],
});

// GET /api/discovery — discovery run history. Reads the REBUILD `discovery_job`
// table (via enrichmentService) so it stays consistent with GET /api/discovery/jobs
// and the "Riwayat". (Legacy `crawl_job` reads removed — that table is orphaned.)
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await enrichmentService.listJobs(guard.ctx);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/discovery GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const { ctx }: { ctx: TenantContext } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const b = parsed.data;

  try {
    if (b.kind === "url" && b.url) {
      const company = await crawlPreview(b.url.startsWith("http") ? b.url : `https://${b.url}`);
      // `result` keeps a small back-compat summary; `company` carries the graph the
      // frontend renders + forwards to /api/discovery/ingest on save.
      return NextResponse.json({
        ok: true,
        kind: "url",
        company,
        result: {
          name: company.name,
          domain: company.domain,
          emails: company.emails.length,
          phones: company.phones.length,
          people: company.people.length,
        },
      });
    }

    if (b.kind === "bulk") {
      const names = (b.names ?? []).map((n) => n.trim()).filter(Boolean);
      return NextResponse.json({ ok: true, kind: "bulk", companies: names.map(companyShell) });
    }

    // industry / auto — AI planner picks candidate companies, then we crawl the top
    // few SYNCHRONOUSLY into previews (no persistence). auto derives the field from
    // the tenant's product when none is given.
    let field = b.industry?.trim() || "";
    if (b.kind === "auto" && !field) {
      const products = await withTenant(ctx, (tx) =>
        tx.select({ name: productTable.name, category: productTable.category }).from(productTable).limit(1),
      );
      field = products[0]?.category || products[0]?.name || "";
    }
    if (!field) {
      return NextResponse.json({
        ok: true,
        kind: b.kind,
        companies: [],
        note: "Belum ada produk/target. Set produk di Pengaturan, atau isi tab Bidang / AI Orang.",
      });
    }

    const plan = await planDiscovery(ctx, { field, location: "Indonesia" });
    const domains = plan.companies
      .map((c) => c.domainGuess)
      .filter((d): d is string => Boolean(d))
      .slice(0, 3);
    const companies: PreviewCompany[] = [];
    for (const d of domains) {
      try {
        companies.push(await crawlPreview(d.startsWith("http") ? d : `https://${d}`));
      } catch (e) {
        console.error("[discovery plan-crawl preview]", d, e);
      }
    }
    return NextResponse.json({
      ok: true,
      kind: b.kind,
      field,
      companies,
      plannedCompanies: plan.companies.length,
      linkedinQueries: plan.linkedinQueries,
      roles: plan.roles,
    });
  } catch (err) {
    console.error("[api/discovery POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
