"use client";

// Kontak & Lead (CRM) — Module 3 FRONTEND (Sainskerta Loop Phase 04). Wired to the
// NEW M3 / CRM backend (no mock data): GET /api/contacts (list, ContactRow[]),
// GET /api/companies (resolve company names — contacts only carry companyId),
// GET /api/contacts/trashed (the Sampah view), GET /api/activities?subjectType=
// contact&subjectId= (drawer timeline) + GET /api/deals?contactId= (related deals).
// Mutations: PATCH /api/contacts/[id] (enrich → set enrichment_status / fit /
// segment override), DELETE /api/contacts/[id] (SOFT delete), PATCH
// /api/contacts/[id]/restore (un-trash), DELETE /api/contacts/[id]?purge=1 (HARD
// delete). Faithful to mockups/contacts.html (Coral Sunset): stat strip, segmented
// segment filter (Semua / B2C / B2B / Belum) + enrichment pills + source select +
// search, table (Nama · Perusahaan · Segment badge · Skor Fit · Status Enrichment ·
// Sumber · Aksi), and a right drawer (klasifikasi segmen + skor fit + profil + data
// enrichment + tabs Aktivitas/Deal/Catatan + Enrich). Every band has loading +
// empty + error states. Lives in the (app) shell (inside the Kontak cluster subnav).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M3 / CRM backend — { ok, data }) ──────────

interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

/** Row from GET /api/contacts (modules/crm · contact). fit_score is 0..1. */
interface ContactRow {
  id: string;
  companyId: string | null;
  workspaceId: string | null;
  fullName: string;
  title: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  location: string | null;
  channelPreference: string | null;
  socials: Record<string, string> | null;
  tags: string[];
  segment: string; // b2c | b2b | unknown
  enrichmentStatus: string; // none | pending | enriched | failed
  fitScore: number | null; // 0..1
  fitReason: string | null;
  lifecycleStage: string;
  ownerUserId: string | null;
  consentStatus: string; // unknown | legitimate_interest | opted_in | opted_out
  source: string | null;
  lastActivityAt: string | null;
  avatarColor: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/contacts/trashed
}

/** Row from GET /api/companies (modules/crm · company_v2). */
interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  socials: Record<string, string> | null;
}

/** Row from GET /api/activities?subjectType=contact&subjectId= (modules/crm · activity). */
interface ActivityRow {
  id: string;
  subjectType: string;
  subjectId: string;
  type: string;
  title: string | null;
  body: string | null;
  createdAt: string;
}

/** Row from GET /api/deals?contactId= (modules/crm · deal). */
interface DealRow {
  id: string;
  name: string;
  value: number;
  currency: string;
  status: string;
  stageId: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type SegFilter = "all" | "b2c" | "b2b" | "unknown";
type EnrFilter = "all" | "enriched" | "pending";
type MainTab = "aktif" | "sampah";
type DrawerTab = "act" | "deal" | "note";

const SEG_BADGE: Record<string, { label: string; style: React.CSSProperties } | null> = {
  b2b: { label: "B2B", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  b2c: { label: "B2C", style: { background: "#E1306C18", color: "#c01f5b" } },
  unknown: null,
};

const SOURCE_DOT: Record<string, string> = {
  Crawl: "#3B82F6",
  Hunter: "#8B5CF6",
  Impor: "#6B7280",
  "Impor CSV": "#6B7280",
  Web: "#0D9488",
};

const CONSENT_META: Record<string, { label: string; cls: string }> = {
  opted_in: { label: "consent: opt-in", cls: "bg-success/12 text-success" },
  legitimate_interest: { label: "consent: legitimate interest", cls: "bg-info/12 text-info" },
  opted_out: { label: "consent: opt-out", cls: "bg-destructive/10 text-destructive" },
  unknown: { label: "consent: unknown", cls: "bg-muted text-muted-foreground" },
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

/** fit_score 0..1 → 0..100 (or null). */
function fitPct(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function fitColor(pct: number): string {
  return pct >= 80 ? "#10B981" : pct >= 65 ? "#F59E0B" : "#EF4444";
}

/** Normalise the free-text `source` into one of the known buckets for the dot/filter. */
function sourceBucket(source: string | null): string {
  if (!source) return "—";
  const s = source.toLowerCase();
  if (s.includes("crawl")) return "Crawl";
  if (s.includes("hunter")) return "Hunter";
  if (s.includes("impor") || s.includes("import") || s.includes("csv")) return "Impor";
  if (s.includes("web")) return "Web";
  return source;
}

function fmtRelID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Baru saja";
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtIDR(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("id-ID")}`;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ContactsCrmPage() {
  const qc = useQueryClient();

  // live contacts + companies (companies resolve the companyId → name join)
  const contactsQ = useQuery({
    queryKey: ["crm", "contacts", "list"],
    queryFn: async () => readJson<ContactRow[]>(await fetch("/api/contacts")),
    retry: false,
  });
  const companiesQ = useQuery({
    queryKey: ["crm", "companies", "list"],
    queryFn: async () => readJson<CompanyRow[]>(await fetch("/api/companies")),
    retry: false,
  });

  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const companyById = useMemo(() => {
    const m: Record<string, CompanyRow> = {};
    for (const c of companiesQ.data ?? []) m[c.id] = c;
    return m;
  }, [companiesQ.data]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  // Trashed contacts — lazy (only fetched when the Sampah tab opens), kept warm.
  const trashedQ = useQuery({
    queryKey: ["crm", "contacts", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<ContactRow[]>(await fetch("/api/contacts/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [segF, setSegF] = useState<SegFilter>("all");
  const [enrF, setEnrF] = useState<EnrFilter>("all");
  const [srcF, setSrcF] = useState<string>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    let b2c = 0;
    let b2b = 0;
    let notEnriched = 0;
    for (const c of contacts) {
      if (c.segment === "b2c") b2c++;
      else if (c.segment === "b2b") b2b++;
      if (c.enrichmentStatus !== "enriched") notEnriched++;
    }
    return { total: contacts.length, b2c, b2b, notEnriched };
  }, [contacts]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      const b = sourceBucket(c.source);
      if (b !== "—") set.add(b);
    }
    return Array.from(set).sort();
  }, [contacts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      const company = c.companyId ? companyById[c.companyId]?.name ?? "" : "";
      const enrMatch =
        enrF === "all" ||
        (enrF === "enriched" && c.enrichmentStatus === "enriched") ||
        (enrF === "pending" && c.enrichmentStatus !== "enriched");
      const okSeg = segF === "all" || c.segment === segF;
      const okSrc = srcF === "all" || sourceBucket(c.source) === srcF;
      const okSearch =
        !q || c.fullName.toLowerCase().includes(q) || company.toLowerCase().includes(q);
      return okSeg && enrMatch && okSrc && okSearch;
    });
  }, [contacts, companyById, segF, enrF, srcF, search]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((c) => {
      const company = c.companyId ? companyById[c.companyId]?.name ?? "" : "";
      return c.fullName.toLowerCase().includes(q) || company.toLowerCase().includes(q);
    });
  }, [trashed, companyById, search]);

  // ── drawer ───────────────────────────────────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("act");
  const active = useMemo(
    () => contacts.find((c) => c.id === openId) ?? null,
    [contacts, openId],
  );

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // Drawer satellites — the related activities + deals for the open contact.
  const activitiesQ = useQuery({
    queryKey: ["crm", "activities", openId],
    enabled: !!openId && drawerTab === "act",
    queryFn: async () =>
      readJson<ActivityRow[]>(
        await fetch(`/api/activities?subjectType=contact&subjectId=${openId}`),
      ),
    retry: false,
  });
  const dealsQ = useQuery({
    queryKey: ["crm", "deals", openId],
    enabled: !!openId && drawerTab === "deal",
    queryFn: async () => readJson<DealRow[]>(await fetch(`/api/deals?contactId=${openId}`)),
    retry: false,
  });

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ContactRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ContactRow | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["crm", "contacts"] });
  }

  // Enrich = PATCH the contact's enrichment_status → enriched (+ a segment override
  // when still unknown). No fabricated values; this flips the lifecycle field the
  // backend owns. fit_score is left to the real enrichment job, not invented here.
  const enrich = useMutation({
    mutationFn: async (vars: { id: string; segment?: string }) =>
      readJson<ContactRow>(
        await fetch(`/api/contacts/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrichmentStatus: "enriched",
            ...(vars.segment ? { segment: vars.segment } : {}),
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Kontak ter-enrich — status diperbarui");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menjalankan enrichment"),
  });

  // Re-classify segment from the drawer (AI klasifikasi · bisa override).
  const reclassify = useMutation({
    mutationFn: async (vars: { id: string; segment: string }) =>
      readJson<ContactRow>(
        await fetch(`/api/contacts/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segment: vars.segment }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(`Segmen diubah ke ${vars.segment.toUpperCase()}`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah segmen"),
  });

  // SOFT delete — moves an active contact into "Sampah" (deleted_at stamped).
  const softDelete = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/contacts/${c.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
      if (openId === c.id) setOpenId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus kontak");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the contact to the active tab.
  const restore = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<ContactRow>(await fetch(`/api/contacts/${c.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan kontak");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent removal from trash. Irreversible.
  const purge = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/contacts/${c.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = contactsQ.isError;
  const forbidden = contactsQ.error instanceof Error && contactsQ.error.message === "forbidden";

  return (
    <div>
      <PageHeader
        title="Kontak & Lead"
        description="Semua kontak/lead yang sudah diakuisisi — dengan segmentasi B2C vs B2B & status pengayaan data. Klik baris untuk lihat profil + data enrichment."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts/discovery">
            <Upload className="h-4 w-4" /> Impor / Discovery
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/contacts/discovery">
            <Plus className="h-4 w-4" /> Cari lead baru
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total kontak"
            value={contactsQ.isLoading ? null : stats.total}
            hint="di workspace ini"
          />
          <StatCard
            label="Segmen B2C"
            value={contactsQ.isLoading ? null : stats.b2c}
            hint="perorangan / customer"
            badge={SEG_BADGE.b2c ?? undefined}
          />
          <StatCard
            label="Segmen B2B"
            value={contactsQ.isLoading ? null : stats.b2b}
            hint="partner / perusahaan"
            badge={SEG_BADGE.b2b ?? undefined}
          />
          <StatCard
            label="Belum di-enrich"
            value={contactsQ.isLoading ? null : stats.notEnriched}
            hint="butuh pengayaan data"
            valueClass="text-warning"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Users className="h-4 w-4" />
            Aktif
            <CountPill>{contacts.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashed.length > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashed.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "aktif" ? (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR: segmented control + enrichment pills + source + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {/* (1) SEGMENT segmented control */}
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "b2c", label: "B2C" },
                    { v: "b2b", label: "B2B" },
                    { v: "unknown", label: "Belum diklasifikasi" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSegF(s.v)}
                    className={cn(
                      "h-7 rounded-md px-3.5 text-xs transition-colors",
                      segF === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              {/* (2) ENRICHMENT pills */}
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Enrichment:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "enriched", label: "Enriched" },
                    { v: "pending", label: "Belum" },
                  ] as const
                ).map((e) => (
                  <button
                    key={e.v}
                    type="button"
                    onClick={() => setEnrF(e.v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      enrF === e.v
                        ? "bg-foreground font-semibold text-background"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              {/* (3) SOURCE select */}
              <div className="relative">
                <select
                  value={srcF}
                  onChange={(e) => setSrcF(e.target.value)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Sumber: Semua</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              {/* (4) inline search */}
              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter nama / perusahaan…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {contactsQ.isLoading || companiesQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat kontak"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar kontak. Pastikan kamu login & database tersedia."
                }
                onRetry={() => contactsQ.refetch()}
              />
            ) : contacts.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Users}
                title="Belum ada kontak"
                description="Kontak muncul di sini setelah kamu menjalankan Discovery / Enrichment. Saat itu kontak otomatis tersegmentasi B2C / B2B."
                action={
                  <Button asChild size="sm">
                    <Link href="/contacts/discovery">
                      <Plus className="h-4 w-4" /> Cari lead baru
                    </Link>
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada kontak yang cocok"
                description="Coba ubah filter segmen / status enrichment / sumber, atau kata kunci."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Perusahaan</th>
                      <th className="px-3 py-3 font-semibold">Segment</th>
                      <th className="w-40 px-3 py-3 font-semibold">Skor Fit</th>
                      <th className="px-3 py-3 font-semibold">Status Enrichment</th>
                      <th className="px-3 py-3 font-semibold">Sumber</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((c) => (
                      <ContactTableRow
                        key={c.id}
                        contact={c}
                        company={c.companyId ? companyById[c.companyId] ?? null : null}
                        onOpen={() => {
                          setOpenId(c.id);
                          setDrawerTab("act");
                        }}
                        onEnrich={() => enrich.mutate({ id: c.id })}
                        onDelete={() => setDeleteTarget(c)}
                        enriching={enrich.isPending && enrich.variables?.id === c.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          /* ============ SAMPAH (trash) view ============ */
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                Kontak yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif, <b>Hapus permanen</b> menghapus selamanya (cascade ke deal & aktivitas).
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} kontak
              </span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil kontak yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Kontak yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Perusahaan</th>
                      <th className="px-3 py-3 font-semibold">Segment</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((c) => (
                      <TrashedTableRow
                        key={c.id}
                        contact={c}
                        company={c.companyId ? companyById[c.companyId] ?? null : null}
                        onRestore={() => setRestoreTarget(c)}
                        onPurge={() => {
                          setPurgeTarget(c);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Badge segmen:{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={SEG_BADGE.b2c?.style}
          >
            B2C
          </span>{" "}
          (perorangan) ·{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={SEG_BADGE.b2b?.style}
          >
            B2B
          </span>{" "}
          (perusahaan) ·{" "}
          <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            belum
          </span>{" "}
          diklasifikasi. Klik baris → panel kanan (profil + data enrichment + klasifikasi +
          Enrich).
        </p>
      </div>

      {/* ===================== RIGHT DRAWER ===================== */}
      <AppDrawerRaw
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={active?.fullName ?? "Detail kontak"}
        widthClassName="w-[400px] max-w-full"
      >
        {active && (
          <>
            {/* header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-xs font-semibold text-primary">
                  {initialsOf(active.fullName)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-foreground">{active.fullName}</h2>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {active.title || "Perorangan"}
                    {active.companyId && companyById[active.companyId]
                      ? ` · ${companyById[active.companyId].name}`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* (A) KLASIFIKASI SEGMEN — editable */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">Segmen</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-tertiary" /> klasifikasi AI · bisa override
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { v: "b2b", label: "B2B Partner" },
                      { v: "b2c", label: "B2C Customer" },
                      { v: "unknown", label: "Belum" },
                    ] as const
                  ).map((s) => {
                    const on = active.segment === s.v;
                    return (
                      <button
                        key={s.v}
                        type="button"
                        disabled={reclassify.isPending}
                        onClick={() =>
                          !on && reclassify.mutate({ id: active.id, segment: s.v })
                        }
                        className={cn(
                          "h-7 rounded-full px-3 text-xs transition-colors disabled:opacity-60",
                          on
                            ? "font-semibold"
                            : s.v === "unknown"
                              ? "border border-dashed border-border bg-card font-medium text-muted-foreground hover:border-primary/40"
                              : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                        )}
                        style={on && SEG_BADGE[s.v] ? SEG_BADGE[s.v]!.style : undefined}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* (B) SKOR FIT */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">Skor Fit produk</span>
                  {(() => {
                    const pct = fitPct(active.fitScore);
                    return pct == null ? (
                      <span className="text-sm font-bold text-muted-foreground">—</span>
                    ) : (
                      <span className="text-sm font-bold" style={{ color: fitColor(pct) }}>
                        {pct}
                      </span>
                    );
                  })()}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  {(() => {
                    const pct = fitPct(active.fitScore);
                    return (
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${pct ?? 0}%`,
                          background: pct == null ? "transparent" : fitColor(pct),
                        }}
                      />
                    );
                  })()}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Kecocokan dengan produk workspace — dihitung AI dari profil &amp; sinyal niat.
                </p>
                {active.fitReason && (
                  <p className="mt-2 rounded-lg border border-border bg-accent/60 p-2.5 text-[11px] leading-relaxed text-foreground/80">
                    <span className="font-semibold text-foreground">Ringkasan AI:</span>{" "}
                    {active.fitReason}
                  </p>
                )}
              </div>

              {/* (C) PROFIL */}
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Profil
                </h3>
                <div className="space-y-2 text-[13px]">
                  <ProfileRow label="Jabatan" value={active.title} />
                  <ProfileRow
                    label="Perusahaan"
                    value={
                      active.companyId ? companyById[active.companyId]?.name ?? "—" : "— (perorangan)"
                    }
                  />
                  <ProfileRow label="Departemen" value={active.department} />
                  <ProfileRow label="Senioritas" value={active.seniority} />
                  <ProfileRow label="Lokasi" value={active.location || active.city} />
                </div>
              </div>

              {/* (D) DATA ENRICHMENT */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Data Enrichment
                  </h3>
                  {active.enrichmentStatus === "enriched" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                      <Check className="h-3 w-3" /> Enriched
                    </span>
                  ) : active.enrichmentStatus === "failed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      Gagal
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 py-0.5 text-[10px] font-medium text-warning">
                      {active.enrichmentStatus === "pending" ? "Sedang diproses" : "Belum di-enrich"}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <EnrichField
                    color="#6366F1"
                    label="Email"
                    value={active.email}
                    source={sourceBucket(active.source)}
                    consent={active.consentStatus}
                  />
                  <EnrichField
                    color="#25D366"
                    label="Telepon / WhatsApp"
                    value={active.whatsapp || active.phone}
                    source={sourceBucket(active.source)}
                    consent={active.consentStatus}
                  />
                  {/* website / socials */}
                  {active.socials && Object.keys(active.socials).length > 0 ? (
                    <div className="rounded-lg border border-border p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          Website / Sosmed
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          sumber:{" "}
                          <span className="font-medium text-foreground/70">
                            {sourceBucket(active.source)}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(active.socials).map(([k, v]) => (
                          <a
                            key={k}
                            href={v}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-secondary"
                          >
                            {k}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        Website · Sosmed · Departemen · Senioritas
                      </span>{" "}
                      — <span className="italic">belum terisi, jalankan Enrich</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Tiap field menampilkan <b>sumber</b> (Crawl / Hunter / Impor / Web) + status
                  consent.
                </p>
              </div>

              {/* (E) TABS sekunder */}
              <div>
                <div className="flex gap-1 border-b border-border text-xs">
                  {(
                    [
                      { v: "act", label: "Aktivitas" },
                      { v: "deal", label: "Deal terkait" },
                      { v: "note", label: "Catatan" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.v}
                      onClick={() => setDrawerTab(t.v)}
                      className={cn(
                        "border-b-2 px-2.5 py-2 transition-colors",
                        drawerTab === t.v
                          ? "border-primary font-semibold text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="pt-3">
                  {drawerTab === "act" && (
                    <DrawerActivities
                      loading={activitiesQ.isLoading}
                      error={activitiesQ.isError}
                      rows={activitiesQ.data ?? []}
                      onRetry={() => activitiesQ.refetch()}
                    />
                  )}
                  {drawerTab === "deal" && (
                    <DrawerDeals
                      loading={dealsQ.isLoading}
                      error={dealsQ.isError}
                      rows={dealsQ.data ?? []}
                      onRetry={() => dealsQ.refetch()}
                    />
                  )}
                  {drawerTab === "note" && (
                    <textarea
                      rows={3}
                      placeholder="Tambah catatan internal… (tersimpan saat modul Catatan aktif)"
                      className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/inbox">
                  <MessageSquare className="h-4 w-4" style={{ color: "#25D366" }} /> Mulai chat
                </Link>
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={enrich.isPending}
                onClick={() => enrich.mutate({ id: active.id })}
              >
                <Sparkles className="h-4 w-4" />
                {enrich.isPending
                  ? "Memproses…"
                  : active.enrichmentStatus === "enriched"
                    ? "Enrich ulang"
                    : "Enrich sekarang"}
              </Button>
            </div>
          </>
        )}
      </AppDrawerRaw>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.fullName}</span> akan
            dihapus dan dipindah ke tab <b>Sampah</b> (cascade ke deal &amp; aktivitasnya). Kamu
            masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan kontak?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.fullName}</span> akan
            dikembalikan ke tab <b>Aktif</b> beserta deal &amp; aktivitasnya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.fullName ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.fullName}</span> akan
            dihapus selamanya beserta deal &amp; aktivitasnya.
          </>
        }
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  badge,
  valueClass,
}: {
  label: string;
  value: number | null;
  hint: string;
  badge?: { label: string; style: React.CSSProperties };
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <span className={cn("text-2xl font-bold tabular-nums", valueClass)}>
            {value.toLocaleString("id-ID")}
          </span>
        )}
        {badge && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={badge.style}
          >
            {badge.label}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const meta = SEG_BADGE[segment];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        belum
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function FitCell({ score }: { score: number | null }) {
  const pct = fitPct(score);
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const c = fitColor(pct);
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-[11px] font-bold" style={{ color: c }}>
        {pct}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  );
}

function EnrichmentChip({ status }: { status: string }) {
  if (status === "enriched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
        <Check className="h-3 w-3" /> Enriched
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        Gagal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 py-0.5 text-[11px] font-medium text-warning">
      {status === "pending" ? "Diproses" : "Belum"}
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const bucket = sourceBucket(source);
  if (bucket === "—") return <span className="text-xs text-muted-foreground">—</span>;
  const dot = SOURCE_DOT[bucket] ?? "#6B7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {bucket}
    </span>
  );
}

function ContactTableRow({
  contact,
  company,
  onOpen,
  onEnrich,
  onDelete,
  enriching,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  onOpen: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  enriching: boolean;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors hover:bg-muted/40"
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {initialsOf(contact.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{contact.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact.title || "Perorangan"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm">
        {company ? (
          <span className="text-foreground/80">{company.name}</span>
        ) : (
          <span className="text-muted-foreground">
            — <span className="text-[11px]">(perorangan)</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <SegmentBadge segment={contact.segment} />
      </td>
      <td className="px-3 py-3">
        <FitCell score={contact.fitScore} />
      </td>
      <td className="px-3 py-3">
        <EnrichmentChip status={contact.enrichmentStatus} />
      </td>
      <td className="px-3 py-3">
        <SourceBadge source={contact.source} />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {contact.enrichmentStatus === "enriched" ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
            >
              Buka <ChevronRight className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnrich}
              disabled={enriching}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Sparkles className="h-3 w-3" /> {enriching ? "…" : "Enrich"}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Hapus (ke Sampah)"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TrashedTableRow({
  contact,
  company,
  onRestore,
  onPurge,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
            {initialsOf(contact.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground/80">{contact.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact.title || "Perorangan"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-muted-foreground">
        {company ? company.name : "— (perorangan)"}
      </td>
      <td className="px-3 py-3">
        <SegmentBadge segment={contact.segment} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(contact.deletedAt ?? null)}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
          >
            <RotateCcw className="h-3 w-3" /> Pulihkan
          </button>
          <button
            type="button"
            onClick={onPurge}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Hapus permanen
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

function EnrichField({
  color,
  label,
  value,
  source,
  consent,
}: {
  color: string;
  label: string;
  value: string | null;
  source: string;
  consent: string;
}) {
  const consentMeta = CONSENT_META[consent] ?? CONSENT_META.unknown;
  if (!value) {
    return (
      <div className="rounded-lg border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/70">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>{" "}
        — <span className="italic">belum terisi, jalankan Enrich</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          sumber: <span className="font-medium text-foreground/70">{source}</span>
        </span>
      </div>
      <p className="select-all text-[13px] font-medium text-foreground">{value}</p>
      <span
        className={cn(
          "mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          consentMeta.cls,
        )}
      >
        {consentMeta.label}
      </span>
    </div>
  );
}

function DrawerActivities({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: ActivityRow[];
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        className="border-0 py-6"
        title="Gagal memuat aktivitas"
        description="Tidak bisa mengambil timeline kontak ini."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-muted-foreground">
        Belum ada aktivitas. Riwayat email, chat, & perubahan tahap muncul di sini.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {rows.map((a) => (
        <div key={a.id} className="flex gap-2.5 text-[12px]">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary" />
          <div className="min-w-0">
            <p className="text-foreground">{a.title || a.body || a.type}</p>
            <p className="text-[10px] text-muted-foreground">
              {fmtRelID(a.createdAt)} · {a.type}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerDeals({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: DealRow[];
  onRetry: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-14 w-full rounded-lg" />;
  }
  if (error) {
    return (
      <ErrorState
        className="border-0 py-6"
        title="Gagal memuat deal"
        description="Tidak bisa mengambil deal terkait kontak ini."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-muted-foreground">
        Belum ada deal terkait. Buat deal dari Pipeline untuk menautkannya ke kontak ini.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((d) => (
        <Link
          key={d.id}
          href="/pipeline"
          className="flex items-center justify-between rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40"
        >
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-foreground">{d.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {d.status} · {fmtIDR(d.value, d.currency)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
