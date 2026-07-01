import { NextResponse } from "next/server";
import { sql, eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { companyTable, personTable, contactPointTable, ingestBatchTable } from "@/lib/db/schema";
import {
  stableId,
  companyDedupKey,
  personDedupKey,
  contactPointDedupKey,
} from "@/lib/profiling/dedup";
import { resolveRepByToken } from "@/lib/team/rep-account";
import { classifyLead } from "@/lib/engagement/classify";
import { salutationFor } from "@/lib/profiling/salutation";

export const runtime = "nodejs";

// Ingest sink for crawled / extension-synced data (doc 21). Idempotent: ids are
// derived from per-tenant dedup keys, so re-ingest upserts instead of duplicating.
const Body = z.object({
  origin: z.enum(["mcp", "extension", "manual"]).default("manual"),
  // Workspace scope (doc 44): when the crawl is run for a specific workspace, every
  // person/company in this batch is tagged to it. Null → goes to the tenant pool.
  workspaceId: z.string().optional(),
  companies: z
    .array(
      z.object({
        name: z.string().min(1),
        domain: z.string().optional(),
        industry: z.string().optional(),
        size: z.string().optional(),
        summary: z.string().optional(),
        source: z.string().optional(),
        sourceUrl: z.string().optional(),
        capturedMode: z.string().optional(),
      }),
    )
    .optional(),
  people: z
    .array(
      z.object({
        fullName: z.string().min(1),
        companyName: z.string().optional(),
        companyDomain: z.string().optional(),
        title: z.string().optional(),
        department: z.string().optional(),
        seniority: z.string().optional(),
        location: z.string().optional(),
        // Extension/LinkedIn enrichment (doc 40)
        linkedinUrl: z.string().optional(),
        // Generic profile/source URL for non-LinkedIn platforms (IG, TikTok, etc.)
        // so every crawled person carries a contactable link, not just a name.
        sourceUrl: z.string().optional(),
        about: z.string().optional(),
        experience: z
          .array(z.object({ title: z.string().optional(), company: z.string().optional(), period: z.string().optional() }))
          .optional(),
        source: z.string().optional(),
        // In-extension DeepSeek analysis (doc 40/44): the extension runs the AI on the
        // profile DOM (the platform server can't log into LinkedIn) and sends the
        // finished classification here. Server-side classify is only a fallback.
        leadType: z.string().optional(),
        leadScore: z.number().optional(),
        leadReason: z.string().optional(),
        profileSummary: z.string().optional(),
        profileConfidence: z.number().optional(),
        socials: z.record(z.string()).optional(), // {instagram,tokopedia,shopee,tiktok,website,...} → URLs
        status: z.string().optional(), // "pending" (Stage 1 raw) | "enriched" (Stage 2 analyzed)
        enriched: z.boolean().optional(),
      }),
    )
    .optional(),
  contactPoints: z
    .array(
      z.object({
        ownerType: z.enum(["company", "person"]),
        companyName: z.string().optional(),
        companyDomain: z.string().optional(),
        personName: z.string().optional(),
        channel: z.string().min(1),
        value: z.string().min(1),
        consentStatus: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  // Auth: an ingest token (Chrome extension / MCP — no session) OR a logged-in
  // session with data.write. The token maps to a configured tenant (doc 21).
  const token = req.headers.get("x-ingest-token");
  let ctx: TenantContext;
  // assignTo: when a PER-REP token is used, crawled leads auto-assign to that rep
  // (doc 41 §4). Tenant-level token / session ingest leaves them unassigned.
  let assignTo: string | null = null;
  const rep = token ? await resolveRepByToken(token) : null;
  const ingestToken = await getSecret("LINKEDIN_INGEST_TOKEN");
  if (rep) {
    ctx = { tenantId: rep.tenantId, userId: rep.userId, role: "member" };
    assignTo = rep.userId;
  } else if (token && ingestToken && token === ingestToken) {
    ctx = {
      tenantId: (await getSecret("LINKEDIN_INGEST_TENANT")) || "t_default",
      userId: "extension",
      role: "member",
    };
  } else {
    const guard = await requirePermission("data.write");
    if ("error" in guard) return guard.error;
    ctx = guard.ctx;
  }
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  const T = ctx.tenantId;
  const wsId = b.workspaceId ?? null; // doc 44 — workspace tag for this whole batch
  const coId = (name: string, domain?: string) => stableId("co", companyDedupKey({ tenantId: T, name, domain: domain ?? null }));

  // FALLBACK classify only: people with a track record but NO extension-provided
  // classification. The extension (which can actually read LinkedIn) is the primary
  // analyzer; the server can't log in, so it only fills gaps (doc 40).
  const needsServerClassify: { id: string; fullName: string; title?: string | null; companyName?: string | null; experience?: { title?: string; company?: string; period?: string }[] }[] = [];

  try {
    let count = 0;
    await withTenant(ctx, async (tx) => {
      for (const c of b.companies ?? []) {
        await tx
          .insert(companyTable)
          .values({
            id: coId(c.name, c.domain),
            tenantId: T,
            name: c.name,
            domain: c.domain ?? null,
            industry: c.industry ?? null,
            size: c.size ?? null,
            summary: c.summary ?? null,
            source: c.source ?? b.origin,
            sourceUrl: c.sourceUrl ?? null,
            capturedMode: c.capturedMode ?? null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: companyTable.id,
            set: { name: c.name, industry: c.industry ?? null, summary: c.summary ?? null, updatedAt: new Date() },
          });
        count++;
      }

      for (const p of b.people ?? []) {
        const companyId = p.companyName || p.companyDomain ? coId(p.companyName ?? "", p.companyDomain) : null;
        const id = stableId("pe", personDedupKey({ tenantId: T, companyId, fullName: p.fullName }));
        const hasExp = !!(p.experience && p.experience.length);
        const isEnriched = p.enriched === true || p.status === "enriched" || hasExp;
        const status = p.status ?? (isEnriched ? "enriched" : "pending");
        // extension already classified → don't queue server fallback (saves AI + the
        // server can't see LinkedIn anyway). Queue only enriched-but-unclassified.
        if (hasExp && !p.leadType) {
          needsServerClassify.push({ id, fullName: p.fullName, title: p.title, companyName: p.companyName, experience: p.experience });
        }
        // Only set AI fields the extension actually sent (don't null out a prior analysis).
        const aiSet = {
          ...(p.leadType ? { leadType: p.leadType } : {}),
          ...(typeof p.leadScore === "number" ? { leadScore: p.leadScore } : {}),
          ...(p.leadReason ? { leadReason: p.leadReason } : {}),
          ...(p.profileSummary ? { profileSummary: p.profileSummary } : {}),
          ...(typeof p.profileConfidence === "number" ? { profileConfidence: p.profileConfidence } : {}),
          ...(p.socials ? { socials: p.socials } : {}),
        };
        await tx
          .insert(personTable)
          .values({
            id,
            tenantId: T,
            companyId,
            fullName: p.fullName,
            title: p.title ?? null,
            department: p.department ?? null,
            seniority: p.seniority ?? null,
            location: p.location ?? null,
            linkedinUrl: p.linkedinUrl ?? null,
            about: p.about ?? null,
            experience: p.experience ?? [],
            status,
            ...(wsId ? { workspaceId: wsId } : {}), // doc 44 — workspace tag
            ...aiSet,
            ...(assignTo ? { assignedTo: assignTo } : {}), // per-rep attribution (doc 41)
            source: p.source ?? b.origin,
            sourceUrl: p.linkedinUrl ?? p.sourceUrl ?? null, // contactable link for any platform
            capturedAt: new Date(), // crawl date (doc 40) — drives the >1yr stale warning
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: personTable.id,
            set: {
              // Enriched payload (Stage 2) overwrites with better data; a pending
              // re-crawl (Stage 1) only fills nulls so it never clobbers enrichment.
              title: isEnriched ? p.title ?? null : sql`coalesce(${personTable.title}, ${p.title ?? null})`,
              department: isEnriched ? p.department ?? null : sql`coalesce(${personTable.department}, ${p.department ?? null})`,
              location: isEnriched ? p.location ?? null : sql`coalesce(${personTable.location}, ${p.location ?? null})`,
              linkedinUrl: sql`coalesce(${personTable.linkedinUrl}, ${p.linkedinUrl ?? null})`,
              sourceUrl: sql`coalesce(${personTable.sourceUrl}, ${p.linkedinUrl ?? p.sourceUrl ?? null})`,
              about: isEnriched ? p.about ?? null : sql`coalesce(${personTable.about}, ${p.about ?? null})`,
              // never downgrade an enriched row back to pending
              ...(isEnriched ? { status: "enriched" } : {}),
              // only overwrite experience when the new payload actually has it
              ...(hasExp ? { experience: p.experience } : {}),
              ...(wsId ? { workspaceId: wsId } : {}),
              ...aiSet,
              // claim ownership only if the lead is still unassigned (don't steal)
              ...(assignTo ? { assignedTo: sql`coalesce(${personTable.assignedTo}, ${assignTo})` } : {}),
              capturedAt: new Date(), // refresh crawl date on re-crawl
              updatedAt: new Date(),
            },
          });
        count++;
      }

      for (const cp of b.contactPoints ?? []) {
        const companyId = cp.companyName || cp.companyDomain ? coId(cp.companyName ?? "", cp.companyDomain) : "";
        const ownerId =
          cp.ownerType === "company"
            ? companyId
            : stableId("pe", personDedupKey({ tenantId: T, companyId: companyId || null, fullName: cp.personName ?? "" }));
        if (!ownerId) continue;
        const id = stableId(
          "cp",
          contactPointDedupKey({ tenantId: T, ownerType: cp.ownerType, ownerId, channel: cp.channel, value: cp.value }),
        );
        await tx
          .insert(contactPointTable)
          .values({
            id,
            tenantId: T,
            ownerType: cp.ownerType,
            ownerId,
            channel: cp.channel,
            value: cp.value,
            consentStatus: cp.consentStatus ?? "unknown",
            source: cp.source ?? b.origin,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
        count++;
      }

      await tx.insert(ingestBatchTable).values({
        id: "ing_" + crypto.randomUUID(),
        tenantId: T,
        origin: b.origin,
        count,
      });
    });

    // FALLBACK server-side classify (doc 40): only for enriched leads the extension
    // did NOT already classify. The extension is the primary analyzer (it can read
    // LinkedIn); this just fills gaps and always sets the rule-based salutation.
    // Capped per request to stay within the serverless budget.
    let analyzed = 0;
    for (const e of needsServerClassify.slice(0, 8)) {
      try {
        const cls = await classifyLead(ctx, { fullName: e.fullName, title: e.title, company: e.companyName, experience: e.experience });
        const sal = salutationFor(e.fullName);
        await withTenant(ctx, (tx) =>
          tx
            .update(personTable)
            .set({ leadType: cls.leadType, leadReason: cls.reason, leadScore: cls.score, gender: sal.gender, honorific: sal.honorific, updatedAt: new Date() })
            .where(and(eq(personTable.id, e.id), eq(personTable.tenantId, T))),
        );
        analyzed++;
      } catch (err) {
        console.error("[ingest auto-analyze]", e.id, err);
      }
    }

    // Dedup signal for the extension: of the URLs just submitted, which are ALREADY
    // enriched in the DB? The extension marks these locally and SKIPS re-enriching
    // them (no redundant re-crawl) — "kalau data udah ada di hasil, gak usah diulang".
    let existingEnriched: string[] = [];
    const submittedUrls = (b.people ?? []).map((p) => p.linkedinUrl).filter((u): u is string => !!u);
    if (submittedUrls.length) {
      try {
        await withTenant(ctx, async (tx) => {
          const rows = await tx
            .select({ url: personTable.linkedinUrl })
            .from(personTable)
            .where(
              and(
                eq(personTable.tenantId, T),
                inArray(personTable.linkedinUrl, submittedUrls),
                sql`(${personTable.status} = 'enriched' or jsonb_array_length(coalesce(${personTable.experience}, '[]'::jsonb)) > 0)`,
              ),
            );
          existingEnriched = rows.map((r) => r.url).filter((u): u is string => !!u);
        });
      } catch (err) {
        console.error("[ingest existingEnriched]", err);
      }
    }

    return NextResponse.json({ ok: true, count, analyzed, existingEnriched, source: "db" });
  } catch (err) {
    console.error("[api/ingest POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
