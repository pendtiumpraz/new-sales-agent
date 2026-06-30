import { NextResponse } from "next/server";
import { eq, and, or, isNull, sql } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { companyTable, personTable, contactPointTable } from "@/lib/db/schema";
import { classifyLead, type ClassifyInput } from "@/lib/engagement/classify";
import { salutationFor } from "@/lib/profiling/salutation";
import { discoverContact, discoverCompany } from "@/lib/websearch/discover";
import { stableId, companyDedupKey, contactPointDedupKey } from "@/lib/profiling/dedup";

export const runtime = "nodejs";
export const maxDuration = 60; // websearch (person + company page fetches) + AI is slow

// POST /api/profiles/enrich (doc 46) — REAL platform-side enrichment:
//   person: gender/honorific (name) + web discovery (Startpage/Mojeek read page-1
//           results + GitHub) → email/phone/github/website/socials/company +
//           classify + summary.
//   company (PT): the discovered/linked company is enriched too — official site,
//           domain, email/phone, ADDRESS, social media, industry, summary.
// { personId } one, { all:true } bulk (capped — deep websearch is slow).
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { personId?: string; all?: boolean; companyId?: string; allCompanies?: boolean };
  const T = ctx.tenantId;

  const cpId = (ownerType: "person" | "company", ownerId: string, channel: string, value: string) =>
    stableId("cp", contactPointDedupKey({ tenantId: T, ownerType, ownerId, channel, value }));

  try {
    // ── Direct company enrichment (doc 46): find domain + address/email/phone/socials ──
    if (body.companyId || body.allCompanies) {
      const cos = await withTenant(ctx, (tx) =>
        body.companyId
          ? tx.select().from(companyTable).where(and(eq(companyTable.id, body.companyId), eq(companyTable.tenantId, T)))
          : tx.select().from(companyTable).where(or(isNull(companyTable.domain), isNull(companyTable.summary))).limit(3),
      );
      const out: { id: string; domain: string | null; emails: number; phones: number; address: boolean }[] = [];
      for (const co of cos) {
        const dc = await discoverCompany(ctx, { name: co.name, website: co.domain ? `https://${co.domain}` : null });
        await withTenant(ctx, async (tx) => {
          await tx
            .update(companyTable)
            .set({
              domain: co.domain ?? dc.domain ?? null,
              industry: dc.industry ?? co.industry ?? null,
              summary: dc.summary ?? co.summary ?? null,
              sourceUrl: co.sourceUrl ?? dc.website ?? null,
              updatedAt: new Date(),
            })
            .where(and(eq(companyTable.id, co.id), eq(companyTable.tenantId, T)));
          const cps: { channel: string; value: string }[] = [];
          for (const e of dc.emails) cps.push({ channel: "email", value: e });
          for (const ph of dc.phones) cps.push({ channel: "phone", value: ph });
          if (dc.website) cps.push({ channel: "website", value: dc.website });
          if (dc.address) cps.push({ channel: "address", value: dc.address });
          for (const [k, v] of Object.entries(dc.socials)) cps.push({ channel: k, value: v });
          for (const pt of cps) {
            await tx
              .insert(contactPointTable)
              .values({ id: cpId("company", co.id, pt.channel, pt.value), tenantId: T, ownerType: "company", ownerId: co.id, channel: pt.channel, value: pt.value, consentStatus: "unknown", source: "websearch", updatedAt: new Date() })
              .onConflictDoNothing();
          }
        });
        out.push({ id: co.id, domain: co.domain ?? dc.domain ?? null, emails: dc.emails.length, phones: dc.phones.length, address: !!dc.address });
      }
      return NextResponse.json({ ok: true, count: out.length, results: out, source: "db" });
    }

    const { companies, targets } = await withTenant(ctx, async (tx) => {
      const companies = await tx
        .select({ id: companyTable.id, name: companyTable.name, industry: companyTable.industry })
        .from(companyTable);
      const targets = body.personId
        ? await tx.select().from(personTable).where(eq(personTable.id, body.personId))
        : await tx
            .select()
            .from(personTable)
            .where(or(isNull(personTable.gender), isNull(personTable.profileSummary)))
            .limit(3);
      return { companies, targets };
    });
    const coById = new Map(companies.map((c) => [c.id, c]));

    const results: { id: string; emails: number; phones: number; github: boolean; company: string | null }[] = [];
    for (const p of targets) {
      const existingCo = p.companyId ? coById.get(p.companyId) : undefined;
      const sal = salutationFor(p.fullName);
      const disc = await discoverContact(ctx, { fullName: p.fullName, company: existingCo?.name ?? null, title: p.title });
      const input: ClassifyInput = {
        fullName: p.fullName,
        title: p.title,
        company: existingCo?.name ?? disc.company ?? null,
        industry: existingCo?.industry ?? null,
        experience: (p.experience as ClassifyInput["experience"]) ?? [],
      };
      const cls = await classifyLead(ctx, input);

      // ── Enrich the company (PT) the person belongs to ──────────────────────
      const companyName = existingCo?.name ?? disc.company ?? null;
      let companyId = p.companyId ?? null;
      if (companyName) {
        const dc = await discoverCompany(ctx, { name: companyName, website: disc.website ?? null });
        if (!companyId) companyId = stableId("co", companyDedupKey({ tenantId: T, name: companyName, domain: dc.domain ?? null }));
        await withTenant(ctx, async (tx) => {
          await tx
            .insert(companyTable)
            .values({
              id: companyId as string,
              tenantId: T,
              name: companyName,
              domain: dc.domain ?? null,
              industry: dc.industry ?? null,
              summary: dc.summary ?? null,
              source: "websearch",
              sourceUrl: dc.website ?? null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: companyTable.id,
              set: {
                domain: sql`coalesce(${companyTable.domain}, ${dc.domain ?? null})`,
                industry: dc.industry ?? sql`${companyTable.industry}`,
                summary: dc.summary ?? sql`${companyTable.summary}`,
                sourceUrl: sql`coalesce(${companyTable.sourceUrl}, ${dc.website ?? null})`,
                updatedAt: new Date(),
              },
            });
          // Company contact points: email / phone / website / ADDRESS / socials.
          const cps: { channel: string; value: string }[] = [];
          for (const e of dc.emails) cps.push({ channel: "email", value: e });
          for (const ph of dc.phones) cps.push({ channel: "phone", value: ph });
          if (dc.website) cps.push({ channel: "website", value: dc.website });
          if (dc.address) cps.push({ channel: "address", value: dc.address });
          for (const [k, v] of Object.entries(dc.socials)) cps.push({ channel: k, value: v });
          for (const pt of cps) {
            await tx
              .insert(contactPointTable)
              .values({ id: cpId("company", companyId as string, pt.channel, pt.value), tenantId: T, ownerType: "company", ownerId: companyId as string, channel: pt.channel, value: pt.value, consentStatus: "unknown", source: "websearch", updatedAt: new Date() })
              .onConflictDoNothing();
          }
        });
      }

      // ── Persist the person ─────────────────────────────────────────────────
      // Rebuild socials from THIS enrich so stale/wrong links from a prior run drop
      // out; keep the old set only if the web found nothing this time.
      const webSocials: Record<string, string> = { ...disc.socials };
      if (disc.github) webSocials.github = disc.github;
      if (disc.website) webSocials.website = disc.website;
      if (disc.twitter) webSocials.twitter = disc.twitter;
      if (disc.linkedin) webSocials.linkedin = disc.linkedin;
      const socials = Object.keys(webSocials).length ? webSocials : ((p.socials as Record<string, string>) ?? {});

      await withTenant(ctx, async (tx) => {
        await tx
          .update(personTable)
          .set({
            gender: sal.gender,
            honorific: sal.honorific,
            ...(disc.title && !p.title ? { title: disc.title } : {}),
            ...(companyId ? { companyId } : {}),
            leadType: cls.leadType,
            leadReason: cls.reason,
            leadScore: cls.score,
            profileSummary: disc.summary ?? p.profileSummary ?? null,
            socials,
            linkedinUrl: p.linkedinUrl ?? disc.linkedin ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(personTable.id, p.id), eq(personTable.tenantId, T)));

        const points: { channel: string; value: string }[] = [];
        for (const e of disc.emails) points.push({ channel: "email", value: e });
        for (const ph of disc.phones) points.push({ channel: "phone", value: ph });
        if (disc.website) points.push({ channel: "website", value: disc.website });
        if (disc.github) points.push({ channel: "github", value: disc.github });
        if (disc.twitter) points.push({ channel: "twitter", value: disc.twitter });
        for (const pt of points) {
          await tx
            .insert(contactPointTable)
            .values({ id: cpId("person", p.id, pt.channel, pt.value), tenantId: T, ownerType: "person", ownerId: p.id, channel: pt.channel, value: pt.value, consentStatus: "unknown", source: "websearch", updatedAt: new Date() })
            .onConflictDoNothing();
        }
      });

      results.push({ id: p.id, emails: disc.emails.length, phones: disc.phones.length, github: !!disc.github, company: companyName });
    }

    return NextResponse.json({ ok: true, count: results.length, results, source: "db" });
  } catch (err) {
    console.error("[api/profiles/enrich POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
