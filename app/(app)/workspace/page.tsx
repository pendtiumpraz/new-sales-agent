"use client";

// Workspace hub — Module 2 FRONTEND (Sainskerta Loop Phase 04). Wired to the NEW
// M2 backend (singular endpoints): GET /api/workspace (list), GET /api/product
// (the connected product), GET /api/workspace/[id]/market-fit (B2B/B2C/mix + ICP),
// GET /api/workspace/[id]/sales-play (technique mix / channel / tone). NO mock
// data — every band has loading + empty + error states. Faithful to
// mockups/workspace.html (Coral Sunset): product summary, Market-Fit Analyzer
// (chips B2B/B2C/mix + ICP + fit-per-segment + discovery playbook + closing
// techniques), funnel summary, acquired-contacts section (tabs Semua/B2C/B2B —
// wired to GET /api/contacts?workspaceId=… — Module 3 / CRM — with live
// Semua/B2C/B2B counts, a compact table with Segment badges + enrichment status,
// and its own loading / empty / error states), and the Sales Play summary. A
// minimal product-setup affordance shows when there's no workspace/product yet.
// NO DB mutations — read-only page.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Boxes,
  Briefcase,
  Building2,
  ChevronRight,
  Circle,
  Copy,
  Handshake,
  Lightbulb,
  MessageSquare,
  Package,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCircle2,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API shapes (NEW M2 backend — { ok, data } envelope) ─────────────────────

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Row from GET /api/workspace (modules/workspace · workspace_v2). */
interface WorkspaceRow {
  id: string;
  name: string;
  type: string; // lead_gen | partner | offering | retention | custom
  productId: string | null;
  targetSegment: string | null;
  status: string; // active | archived
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** Row from GET /api/product (modules/product · product_v2). */
interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  valueProps: string[];
  pricingNotes: string | null;
  targetMarket: string | null; // B2B | B2C | both
  icp: Record<string, unknown> | null;
  status: string;
}

/** GET /api/workspace/[id]/market-fit (modules/workspace · market_fit), or null. */
interface MarketFitRow {
  id: string;
  workspaceId: string;
  marketType: string; // b2b | b2c | mix
  confidence: number | null; // 0..1
  icp: Record<string, unknown> | null;
  segments: string[];
  rationale: string | null;
  source: string | null; // ai | manual
}

/** GET /api/workspace/[id]/sales-play (modules/workspace · sales_play), or null. */
interface SalesPlayRow {
  id: string;
  workspaceId: string;
  name: string | null;
  channel: string; // whatsapp | email | instagram | linkedin
  tone: string; // consultative | direct | friendly | formal
  techniques: string[];
  steps: Record<string, unknown>[];
  config: Record<string, unknown> | null;
  status: string;
}

/** Row from GET /api/sales/techniques (modules/sales · kb_technique). One of the
 *  17 Teknik Closing — `cocokUntuk` tags B2B/B2C fit, `sinyal` the trigger signals. */
interface KbTechniqueRow {
  id: string;
  key: string;
  name: string;
  inti: string; // one-line how-it-works
  contoh: string | null; // optional sample line
  cocokUntuk: string[]; // ["b2b","b2c"] — market fit
  sinyal: string[]; // trigger signals
  sort: number;
}

/** Row from GET /api/contacts (modules/crm · contact). The acquired lead. */
interface ContactRow {
  id: string;
  workspaceId: string | null;
  companyId: string | null;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  socials: Record<string, string> | null;
  segment: string; // b2c | b2b | unknown
  enrichmentStatus: string; // none | pending | enriched | failed
  source: string | null;
}

// ── Display metadata ────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string }> = {
  lead_gen: { label: "Cari lead" },
  partner: { label: "Cari partner" },
  offering: { label: "Penawaran" },
  retention: { label: "Follow-up retensi" },
  custom: { label: "Lainnya" },
};

const MARKET_META: Record<string, { label: string; cls: string }> = {
  b2b: { label: "B2B dominan", cls: "bg-primary/12 text-primary" },
  b2c: { label: "B2C dominan", cls: "bg-tertiary/15 text-tertiary" },
  mix: { label: "Mix (B2B + B2C)", cls: "bg-highlight/15 text-highlight-foreground" },
};

// Contact-segment badge styling — faithful to mockups/workspace.html (Coral
// Sunset): B2B = primary tint, B2C = tertiary tint, unknown = neutral.
const SEGMENT_BADGE: Record<string, { label: string; cls: string }> = {
  b2b: { label: "B2B", cls: "bg-primary/10 text-primary" },
  b2c: { label: "B2C", cls: "bg-tertiary/15 text-tertiary" },
  unknown: { label: "?", cls: "bg-muted text-muted-foreground" },
};

// Enrichment-status pill — Lengkap (enriched) = success, Sebagian (pending) =
// highlight, Belum (none) = neutral, Gagal (failed) = destructive.
const ENRICHMENT_META: Record<string, { label: string; dot: string; cls: string }> = {
  enriched: { label: "Lengkap", dot: "bg-success", cls: "bg-success/10 text-success" },
  pending: {
    label: "Sebagian",
    dot: "bg-highlight",
    cls: "bg-highlight/15 text-highlight-foreground",
  },
  none: { label: "Belum", dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground" },
  failed: { label: "Gagal", dot: "bg-destructive", cls: "bg-destructive/10 text-destructive" },
};

// Discovery playbook query chips — channel-aware default scaffolding shown when
// the workspace has no analyzed segments yet. Click-to-copy → run in the channel.
const DEFAULT_PLAYBOOK: { label: string; query: string }[] = [
  { label: "IG: toko retail", query: '"toko retail" "WhatsApp" site:instagram.com' },
  { label: "Google: UMKM F&B", query: "UMKM F&B Jakarta kontak owner" },
  { label: "LinkedIn: distributor", query: "distributor grosir reseller B2B site:linkedin.com" },
  { label: "Shopee: toko aktif", query: "toko Shopee fashion aktif" },
];

// Closing-technique labels (consultative value-first; aggressive ones gated to
// B2C-only per the closing-flow initiative). Used to label sales-play technique
// keys; falls back to the raw key when unmapped.
const TECHNIQUE_LABELS: Record<string, string> = {
  value_ladder: "Value Ladder",
  urgency: "Urgency / Scarcity",
  scarcity: "Urgency / Scarcity",
  social_proof: "Social Proof",
  trial_close: "Trial Close",
  assumptive_close: "Assumptive Close",
  bonus_stack: "Bonus Stack",
  consultative: "Consultative",
};

function techniqueLabel(key: string): string {
  return TECHNIQUE_LABELS[key] ?? key.replace(/_/g, " ");
}

// "cocok untuk" market-fit chip on a closing technique (b2b = consultative tint,
// b2c = the aggressive/scarcity set). Faithful to the Coral Sunset palette.
const FIT_BADGE: Record<string, { label: string; cls: string }> = {
  b2b: { label: "B2B", cls: "bg-primary/10 text-primary" },
  b2c: { label: "B2C", cls: "bg-tertiary/15 text-tertiary" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** ICP record → ordered [label, value] rows (only string-ish values rendered). */
function icpRows(icp: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!icp) return [];
  return Object.entries(icp)
    .map(([k, v]) => {
      let value = "";
      if (Array.isArray(v)) value = v.join(", ");
      else if (v != null && (typeof v === "string" || typeof v === "number")) value = String(v);
      return { label: k.replace(/_/g, " "), value };
    })
    .filter((r) => r.value.length > 0)
    .slice(0, 6);
}

async function getEnvelope<T>(url: string): Promise<T | null> {
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error("gagal memuat");
  }
  const j = (await r.json()) as ApiEnvelope<T>;
  return j.data ?? null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspaceHubPage() {
  // 1) Workspaces — the new M2 list. We focus the most-recently-updated active
  //    one (1 ws = 1 product). A multi-workspace switcher lives at /workspaces.
  const wsQ = useQuery({
    queryKey: ["m2", "workspace", "list"],
    queryFn: () => getEnvelope<WorkspaceRow[]>("/api/workspace"),
    retry: false,
  });

  const workspaces = useMemo<WorkspaceRow[]>(() => wsQ.data ?? [], [wsQ.data]);
  const activeWs = useMemo<WorkspaceRow | null>(() => {
    const live = workspaces.filter((w) => w.status !== "archived");
    if (live.length === 0) return null;
    return [...live].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  }, [workspaces]);
  const wsId = activeWs?.id ?? null;

  // 2) Products — used to resolve the connected product, and to power the
  //    "no product yet" setup affordance.
  const productQ = useQuery({
    queryKey: ["m2", "product", "list"],
    queryFn: () => getEnvelope<ProductRow[]>("/api/product"),
    retry: false,
  });
  const products = useMemo<ProductRow[]>(() => productQ.data ?? [], [productQ.data]);
  const product = useMemo<ProductRow | null>(() => {
    if (!activeWs?.productId) return null;
    return products.find((p) => p.id === activeWs.productId) ?? null;
  }, [activeWs, products]);

  // 3) Market-Fit + Sales-Play satellites — only fetched once we have a ws id.
  const mfQ = useQuery({
    queryKey: ["m2", "workspace", wsId, "market-fit"],
    enabled: !!wsId,
    queryFn: () => getEnvelope<MarketFitRow>(`/api/workspace/${wsId}/market-fit`),
    retry: false,
  });
  const playQ = useQuery({
    queryKey: ["m2", "workspace", wsId, "sales-play"],
    enabled: !!wsId,
    queryFn: () => getEnvelope<SalesPlayRow>(`/api/workspace/${wsId}/sales-play`),
    retry: false,
  });

  // 4) Acquired contacts — Module 3 / CRM, scoped to this workspace. Real data
  //    from GET /api/contacts?workspaceId=… (NO mock). Segmented B2C / B2B.
  const contactsQ = useQuery({
    queryKey: ["m3", "contacts", "workspace", wsId],
    enabled: !!wsId,
    queryFn: () =>
      getEnvelope<ContactRow[]>(`/api/contacts?workspaceId=${encodeURIComponent(wsId as string)}`),
    retry: false,
  });

  // 5) Closing techniques — the tenant's live 17 Teknik Closing catalog (Module 6
  //    / sales · kb_technique). Not workspace-scoped on the backend, so we fetch
  //    the catalog and filter it B2B/B2C client-side by THIS workspace's market-fit
  //    (mix / no fit → show all). Works with NO db (returns []).
  const techQ = useQuery({
    queryKey: ["m6", "sales", "techniques"],
    queryFn: () => getEnvelope<KbTechniqueRow[]>("/api/sales/techniques"),
    retry: false,
  });

  const marketFit = mfQ.data ?? null;
  const salesPlay = playQ.data ?? null;
  const contacts = useMemo<ContactRow[]>(() => contactsQ.data ?? [], [contactsQ.data]);
  const allTechniques = useMemo<KbTechniqueRow[]>(() => techQ.data ?? [], [techQ.data]);

  const [seg, setSeg] = useState<"all" | "b2c" | "b2b">("all");

  // Live per-segment counts + the filtered view for the active tab.
  const segCounts = useMemo(() => {
    let b2c = 0;
    let b2b = 0;
    for (const c of contacts) {
      if (c.segment === "b2c") b2c += 1;
      else if (c.segment === "b2b") b2b += 1;
    }
    return { all: contacts.length, b2c, b2b };
  }, [contacts]);

  const visibleContacts = useMemo<ContactRow[]>(() => {
    if (seg === "all") return contacts;
    return contacts.filter((c) => c.segment === seg);
  }, [contacts, seg]);

  // Closing techniques matched to THIS workspace's market type. B2B keeps only
  // consultative-safe techniques (cocokUntuk includes b2b); B2C the aggressive/
  // scarcity set; mix / no market-fit → the whole catalog. Sorted by display order.
  const techMarket = marketFit?.marketType === "b2b" || marketFit?.marketType === "b2c"
    ? marketFit.marketType
    : null;
  const matchedTechniques = useMemo<KbTechniqueRow[]>(() => {
    const list = techMarket
      ? allTechniques.filter((t) => (t.cocokUntuk ?? []).includes(techMarket))
      : allTechniques;
    return [...list].sort((a, b) => a.sort - b.sort);
  }, [allTechniques, techMarket]);

  function copyQuery(q: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(q).catch(() => {});
    }
    toast.success("Kueri disalin — tempel di channel discovery-nya");
  }

  // ── Loading / error / empty (top-level) ──────────────────────────────────
  const wsLoading = wsQ.isLoading || productQ.isLoading;
  const wsError = wsQ.isError || productQ.isError;

  if (wsLoading) {
    return (
      <div>
        <PageHeader title="Workspace" description="Hub workspace — 1 workspace = 1 produk." />
        <div className="space-y-5 p-6">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (wsError) {
    return (
      <div>
        <PageHeader title="Workspace" description="Hub workspace — 1 workspace = 1 produk." />
        <div className="p-6">
          <ErrorState
            title="Gagal memuat workspace"
            description="Tidak bisa mengambil data workspace/produk. Pastikan kamu login & punya akses data."
            onRetry={() => {
              wsQ.refetch();
              productQ.refetch();
            }}
          />
        </div>
      </div>
    );
  }

  // No workspace yet → product-setup affordance (minimal: link to create flow).
  if (!activeWs) {
    return (
      <div>
        <PageHeader title="Workspace" description="Hub workspace — 1 workspace = 1 produk." />
        <div className="p-6">
          <EmptyState
            icon={Briefcase}
            title="Belum ada workspace aktif"
            description="Buat workspace pertama (1 workspace = 1 produk) untuk mulai: hubungkan produk, analisis market-fit (B2B/B2C/mix), lalu cari kontak lewat Discovery."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild>
                  <Link href="/workspaces">
                    <Plus className="h-4 w-4" /> Buat workspace
                  </Link>
                </Button>
                {products.length === 0 && (
                  <Button asChild variant="outline">
                    <Link href="/settings">
                      <Package className="h-4 w-4" /> Tambah produk dulu
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const typeLabel = TYPE_META[activeWs.type]?.label ?? TYPE_META.custom.label;
  const marketMeta = marketFit ? MARKET_META[marketFit.marketType] ?? MARKET_META.mix : null;
  const confidencePct =
    marketFit?.confidence != null ? Math.round(marketFit.confidence * 100) : null;
  const icp = icpRows(marketFit?.icp ?? product?.icp ?? null);
  const segments = marketFit?.segments ?? [];
  const techniques = salesPlay?.techniques ?? [];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/workspaces" className="hover:text-foreground hover:underline">
              Semua workspace
            </Link>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-foreground/70">{activeWs.name}</span>
          </span>
        }
        title={activeWs.name}
        description="Hub workspace — semua aktivitas sales fokus di sini. 1 workspace = 1 produk."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/workspaces">
            <Boxes className="h-4 w-4" /> Semua workspace
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/contacts/discovery">
            <Radar className="h-4 w-4" /> Cari kontak (Discovery)
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ (1) PRODUCT SUMMARY ============ */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tertiary/15 text-tertiary">
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold">
                  {product?.name ?? activeWs.name}
                  {product?.category ? ` — ${product.category}` : ""}
                </p>
                <Badge variant="muted" className="bg-tertiary/15 text-tertiary">
                  <Target className="mr-1 h-3 w-3" /> {typeLabel}
                </Badge>
                {activeWs.status === "active" ? (
                  <Badge variant="success">
                    <Circle className="mr-1 h-1.5 w-1.5 fill-current" /> Aktif
                  </Badge>
                ) : (
                  <Badge variant="muted">Diarsipkan</Badge>
                )}
                {!product && (
                  <Badge variant="warning">Produk belum terhubung</Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                {activeWs.targetSegment && (
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> Target:{" "}
                    <span className="font-medium text-foreground/80">{activeWs.targetSegment}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {product ? "Produk terhubung" : "Belum ada produk"}
                </span>
                {product?.targetMarket && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Pasar:{" "}
                    <span className="font-medium text-foreground/80">{product.targetMarket}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <UserCircle2 className="h-3.5 w-3.5" /> Owner workspace
                </span>
              </div>
            </div>
            {!product && (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/workspaces">
                  <Package className="h-4 w-4" /> Hubungkan produk
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ============ (2) MARKET-FIT ANALYZER (B2B / B2C / mix + ICP) ============ */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Market-Fit Analyzer (B2B / B2C / mix)
            </CardTitle>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href="/use-case">
                <RefreshCw className="h-3.5 w-3.5" /> Analisis ulang
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {mfQ.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                </div>
              </div>
            ) : mfQ.isError ? (
              <ErrorState
                className="border-0 py-8"
                title="Gagal memuat market-fit"
                description="Tidak bisa mengambil hasil analisis market-fit workspace ini."
                onRetry={() => mfQ.refetch()}
              />
            ) : !marketFit ? (
              <EmptyState
                className="border-0 py-8"
                icon={Sparkles}
                title="Market-fit belum dianalisis"
                description="Jalankan Market-Fit Analyzer untuk menentukan tipe pasar (B2B / B2C / mix), ICP, dan teknik closing yang cocok."
                action={
                  <Button asChild size="sm">
                    <Link href="/use-case">
                      <Sparkles className="h-4 w-4" /> Analisis market-fit
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                {/* headline market-type + confidence */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      marketMeta?.cls,
                    )}
                  >
                    {marketMeta?.label}
                  </span>
                  {confidencePct != null && (
                    <span className="text-xs text-muted-foreground">
                      keyakinan{" "}
                      <span className="font-medium text-foreground/80">{confidencePct}%</span>
                      {marketFit.source ? ` · sumber ${marketFit.source}` : ""}
                    </span>
                  )}
                </div>

                {marketFit.rationale && (
                  <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {marketFit.rationale}
                  </p>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {/* ICP — target ideal */}
                  <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
                    <p className="font-semibold text-foreground/80">ICP — target ideal</p>
                    {icp.length === 0 ? (
                      <p className="text-muted-foreground">
                        ICP belum diisi. Analisis market-fit akan mengisinya otomatis.
                      </p>
                    ) : (
                      icp.map((r) => (
                        <div key={r.label} className="flex gap-2">
                          <span className="w-24 shrink-0 capitalize text-muted-foreground">
                            {r.label}
                          </span>
                          <span className="flex-1 text-foreground/90">{r.value}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Fit per segmen */}
                  <div className="space-y-2.5 rounded-lg border bg-muted/40 p-3 text-xs">
                    <p className="font-semibold text-foreground/80">Segmen target</p>
                    {segments.length === 0 ? (
                      <p className="text-muted-foreground">
                        Belum ada segmen target. Tambah lewat analisis atau edit market-fit.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {segments.map((s) => (
                          <span
                            key={s}
                            className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-foreground/80"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Playbook discovery + closing techniques */}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground/80">
                      <Search className="h-3.5 w-3.5 text-primary" />
                      Playbook discovery — cari di mana &amp; apa
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Klik kueri buat salin → cari di channel-nya → crawl email/HP.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_PLAYBOOK.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => copyQuery(c.query)}
                          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] text-foreground/80 transition hover:bg-accent"
                        >
                          <Copy className="h-2.5 w-2.5 opacity-50" />
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <Link
                      href="/contacts/discovery"
                      className="inline-flex items-center gap-1 pt-1 text-[11px] text-primary hover:underline"
                    >
                      Buka di Enrichment / Discovery
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="space-y-2 rounded-lg border p-3 text-xs">
                    <p className="font-semibold text-foreground/80">
                      Teknik closing yang cocok{techniques.length ? ` (${techniques.length})` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Tipe pasar nentuin teknik yang kebuka (agresif = B2C-only).
                    </p>
                    {techniques.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Belum ada teknik dipilih — atur di Sales Play.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {techniques.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {techniqueLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ (3) FUNNEL SUMMARY ============ */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Funnel workspace</CardTitle>
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Buka Pipeline <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {/* Funnel counts come from CRM/contacts (Module 3). Until then, an
                honest zero-state funnel — labelled, not fabricated. */}
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              {[
                { label: "Kontak", cls: "text-foreground" },
                { label: "Ter-enrich", cls: "text-tertiary" },
                { label: "Obrolan aktif", cls: "text-foreground" },
                { label: "Qualified", cls: "text-foreground" },
                { label: "Closing", cls: "text-primary", highlight: true },
              ].map((s) => (
                <div
                  key={s.label}
                  className={cn(
                    "rounded-lg border p-3",
                    s.highlight ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/20",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                  <div className={cn("mt-1.5 text-2xl font-bold", s.cls)}>—</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Angka funnel terisi otomatis setelah modul CRM / Enrichment menambah &amp; menilai
              kontak workspace ini.
            </p>
          </CardContent>
        </Card>

        {/* ============ (4) ACQUIRED CONTACTS — B2C / B2B segmentation ============ */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Users className="h-4 w-4 text-tertiary" />
                Kontak yang sudah didapat
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Hasil Discovery untuk workspace ini — disegmentasi B2C / B2B.
              </p>
            </div>
            <Button asChild size="sm" className="h-8">
              <Link href="/contacts/discovery">
                <Plus className="h-3.5 w-3.5" /> Cari kontak (Discovery)
              </Link>
            </Button>
          </CardHeader>

          {/* Segmentation tabs (Semua / B2C / B2B) — LIVE counts from the wired
              CRM contacts query (scoped to this workspace). */}
          <div className="flex items-center gap-1 border-y bg-muted/20 px-4 py-2 text-xs">
            {([
              { key: "all", label: "Semua", count: segCounts.all, badge: "bg-muted text-muted-foreground" },
              { key: "b2c", label: "B2C", count: segCounts.b2c, badge: "bg-tertiary/15 text-tertiary" },
              { key: "b2b", label: "B2B", count: segCounts.b2b, badge: "bg-primary/10 text-primary" },
            ] as const).map((t) => {
              const on = seg === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSeg(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium transition",
                    on
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      t.badge,
                    )}
                  >
                    {contactsQ.isLoading ? "…" : t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <CardContent className="p-0">
            {contactsQ.isLoading ? (
              /* loading — skeleton rows */
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : contactsQ.isError ? (
              /* error — retry */
              <ErrorState
                className="border-0 py-12"
                title="Gagal memuat kontak"
                description="Tidak bisa mengambil kontak workspace ini dari CRM. Pastikan kamu login & punya akses data."
                onRetry={() => contactsQ.refetch()}
              />
            ) : visibleContacts.length === 0 ? (
              /* empty — per active tab */
              <EmptyState
                className="border-0 py-12"
                icon={Users}
                title={
                  seg === "b2c"
                    ? "Belum ada kontak B2C"
                    : seg === "b2b"
                      ? "Belum ada kontak B2B"
                      : "Belum ada kontak di workspace ini"
                }
                description="Jalankan Discovery untuk mengisi kontak workspace ini — kontak otomatis tersegmentasi B2C / B2B dan ditandai status enrichment-nya."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm">
                      <Link href="/contacts/discovery">
                        <Radar className="h-4 w-4" /> Cari kontak (Discovery)
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/contacts">
                        <Users className="h-4 w-4" /> Buka Contacts
                      </Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              /* compact table — Segment badge + enrichment status (mockup-faithful) */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Nama</th>
                      <th className="px-4 py-2.5 font-medium">Segment</th>
                      <th className="px-4 py-2.5 font-medium">Profil</th>
                      <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                        Kontak (email · HP)
                      </th>
                      <th className="px-4 py-2.5 font-medium">Status enrichment</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Sumber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleContacts.map((c) => {
                      const segBadge = SEGMENT_BADGE[c.segment] ?? SEGMENT_BADGE.unknown;
                      const enr = ENRICHMENT_META[c.enrichmentStatus] ?? ENRICHMENT_META.none;
                      const emailPhone = [c.email, c.phone ?? c.whatsapp]
                        .map((v) => v || "—")
                        .join(" · ");
                      const hasContact = !!(c.email || c.phone || c.whatsapp);
                      return (
                        <tr key={c.id} className="transition hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium text-foreground">{c.fullName}</td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                segBadge.cls,
                              )}
                            >
                              {segBadge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-foreground/80">
                            {c.title ? (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                {c.title}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-xs md:table-cell">
                            {hasContact ? (
                              <span className="text-foreground/70">{emailPhone}</span>
                            ) : (
                              <span className="italic text-muted-foreground">— belum ada —</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {c.enrichmentStatus === "none" ? (
                              <Link
                                href="/contacts/discovery"
                                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/10"
                              >
                                <Sparkles className="h-2.5 w-2.5" /> Belum · Enrich
                              </Link>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  enr.cls,
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", enr.dot)} />
                                {enr.label}
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                            {c.source || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          <div className="flex items-center justify-between border-t px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>
              {contactsQ.isLoading
                ? "Memuat kontak workspace…"
                : contactsQ.isError
                  ? "Kontak gagal dimuat."
                  : `Menampilkan ${visibleContacts.length} dari ${segCounts.all} kontak · disegmentasi otomatis saat Discovery.`}
            </span>
            <Link href="/contacts" className="text-primary hover:underline">
              Semua kontak →
            </Link>
          </div>
        </Card>

        {/* ============ (5) SALES PLAY SUMMARY ============ */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                Sales Script (Sales Play)
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Alur · adab · teknik closing · channel · tone — nyetir orkestrator obrolan.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href="/workspaces">Atur Sales Play</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {playQ.isLoading ? (
              <div className="grid gap-2.5 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : playQ.isError ? (
              <ErrorState
                className="border-0 py-8"
                title="Gagal memuat sales-play"
                description="Tidak bisa mengambil konfigurasi sales-play workspace ini."
                onRetry={() => playQ.refetch()}
              />
            ) : !salesPlay ? (
              <EmptyState
                className="border-0 py-8"
                icon={MessageSquare}
                title="Sales Play belum diatur"
                description="Atur channel, tone, dan teknik closing untuk menyetir obrolan konsultatif value-first."
                action={
                  <Button asChild size="sm">
                    <Link href="/workspaces">
                      <Sparkles className="h-4 w-4" /> Atur Sales Play
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-2.5 text-[11px] sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-0.5 font-semibold text-foreground/80">Channel &amp; tone</p>
                  <p className="capitalize text-muted-foreground">
                    {salesPlay.channel} · {salesPlay.tone}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-0.5 font-semibold text-foreground/80">Teknik closing</p>
                  <p className="text-muted-foreground">
                    {techniques.length
                      ? techniques.map(techniqueLabel).join(" · ")
                      : "Belum ada teknik dipilih"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-0.5 font-semibold text-foreground/80">Tahap play</p>
                  <p className="text-muted-foreground">
                    {salesPlay.steps.length
                      ? `${salesPlay.steps.length} tahap dikonfigurasi`
                      : "Belum ada tahap — pakai alur default"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============ (5b) CLOSING TECHNIQUES — matched to market-fit ============ */}
        {/* Module 6 / sales · the differentiator. Wired to GET /api/sales/techniques
            (the tenant's live 17 Teknik Closing catalog), filtered B2B/B2C by this
            workspace's market-fit. Techniques already chosen in the Sales Play above
            are highlighted as "dipakai". Own loading / empty / error states. */}
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Handshake className="h-4 w-4 text-primary" />
                Teknik Closing yang cocok
                {techMarket && (
                  <span
                    className={cn(
                      "ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      FIT_BADGE[techMarket]?.cls,
                    )}
                  >
                    {marketMeta?.label ?? FIT_BADGE[techMarket]?.label}
                  </span>
                )}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                {techMarket
                  ? `Difilter untuk pasar ${techMarket.toUpperCase()} — teknik agresif/scarcity ${
                      techMarket === "b2b" ? "ditutup (B2B konsultatif)" : "kebuka (B2C)"
                    }.`
                  : "Market-fit belum B2B/B2C — menampilkan seluruh katalog. Analisis market-fit untuk mempersempit."}
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href="/use-case">
                <Lightbulb className="h-3.5 w-3.5" /> Atur teknik
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {techQ.isLoading ? (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : techQ.isError ? (
              <ErrorState
                className="border-0 py-8"
                title="Gagal memuat teknik closing"
                description="Tidak bisa mengambil katalog 17 Teknik Closing. Pastikan kamu login & punya akses data."
                onRetry={() => techQ.refetch()}
              />
            ) : allTechniques.length === 0 ? (
              <EmptyState
                className="border-0 py-8"
                icon={Handshake}
                title="Katalog teknik closing belum diisi"
                description="Seed 17 Teknik Closing (Dewa Eka Prayoga) untuk mulai — teknik konsultatif kebuka untuk B2B, yang agresif/scarcity di-gate untuk B2C."
                action={
                  <Button asChild size="sm">
                    <Link href="/use-case">
                      <Sparkles className="h-4 w-4" /> Siapkan teknik closing
                    </Link>
                  </Button>
                }
              />
            ) : matchedTechniques.length === 0 ? (
              <EmptyState
                className="border-0 py-8"
                icon={Handshake}
                title={`Belum ada teknik untuk pasar ${techMarket?.toUpperCase() ?? ""}`}
                description="Tidak ada teknik di katalog yang cocok untuk tipe pasar workspace ini. Tambah teknik atau ubah market-fit."
              />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground/80">{matchedTechniques.length}</span>{" "}
                    teknik cocok
                    {techMarket ? "" : " (seluruh katalog)"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Zap className="h-3 w-3 text-primary" />
                    <span className="font-semibold text-foreground/80">
                      {matchedTechniques.filter((t) => techniques.includes(t.key)).length}
                    </span>{" "}
                    dipakai di Sales Play
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {matchedTechniques.map((t) => {
                    const inPlay = techniques.includes(t.key);
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-lg border p-3 text-xs transition",
                          inPlay
                            ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/15"
                            : "bg-muted/20 hover:border-primary/30",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-tight text-foreground/90">{t.name}</p>
                          {inPlay && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                              <Zap className="h-2.5 w-2.5" /> dipakai
                            </span>
                          )}
                        </div>
                        <p className="leading-relaxed text-muted-foreground">{t.inti}</p>
                        {t.contoh && (
                          <p className="rounded bg-card/80 px-2 py-1 text-[11px] italic text-foreground/70">
                            &ldquo;{t.contoh}&rdquo;
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
                          {(t.cocokUntuk ?? []).map((m) => {
                            const fit = FIT_BADGE[m];
                            if (!fit) return null;
                            return (
                              <span
                                key={m}
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                                  fit.cls,
                                )}
                              >
                                {fit.label}
                              </span>
                            );
                          })}
                          {(t.sinyal ?? []).slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="rounded-full border bg-card px-1.5 py-0.5 text-[9px] text-muted-foreground"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ (6) RELATED MODULES ============ */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Lainnya (modul terkait workspace)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/inbox", icon: MessageSquare, label: "Inbox · Obrolan" },
              { href: "/pipeline", icon: TrendingUp, label: "Riset Prospek / Pipeline" },
              { href: "/cadences", icon: ArrowRight, label: "Cadence" },
              { href: "/reports", icon: TrendingUp, label: "Reports" },
            ].map((l) => {
              const Icon = l.icon;
              return (
                <Link key={l.href} href={l.href} className="group block">
                  <Card className="transition hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex items-center gap-2.5 p-3 text-sm">
                      <Icon className="h-4 w-4 text-muted-foreground" /> {l.label}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
          Flow: <b className="text-foreground/70">Setup (produk → market-fit B2B/B2C)</b> →{" "}
          <b className="text-foreground/70">Discovery / Enrichment</b> isi kontak →{" "}
          <b className="text-foreground/70">kontak ter-segmentasi B2C / B2B</b> →{" "}
          <b className="text-foreground/70">Sales Script</b> →{" "}
          <b className="text-foreground/70">Eksekusi obrolan</b> → Pipeline.
        </p>
      </div>
    </div>
  );
}
