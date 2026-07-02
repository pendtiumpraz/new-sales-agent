import { NextResponse } from "next/server";
import { z } from "zod";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { type TenantContext } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveRepByToken } from "@/lib/team/rep-account";
import { ServiceError } from "@/modules/_shared/api";
import { crmService } from "@/modules/crm/service";
import {
  enrichmentService,
  classifySignals,
  type IngestCompanyInput,
  type IngestPersonInput,
} from "@/modules/enrichment/service";
import { settingsService } from "@/modules/settings/service";
import { agentTaskService } from "@/modules/agent-task/service";

export const runtime = "nodejs";

// Ingest sink for crawled / extension-synced data (doc 21). REROUTED to the REBUILD
// graph: this endpoint used to write the orphaned legacy `company`/`person`/
// `contact_point` tables; it now persists into the SAME channel-agnostic sink the
// web discovery uses (`enrichmentService.ingestGraph` → `company_v2` / `contact`),
// so extension-crawled leads show up in Kontak + the workspace. Idempotent: the sink
// upserts (company by domain/name, person by name-in-company), so a re-crawl updates
// instead of duplicating. Enriched (Stage 2) payloads overwrite; pending (Stage 1)
// re-crawls only fill nulls. The auth + response contract the extension relies on is
// preserved verbatim ({ ok, count, analyzed, existingEnriched, source }).
const Body = z.object({
  origin: z.enum(["mcp", "extension", "manual"]).default("manual"),
  // Batch-level provenance the extension flush stamps (DISCOVERY HISTORY): the
  // channel this crawl ran on + the search term/seed used. Both label the single
  // `discovery_job` this flush records. Optional — derived from per-item source
  // labels when absent.
  channel: z.string().optional(),
  query: z.string().optional(),
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

const norm = (s?: string | null): string => (s ?? "").trim().toLowerCase();

// Legacy free-text `source` label → the rebuild sink's channel enum (CHANNELS).
function toChannel(src?: string | null): string {
  const s = norm(src);
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("googlemaps") || s.includes("google_maps") || s.includes("maps")) return "google_maps";
  if (s.includes("google")) return "google";
  if (s.includes("instagram") || s === "ig") return "instagram";
  if (s.includes("facebook") || s === "fb") return "facebook";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("shopee")) return "shopee";
  if (s.includes("tokopedia")) return "tokopedia";
  if (s.includes("marketplace")) return "marketplace";
  if (s === "manual" || s === "directory" || s === "web") return s;
  return "web";
}

// Which rebuild `contact` field a contact-point channel maps to.
function channelKind(ch: string): "whatsapp" | "email" | "phone" | "social" {
  const c = norm(ch);
  if (c === "whatsapp" || c === "wa") return "whatsapp";
  if (c === "email" || c === "mail" || c === "e-mail") return "email";
  if (["phone", "telp", "telepon", "telephone", "mobile", "hp", "tel"].includes(c)) return "phone";
  return "social";
}

// leadScore (0..1 confidence, or occasionally a 0..100 scale) → fit_score (0..1).
function normalizeScore(n?: number | null): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, Number(v.toFixed(4))));
}

// leadType (b2b_partner|b2c_customer|unknown) → contact.segment (b2b|b2c|unknown).
function segmentFromLeadType(lt?: string | null): "b2b" | "b2c" | "unknown" | undefined {
  if (!lt) return undefined;
  const s = norm(lt);
  if (s.startsWith("b2b")) return "b2b";
  if (s.startsWith("b2c")) return "b2c";
  if (s === "unknown") return "unknown";
  return undefined;
}

interface PersonBag {
  name: string;
  companyName?: string;
  companyDomain?: string;
  whatsapp?: string;
  email?: string;
  phone?: string;
  socials: Record<string, string>;
}

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

  // Source-of-AI mode (Fase 3 ANALYZE). `byoa` → the tenant's own agent classifies
  // via the agent_task queue, so the server-side heuristic fallback is SKIPPED here
  // and a `classify` task is enqueued per new/unclassified contact after ingest.
  // `platform` (default) → the existing server-side fallback classify is UNCHANGED.
  // Best-effort: any lookup error degrades to `platform`.
  let aiMode: string = "platform";
  try {
    aiMode = await settingsService.getAiMode(ctx);
  } catch (err) {
    console.error("[ingest aiMode]", err);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  // 1) Fold contact-points into the person/company they belong to. The rebuild
  //    `contact` carries whatsapp/email/phone as first-class columns (+ socials for
  //    other channels), so a separate contact_point table is no longer written.
  const personBags = new Map<string, PersonBag>();
  const companyBags = new Map<string, { phone?: string; email?: string; address?: string }>();
  for (const cp of b.contactPoints ?? []) {
    const kind = channelKind(cp.channel);
    if (cp.ownerType === "person") {
      const key = norm(cp.personName);
      if (!key) continue;
      let bag = personBags.get(key);
      if (!bag) {
        bag = { name: cp.personName ?? key, socials: {} };
        personBags.set(key, bag);
      }
      if (cp.companyName && !bag.companyName) bag.companyName = cp.companyName;
      if (cp.companyDomain && !bag.companyDomain) bag.companyDomain = cp.companyDomain;
      if (kind === "whatsapp") bag.whatsapp ??= cp.value;
      else if (kind === "email") bag.email ??= cp.value;
      else if (kind === "phone") bag.phone ??= cp.value;
      else bag.socials[cp.channel] = cp.value;
    } else {
      const key = norm(cp.companyDomain) || norm(cp.companyName);
      if (!key) continue;
      let bag = companyBags.get(key);
      if (!bag) {
        bag = {};
        companyBags.set(key, bag);
      }
      if (kind === "email") bag.email ??= cp.value;
      else if (kind === "whatsapp" || kind === "phone") bag.phone ??= cp.value;
    }
  }

  // 2) Companies → company_v2 (name/domain/industry/size/summary + phone/email from
  //    company contact-points; the sink stores those in the company `socials` bag).
  const companies: IngestCompanyInput[] = (b.companies ?? []).map((c) => {
    const cbag = companyBags.get(norm(c.domain)) || companyBags.get(norm(c.name)) || {};
    return {
      name: c.name,
      domain: c.domain ?? null,
      industry: c.industry ?? null,
      size: c.size ?? null,
      summary: c.summary ?? null,
      phone: cbag.phone ?? null,
      email: cbag.email ?? null,
      address: cbag.address ?? null,
    };
  });

  // 3) People → contact. Map the extension's AI classification onto rebuild columns
  //    (leadType→segment, leadScore→fitScore, leadReason→fitReason, profileSummary/
  //    about→summary). FALLBACK: only for ENRICHED-but-unclassified leads, reuse the
  //    rebuild `classifySignals` heuristic (no legacy classifyLead, no legacy tables).
  let analyzed = 0;
  const people: IngestPersonInput[] = [];
  const seenPersonKeys = new Set<string>();
  for (const p of b.people ?? []) {
    const key = norm(p.fullName);
    seenPersonKeys.add(key);
    const bag = personBags.get(key);
    const socials: Record<string, string> = { ...(p.socials ?? {}), ...(bag?.socials ?? {}) };
    const email = bag?.email ?? null;
    const phone = bag?.phone ?? null;
    const whatsapp = bag?.whatsapp ?? null;

    const hasExp = !!(p.experience && p.experience.length);
    const isEnriched = p.enriched === true || p.status === "enriched" || hasExp;

    // Extension classification wins; else fall back to the rebuild heuristic ONLY
    // for enriched-but-unclassified leads (the extension is the primary analyzer —
    // it can read LinkedIn; the server can't, so it just fills the gap).
    let segment = segmentFromLeadType(p.leadType);
    let fitScore = normalizeScore(p.leadScore);
    let fitReason = p.leadReason ?? null;
    // In BYOA mode the tenant's own agent is the classifier — skip the server
    // heuristic and leave the contact unclassified so a `classify` agent_task is
    // enqueued below. Platform mode keeps the heuristic fallback UNCHANGED.
    if (!p.leadType && isEnriched && aiMode !== "byoa") {
      const sig = classifySignals({ companyName: p.companyName, title: p.title, email, phone, whatsapp, socials });
      segment = sig.classification;
      fitScore = sig.fitScore;
      fitReason = sig.fitReason;
      analyzed++;
    }

    people.push({
      fullName: p.fullName,
      title: p.title ?? null,
      department: p.department ?? null,
      seniority: p.seniority ?? null,
      location: p.location ?? null,
      summary: p.profileSummary ?? p.about ?? null,
      email,
      phone,
      whatsapp,
      channelProfileUrl: p.linkedinUrl ?? p.sourceUrl ?? null,
      socials: Object.keys(socials).length ? socials : null,
      companyRef:
        p.companyName || p.companyDomain
          ? { name: p.companyName ?? null, domain: p.companyDomain ?? null }
          : null,
      segment: segment ?? undefined,
      fitScore: fitScore ?? undefined,
      fitReason: fitReason ?? undefined,
      source: p.source ?? null,
      enriched: isEnriched,
    });
  }

  // Orphan person contact-points (a WA/email for someone not in people[]) — create a
  // minimal pending contact so the number isn't lost (mirrors the legacy stub).
  for (const [key, bag] of personBags) {
    if (seenPersonKeys.has(key)) continue;
    people.push({
      fullName: bag.name,
      email: bag.email ?? null,
      phone: bag.phone ?? null,
      whatsapp: bag.whatsapp ?? null,
      socials: Object.keys(bag.socials).length ? bag.socials : null,
      companyRef:
        bag.companyName || bag.companyDomain
          ? { name: bag.companyName ?? null, domain: bag.companyDomain ?? null }
          : null,
      enriched: false,
    });
  }

  // Batch channel: prefer the batch-level `channel` the extension flush stamps;
  // else derive from the crawled source labels (per-person source is kept on each
  // contact). `toChannel` normalizes aliases to the CHANNELS enum; default "web".
  const firstSrc =
    (b.people ?? []).find((p) => p.source)?.source ??
    (b.companies ?? []).find((c) => c.source)?.source ??
    null;
  const channel = toChannel(b.channel ?? firstSrc);

  let result;
  try {
    result = await enrichmentService.ingestGraph(ctx, {
      channel,
      // Label the run's discovery_job with the batch search term/seed (Riwayat).
      query: b.query ?? null,
      sourceUrl: null,
      workspaceId: b.workspaceId ?? null,
      ownerUserId: assignTo, // per-rep attribution (doc 41)
      origin: b.origin,
      posture: "compliant",
      companies,
      people,
      analyze: false,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[api/ingest POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }

  // Fase 3 ANALYZE — BYOA classify routing: hand each NEW/unclassified contact to
  // the tenant's own agent (metered, its own model) instead of the extension's
  // direct-DeepSeek call. Enqueue a Fase-2 `classify` agent_task per contact;
  // applyResult (agentTaskService) writes segment/fitScore/fitReason back onto it.
  // Batch-capped so a big crawl can't flood the queue. Best-effort: never fails the
  // ingest. Platform mode enqueues nothing (server heuristic already ran above).
  if (aiMode === "byoa") {
    const unclassified = result.contacts.filter(
      (c) => c.isNew || !c.segment || c.segment === "unknown",
    );
    const BYOA_CLASSIFY_CAP = 25;
    try {
      for (const c of unclassified.slice(0, BYOA_CLASSIFY_CAP)) {
        await agentTaskService.enqueue(ctx, {
          type: "classify",
          payload: {
            contactId: c.id,
            fullName: c.fullName,
            title: c.title,
            companyName: c.companyName,
          },
          refType: "contact",
          refId: c.id,
        });
      }
    } catch (err) {
      console.error("[ingest byoa classify enqueue]", err);
    }
  }

  // Dedup signal for the extension: of the URLs just submitted, which are ALREADY
  // enriched in the rebuild `contact` (matched by profile URL stored in socials)?
  // The extension marks these locally and SKIPS re-enriching them.
  let existingEnriched: string[] = [];
  const submittedUrls = (b.people ?? [])
    .map((p) => p.linkedinUrl ?? p.sourceUrl)
    .filter((u): u is string => !!u);
  if (submittedUrls.length) {
    try {
      existingEnriched = await crmService.findEnrichedProfileUrls(ctx, submittedUrls);
    } catch (err) {
      console.error("[ingest existingEnriched]", err);
    }
  }

  return NextResponse.json({
    ok: true,
    count: result.companiesUpserted + result.peopleUpserted,
    analyzed,
    existingEnriched,
    source: "db",
  });
}
