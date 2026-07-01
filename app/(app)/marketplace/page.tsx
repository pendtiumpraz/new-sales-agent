"use client";

// Marketplace — INTER-TENANT COMPANY-DATA MARKETPLACE ("Jual-beli data perusahaan
// antar-tenant"). A tenant SELLS the firmographic company data it crawled into its
// CRM graph; a BUYER purchases a listing and those companies are imported into its
// OWN CRM graph. Closes the loop with the AI crawl → AI CRM engine.
//
// COMPLIANCE: company-level (firmographic) data ONLY — no personal contacts cross
// tenants (UU PDP / GDPR).
//
// Wires to the NEW modules/data-market backend (no mock data):
//   GET    /api/data-market/listings                  (Jelajah — cross-tenant shelf)
//   POST   /api/data-market/listings                  (create a listing)
//   GET    /api/data-market/listings/mine             (Listing Saya)
//   GET    /api/data-market/listings/trashed          (Sampah)
//   PATCH  /api/data-market/listings/[id]             (pause/resume)
//   DELETE /api/data-market/listings/[id]             (SOFT delete)
//   DELETE /api/data-market/listings/[id]?purge=1     (HARD delete)
//   PATCH  /api/data-market/listings/[id]/restore     (un-trash)
//   POST   /api/data-market/listings/[id]/purchase    (BUY → import into CRM)
//   POST   /api/data-market/preview                   (live count for the create drawer)
//   GET    /api/data-market/stats                     (stat strip)

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Coins,
  Database,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  TrendingUp,
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
import { cn } from "@/lib/utils";

// ── API envelope + row shapes ({ ok, data }) ─────────────────────────────────
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

interface ListingRow {
  id: string;
  sellerTenantId: string;
  title: string;
  description: string | null;
  industryKey: string | null;
  segment: string; // all|b2b|b2c
  companyCount: number;
  price: number;
  sample: string[];
  status: string; // active|paused|sold
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
interface BrowseRow extends ListingRow {
  sellerName: string;
}
interface StatsRow {
  activeListings: number;
  companiesSold: number;
  myPurchases: number;
}
interface PreviewRow {
  companyCount: number;
  sample: string[];
}
interface PurchaseResult {
  companyCount: number;
  importedCount: number;
  skippedCount: number;
}

type MainTab = "jelajah" | "listing" | "sampah";

const SEGMENTS = [
  { value: "all", label: "Semua" },
  { value: "b2b", label: "B2B" },
  { value: "b2c", label: "B2C" },
] as const;

const SEGMENT_META: Record<string, { label: string; cls: string }> = {
  all: { label: "Semua segmen", cls: "bg-muted text-muted-foreground" },
  b2b: { label: "B2B", cls: "bg-info/12 text-info" },
  b2c: { label: "B2C", cls: "bg-tertiary/[0.14] text-tertiary" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-success/15 text-success" },
  paused: { label: "Dijeda", cls: "bg-warning/15 text-warning" },
  sold: { label: "Terjual", cls: "bg-muted text-muted-foreground" },
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

function fmtIDR(value: number): string {
  if (value <= 0) return "Gratis";
  if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function fmtRelID(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "Baru saja";
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TN"
  );
}

// ── create-listing drawer state ──────────────────────────────────────────────
interface ListingForm {
  open: boolean;
  title: string;
  description: string;
  industryKey: string;
  segment: string;
  price: string;
}
const EMPTY_FORM: ListingForm = {
  open: false,
  title: "",
  description: "",
  industryKey: "",
  segment: "all",
  price: "",
};

// ── page ─────────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<MainTab>("jelajah");
  const [search, setSearch] = useState("");
  const [segF, setSegF] = useState<string>("all");

  const browseQ = useQuery({
    queryKey: ["dm", "browse"],
    queryFn: async () => readJson<BrowseRow[]>(await fetch("/api/data-market/listings")),
    retry: false,
  });
  const mineQ = useQuery({
    queryKey: ["dm", "mine"],
    queryFn: async () => readJson<ListingRow[]>(await fetch("/api/data-market/listings/mine")),
    retry: false,
  });
  const statsQ = useQuery({
    queryKey: ["dm", "stats"],
    queryFn: async () => readJson<StatsRow>(await fetch("/api/data-market/stats")),
    retry: false,
  });
  const trashedQ = useQuery({
    queryKey: ["dm", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<ListingRow[]>(await fetch("/api/data-market/listings/trashed")),
    retry: false,
  });

  const browse = useMemo(() => browseQ.data ?? [], [browseQ.data]);
  const mine = useMemo(() => mineQ.data ?? [], [mineQ.data]);
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  const forbidden = browseQ.error instanceof Error && browseQ.error.message === "forbidden";

  const visibleBrowse = useMemo(() => {
    const q = search.trim().toLowerCase();
    return browse.filter((l) => {
      const okSeg = segF === "all" || l.segment === segF;
      const okSearch =
        !q ||
        l.title.toLowerCase().includes(q) ||
        l.sellerName.toLowerCase().includes(q) ||
        (l.industryKey ?? "").toLowerCase().includes(q);
      return okSeg && okSearch;
    });
  }, [browse, search, segF]);

  // ── create drawer + live preview ────────────────────────────────────────────
  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey] = useState({ industryKey: "", segment: "all" });

  // Debounce the filter → live preview key so typing industri doesn't spam.
  useEffect(() => {
    if (!form.open) return;
    const t = setTimeout(
      () => setPreviewKey({ industryKey: form.industryKey.trim(), segment: form.segment }),
      400,
    );
    return () => clearTimeout(t);
  }, [form.open, form.industryKey, form.segment]);

  const previewQ = useQuery({
    queryKey: ["dm", "preview", previewKey.industryKey, previewKey.segment],
    enabled: form.open,
    queryFn: async () =>
      readJson<PreviewRow>(
        await fetch("/api/data-market/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(previewKey),
        }),
      ),
    retry: false,
  });

  function openCreate() {
    setForm({ ...EMPTY_FORM, open: true });
    setPreviewKey({ industryKey: "", segment: "all" });
  }
  function closeCreate() {
    setForm((d) => ({ ...d, open: false }));
  }

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [buyTarget, setBuyTarget] = useState<BrowseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListingRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ListingRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ListingRow | null>(null);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["dm"] });
  }

  // ── mutations ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (f: ListingForm) => {
      const body = {
        title: f.title.trim(),
        description: f.description.trim() || null,
        industryKey: f.industryKey.trim() || null,
        segment: f.segment,
        price: f.price ? Number(f.price) : 0,
      };
      return readJson<ListingRow>(
        await fetch("/api/data-market/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (row) => {
      toast.success(`Listing "${row.title}" dipublikasikan · ${row.companyCount} perusahaan`);
      refreshAll();
      closeCreate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mempublikasikan listing"),
  });

  const purchase = useMutation({
    mutationFn: async (l: BrowseRow) =>
      readJson<PurchaseResult>(
        await fetch(`/api/data-market/listings/${l.id}/purchase`, { method: "POST" }),
      ),
    onSuccess: (res) => {
      const skip = res.skippedCount > 0 ? ` (${res.skippedCount} duplikat dilewati)` : "";
      toast.success(`${res.importedCount} perusahaan diimpor ke CRM${skip}`);
      refreshAll();
      // Refresh the CRM graph so the imported companies show up immediately.
      qc.invalidateQueries({ queryKey: ["crm", "companies"] });
      qc.invalidateQueries({ queryKey: ["crm"] });
      setBuyTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal membeli listing");
      setBuyTarget(null);
    },
  });

  const setStatus = useMutation({
    mutationFn: async (v: { l: ListingRow; status: string }) =>
      readJson<ListingRow>(
        await fetch(`/api/data-market/listings/${v.l.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: v.status }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(row.status === "paused" ? "Listing dijeda" : "Listing diaktifkan");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah status"),
  });

  const softDelete = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<{ id: string }>(
        await fetch(`/api/data-market/listings/${l.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus listing");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<{ id: string }>(
        await fetch(`/api/data-market/listings/${l.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan listing");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (l: ListingRow) =>
      readJson<{ id: string }>(
        await fetch(`/api/data-market/listings/${l.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, l) => {
      toast.success(`Listing "${l.title}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  function submitCreate() {
    if (!form.title.trim()) {
      toast.error("Judul listing wajib diisi");
      return;
    }
    if ((previewQ.data?.companyCount ?? 0) === 0) {
      toast.error("Tidak ada perusahaan yang cocok dengan filter ini");
      return;
    }
    create.mutate(form);
  }

  const stats = statsQ.data;

  return (
    <div>
      <PageHeader
        title="Marketplace Data"
        description="Jual-beli data perusahaan (firmografis) antar-tenant. Jual dataset perusahaan hasil crawl-mu, atau beli dataset tenant lain — langsung terimpor ke CRM-mu."
      >
        <FeatureGuide guide={FEATURE_GUIDES.marketplace} />
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Jual data
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ COMPLIANCE NOTE ============ */}
        <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info/[0.06] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-[13px] leading-relaxed text-foreground/80">
            <b className="text-foreground">Hanya data perusahaan (firmografis)</b> yang
            diperjualbelikan — nama PT, industri, ukuran, lokasi, website. <b>Bukan kontak personal</b>{" "}
            (nama orang, email, HP) demi kepatuhan UU PDP / GDPR.
          </p>
        </div>

        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Listing di pasar"
            value={browseQ.isLoading ? null : browse.length}
            hint="dataset tenant lain"
            icon={<Store className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/10 text-primary"
          />
          <StatCard
            label="Listing aktif saya"
            value={statsQ.isLoading ? null : stats?.activeListings ?? 0}
            hint={`${mine.length} listing total`}
            icon={<Tag className="h-[18px] w-[18px]" />}
            iconClass="bg-tertiary/[0.12] text-tertiary"
          />
          <StatCard
            label="Perusahaan terjual"
            value={statsQ.isLoading ? null : stats?.companiesSold ?? 0}
            hint="diimpor pembeli"
            valueClass="text-primary"
            icon={<TrendingUp className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#25D36618", color: "#1faa52" }}
          />
          <StatCard
            label="Pembelian saya"
            value={statsQ.isLoading ? null : stats?.myPurchases ?? 0}
            hint="dataset dibeli"
            icon={<ShoppingCart className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(199 89% 48% / .14)", color: "#0284c7" }}
          />
        </section>

        {/* ============ TABS ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "jelajah"} onClick={() => setTab("jelajah")}>
            <Store className="h-4 w-4" />
            Jelajah
            <CountPill>{browse.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "listing"} onClick={() => setTab("listing")}>
            <Tag className="h-4 w-4" />
            Listing Saya
            <CountPill>{mine.length}</CountPill>
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

        {/* ============ JELAJAH TAB ============ */}
        {tab === "jelajah" && (
          <section className="space-y-4">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSegF(s.value)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs transition-colors",
                      segF === s.value
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari judul / penjual / industri…"
                  className="h-8 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visibleBrowse.length}</b> listing
              </span>
            </div>

            {browseQ.isLoading ? (
              <CardGridLoading />
            ) : browseQ.isError ? (
              <ErrorState
                title={forbidden ? "Tidak punya akses" : "Gagal memuat pasar"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil listing marketplace. Pastikan kamu login & database tersedia."
                }
                onRetry={() => browseQ.refetch()}
              />
            ) : browse.length === 0 ? (
              <EmptyState
                icon={Store}
                title="Belum ada listing di pasar"
                description="Belum ada tenant lain yang menjual dataset perusahaan. Kamu bisa jadi yang pertama menjual — buka tab Listing Saya."
              />
            ) : visibleBrowse.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Tidak ada listing yang cocok"
                description="Coba ubah filter segmen atau kata kunci pencarian."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleBrowse.map((l) => (
                  <BrowseCard key={l.id} listing={l} onBuy={() => setBuyTarget(l)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============ LISTING SAYA TAB ============ */}
        {tab === "listing" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Dataset yang saya jual</span>
              <span className="ml-auto">
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Jual data
                </Button>
              </span>
            </div>
            {mineQ.isLoading ? (
              <TableLoading />
            ) : mineQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat listing saya"
                description="Tidak bisa mengambil listing kamu. Pastikan kamu login & database tersedia."
                onRetry={() => mineQ.refetch()}
              />
            ) : mine.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Tag}
                title="Belum ada listing"
                description="Jual dataset perusahaan hasil crawl-mu. Pilih filter industri/segmen, tentukan harga, lalu publikasikan — tenant lain bisa membelinya."
                action={
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Jual data
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Listing</th>
                      <th className="px-3 py-3 font-semibold">Segmen</th>
                      <th className="px-3 py-3 text-right font-semibold">Perusahaan</th>
                      <th className="px-3 py-3 text-right font-semibold">Harga</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mine.map((l) => (
                      <MyListingRow
                        key={l.id}
                        listing={l}
                        onPause={() =>
                          setStatus.mutate({ l, status: l.status === "active" ? "paused" : "active" })
                        }
                        onDelete={() => setDeleteTarget(l)}
                        busy={setStatus.isPending && setStatus.variables?.l.id === l.id}
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
              <span className="font-semibold text-foreground">Listing dihapus</span>
              <span className="text-muted-foreground">
                <b>Pulihkan</b> mengembalikan ke Listing Saya · <b>Hapus permanen</b> menghapus selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">{trashed.length} listing</span>
            </div>
            {trashedQ.isLoading ? (
              <TableLoading rows={3} />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil listing yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : trashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title="Tidak ada listing di sampah"
                description="Listing yang kamu hapus akan muncul di sini dan bisa dipulihkan."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Listing</th>
                      <th className="px-3 py-3 text-right font-semibold">Perusahaan</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trashed.map((l) => (
                      <tr key={l.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground/80">{l.title}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-foreground/80">
                          {l.companyCount.toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {fmtRelID(l.deletedAt)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRestoreTarget(l)}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
                            >
                              <RotateCcw className="h-3 w-3" /> Pulihkan
                            </button>
                            <button
                              type="button"
                              onClick={() => setPurgeTarget(l)}
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

      {/* ===================== CREATE LISTING DRAWER ===================== */}
      <AppDrawerRaw
        open={form.open}
        onClose={closeCreate}
        title="Jual data perusahaan"
        widthClassName="w-[460px] max-w-full"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Jual data perusahaan</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Snapshot data firmografis dari CRM-mu
              </p>
            </div>
          </div>
          <button
            onClick={closeCreate}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Judul listing
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((d) => ({ ...d, title: e.target.value }))}
              placeholder="mis. 120 UMKM F&B Jabodetabek"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Deskripsi <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((d) => ({ ...d, description: e.target.value }))}
              placeholder="Jelaskan sumber & kualitas data yang kamu jual…"
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Filter: industry */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Filter industri <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <input
              type="text"
              value={form.industryKey}
              onChange={(e) => setForm((d) => ({ ...d, industryKey: e.target.value }))}
              placeholder="mis. F&B / Retail — kosongkan untuk semua"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cocokkan label industri perusahaan di CRM-mu. Kosong = semua industri.
            </p>
          </div>

          {/* Filter: segment */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Segmen</label>
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((s) => {
                const on = form.segment === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm((d) => ({ ...d, segment: s.value }))}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-medium transition-colors",
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              B2B/B2C memilih perusahaan yang punya kontak segmen itu (kontaknya sendiri tidak dijual).
            </p>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-[13px] font-medium text-foreground/80">Perusahaan yang cocok</span>
              <span className="ml-auto text-lg font-bold tabular-nums text-primary">
                {previewQ.isFetching ? (
                  <Skeleton className="h-6 w-10" />
                ) : (
                  (previewQ.data?.companyCount ?? 0).toLocaleString("id-ID")
                )}
              </span>
            </div>
            {(previewQ.data?.sample?.length ?? 0) > 0 && (
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                Contoh: {previewQ.data?.sample.join(", ")}…
              </p>
            )}
            {!previewQ.isFetching && (previewQ.data?.companyCount ?? 0) === 0 && (
              <p className="mt-1.5 text-[11px] text-warning">
                Tidak ada perusahaan yang cocok — sesuaikan filter atau tambah data di CRM dulu.
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Harga (Rp) — flat per pembelian
            </label>
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm((d) => ({ ...d, price: e.target.value }))}
              placeholder="0 = gratis"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              MVP: pembayaran belum diproses — nilai dicatat sebagai ledger saja.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={closeCreate}>
            Batal
          </Button>
          <Button
            size="sm"
            disabled={create.isPending || (previewQ.data?.companyCount ?? 0) === 0}
            onClick={submitCreate}
          >
            {create.isPending ? "Mempublikasikan…" : "Publikasikan"}
          </Button>
        </div>
      </AppDrawerRaw>

      {/* ===================== BUY CONFIRM ===================== */}
      <ConfirmDialog
        open={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        icon={<ShoppingCart className="h-5 w-5" />}
        tone="tertiary"
        title="Beli dataset ini?"
        body={
          buyTarget ? (
            <>
              <span className="font-medium text-foreground">{buyTarget.companyCount} perusahaan</span> dari{" "}
              <span className="font-medium text-foreground">{buyTarget.sellerName}</span> akan{" "}
              <b>diimpor ke CRM-mu</b> (duplikat berdasarkan domain/nama otomatis dilewati). Harga{" "}
              <span className="font-medium text-foreground">{fmtIDR(buyTarget.price)}</span>. Hanya data
              perusahaan — tanpa kontak personal.
            </>
          ) : null
        }
        confirmLabel="Ya, beli & impor"
        confirmPending={purchase.isPending}
        onConfirm={() => buyTarget && purchase.mutate(buyTarget)}
      />

      {/* ===================== DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            Listing <span className="font-medium text-foreground">{deleteTarget?.title}</span> akan
            ditarik dari pasar dan dipindah ke <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
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
        title="Pulihkan listing?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.title}</span> akan dikembalikan
            ke <b>Listing Saya</b> (status dijeda).
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== PURGE CONFIRM ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.title ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.title}</span> akan dihapus
            selamanya. Data yang sudah dibeli tenant lain tetap ada di CRM mereka.
          </>
        }
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function BrowseCard({ listing, onBuy }: { listing: BrowseRow; onBuy: () => void }) {
  const l = listing;
  const seg = SEGMENT_META[l.segment] ?? SEGMENT_META.all;
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
          {initialsOf(l.sellerName)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-foreground">{l.title}</h3>
          <p className="truncate text-[11px] text-muted-foreground">
            oleh {l.sellerName} · {fmtRelID(l.createdAt)}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", seg.cls)}>
          {seg.label}
        </span>
      </div>

      {l.description && (
        <p className="mt-2.5 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          {l.companyCount.toLocaleString("id-ID")} perusahaan
        </span>
        {l.industryKey && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            {l.industryKey}
          </span>
        )}
      </div>

      {l.sample.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
          Contoh: {l.sample.join(", ")}
          {l.companyCount > l.sample.length ? "…" : ""}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Coins className="h-4 w-4 text-primary" />
          {fmtIDR(l.price)}
        </span>
        <Button size="sm" onClick={onBuy}>
          <Download className="h-4 w-4" /> Beli
        </Button>
      </div>
    </div>
  );
}

function MyListingRow({
  listing,
  onPause,
  onDelete,
  busy,
}: {
  listing: ListingRow;
  onPause: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const l = listing;
  const seg = SEGMENT_META[l.segment] ?? SEGMENT_META.all;
  const st = STATUS_META[l.status] ?? STATUS_META.active;
  const paused = l.status === "paused";
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{l.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {l.sample.length > 0 ? l.sample.join(", ") : "tanpa contoh"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", seg.cls)}>
          {seg.label}
        </span>
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums text-foreground/80">
        {l.companyCount.toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
        {fmtIDR(l.price)}
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
            st.cls,
          )}
        >
          {st.label}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPause}
            disabled={busy}
            title={paused ? "Aktifkan" : "Jeda"}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Aktifkan" : "Jeda"}
          </button>
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

function StatCard({
  label,
  value,
  hint,
  valueClass,
  icon,
  iconClass,
  iconStyle,
}: {
  label: string;
  value: number | null;
  hint: string;
  valueClass?: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {value == null ? (
            <Skeleton className="mt-1.5 h-7 w-14" />
          ) : (
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueClass)}>
              {value.toLocaleString("id-ID")}
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

function CardGridLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-4 h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

function TableLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
