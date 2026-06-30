import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { crawlJobTable, companyTable, contactPointTable, personTable, productTable } from "@/lib/db/schema";
import { companyDedupKey, contactPointDedupKey, personDedupKey, stableId } from "@/lib/profiling/dedup";
import { crawlWebsite } from "@/lib/crawl/web";
import { hunterConfigured, hunterDomainSearch } from "@/lib/crawl/hunter";
import { planDiscovery } from "@/lib/discovery/plan";
import { recordAudit } from "@/lib/compliance/audit";
import { classifyLead } from "@/lib/engagement/classify";
import { salutationFor } from "@/lib/profiling/salutation";
import { generatePositioning, storePositioning } from "@/lib/positioning/engine";
import type { Company, Product } from "@/lib/types/profiling";

export const runtime = "nodejs";
export const maxDuration = 60;

// Discovery entry-points (doc 21/40). Everything runs SYNCHRONOUSLY in this
// request — there is NO background cron/worker. url crawls one site; bulk makes
// company shells; industry/auto use the AI planner to pick candidate companies
// then crawl the top few. So a job is "done" by the time the POST returns
// (pending only ever appears transiently / on error).
const Body = z.object({
  kind: z.enum(["bulk", "url", "industry", "auto"]),
  workspaceId: z.string().optional(),
  names: z.array(z.string().min(1)).optional(),
  url: z.string().optional(),
  industry: z.string().optional(),
  posture: z.enum(["compliant", "balanced", "aggressive"]).default("compliant"),
  // Opt-in: also generate + persist the AI analysis (lead classify + positioning).
  analyze: z.boolean().optional(),
});

interface CrawlOutcome {
  name: string;
  domain: string | null;
  contactsCreated: number;
  peopleCreated: number;
  emails: number;
  phones: number;
  socials: number;
  pagesTried: number;
  analyzedPeople: number;
  positioned: boolean;
}

// Crawl one website + persist the company, its contact points, and (if Hunter is
// configured) its people. Returns a summary. Shared by the url + industry/auto paths.
async function crawlAndPersist(ctx: TenantContext, url: string, posture: string, workspaceId: string | null = null, analyze = false): Promise<CrawlOutcome> {
  const crawl = await crawlWebsite(url);
  const coName = crawl.name || crawl.domain || url;
  const coId = stableId("co", companyDedupKey({ tenantId: ctx.tenantId, name: coName, domain: crawl.domain }));
  const socialsMap = Object.fromEntries(Object.entries(crawl.socials).filter(([, v]) => Boolean(v))) as Record<string, string>;

  const cps = [
    ...crawl.emails.map((v) => ({ channel: "email", value: v })),
    ...crawl.phones.map((v) => ({ channel: /^(\+?62|0)/.test(v) ? "whatsapp" : "phone", value: v })),
    ...(crawl.socials.linkedin ? [{ channel: "linkedin", value: crawl.socials.linkedin }] : []),
    ...(crawl.socials.instagram ? [{ channel: "instagram", value: crawl.socials.instagram }] : []),
  ];

  let contactsCreated = 0;
  await withTenant(ctx, async (tx) => {
    await tx
      .insert(companyTable)
      .values({
        id: coId,
        tenantId: ctx.tenantId,
        name: coName,
        domain: crawl.domain,
        summary: crawl.description,
        socials: socialsMap,
        source: "crawl:web",
        sourceUrl: crawl.url,
        capturedAt: new Date(),
        capturedMode: posture,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companyTable.id,
        set: { name: coName, domain: crawl.domain, summary: crawl.description, socials: socialsMap, sourceUrl: crawl.url, updatedAt: new Date() },
      });

    for (const cp of cps) {
      await tx
        .insert(contactPointTable)
        .values({
          id: stableId("cp", contactPointDedupKey({ tenantId: ctx.tenantId, ownerType: "company", ownerId: coId, channel: cp.channel, value: cp.value })),
          tenantId: ctx.tenantId,
          ownerType: "company",
          ownerId: coId,
          channel: cp.channel,
          value: cp.value,
          source: "crawl:web",
          sourceUrl: crawl.url,
          capturedAt: new Date(),
          capturedMode: posture,
          consentStatus: "unknown",
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      contactsCreated++;
    }
  });

  // Real PEOPLE per company via Hunter.io, if configured.
  let peopleCreated = 0;
  const createdPeople: { id: string; fullName: string; title: string | null }[] = [];
  if (hunterConfigured() && crawl.domain) {
    try {
      const h = await hunterDomainSearch(crawl.domain);
      await withTenant(ctx, async (tx) => {
        for (const p of h.people) {
          const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email;
          const personId = stableId("pe", personDedupKey({ tenantId: ctx.tenantId, companyId: coId, fullName }));
          createdPeople.push({ id: personId, fullName, title: p.position ?? null });
          await tx
            .insert(personTable)
            .values({
              id: personId,
              tenantId: ctx.tenantId,
              companyId: coId,
              fullName,
              title: p.position,
              department: p.department,
              seniority: p.seniority,
              socials: p.linkedin ? { linkedin: p.linkedin } : {},
              workspaceId: workspaceId ?? null,
              source: "hunter",
              sourceUrl: `https://${crawl.domain}`,
              capturedAt: new Date(),
              capturedMode: posture,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({ target: personTable.id, set: { title: p.position, department: p.department, updatedAt: new Date() } });
          peopleCreated++;

          const pcps = [
            { channel: "email", value: p.email },
            ...(p.phone ? [{ channel: "whatsapp", value: p.phone }] : []),
            ...(p.linkedin ? [{ channel: "linkedin", value: p.linkedin }] : []),
          ];
          for (const cp of pcps) {
            await tx
              .insert(contactPointTable)
              .values({
                id: stableId("cp", contactPointDedupKey({ tenantId: ctx.tenantId, ownerType: "person", ownerId: personId, channel: cp.channel, value: cp.value })),
                tenantId: ctx.tenantId,
                ownerType: "person",
                ownerId: personId,
                channel: cp.channel,
                value: cp.value,
                source: "hunter",
                sourceUrl: `https://${crawl.domain}`,
                capturedAt: new Date(),
                consentStatus: "unknown",
                updatedAt: new Date(),
              })
              .onConflictDoNothing();
            contactsCreated++;
          }
        }
      });
    } catch (e) {
      console.error("[discovery hunter]", e);
    }
  }

  // Opt-in AI ANALYSIS, persisted to DB (doc 21/22/40): classify the Hunter people
  // (→ personTable.leadType/leadScore/leadReason + salutation) and generate the
  // company positioning (→ positioningInsightTable). Capped to stay within
  // maxDuration; runs only when the caller asked for it (metered AI).
  let analyzedPeople = 0;
  let positioned = false;
  if (analyze) {
    const ANALYZE_CAP = 12;
    if (createdPeople.length > ANALYZE_CAP) {
      console.warn(`[discovery analyze] ${createdPeople.length} orang ditemukan — classify ${ANALYZE_CAP} pertama (sisanya bisa di-analisis manual).`);
    }
    for (const person of createdPeople.slice(0, ANALYZE_CAP)) {
      try {
        const cls = await classifyLead(ctx, { fullName: person.fullName, title: person.title, company: coName });
        const sal = salutationFor(person.fullName);
        await withTenant(ctx, (tx) =>
          tx
            .update(personTable)
            .set({ leadType: cls.leadType, leadReason: cls.reason, leadScore: cls.score, gender: sal.gender, honorific: sal.honorific, updatedAt: new Date() })
            .where(and(eq(personTable.id, person.id), eq(personTable.tenantId, ctx.tenantId))),
        );
        analyzedPeople++;
      } catch (e) {
        console.error("[discovery analyze person]", person.id, e);
      }
    }
    // Company positioning vs the tenant's product (first product as default).
    try {
      const { company, product } = await withTenant(ctx, async (tx) => {
        const co = await tx.select().from(companyTable).where(eq(companyTable.id, coId)).limit(1);
        const prod = await tx.select().from(productTable).limit(1);
        return { company: co[0] ?? null, product: prod[0] ?? null };
      });
      if (company && product) {
        const gen = await generatePositioning(ctx, company as unknown as Company, product as unknown as Product);
        await storePositioning(ctx, company.id, product.id, gen);
        positioned = true;
      }
    } catch (e) {
      console.error("[discovery analyze positioning]", e);
    }
  }

  return {
    name: coName,
    domain: crawl.domain,
    contactsCreated,
    peopleCreated,
    emails: crawl.emails.length,
    phones: crawl.phones.length,
    socials: Object.keys(socialsMap).length,
    pagesTried: crawl.pagesTried.length,
    analyzedPeople,
    positioned,
  };
}

export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await withTenant(guard.ctx, (tx) =>
      tx.select().from(crawlJobTable).orderBy(desc(crawlJobTable.createdAt)).limit(30),
    );
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/discovery GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const b = parsed.data;
  const jobId = "crawl_" + crypto.randomUUID();

  try {
    // Record the job as "running" BEFORE the slow synchronous crawl (#2) so a
    // serverless timeout / crash still leaves a history row instead of nothing.
    await withTenant(ctx, (tx) =>
      tx.insert(crawlJobTable).values({ id: jobId, tenantId: ctx.tenantId, kind: b.kind, input: { kind: b.kind }, posture: b.posture, status: "running" }),
    );
    let created = 0;
    let contactsCreated = 0;
    let peopleCreated = 0;
    let status = "pending";
    const error: string | null = null;
    const input: Record<string, unknown> = { kind: b.kind, analyze: !!b.analyze };
    let result: Record<string, unknown> | null = null;

    if (b.kind === "bulk") {
      const names = (b.names ?? []).map((n) => n.trim()).filter(Boolean);
      input.names = names;
      await withTenant(ctx, async (tx) => {
        for (const name of names) {
          await tx
            .insert(companyTable)
            .values({
              id: stableId("co", companyDedupKey({ tenantId: ctx.tenantId, name, domain: null })),
              tenantId: ctx.tenantId,
              name,
              source: "discovery:bulk",
              capturedMode: b.posture,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({ target: companyTable.id, set: { name, updatedAt: new Date() } });
          created++;
        }
      });
      status = "done";
      result = { created, note: `${created} perusahaan dibuat sebagai shell — crawl URL-nya untuk dapat kontak.` };
    } else if (b.kind === "url" && b.url) {
      input.url = b.url;
      const r = await crawlAndPersist(ctx, b.url, b.posture, b.workspaceId ?? null, b.analyze ?? false);
      created = 1;
      contactsCreated = r.contactsCreated;
      peopleCreated = r.peopleCreated;
      status = "done";
      result = { created, contactsCreated, peopleCreated, name: r.name, domain: r.domain, emails: r.emails, phones: r.phones, socials: r.socials, pagesTried: r.pagesTried, hunter: hunterConfigured(), analyzedPeople: r.analyzedPeople, positioned: r.positioned };
    } else {
      // industry / auto — AI planner picks candidate companies, then we crawl the
      // top few SYNCHRONOUSLY (no cron). auto derives the field from the tenant's
      // product if no industry was given.
      let field = b.industry?.trim() || "";
      if (b.kind === "auto" && !field) {
        const products = await withTenant(ctx, (tx) =>
          tx.select({ name: productTable.name, category: productTable.category }).from(productTable).limit(1),
        );
        field = products[0]?.category || products[0]?.name || "";
      }
      input.industry = field;

      if (!field) {
        status = "done";
        result = { note: "Belum ada produk/target. Set produk di Pengaturan, atau isi tab Bidang / AI Orang." };
      } else {
        const plan = await planDiscovery(ctx, { field, location: "Indonesia" });
        const domains = plan.companies.map((c) => c.domainGuess).filter((d): d is string => Boolean(d)).slice(0, 3);
        const crawled: { name: string; domain: string | null; contacts: number }[] = [];
        let analyzedPeople = 0;
        for (const d of domains) {
          try {
            const r = await crawlAndPersist(ctx, d.startsWith("http") ? d : `https://${d}`, b.posture, b.workspaceId ?? null, b.analyze ?? false);
            created++;
            contactsCreated += r.contactsCreated;
            peopleCreated += r.peopleCreated;
            analyzedPeople += r.analyzedPeople;
            crawled.push({ name: r.name, domain: r.domain, contacts: r.contactsCreated });
          } catch (e) {
            console.error("[discovery plan-crawl]", d, e);
          }
        }
        status = "done";
        result = {
          field,
          created,
          contactsCreated,
          peopleCreated,
          analyzedPeople,
          plannedCompanies: plan.companies.length,
          crawled,
          linkedinQueries: plan.linkedinQueries,
          roles: plan.roles,
          note:
            domains.length === 0
              ? "AI tak menebak domain yang bisa di-crawl — pakai query LinkedIn (extension) di hasil ini."
              : `${created} perusahaan di-crawl dari ${plan.companies.length} kandidat. Lanjut query LinkedIn di extension untuk orangnya.`,
        };
      }
    }

    await withTenant(ctx, (tx) =>
      tx
        .update(crawlJobTable)
        .set({ input, status, result, error, finishedAt: status === "done" ? new Date() : null })
        .where(eq(crawlJobTable.id, jobId)),
    );

    await recordAudit(ctx, "discovery.start", b.kind, { posture: b.posture, created, contactsCreated, peopleCreated });
    return NextResponse.json({ ok: true, jobId, status, created, contactsCreated, peopleCreated, result });
  } catch (err) {
    console.error("[api/discovery POST]", err);
    // Mark the job failed so the history shows it (not stuck on "running").
    await withTenant(ctx, (tx) =>
      tx.update(crawlJobTable).set({ status: "error", error: String(err), finishedAt: new Date() }).where(eq(crawlJobTable.id, jobId)),
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: "Internal error", jobId }, { status: 500 });
  }
}
