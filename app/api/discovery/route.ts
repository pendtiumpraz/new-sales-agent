import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { crawlJobTable, companyTable, contactPointTable, personTable } from "@/lib/db/schema";
import { companyDedupKey, contactPointDedupKey, personDedupKey, stableId } from "@/lib/profiling/dedup";
import { crawlWebsite } from "@/lib/crawl/web";
import { hunterConfigured, hunterDomainSearch } from "@/lib/crawl/hunter";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Discovery entry-points (doc 21). The URL kind does a REAL server-side crawl of
// the target site (homepage + /contact + /about) and writes the company + its
// real contact points (emails/phones/socials). bulk creates company shells from
// names. industry/auto still need the MCP server / extension (Fase 6).
const Body = z.object({
  kind: z.enum(["bulk", "url", "industry", "auto"]),
  names: z.array(z.string().min(1)).optional(),
  url: z.string().optional(),
  industry: z.string().optional(),
  posture: z.enum(["compliant", "balanced", "aggressive"]).default("compliant"),
});

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
    let created = 0;
    let contactsCreated = 0;
    let peopleCreated = 0;
    let status = "pending";
    const input: Record<string, unknown> = { kind: b.kind };
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
      result = { created };
    } else if (b.kind === "url" && b.url) {
      input.url = b.url;
      // REAL crawl (network I/O outside the tx).
      const crawl = await crawlWebsite(b.url);
      const coName = crawl.name || crawl.domain || b.url;
      const coId = stableId(
        "co",
        companyDedupKey({ tenantId: ctx.tenantId, name: coName, domain: crawl.domain }),
      );
      const socialsMap = Object.fromEntries(
        Object.entries(crawl.socials).filter(([, v]) => Boolean(v)),
      ) as Record<string, string>;

      // Build real contact points from what the site exposed.
      const cps = [
        ...crawl.emails.map((v) => ({ channel: "email", value: v })),
        ...crawl.phones.map((v) => ({ channel: /^(\+?62|0)/.test(v) ? "whatsapp" : "phone", value: v })),
        ...(crawl.socials.linkedin ? [{ channel: "linkedin", value: crawl.socials.linkedin }] : []),
        ...(crawl.socials.instagram ? [{ channel: "instagram", value: crawl.socials.instagram }] : []),
      ];

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
            capturedMode: b.posture,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: companyTable.id,
            set: {
              name: coName,
              domain: crawl.domain,
              summary: crawl.description,
              socials: socialsMap,
              sourceUrl: crawl.url,
              updatedAt: new Date(),
            },
          });
        created = 1;

        for (const cp of cps) {
          await tx
            .insert(contactPointTable)
            .values({
              id: stableId(
                "cp",
                contactPointDedupKey({
                  tenantId: ctx.tenantId,
                  ownerType: "company",
                  ownerId: coId,
                  channel: cp.channel,
                  value: cp.value,
                }),
              ),
              tenantId: ctx.tenantId,
              ownerType: "company",
              ownerId: coId,
              channel: cp.channel,
              value: cp.value,
              source: "crawl:web",
              sourceUrl: crawl.url,
              capturedAt: new Date(),
              capturedMode: b.posture,
              consentStatus: "unknown",
              updatedAt: new Date(),
            })
            .onConflictDoNothing();
          contactsCreated++;
        }
      });

      // Real PEOPLE per company via Hunter.io (name + position + email), if
      // configured. This is the human-contact layer the website crawl can't get.
      if (hunterConfigured() && crawl.domain) {
        try {
          const h = await hunterDomainSearch(crawl.domain);
          await withTenant(ctx, async (tx) => {
            for (const p of h.people) {
              const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email;
              const personId = stableId(
                "pe",
                personDedupKey({ tenantId: ctx.tenantId, companyId: coId, fullName }),
              );
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
                  source: "hunter",
                  sourceUrl: `https://${crawl.domain}`,
                  capturedAt: new Date(),
                  capturedMode: b.posture,
                  updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                  target: personTable.id,
                  set: { title: p.position, department: p.department, updatedAt: new Date() },
                });
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
                    id: stableId(
                      "cp",
                      contactPointDedupKey({
                        tenantId: ctx.tenantId,
                        ownerType: "person",
                        ownerId: personId,
                        channel: cp.channel,
                        value: cp.value,
                      }),
                    ),
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

      status = "done";
      result = {
        created,
        contactsCreated,
        peopleCreated,
        name: coName,
        domain: crawl.domain,
        emails: crawl.emails.length,
        phones: crawl.phones.length,
        socials: Object.keys(socialsMap).length,
        pagesTried: crawl.pagesTried.length,
        hunter: hunterConfigured(),
      };
    } else {
      // industry / auto — still need the MCP server / extension (Fase 6).
      if (b.industry) input.industry = b.industry;
    }

    await withTenant(ctx, (tx) =>
      tx.insert(crawlJobTable).values({
        id: jobId,
        tenantId: ctx.tenantId,
        kind: b.kind,
        input,
        posture: b.posture,
        status,
        result,
        finishedAt: status === "done" ? new Date() : null,
      }),
    );

    await recordAudit(ctx, "discovery.start", b.kind, { posture: b.posture, created, contactsCreated, peopleCreated });
    return NextResponse.json({ ok: true, jobId, status, created, contactsCreated, peopleCreated, result });
  } catch (err) {
    console.error("[api/discovery POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
