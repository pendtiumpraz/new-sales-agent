"use client";

// Pengayaan Data (Enrichment) — Module 5 FRONTEND (Sainskerta Loop Phase 04). Wired
// to the NEW M5 enrichment backend (NO mock data). Two JS-switched section tabs.
// Discovery (finding leads) now lives at /contacts/discovery — from there, saved
// leads land in this page's Enrichment queue.
//
//   (1) ENRICHMENT — the queue of raw contacts (GET /api/enrichment). Run enrich
//       (POST /api/enrichment/[id]/run · before/after fields), AUTO classify
//       B2C/B2B + fit score (POST /api/enrichment/[id]/classify → badge + score),
//       and "Push ke Contacts" (POST /api/enrichment/[id]/push). A right drawer
//       shows the before/after enrich diff + classification override.
//   (2) RIWAYAT — the discovery run history (GET /api/discovery/jobs) with
//       soft-delete/restore/purge of past runs.
//
// Soft-delete / restore / purge for enrichment records (a Sampah / trash view per
// tab). Every band has loading + empty + error states. Lives in the (app) shell.
// NO DB mutations beyond calling the existing endpoints.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Loader2,
  Radar,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureGuide } from "@/components/shared/feature-guide";
import { FEATURE_GUIDES } from "@/lib/feature-guides";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";

// ── API envelope (NEW M5 backend — { ok, data }) ─────────────────────────────

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

/** Row from GET /api/discovery/jobs (modules/enrichment · discovery_job). */
interface DiscoveryJobRow {
  id: string;
  workspaceId: string | null;
  query: string;
  channel: string;
  source: string | null;
  status: string; // pending|running|done|error
  posture: string;
  origin: string | null;
  resultsCount: number;
  companiesCreated: number; // NEW company nodes this run produced (0051)
  contactsCreated: number; // NEW contact nodes this run produced (0051)
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Row from GET /api/enrichment (modules/enrichment · enrichment_record). */
interface EnrichmentRecordRow {
  id: string;
  contactId: string | null;
  workspaceId: string | null;
  resultId: string | null;
  fields: Record<string, unknown>;
  source: string | null;
  classification: string; // b2c|b2b|unknown
  fitScore: number | null; // 0..1
  fitReason: string | null;
  status: string; // queued|running|enriched|failed
  error: string | null;
  pushedContactId: string | null;
  pushedAt: string | null;
  enrichedAt: string | null;
  classifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type SectionTab = "enrichment" | "history";
type DiscoveryView = "results" | "trash";
type EnrichView = "queue" | "trash";
type StatusFilter = "all" | "queued" | "running" | "enriched" | "failed";
type SegFilter = "all" | "b2c" | "b2b";

const CHANNELS = [
  { v: "web", label: "AI Orang (SERP)" },
  { v: "linkedin", label: "LinkedIn" },
  { v: "instagram", label: "Instagram" },
  { v: "maps", label: "Maps" },
  { v: "directory", label: "Direktori" },
] as const;

const SEG_BADGE: Record<string, { label: string; style: React.CSSProperties } | null> = {
  b2b: { label: "B2B", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  b2c: { label: "B2C", style: { background: "#E1306C18", color: "#c01f5b" } },
  unknown: null,
};

const RECORD_STATUS_META: Record<
  string,
  { label: string; cls: string; dashed?: boolean; spin?: boolean }
> = {
  queued: { label: "Belum", cls: "border border-dashed border-border text-muted-foreground", dashed: true },
  running: { label: "Jalan", cls: "bg-info/12 text-info", spin: true },
  enriched: { label: "Selesai", cls: "bg-success/15 text-success" },
  failed: { label: "Gagal", cls: "bg-destructive/12 text-destructive" },
};

const JOB_STATUS_META: Record<string, { label: string; cls: string }> = {
  done: { label: "done", cls: "bg-success/15 text-success" },
  running: { label: "running", cls: "bg-info/12 text-info" },
  pending: { label: "pending", cls: "bg-muted text-muted-foreground" },
  error: { label: "error", cls: "bg-destructive/12 text-destructive" },
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

function fitPct(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function fitColor(pct: number): string {
  return pct >= 80 ? "#10B981" : pct >= 65 ? "#F59E0B" : "#EF4444";
}

/** Completeness of a record's enriched fields (X / 6 core fields filled). */
const CORE_FIELDS = ["companyName", "title", "email", "phone", "whatsapp", "socials"] as const;
function completeness(rec: EnrichmentRecordRow): { filled: number; total: number; pct: number } {
  const f = rec.fields ?? {};
  let filled = 0;
  for (const k of CORE_FIELDS) {
    const v = (f as Record<string, unknown>)[k];
    if (k === "socials") {
      if (v && typeof v === "object" && Object.keys(v as object).length > 0) filled++;
    } else if (typeof v === "string" && v.trim()) {
      filled++;
    }
  }
  const total = CORE_FIELDS.length;
  return { filled, total, pct: Math.round((filled / total) * 100) };
}

function recordName(rec: EnrichmentRecordRow): string {
  const f = (rec.fields ?? {}) as Record<string, unknown>;
  const name = f.fullName ?? f.name ?? f.companyName;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "Lead tanpa nama";
}

function recordOrigin(rec: EnrichmentRecordRow): string {
  if (rec.resultId) return "dari Discovery";
  if (rec.contactId) return "dari Contacts";
  return rec.source || "manual";
}

function fmtRelID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const fieldStr = (f: Record<string, unknown>, k: string): string | null => {
  const v = f[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function EnrichmentPage() {
  const qc = useQueryClient();
  const activeWs = useWorkspaceStore((s) => s.active);
  const wsName = activeWs?.name ?? "Workspace";

  const [tab, setTab] = useState<SectionTab>("enrichment");

  // ── live data ──────────────────────────────────────────────────────────────
  const recordsQ = useQuery({
    queryKey: ["m5", "records"],
    queryFn: async () => readJson<EnrichmentRecordRow[]>(await fetch("/api/enrichment")),
    retry: false,
  });
  const jobsQ = useQuery({
    queryKey: ["m5", "jobs"],
    enabled: tab === "history",
    queryFn: async () => readJson<DiscoveryJobRow[]>(await fetch("/api/discovery/jobs")),
    retry: false,
  });

  const records = useMemo(() => recordsQ.data ?? [], [recordsQ.data]);

  const forbidden =
    recordsQ.error instanceof Error && recordsQ.error.message === "forbidden";

  // ── enrichment stat strip ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let b2c = 0;
    let b2b = 0;
    let ready = 0;
    for (const r of records) {
      if (r.classification === "b2c") b2c++;
      else if (r.classification === "b2b") b2b++;
      if (r.status === "enriched") ready++;
    }
    return { queued: records.length, b2c, b2b, ready };
  }, [records]);

  function refreshRecords() {
    qc.invalidateQueries({ queryKey: ["m5", "records"] });
    qc.invalidateQueries({ queryKey: ["m5", "trashedRecords"] });
  }

  return (
    <div>
      <PageHeader
        title="Pengayaan Data"
        description={`Lengkapi & klasifikasi lead, lalu push ke Contacts · Workspace: ${wsName}`}
      >
        <FeatureGuide guide={FEATURE_GUIDES.enrichment} />
        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-warning" />
          Extension: <span className="font-semibold text-foreground/80">Belum terhubung</span>
        </span>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ DISCOVERY MOVED → /contacts/discovery ============ */}
        <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-primary/30 bg-card p-4 shadow-soft">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radar className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Cari lead baru?</p>
            <p className="text-[11px] text-muted-foreground">
              Discovery pindah ke <b className="text-foreground/70">Kontak → Discovery</b>. Lead yang
              kamu simpan dari sana otomatis masuk ke antrian Enrichment di bawah.
            </p>
          </div>
          <Link
            href="/contacts/discovery"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
          >
            Buka Discovery <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* ============ SECTION TABS (JS switch) ============ */}
        <div className="flex items-center gap-1 border-b border-border text-sm">
          <SectionTabButton active={tab === "enrichment"} onClick={() => setTab("enrichment")}>
            Antrian Enrichment
            <CountPill>{recordsQ.isLoading ? "…" : records.length}</CountPill>
          </SectionTabButton>
          <SectionTabButton active={tab === "history"} onClick={() => setTab("history")}>
            Riwayat
          </SectionTabButton>
        </div>

        {/* ===================== PANEL 1 — ENRICHMENT ===================== */}
        {tab === "enrichment" && (
          <EnrichmentPanel
            recordsQ={recordsQ}
            records={records}
            stats={stats}
            forbidden={forbidden}
            workspaceId={activeWs?.id ?? null}
            onRefreshRecords={refreshRecords}
          />
        )}

        {/* ===================== PANEL 2 — RIWAYAT ===================== */}
        {tab === "history" && <HistoryPanel jobsQ={jobsQ} />}
      </div>
    </div>
  );
}

// ═══════════════════════ ENRICHMENT PANEL ═══════════════════════

function EnrichmentPanel({
  recordsQ,
  records,
  stats,
  forbidden,
  workspaceId,
  onRefreshRecords,
}: {
  recordsQ: ReturnType<typeof useQuery<EnrichmentRecordRow[]>>;
  records: EnrichmentRecordRow[];
  stats: { queued: number; b2c: number; b2b: number; ready: number };
  forbidden: boolean;
  workspaceId: string | null;
  onRefreshRecords: () => void;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<EnrichView>("queue");
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [segF, setSegF] = useState<SegFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const active = useMemo(() => records.find((r) => r.id === openId) ?? null, [records, openId]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  const visible = useMemo(
    () =>
      records.filter((r) => {
        const okStatus = statusF === "all" || r.status === statusF;
        const okSeg = segF === "all" || r.classification === segF;
        return okStatus && okSeg;
      }),
    [records, statusF, segF],
  );

  // ── trash query (lazy) ───────────────────────────────────────────────────
  const trashedQ = useQuery({
    queryKey: ["m5", "trashedRecords"],
    enabled: view === "trash",
    queryFn: async () => readJson<EnrichmentRecordRow[]>(await fetch("/api/enrichment/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── mutations ──────────────────────────────────────────────────────────────
  // RUN enrich then AUTO classify (B2C/B2B + fit) in one action — the queue → done flow.
  const enrich = useMutation({
    mutationFn: async (rec: EnrichmentRecordRow) => {
      await readJson(
        await fetch(`/api/enrichment/${rec.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      // AUTO classify (heuristic) right after enrich.
      return readJson<EnrichmentRecordRow>(
        await fetch(`/api/enrichment/${rec.id}/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
    },
    onSuccess: (rec) => {
      const seg = rec.classification === "unknown" ? "belum terklasifikasi" : rec.classification.toUpperCase();
      toast.success(`Enrich selesai · ${seg}${rec.fitScore != null ? ` · fit ${fitPct(rec.fitScore)}` : ""}`);
      onRefreshRecords();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menjalankan enrichment"),
  });

  const reclassify = useMutation({
    mutationFn: async (vars: { id: string; classification: string }) =>
      readJson<EnrichmentRecordRow>(
        await fetch(`/api/enrichment/${vars.id}/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classification: vars.classification }),
        }),
      ),
    onSuccess: (_d, vars) => {
      toast.success(`Klasifikasi diubah ke ${vars.classification.toUpperCase()}`);
      onRefreshRecords();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah klasifikasi"),
  });

  const push = useMutation({
    mutationFn: async (rec: EnrichmentRecordRow) =>
      readJson<{ record: EnrichmentRecordRow; contactId: string }>(
        await fetch(`/api/enrichment/${rec.id}/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        }),
      ),
    onSuccess: () => {
      toast.success("Lead di-push ke Contacts");
      onRefreshRecords();
      qc.invalidateQueries({ queryKey: ["crm", "contacts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal push ke Contacts"),
  });

  const [deleteTarget, setDeleteTarget] = useState<EnrichmentRecordRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<EnrichmentRecordRow | null>(null);

  const softDelete = useMutation({
    mutationFn: async (rec: EnrichmentRecordRow) =>
      readJson(await fetch(`/api/enrichment/${rec.id}`, { method: "DELETE" })),
    onSuccess: (_d, rec) => {
      toast.success(`"${recordName(rec)}" dipindah ke Sampah`);
      setDeleteTarget(null);
      if (openId === rec.id) setOpenId(null);
      onRefreshRecords();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus record");
      setDeleteTarget(null);
    },
  });
  const restore = useMutation({
    mutationFn: async (rec: EnrichmentRecordRow) =>
      readJson(await fetch(`/api/enrichment/${rec.id}/restore`, { method: "PATCH" })),
    onSuccess: (_d, rec) => {
      toast.success(`"${recordName(rec)}" dipulihkan`);
      onRefreshRecords();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memulihkan record"),
  });
  const purge = useMutation({
    mutationFn: async (rec: EnrichmentRecordRow) =>
      readJson(await fetch(`/api/enrichment/${rec.id}?purge=1`, { method: "DELETE" })),
    onSuccess: (_d, rec) => {
      toast.success(`"${recordName(rec)}" dihapus permanen`);
      setPurgeTarget(null);
      onRefreshRecords();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen");
      setPurgeTarget(null);
    },
  });

  const busyId =
    (enrich.isPending && enrich.variables?.id) ||
    (push.isPending && push.variables?.id) ||
    null;

  return (
    <section className="space-y-5">
      {/* STAT STRIP */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Antri enrich" value={recordsQ.isLoading ? null : stats.queued} />
        <StatCard
          label="Diklasifikasi B2C"
          value={recordsQ.isLoading ? null : stats.b2c}
          badge={SEG_BADGE.b2c ?? undefined}
        />
        <StatCard
          label="Diklasifikasi B2B"
          value={recordsQ.isLoading ? null : stats.b2b}
          badge={SEG_BADGE.b2b ?? undefined}
        />
        <StatCard
          label="Siap push ke Contacts"
          value={recordsQ.isLoading ? null : stats.ready}
          badge={{ label: "enriched", style: { background: "hsl(142 71% 45% / .15)", color: "#10B981" } }}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <ViewPill active={view === "queue"} onClick={() => setView("queue")}>
            Antrian
          </ViewPill>
          <ViewPill active={view === "trash"} onClick={() => setView("trash")}>
            <Trash2 className="h-3.5 w-3.5" /> Sampah
            {trashed.length > 0 && view === "trash" && <CountPill>{trashed.length}</CountPill>}
          </ViewPill>

          {view === "queue" && (
            <>
              <span className="h-5 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">Status:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "queued", label: "Belum" },
                    { v: "running", label: "Jalan" },
                    { v: "enriched", label: "Selesai" },
                    { v: "failed", label: "Gagal" },
                  ] as const
                ).map((s) => (
                  <FilterPill key={s.v} active={statusF === s.v} onClick={() => setStatusF(s.v)}>
                    {s.label}
                  </FilterPill>
                ))}
              </div>
              <span className="h-5 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">Segmen:</span>
                {(
                  [
                    { v: "b2c", label: "B2C" },
                    { v: "b2b", label: "B2B" },
                  ] as const
                ).map((s) => (
                  <FilterPill
                    key={s.v}
                    active={segF === s.v}
                    onClick={() => setSegF((cur) => (cur === s.v ? "all" : s.v))}
                  >
                    {s.label}
                  </FilterPill>
                ))}
              </div>
              <span className="ml-auto text-[11px] text-muted-foreground">
                <b className="text-foreground/80">{visible.length}</b> di antrian
              </span>
            </>
          )}
        </div>

        {/* body */}
        {view === "queue" ? (
          recordsQ.isLoading ? (
            <TableLoading />
          ) : recordsQ.isError ? (
            <ErrorState
              className="border-0"
              title={forbidden ? "Tidak punya akses" : "Gagal memuat antrian"}
              description={
                forbidden
                  ? "Akun kamu tidak punya izin baca data (data.read)."
                  : "Tidak bisa mengambil antrian enrichment. Pastikan login & database tersedia."
              }
              onRetry={() => recordsQ.refetch()}
            />
          ) : records.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Sparkles}
              title="Antrian enrichment kosong"
              description="Simpan lead dari Kontak → Discovery untuk mengantrekannya di sini. Tiap lead bisa di-enrich, diklasifikasi B2C/B2B, lalu di-push ke Contacts."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Search}
              title="Tidak ada yang cocok"
              description="Coba ubah filter status / segmen."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Lead (mentah)</th>
                    <th className="px-4 py-3 font-semibold">Kelengkapan data</th>
                    <th className="px-4 py-3 font-semibold">Klasifikasi</th>
                    <th className="px-4 py-3 font-semibold">Skor Fit</th>
                    <th className="px-4 py-3 font-semibold">Status enrich</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((rec) => (
                    <EnrichRow
                      key={rec.id}
                      rec={rec}
                      onOpen={() => setOpenId(rec.id)}
                      onEnrich={() => enrich.mutate(rec)}
                      onPush={() => push.mutate(rec)}
                      onDelete={() => setDeleteTarget(rec)}
                      busy={busyId === rec.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : /* TRASH (records) */ trashedQ.isLoading ? (
          <TableLoading />
        ) : trashedQ.isError ? (
          <ErrorState
            className="border-0"
            title="Gagal memuat sampah"
            description="Tidak bisa mengambil record yang dihapus."
            onRetry={() => trashedQ.refetch()}
          />
        ) : trashed.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={Trash2}
            title="Sampah kosong"
            description="Record enrichment yang kamu hapus akan muncul di sini dan bisa dipulihkan."
          />
        ) : (
          <ul className="divide-y divide-border">
            {trashed.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground/80">{recordName(rec)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    dihapus {fmtRelID(rec.deletedAt ?? null)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore.mutate(rec)}
                  disabled={restore.isPending}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary disabled:opacity-60"
                >
                  <RotateCcw className="h-3 w-3" /> Pulihkan
                </button>
                <button
                  type="button"
                  onClick={() => setPurgeTarget(rec)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" /> Hapus permanen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Klik baris → panel kanan <b className="text-foreground/70">Before / After enrich</b>. Enrich
        mengisi profil, perusahaan/PT, kontak (email/telp/sosmed), lalu{" "}
        <b className="text-foreground/70">klasifikasi B2C/B2B + skor fit</b> otomatis. Tombol{" "}
        <b className="text-foreground/70">Push ke Contacts</b> memindahkan lead ke{" "}
        <Link href="/contacts" className="text-primary hover:underline">
          Contacts
        </Link>
        .
      </p>

      {/* ---- RIGHT DRAWER: before/after ---- */}
      <AppDrawerRaw
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={active ? recordName(active) : "Detail enrichment"}
        widthClassName="w-[420px] max-w-full"
      >
        {active && (
          <EnrichDrawer
            rec={active}
            onClose={() => setOpenId(null)}
            onReclassify={(cls) => reclassify.mutate({ id: active.id, classification: cls })}
            reclassifying={reclassify.isPending}
            onEnrich={() => enrich.mutate(active)}
            enriching={enrich.isPending && enrich.variables?.id === active.id}
            onPush={() => push.mutate(active)}
            pushing={push.isPending && push.variables?.id === active.id}
          />
        )}
      </AppDrawerRaw>

      {/* confirms */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">
              {deleteTarget && recordName(deleteTarget)}
            </span>{" "}
            akan dihapus dari antrian dan dipindah ke <b>Sampah</b>. Kamu masih bisa memulihkannya.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget ? recordName(purgeTarget) : ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
      />
    </section>
  );
}

// ═══════════════════════ HISTORY PANEL ═══════════════════════

function jobLabel(j: DiscoveryJobRow): string {
  return j.query?.trim() || `${j.channel} crawl`;
}

/** Minimal workspace shape for the id→name map (GET /api/workspace). */
interface WorkspaceLite {
  id: string;
  name: string;
}

/**
 * What this run PRODUCED, for the Riwayat row. Ingest flushes report NEW companies +
 * contacts; web-discovery runs (which leave those 0) fall back to the raw candidate
 * count so both job kinds read sensibly.
 */
function jobCounts(j: DiscoveryJobRow): string {
  const parts: string[] = [];
  if (j.companiesCreated > 0) parts.push(`${j.companiesCreated} perusahaan`);
  if (j.contactsCreated > 0) parts.push(`${j.contactsCreated} kontak`);
  if (parts.length === 0) parts.push(`${j.resultsCount} kandidat`);
  return parts.join(" · ");
}

function HistoryPanel({ jobsQ }: { jobsQ: ReturnType<typeof useQuery<DiscoveryJobRow[]>> }) {
  const qc = useQueryClient();
  const [view, setView] = useState<DiscoveryView>("results");
  const jobs = jobsQ.data ?? [];

  // Resolve workspace names for the "Workspace" column (jobs carry only workspaceId).
  const wsQ = useQuery({
    queryKey: ["m2", "workspace", "list"],
    queryFn: async () => readJson<WorkspaceLite[]>(await fetch("/api/workspace")),
    retry: false,
  });
  const wsNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of wsQ.data ?? []) m.set(w.id, w.name);
    return m;
  }, [wsQ.data]);
  const wsName = (id: string | null): string | null =>
    id ? wsNameById.get(id) ?? null : null;

  // ── trash query (lazy) ───────────────────────────────────────────────────
  const trashedQ = useQuery({
    queryKey: ["m5", "trashedJobs"],
    enabled: view === "trash",
    queryFn: async () => readJson<DiscoveryJobRow[]>(await fetch("/api/discovery/jobs/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  function refreshJobs() {
    qc.invalidateQueries({ queryKey: ["m5", "jobs"] });
    qc.invalidateQueries({ queryKey: ["m5", "trashedJobs"] });
    // Soft-delete/restore cascade to the job's results → keep those views fresh too.
    qc.invalidateQueries({ queryKey: ["m5", "results"] });
    qc.invalidateQueries({ queryKey: ["m5", "trashedResults"] });
  }

  // ── soft delete / restore / purge ────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryJobRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DiscoveryJobRow | null>(null);

  const softDelete = useMutation({
    mutationFn: async (j: DiscoveryJobRow) =>
      readJson(await fetch(`/api/discovery/jobs/${j.id}`, { method: "DELETE" })),
    onSuccess: (_d, j) => {
      toast.success(`Riwayat "${jobLabel(j)}" dipindah ke Sampah`);
      setDeleteTarget(null);
      refreshJobs();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus riwayat");
      setDeleteTarget(null);
    },
  });
  const restore = useMutation({
    mutationFn: async (j: DiscoveryJobRow) =>
      readJson(await fetch(`/api/discovery/jobs/${j.id}/restore`, { method: "PATCH" })),
    onSuccess: (_d, j) => {
      toast.success(`Riwayat "${jobLabel(j)}" dipulihkan`);
      refreshJobs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memulihkan riwayat"),
  });
  const purge = useMutation({
    mutationFn: async (j: DiscoveryJobRow) =>
      readJson(await fetch(`/api/discovery/jobs/${j.id}?purge=1`, { method: "DELETE" })),
    onSuccess: (_d, j) => {
      toast.success(`Riwayat "${jobLabel(j)}" dihapus permanen`);
      setPurgeTarget(null);
      refreshJobs();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen");
      setPurgeTarget(null);
    },
  });

  return (
    <section className="space-y-4">
      {/* view switch: riwayat | sampah */}
      <div className="flex items-center gap-1 text-sm">
        <ViewPill active={view === "results"} onClick={() => setView("results")}>
          <Radar className="h-3.5 w-3.5" /> Riwayat
        </ViewPill>
        <ViewPill active={view === "trash"} onClick={() => setView("trash")}>
          <Trash2 className="h-3.5 w-3.5" /> Sampah job
          {trashed.length > 0 && view === "trash" && <CountPill>{trashed.length}</CountPill>}
        </ViewPill>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        {view === "results" ? (
          <>
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Riwayat crawl &amp; enrich</h2>
              <p className="text-[11px] text-muted-foreground">
                Tiap job jalan langsung (tanpa antrian/cron). Hapus memindahkan job &amp; hasilnya ke
                Sampah.
              </p>
            </div>
            {jobsQ.isLoading ? (
              <TableLoading />
            ) : jobsQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat riwayat"
                description="Tidak bisa mengambil riwayat discovery."
                onRetry={() => jobsQ.refetch()}
              />
            ) : jobs.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Radar}
                title="Belum ada riwayat"
                description="Setiap kali kamu menjalankan discovery, run-nya tercatat di sini beserta jumlah kandidat & statusnya."
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {jobs.map((j) => {
                  const meta = JOB_STATUS_META[j.status] ?? JOB_STATUS_META.pending;
                  return (
                    <li
                      key={j.id}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        {j.channel}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <b>{jobLabel(j)}</b>{" "}
                        <span className="text-muted-foreground">
                          · {jobCounts(j)} · {fmtRelID(j.finishedAt ?? j.createdAt)}
                          {wsName(j.workspaceId) ? ` · ${wsName(j.workspaceId)}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(j)}
                        title="Hapus riwayat (ke Sampah)"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          /* ---- TRASH (jobs) ---- */
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5 text-xs">
              <span className="text-muted-foreground">
                Riwayat crawl yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikan job &amp;
                hasilnya, <b>Hapus permanen</b> menghapus selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">{trashed.length} job</span>
            </div>
            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil riwayat yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : trashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title="Sampah kosong"
                description="Riwayat crawl yang kamu hapus akan muncul di sini dan bisa dipulihkan."
              />
            ) : (
              <ul className="divide-y divide-border">
                {trashed.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {j.channel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground/80">{jobLabel(j)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {jobCounts(j)}
                        {wsName(j.workspaceId) ? ` · ${wsName(j.workspaceId)}` : ""} · dihapus{" "}
                        {fmtRelID(j.deletedAt ?? null)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restore.mutate(j)}
                      disabled={restore.isPending}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary disabled:opacity-60"
                    >
                      <RotateCcw className="h-3 w-3" /> Pulihkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurgeTarget(j)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" /> Hapus permanen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* confirms */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            Riwayat crawl{" "}
            <span className="font-medium text-foreground">
              {deleteTarget && jobLabel(deleteTarget)}
            </span>{" "}
            beserta hasilnya akan dipindah ke <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget ? jobLabel(purgeTarget) : ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
      />
    </section>
  );
}

// ───────────────────────── rows ─────────────────────────

function EnrichRow({
  rec,
  onOpen,
  onEnrich,
  onPush,
  onDelete,
  busy,
}: {
  rec: EnrichmentRecordRow;
  onOpen: () => void;
  onEnrich: () => void;
  onPush: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const comp = completeness(rec);
  const pct = fitPct(rec.fitScore);
  const compColor = comp.pct >= 80 ? "bg-success" : comp.pct >= 33 ? "bg-warning" : "bg-destructive";

  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="font-medium">{recordName(rec)}</div>
        <div className="text-[11px] text-muted-foreground">{recordOrigin(rec)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", compColor)} style={{ width: `${comp.pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {comp.filled}/{comp.total}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <ClassificationBadge classification={rec.classification} hinted={rec.classifiedAt == null} />
      </td>
      <td className="px-4 py-3">
        {pct == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold"
            style={{ background: `${fitColor(pct)}26`, color: fitColor(pct) }}
          >
            {pct}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <RecordStatusChip status={rec.status} />
      </td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        {rec.status === "enriched" ? (
          <button
            type="button"
            onClick={onPush}
            disabled={busy || !!rec.pushedContactId}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            {rec.pushedContactId ? "Terpush" : "Push"}
          </button>
        ) : rec.status === "running" ? (
          <button
            type="button"
            disabled
            className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-border px-3 text-[11px] font-medium text-muted-foreground/50"
          >
            Push
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnrich}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {rec.status === "failed" ? "Coba lagi" : "Enrich"}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          title="Hapus (ke Sampah)"
          className="ml-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ───────────────────────── drawer ─────────────────────────

function EnrichDrawer({
  rec,
  onClose,
  onReclassify,
  reclassifying,
  onEnrich,
  enriching,
  onPush,
  pushing,
}: {
  rec: EnrichmentRecordRow;
  onClose: () => void;
  onReclassify: (cls: string) => void;
  reclassifying: boolean;
  onEnrich: () => void;
  enriching: boolean;
  onPush: () => void;
  pushing: boolean;
}) {
  const f = (rec.fields ?? {}) as Record<string, unknown>;
  const pct = fitPct(rec.fitScore);
  const socials = (f.socials as Record<string, string> | undefined) ?? null;

  // "Before" = the raw fields; "After" = filled-in once enriched. We mark a field
  // as newly-filled (✦) when the record is enriched and the field is present.
  const isEnriched = rec.status === "enriched";
  const rows: { label: string; value: string | null }[] = [
    { label: "Nama", value: fieldStr(f, "fullName") ?? fieldStr(f, "name") },
    { label: "Perusahaan", value: fieldStr(f, "companyName") },
    { label: "Email", value: fieldStr(f, "email") },
    { label: "Telp / WA", value: fieldStr(f, "whatsapp") ?? fieldStr(f, "phone") },
  ];

  return (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">{recordName(rec)}</h2>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Detail enrich · <RecordStatusChip status={rec.status} small />
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* (A) klasifikasi + fit */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Klasifikasi otomatis</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-tertiary" /> AI · bisa override
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { v: "b2b", label: "B2B" },
                { v: "b2c", label: "B2C" },
                { v: "unknown", label: "Belum" },
              ] as const
            ).map((s) => {
              const on = rec.classification === s.v;
              return (
                <button
                  key={s.v}
                  type="button"
                  disabled={reclassifying || on}
                  onClick={() => onReclassify(s.v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-60",
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
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-[12px] font-medium text-foreground/70">Skor fit produk</span>
            <span
              className="shrink-0 text-[13px] font-bold"
              style={{ color: pct == null ? undefined : fitColor(pct) }}
            >
              {pct ?? "—"}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${pct ?? 0}%`, background: pct == null ? "transparent" : fitColor(pct) }}
              />
            </div>
          </div>
          {rec.fitReason && (
            <p className="rounded-lg border border-border bg-accent/60 p-2.5 text-[11px] leading-relaxed text-foreground/80">
              <span className="font-semibold text-foreground">Ringkasan AI:</span> {rec.fitReason}
            </p>
          )}
        </div>

        {/* (B) before / after */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Before / After enrich
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Before (mentah)
              </p>
              <div className="space-y-2 text-[11px]">
                {rows.map((r) => (
                  <div key={r.label}>
                    <span className="text-muted-foreground">{r.label}</span>
                    <div className="mt-0.5 italic text-muted-foreground/50">
                      {r.label === "Nama" ? r.value || "—" : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg border p-3",
                isEnriched ? "border-success/40 bg-success/5" : "border-border",
              )}
            >
              <p
                className={cn(
                  "mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
                  isEnriched ? "text-success" : "text-muted-foreground",
                )}
              >
                After {isEnriched && <Sparkles className="h-3 w-3" />}
              </p>
              <div className="space-y-2 text-[11px]">
                {rows.map((r) => (
                  <div key={r.label}>
                    <span className="text-muted-foreground">{r.label}</span>
                    <div className="mt-0.5 truncate font-medium">
                      {r.value ? (
                        <>
                          {r.value} {isEnriched && r.label !== "Nama" && <span className="text-success">✦</span>}
                        </>
                      ) : (
                        <span className="italic text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </div>
                ))}
                {socials && Object.keys(socials).length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Sosmed</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {Object.keys(socials).map((k) => (
                        <span key={k} className="rounded border border-border bg-card px-1.5 py-0.5 text-[9px]">
                          {k} {isEnriched && <span className="text-success">✦</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Field baru ditandai <b className="text-success">✦</b>; tiap field punya{" "}
            <b>sumber</b> + waktu capture.
          </p>
        </div>

        {/* (C) sumber */}
        {rec.source && (
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sumber
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {rec.source}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
        <Button variant="outline" size="sm" onClick={onEnrich} disabled={enriching}>
          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {rec.status === "enriched" ? "Enrich ulang" : "Enrich"}
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={onPush}
          disabled={pushing || rec.status !== "enriched" || !!rec.pushedContactId}
        >
          {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {rec.pushedContactId ? "Sudah di Contacts" : "Push ke Contacts"}
        </Button>
      </div>
    </>
  );
}

// ───────────────────────── small UI ─────────────────────────

function SectionTabButton({
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
        "relative px-4 py-2.5 transition-colors",
        active ? "font-semibold text-primary" : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1.5">{children}</span>
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

function ViewPill({
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
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors",
        active
          ? "bg-primary font-semibold text-primary-foreground"
          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({
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
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs transition-colors",
        active
          ? "bg-primary font-semibold text-primary-foreground"
          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-secondary-foreground">
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: number | null;
  badge?: { label: string; style: React.CSSProperties };
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {badge && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={badge.style}>
            {badge.label}
          </span>
        )}
        {value == null ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <span className="text-2xl font-bold tabular-nums">{value.toLocaleString("id-ID")}</span>
        )}
      </div>
    </div>
  );
}

function ClassificationBadge({
  classification,
  hinted,
}: {
  classification: string;
  hinted?: boolean;
}) {
  const meta = SEG_BADGE[classification];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        belum
      </span>
    );
  }
  return (
    <div>
      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
        {meta.label}
      </span>
      {hinted && <span className="mt-0.5 block text-[9px] text-muted-foreground">tebakan awal</span>}
    </div>
  );
}

function RecordStatusChip({ status, small }: { status: string; small?: boolean }) {
  const meta = RECORD_STATUS_META[status] ?? RECORD_STATUS_META.queued;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
        small ? "text-[10px]" : "text-[11px]",
        meta.cls,
      )}
    >
      {meta.spin && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "enriched" && <Check className="h-3 w-3" />}
      {status === "failed" && <X className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

