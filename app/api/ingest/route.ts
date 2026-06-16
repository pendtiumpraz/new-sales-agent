import { NextResponse } from "next/server";
import { z } from "zod";

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

export const runtime = "nodejs";

// Ingest sink for crawled / extension-synced data (doc 21). Idempotent: ids are
// derived from per-tenant dedup keys, so re-ingest upserts instead of duplicating.
const Body = z.object({
  origin: z.enum(["mcp", "extension", "manual"]).default("manual"),
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
        about: z.string().optional(),
        experience: z
          .array(z.object({ title: z.string().optional(), company: z.string().optional(), period: z.string().optional() }))
          .optional(),
        source: z.string().optional(),
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
  if (token && process.env.LINKEDIN_INGEST_TOKEN && token === process.env.LINKEDIN_INGEST_TOKEN) {
    ctx = {
      tenantId: process.env.LINKEDIN_INGEST_TENANT || "t_default",
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
  const coId = (name: string, domain?: string) => stableId("co", companyDedupKey({ tenantId: T, name, domain: domain ?? null }));

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
            source: p.source ?? b.origin,
            sourceUrl: p.linkedinUrl ?? null,
            capturedAt: new Date(), // crawl date (doc 40) — drives the >1yr stale warning
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: personTable.id,
            set: {
              title: p.title ?? null,
              department: p.department ?? null,
              location: p.location ?? null,
              linkedinUrl: p.linkedinUrl ?? null,
              about: p.about ?? null,
              // only overwrite experience when the new payload actually has it
              ...(p.experience && p.experience.length ? { experience: p.experience } : {}),
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

    return NextResponse.json({ ok: true, count, source: "db" });
  } catch (err) {
    console.error("[api/ingest POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
