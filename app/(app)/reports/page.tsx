"use client";

// Laporan & Analitik — Module 9 FRONTEND (Sainskerta Loop Phase 04, FINAL
// secondary tick). Wired to the NEW M9 reports backend (no mock data): a
// read-only dashboard that AGGREGATES over the existing rebuild tables, plus
// CRUD for the thin `saved_report` config. Wires to:
//   GET    /api/reports/overview              (one-shot DashboardOverview — KPI totals + every roll-up)
//   GET    /api/reports/saved                 (list saved reports — SavedReportRow[])
//   GET    /api/reports/saved/trashed         (Sampah view)
//   POST   /api/reports/saved                 (save a report config)
//   DELETE /api/reports/saved/[id]            (SOFT delete → Sampah)
//   PATCH  /api/reports/saved/[id]/restore    (un-trash)
//   DELETE /api/reports/saved/[id]/purge      (HARD delete — irreversible)
// The numbers are computed LIVE by the service against crm / inbox / sales /
// ecommerce / field tables — the page never fabricates a metric. Charts are
// styled divs/bars (no chart lib). Matches the established design system
// (Coral Sunset, the (app) shell): stat strip, cards, list table, confirm
// modals. Every band has loading + empty + error states.

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  Coins,
  Flame,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Star,
  Target,
  Trash2,
  TrendingUp,
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

// ── API envelope + shapes (NEW M9 reports backend — { ok, data }) ─────────────

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

/** Row from the deals-by-stage roll-up (modules/reports · service). */
interface DealsByStageRow {
  stageId: string | null;
  stageName: string;
  sort: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  value: number;
}

/** GET /api/reports/overview → the composed dashboard overview. */
interface DashboardOverview {
  contactsBySegment: { segment: string; count: number }[];
  contactsByLifecycle: { stage: string; count: number }[];
  dealsByStatus: { status: string; count: number; value: number }[];
  dealsByStage: DealsByStageRow[];
  conversationsByStatus: { status: string; count: number }[];
  closingReadinessByBand: { band: string; count: number }[];
  ordersByChannel: { channel: string; count: number; total: number }[];
  visitsByStatus: { status: string; count: number }[];
  totals: {
    contacts: number;
    openDeals: number;
    openDealValue: number;
    wonDeals: number;
    wonValue: number;
    conversations: number;
    orders: number;
    orderRevenue: number;
    visits: number;
  };
}

/** Row from GET /api/reports/saved (modules/reports · saved_report). */
interface SavedReportRow {
  id: string;
  tenantId: string;
  ownerUserId: string | null;
  workspaceId: string | null;
  name: string;
  kind: string;
  description: string | null;
  config: Record<string, unknown> | null;
  scope: string; // private | tenant
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "ringkasan" | "tersimpan" | "sampah";

/** The aggregates a saved report can pin to (mirrors the backend REPORT_KINDS). */
const REPORT_KINDS = [
  { value: "overview", label: "Ringkasan menyeluruh" },
  { value: "contacts_by_segment", label: "Kontak per segmen" },
  { value: "deals_by_stage", label: "Deal per tahap" },
  { value: "pipeline_overview", label: "Ringkasan pipeline" },
  { value: "closing_funnel", label: "Funnel closing" },
  { value: "marketplace_sales", label: "Penjualan marketplace" },
  { value: "field_activity", label: "Aktivitas lapangan" },
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_KINDS.map((k) => [k.value, k.label]),
);

const SEGMENT_META: Record<string, { label: string; color: string }> = {
  b2c: { label: "B2C (perorangan)", color: "#E1306C" },
  b2b: { label: "B2B (perusahaan)", color: "#0D9488" },
  unknown: { label: "Belum diklasifikasi", color: "#9CA3AF" },
};

const LIFECYCLE_META: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "#9CA3AF" },
  mql: { label: "MQL", color: "#3B82F6" },
  sql: { label: "SQL", color: "#6366F1" },
  customer: { label: "Customer", color: "#10B981" },
  churned: { label: "Churned", color: "#EF4444" },
};

const CONV_STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Terbuka", color: "#FB5E3B" },
  snoozed: { label: "Ditunda", color: "#F59E0B" },
  closed: { label: "Selesai", color: "#10B981" },
};

const BAND_META: Record<string, { label: string; color: string }> = {
  hot: { label: "Hot — siap closing", color: "#EF4444" },
  warm: { label: "Warm — dipanaskan", color: "#F59E0B" },
  cold: { label: "Cold — awal", color: "#3B82F6" },
};
const BAND_ORDER = ["hot", "warm", "cold"];

const VISIT_STATUS_META: Record<string, { label: string; color: string }> = {
  planned: { label: "Direncanakan", color: "#3B82F6" },
  in_progress: { label: "Berjalan", color: "#F59E0B" },
  completed: { label: "Selesai", color: "#10B981" },
  cancelled: { label: "Dibatalkan", color: "#9CA3AF" },
  no_show: { label: "Tidak hadir", color: "#EF4444" },
};

const CHANNEL_DOT: Record<string, string> = {
  tokopedia: "#16A34A",
  shopee: "#EE4D2D",
  tiktok: "#111111",
  lazada: "#0F146D",
  other: "#6B7280",
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

function titleCase(s: string): string {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtRelID(iso: string | null | undefined): string {
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

/** Compact IDR — drives the revenue KPI captions. */
function fmtIDR(value: number): string {
  if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (value >= 1e3) return `Rp ${(value / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function num(n: number): string {
  return n.toLocaleString("id-ID");
}

// ── save-report form ──────────────────────────────────────────────────────────

interface SaveForm {
  open: boolean;
  name: string;
  kind: string;
  description: string;
  scope: string;
  isPinned: boolean;
}

const EMPTY_SAVE_FORM: SaveForm = {
  open: false,
  name: "",
  kind: "overview",
  description: "",
  scope: "private",
  isPinned: false,
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  // ── live aggregate overview + saved-report list ──────────────────────────────
  const overviewQ = useQueryOverview();
  const savedQ = useQuerySaved();

  const overview = overviewQ.data ?? null;
  const saved = useMemo(() => savedQ.data ?? [], [savedQ.data]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("ringkasan");

  const trashedQ = useQueryTrashed(tab === "sampah");
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── save form + confirm targets ──────────────────────────────────────────────
  const nameId = useId();
  const descId = useId();
  const [form, setForm] = useState<SaveForm>(EMPTY_SAVE_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SavedReportRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SavedReportRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<SavedReportRow | null>(null);

  useEffect(() => {
    if (!form.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setForm((d) => ({ ...d, open: false }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [form.open]);

  // ── mutations ────────────────────────────────────────────────────────────────
  const { save, softDelete, restore, purge } = useReportMutations({
    onSaved: () => setForm(EMPTY_SAVE_FORM),
    onDeleted: () => setDeleteTarget(null),
    onRestored: () => setRestoreTarget(null),
    onPurged: () => {
      setPurgeTarget(null);
    },
  });

  function submitForm() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Nama laporan wajib diisi");
      return;
    }
    save.mutate({
      name,
      kind: form.kind,
      description: form.description.trim() || null,
      scope: form.scope,
      isPinned: form.isPinned,
    });
  }

  // ── derived headline KPIs (from overview.totals — never fabricated) ──────────
  const totals = overview?.totals;
  const loadingOverview = overviewQ.isLoading;

  const overviewError = overviewQ.isError;
  const forbidden = overviewQ.error instanceof Error && overviewQ.error.message === "forbidden";

  return (
    <div>
      <PageHeader
        title="Laporan & Analitik"
        description="Dasbor agregat real-time atas data kontak, deal, percakapan, kesiapan closing, pesanan & kunjungan lapangan. Simpan tampilan favorit sebagai laporan."
      >
        <Button size="sm" onClick={() => setForm({ ...EMPTY_SAVE_FORM, open: true })}>
          <Save className="h-4 w-4" /> Simpan laporan
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP (headline totals) ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total kontak"
            value={loadingOverview ? null : totals?.contacts ?? 0}
            hint="basis lead/customer"
            icon={<Users className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/10 text-primary"
          />
          <StatCard
            label="Deal terbuka"
            value={loadingOverview ? null : totals?.openDeals ?? 0}
            hint={totals ? `nilai ${fmtIDR(totals.openDealValue)}` : "pipeline aktif"}
            icon={<Target className="h-[18px] w-[18px]" />}
            iconClass="bg-tertiary/[0.12] text-tertiary"
          />
          <StatCard
            label="Deal menang"
            value={loadingOverview ? null : totals?.wonDeals ?? 0}
            hint={totals ? `nilai ${fmtIDR(totals.wonValue)}` : "ditutup menang"}
            valueClass="text-success"
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(142 71% 45% / .14)", color: "#16a34a" }}
          />
          <StatCard
            label="Pendapatan pesanan"
            value={null}
            display={loadingOverview ? null : totals ? fmtIDR(totals.orderRevenue) : "Rp 0"}
            hint={totals ? `${num(totals.orders)} pesanan marketplace` : "dari marketplace"}
            valueClass="text-primary"
            icon={<Coins className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#FB5E3B18", color: "#FB5E3B" }}
          />
        </section>

        {/* ============ MAIN TABS ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "ringkasan"} onClick={() => setTab("ringkasan")}>
            <BarChart3 className="h-4 w-4" />
            Ringkasan
          </TabButton>
          <TabButton active={tab === "tersimpan"} onClick={() => setTab("tersimpan")}>
            <Star className="h-4 w-4" />
            Laporan tersimpan
            <CountPill>{saved.length}</CountPill>
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

        {/* ============ RINGKASAN TAB ============ */}
        {tab === "ringkasan" &&
          (loadingOverview ? (
            <OverviewLoading />
          ) : overviewError ? (
            <ErrorState
              title={forbidden ? "Tidak punya akses" : "Gagal memuat ringkasan"}
              description={
                forbidden
                  ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                  : "Tidak bisa mengambil agregat laporan. Pastikan kamu login & database tersedia."
              }
              onRetry={() => overviewQ.refetch()}
            />
          ) : !overview ? (
            <EmptyState
              icon={BarChart3}
              title="Belum ada data untuk dirangkum"
              description="Dasbor ini mengagregasi kontak, deal, percakapan, dan pesanan secara real-time. Mulai akuisisi lead & buat deal agar angkanya muncul."
            />
          ) : (
            <div className="space-y-5">
              {/* Row 1: Kontak per segmen + Deal per tahap */}
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard
                  icon={<Users className="h-4 w-4" />}
                  title="Kontak per segmen"
                  subtitle="Distribusi B2C vs B2B vs belum diklasifikasi"
                  empty={overview.contactsBySegment.length === 0}
                  emptyHint="Belum ada kontak."
                >
                  <BarList
                    rows={overview.contactsBySegment.map((r) => {
                      const meta = SEGMENT_META[r.segment] ?? {
                        label: titleCase(r.segment),
                        color: "#9CA3AF",
                      };
                      return { key: r.segment, label: meta.label, color: meta.color, value: r.count };
                    })}
                  />
                </ChartCard>

                <ChartCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="Deal per tahap pipeline"
                  subtitle="Jumlah & nilai deal di tiap tahap (urut pipeline)"
                  empty={overview.dealsByStage.length === 0}
                  emptyHint="Belum ada deal di pipeline."
                >
                  <BarList
                    rows={overview.dealsByStage.map((r) => ({
                      key: r.stageId ?? r.stageName,
                      label: r.stageName,
                      color: r.isWon ? "#16A34A" : r.isLost ? "#EF4444" : "#FB5E3B",
                      value: r.count,
                      caption: fmtIDR(r.value),
                      cue: r.isWon ? "Menang" : r.isLost ? "Kalah" : "Terbuka",
                    }))}
                  />
                </ChartCard>
              </div>

              {/* Row 2: Closing readiness bands + Conversations by status */}
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard
                  icon={<Flame className="h-4 w-4" />}
                  title="Kesiapan closing (band)"
                  subtitle="Sebaran skor kesiapan percakapan: cold → warm → hot"
                  empty={overview.closingReadinessByBand.length === 0}
                  emptyHint="Belum ada skor kesiapan closing."
                >
                  <BarList
                    rows={[...overview.closingReadinessByBand]
                      .sort(
                        (a, b) =>
                          BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band),
                      )
                      .map((r) => {
                        const meta = BAND_META[r.band] ?? {
                          label: titleCase(r.band),
                          color: "#9CA3AF",
                        };
                        return { key: r.band, label: meta.label, color: meta.color, value: r.count };
                      })}
                  />
                </ChartCard>

                <ChartCard
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Percakapan per status"
                  subtitle={`Total ${num(overview.totals.conversations)} percakapan di inbox`}
                  empty={overview.conversationsByStatus.length === 0}
                  emptyHint="Belum ada percakapan."
                >
                  <BarList
                    rows={overview.conversationsByStatus.map((r) => {
                      const meta = CONV_STATUS_META[r.status] ?? {
                        label: titleCase(r.status),
                        color: "#9CA3AF",
                      };
                      return { key: r.status, label: meta.label, color: meta.color, value: r.count };
                    })}
                  />
                </ChartCard>
              </div>

              {/* Row 3: Lifecycle + Orders by channel + Field visits */}
              <div className="grid gap-5 lg:grid-cols-3">
                <ChartCard
                  icon={<Building2 className="h-4 w-4" />}
                  title="Kontak per lifecycle"
                  subtitle="Lead → MQL → SQL → Customer"
                  empty={overview.contactsByLifecycle.length === 0}
                  emptyHint="Belum ada kontak."
                >
                  <BarList
                    rows={overview.contactsByLifecycle.map((r) => {
                      const meta = LIFECYCLE_META[r.stage] ?? {
                        label: titleCase(r.stage),
                        color: "#9CA3AF",
                      };
                      return { key: r.stage, label: meta.label, color: meta.color, value: r.count };
                    })}
                  />
                </ChartCard>

                <ChartCard
                  icon={<Boxes className="h-4 w-4" />}
                  title="Pesanan per channel"
                  subtitle="Roll-up pesanan marketplace"
                  empty={overview.ordersByChannel.length === 0}
                  emptyHint="Belum ada pesanan."
                >
                  <BarList
                    rows={overview.ordersByChannel.map((r) => ({
                      key: r.channel,
                      label: titleCase(r.channel),
                      color: CHANNEL_DOT[r.channel] ?? "#6B7280",
                      value: r.count,
                      caption: fmtIDR(r.total),
                    }))}
                  />
                </ChartCard>

                <ChartCard
                  icon={<MapPin className="h-4 w-4" />}
                  title="Kunjungan lapangan"
                  subtitle={`Total ${num(overview.totals.visits)} kunjungan`}
                  empty={overview.visitsByStatus.length === 0}
                  emptyHint="Belum ada kunjungan lapangan."
                >
                  <BarList
                    rows={overview.visitsByStatus.map((r) => {
                      const meta = VISIT_STATUS_META[r.status] ?? {
                        label: titleCase(r.status),
                        color: "#9CA3AF",
                      };
                      return { key: r.status, label: meta.label, color: meta.color, value: r.count };
                    })}
                  />
                </ChartCard>
              </div>

              <p className="max-w-3xl text-[11px] text-muted-foreground">
                Semua angka dihitung <b>real-time</b> oleh layanan reports atas tabel yang sudah ada
                (kontak / deal / percakapan / kesiapan closing / pesanan / kunjungan) — baris yang
                terhapus diabaikan. Tidak ada data demo. <b>Simpan laporan</b> untuk memfavoritkan
                tampilan agregat tertentu.
              </p>
            </div>
          ))}

        {/* ============ TERSIMPAN TAB ============ */}
        {tab === "tersimpan" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                Konfigurasi laporan tersimpan (nama + agregat + lingkup). Konfigurasi ini menentukan
                agregat mana yang dirender — angkanya tetap dihitung live.
              </span>
              <span className="ml-auto text-muted-foreground">{saved.length} laporan</span>
            </div>

            {savedQ.isLoading ? (
              <TableLoading />
            ) : savedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat laporan tersimpan"
                description="Tidak bisa mengambil daftar laporan."
                onRetry={() => savedQ.refetch()}
              />
            ) : saved.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Star}
                title="Belum ada laporan tersimpan"
                description="Simpan tampilan agregat favorit (mis. 'Funnel closing mingguan') agar bisa dibuka cepat oleh tim."
                action={
                  <Button size="sm" onClick={() => setForm({ ...EMPTY_SAVE_FORM, open: true })}>
                    <Plus className="h-4 w-4" /> Simpan laporan
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Agregat</th>
                      <th className="px-3 py-3 font-semibold">Lingkup</th>
                      <th className="px-3 py-3 font-semibold">Diperbarui</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {saved.map((r) => (
                      <SavedTableRow
                        key={r.id}
                        report={r}
                        onDelete={() => setDeleteTarget(r)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ SAMPAH TAB ============ */}
        {tab === "sampah" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                Laporan yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Tersimpan · <b>Hapus permanen</b> menghapus selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">{trashed.length} laporan</span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil laporan yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : trashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title="Sampah kosong"
                description="Laporan yang kamu hapus akan muncul di sini dan bisa dipulihkan."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Agregat</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trashed.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground/80">{r.name}</td>
                        <td className="px-3 py-3">
                          <KindBadge kind={r.kind} />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {fmtRelID(r.deletedAt)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRestoreTarget(r)}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
                            >
                              <RotateCcw className="h-3 w-3" /> Pulihkan
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPurgeTarget(r);
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" /> Hapus permanen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ===================== SAVE-REPORT DRAWER ===================== */}
      <AppDrawerRaw
        open={form.open}
        onClose={() => setForm((d) => ({ ...d, open: false }))}
        title="Simpan laporan"
        widthClassName="w-[420px] max-w-full"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Save className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Simpan laporan</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Favoritkan tampilan agregat sebagai laporan bernama
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => setForm((d) => ({ ...d, open: false }))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Name */}
          <div>
            <label
              htmlFor={nameId}
              className="mb-1.5 block text-[13px] font-medium text-foreground/80"
            >
              Nama laporan
            </label>
            <input
              id={nameId}
              type="text"
              value={form.name}
              onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))}
              placeholder="mis. Funnel closing mingguan"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Kind */}
          <div>
            <div className="mb-1.5 block text-[13px] font-medium text-foreground/80">Agregat</div>
            <div className="grid grid-cols-1 gap-2">
              {REPORT_KINDS.map((k) => {
                const on = form.kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setForm((d) => ({ ...d, kind: k.value }))}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    {k.label}
                    {on && <CheckCircle2 className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor={descId}
              className="mb-1.5 block text-[13px] font-medium text-foreground/80"
            >
              Deskripsi <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              id={descId}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((d) => ({ ...d, description: e.target.value }))}
              placeholder="Apa yang dilacak laporan ini & untuk siapa…"
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Scope */}
          <div>
            <div className="mb-1.5 block text-[13px] font-medium text-foreground/80">Lingkup</div>
            <div className="flex gap-2">
              {(
                [
                  { v: "private", label: "Pribadi" },
                  { v: "tenant", label: "Seluruh workspace" },
                ] as const
              ).map((s) => {
                const on = form.scope === s.v;
                return (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setForm((d) => ({ ...d, scope: s.v }))}
                    className={cn(
                      "h-9 flex-1 rounded-lg border px-3 text-xs font-medium transition-colors",
                      on
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border border-border hover:border-primary/40",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pin */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm((d) => ({ ...d, isPinned: e.target.checked }))}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Sematkan ke atas</p>
              <p className="text-[11px] text-muted-foreground">
                Laporan tersemat muncul lebih dulu di daftar.
              </p>
            </div>
          </label>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setForm((d) => ({ ...d, open: false }))}>
            Batal
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={submitForm}>
            {save.isPending ? "Menyimpan…" : "Simpan laporan"}
          </Button>
        </div>
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
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus dan
            dipindah ke tab <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
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
        title="Pulihkan laporan?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan dikembalikan
            ke tab <b>Laporan tersimpan</b>.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.name ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
      />
    </div>
  );
}

// ───────────────────────── queries / mutations ─────────────────────────

function useQueryOverview() {
  return useQuery({
    queryKey: ["reports", "overview"],
    queryFn: async () => readJson<DashboardOverview | null>(await fetch("/api/reports/overview")),
    retry: false,
  });
}

function useQuerySaved() {
  return useQuery({
    queryKey: ["reports", "saved", "list"],
    queryFn: async () => readJson<SavedReportRow[]>(await fetch("/api/reports/saved")),
    retry: false,
  });
}

function useQueryTrashed(enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "saved", "trashed"],
    enabled,
    queryFn: async () => readJson<SavedReportRow[]>(await fetch("/api/reports/saved/trashed")),
    retry: false,
  });
}

interface SaveInput {
  name: string;
  kind: string;
  description: string | null;
  scope: string;
  isPinned: boolean;
}

function useReportMutations(cb: {
  onSaved: () => void;
  onDeleted: () => void;
  onRestored: () => void;
  onPurged: () => void;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports", "saved"] });

  const save = useMutation({
    mutationFn: async (input: SaveInput) =>
      readJson<SavedReportRow>(
        await fetch("/api/reports/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: (_res, input) => {
      toast.success(`Laporan "${input.name}" disimpan`);
      refresh();
      cb.onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan laporan"),
  });

  const softDelete = useMutation({
    mutationFn: async (r: SavedReportRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/reports/saved/${r.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.name}" dipindah ke Sampah`);
      refresh();
      cb.onDeleted();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus laporan");
      cb.onDeleted();
    },
  });

  const restore = useMutation({
    mutationFn: async (r: SavedReportRow) =>
      readJson<SavedReportRow>(
        await fetch(`/api/reports/saved/${r.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.name}" dipulihkan`);
      refresh();
      cb.onRestored();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan laporan");
      cb.onRestored();
    },
  });

  const purge = useMutation({
    mutationFn: async (r: SavedReportRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/reports/saved/${r.id}/purge`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.name}" dihapus permanen`);
      refresh();
      cb.onPurged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  return { save, softDelete, restore, purge };
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  display,
  hint,
  valueClass,
  icon,
  iconClass,
  iconStyle,
}: {
  label: string;
  /** Numeric value (formatted id-ID). Use `display` for a pre-formatted string. */
  value: number | null;
  display?: string | null;
  hint: string;
  valueClass?: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
}) {
  const loading = value == null && display == null;
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-16" />
          ) : (
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueClass)}>
              {display ?? num(value ?? 0)}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass)}
          style={iconStyle}
        >
          {icon}
        </span>
      </div>
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

/** A dashboard card wrapping a chart band — handles its own empty state. */
function ChartCard({
  icon,
  title,
  subtitle,
  empty,
  emptyHint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  empty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {empty ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">{emptyHint}</p>
      ) : (
        children
      )}
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  color: string;
  value: number;
  caption?: string;
  /** Non-color status cue (audit #38): short text shown next to the label so
   *  win/lost/open isn't conveyed by bar colour alone. */
  cue?: string;
}

/** Horizontal bar chart built from styled divs (no chart lib). Bars scale to the
 *  band's own max so the tallest fills the track. */
function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
        return (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-foreground/80">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.label}</span>
                {r.cue && (
                  <span
                    className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: r.color, background: `${r.color}1A` }}
                  >
                    {r.cue}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums">
                <b className="text-foreground">{num(r.value)}</b>
                <span className="ml-1 text-[10px] text-muted-foreground">{share}%</span>
                {r.caption && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">· {r.caption}</span>
                )}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.max(pct, r.value > 0 ? 4 : 0)}%`, background: r.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {KIND_LABEL[kind] ?? titleCase(kind)}
    </span>
  );
}

function SavedTableRow({
  report,
  onDelete,
}: {
  report: SavedReportRow;
  onDelete: () => void;
}) {
  const r = report;
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {r.isPinned && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="Tersemat" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.name}</p>
            {r.description && (
              <p className="truncate text-[11px] text-muted-foreground">{r.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <KindBadge kind={r.kind} />
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            r.scope === "tenant"
              ? "bg-info/12 text-info"
              : "bg-muted text-muted-foreground",
          )}
        >
          {r.scope === "tenant" ? "Workspace" : "Pribadi"}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(r.updatedAt)}</td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={onDelete}
          title="Hapus (ke Sampah)"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function OverviewLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[260px] w-full rounded-lg" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[220px] w-full rounded-lg" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function TableLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
