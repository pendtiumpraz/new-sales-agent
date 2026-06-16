import { NextResponse } from "next/server";
import { eq, and, or, isNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { companyTable, personTable, contactPointTable } from "@/lib/db/schema";
import { classifyLead, type ClassifyInput } from "@/lib/engagement/classify";
import { salutationFor } from "@/lib/profiling/salutation";
import { discoverContact } from "@/lib/websearch/discover";
import { stableId, contactPointDedupKey } from "@/lib/profiling/dedup";

export const runtime = "nodejs";
export const maxDuration = 60; // websearch + AI per person is slow

// POST /api/profiles/enrich (doc 46) — REAL platform-side enrichment:
//   - gender/honorific from the name (rule-based, no LinkedIn needed)
//   - web discovery (DuckDuckGo + GitHub API) → email / phone / github / website
//   - lead classification + 1-line summary
// Persists onto person + person contact points. { personId } one, { all:true } bulk.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { personId?: string; all?: boolean };
  const T = ctx.tenantId;

  try {
    const { companies, targets } = await withTenant(ctx, async (tx) => {
      const companies = await tx
        .select({ id: companyTable.id, name: companyTable.name, industry: companyTable.industry })
        .from(companyTable);
      const targets = body.personId
        ? await tx.select().from(personTable).where(eq(personTable.id, body.personId))
        : await tx
            .select()
            .from(personTable)
            // bulk: people not yet enriched (no gender or no summary). Capped — websearch is slow.
            .where(or(isNull(personTable.gender), isNull(personTable.profileSummary)))
            .limit(8);
      return { companies, targets };
    });
    const coName = new Map(companies.map((c) => [c.id, c]));

    const results: { id: string; emails: number; phones: number; github: boolean }[] = [];
    for (const p of targets) {
      const co = p.companyId ? coName.get(p.companyId) : undefined;
      const sal = salutationFor(p.fullName);
      const disc = await discoverContact(ctx, { fullName: p.fullName, company: co?.name ?? null, title: p.title });
      const input: ClassifyInput = {
        fullName: p.fullName,
        title: p.title,
        company: co?.name ?? null,
        industry: co?.industry ?? null,
        experience: (p.experience as ClassifyInput["experience"]) ?? [],
      };
      const cls = await classifyLead(ctx, input);

      const socials: Record<string, string> = { ...((p.socials as Record<string, string>) ?? {}) };
      if (disc.github) socials.github = disc.github;
      if (disc.website) socials.website = disc.website;
      if (disc.twitter) socials.twitter = disc.twitter;
      if (disc.linkedin) socials.linkedin = disc.linkedin;

      await withTenant(ctx, async (tx) => {
        await tx
          .update(personTable)
          .set({
            gender: sal.gender,
            honorific: sal.honorific,
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
          const id = stableId("cp", contactPointDedupKey({ tenantId: T, ownerType: "person", ownerId: p.id, channel: pt.channel, value: pt.value }));
          await tx
            .insert(contactPointTable)
            .values({ id, tenantId: T, ownerType: "person", ownerId: p.id, channel: pt.channel, value: pt.value, consentStatus: "unknown", source: "websearch", updatedAt: new Date() })
            .onConflictDoNothing();
        }
      });
      results.push({ id: p.id, emails: disc.emails.length, phones: disc.phones.length, github: !!disc.github });
    }

    return NextResponse.json({ ok: true, count: results.length, results, source: "db" });
  } catch (err) {
    console.error("[api/profiles/enrich POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
