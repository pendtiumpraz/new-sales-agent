"use client";

// Penawaran / Quotes — LIST page (rebuild). Replaces the old
// `redirect("/pipeline")` stub. Wires to the REAL quote store (no mock data):
//   GET  /api/quotes                     (list AKTIF — soft-deleted hidden)
//   GET  /api/quotes?archived=1          (list SAMPAH — only soft-deleted)
//   POST /api/quotes                     (create a draft → open /penawaran/[id] editor)
//   POST /api/data/archive               ({entity:"quote",id}          → soft-delete)
//   POST /api/data/archive               ({entity:"quote",id,restore})  → restore
// There is no hard-delete/purge endpoint for quotes, so Sampah offers restore
// only (honest — no fake "Hapus permanen"). Numbers are computed from the live
// list; empty/loading/error states everywhere. Mirrors reports/page.tsx (Coral
// Sunset shell: PageHeader, stat strip, Aktif/Sampah tabs, confirm dialogs).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Coins,
  FilePlus2,
  FileText,
  Files,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";

// ── shapes (the quote store returns quoteTable rows via a bare { data } envelope) ──
interface QuoteRow {
  id: string;
  number: string;
  title: string;
  currency: string;
  total: number;
  status: string;
  customerName: string | null;
  customerCompany: string | null;
  customerEmail: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

type MainTab = "aktif" | "sampah";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Terkirim", cls: "bg-info/12 text-info" },
  viewed: { label: "Dibuka", cls: "bg-warning/15 text-warning" },
  accepted: { label: "Diterima", cls: "bg-success/12 text-success" },
  rejected: { label: "Ditolak", cls: "bg-destructive/12 text-destructive" },
  expired: { label: "Kadaluarsa", cls: "bg-muted text-muted-foreground" },
};

// ── helpers ───────────────────────────────────────────────────────────────────
/** The quotes API answers `{ data }` on success / `{ error }` on failure (no
 *  `ok` flag — unlike the reports backend). Unwrap accordingly. */
async function readData<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!r.ok || !j) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && j.error) || "Permintaan gagal");
  }
  return j.data as T;
}

const fmtMoney = (n: number, c: string) =>
  c === "IDR"
    ? "Rp" + Math.round(n || 0).toLocaleString("id-ID")
    : `${c} ${(n || 0).toLocaleString("en-US")}`;

function fmtIDR(value: number): string {
  if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (value >= 1e3) return `Rp ${(value / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function num(n: number): string {
  return n.toLocaleString("id-ID");
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

// ── create form ────────────────────────────────────────────────────────────────
interface CreateForm {
  open: boolean;
  title: string;
  customerName: string;
  customerCompany: string;
}
const EMPTY_CREATE: CreateForm = { open: false, title: "", customerName: "", customerCompany: "" };

// ── page ─────────────────────────────────────────────────────────────────────
export default function PenawaranListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const activeWs = useWorkspaceStore((s) => s.active);

  const [tab, setTab] = useState<MainTab>("aktif");
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [deleteTarget, setDeleteTarget] = useState<QuoteRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<QuoteRow | null>(null);

  const activeQ = useQuery({
    queryKey: ["quotes", "list"],
    queryFn: async () => readData<QuoteRow[]>(await fetch("/api/quotes")),
    retry: false,
  });
  const trashedQ = useQuery({
    queryKey: ["quotes", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readData<QuoteRow[]>(await fetch("/api/quotes?archived=1")),
    retry: false,
  });

  const active = useMemo(() => activeQ.data ?? [], [activeQ.data]);
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  const forbidden = activeQ.error instanceof Error && activeQ.error.message === "forbidden";

  // ── headline KPIs (derived from the live list — never fabricated) ────────────
  const totals = useMemo(() => {
    const waiting = active.filter((q) => q.status === "sent" || q.status === "viewed").length;
    const accepted = active.filter((q) => q.status === "accepted").length;
    const value = active
      .filter((q) => q.status !== "rejected" && q.status !== "expired")
      .reduce((s, q) => s + (Number(q.total) || 0), 0);
    return { count: active.length, waiting, accepted, value };
  }, [active]);

  // ── mutations ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (input: { title: string; customerName?: string; customerCompany?: string }) =>
      readData<QuoteRow>(
        await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            customerName: input.customerName || null,
            customerCompany: input.customerCompany || null,
            workspaceId: activeWs?.id ?? null,
          }),
        }),
      ),
    onSuccess: (q) => {
      setForm(EMPTY_CREATE);
      toast.success("Draf penawaran dibuat");
      router.push(`/penawaran/${q.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat penawaran"),
  });

  const softDelete = useMutation({
    mutationFn: async (q: QuoteRow) => {
      const r = await fetch("/api/data/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "quote", id: q.id }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || "gagal");
      return j;
    },
    onSuccess: (_res, q) => {
      toast.success(`"${q.title}" dipindah ke Sampah`);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus (cek hak akses & DB)");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (q: QuoteRow) => {
      const r = await fetch("/api/data/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "quote", id: q.id, restore: true }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || "gagal");
      return j;
    },
    onSuccess: (_res, q) => {
      toast.success(`"${q.title}" dipulihkan`);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan");
      setRestoreTarget(null);
    },
  });

  function submitCreate() {
    const title = form.title.trim();
    if (!title) {
      toast.error("Judul penawaran wajib diisi");
      return;
    }
    create.mutate({ title, customerName: form.customerName.trim(), customerCompany: form.customerCompany.trim() });
  }

  return (
    <div>
      <PageHeader
        title="Penawaran"
        description="Quote/penawaran ke pelanggan — AI menyusun, dikirim via email, halaman publik melacak dibuka/diterima. 1 penawaran = 1 dokumen quote-to-cash."
      >
        <Button size="sm" onClick={() => setForm({ ...EMPTY_CREATE, open: true })}>
          <Plus className="h-4 w-4" /> Buat penawaran
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total penawaran"
            value={activeQ.isLoading ? null : totals.count}
            hint="penawaran aktif"
            icon={<Files className="h-[18px] w-[18px]" />}
            iconClass="bg-primary/10 text-primary"
          />
          <StatCard
            label="Menunggu respons"
            value={activeQ.isLoading ? null : totals.waiting}
            hint="terkirim / dibuka"
            icon={<Clock className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(38 92% 50% / .14)", color: "#D97706" }}
          />
          <StatCard
            label="Diterima"
            value={activeQ.isLoading ? null : totals.accepted}
            hint="disetujui pelanggan"
            valueClass="text-success"
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "hsl(142 71% 45% / .14)", color: "#16a34a" }}
          />
          <StatCard
            label="Nilai penawaran aktif"
            value={null}
            display={activeQ.isLoading ? null : fmtIDR(totals.value)}
            hint="di luar ditolak/kadaluarsa"
            valueClass="text-primary"
            icon={<Coins className="h-[18px] w-[18px]" />}
            iconStyle={{ background: "#FB5E3B18", color: "#FB5E3B" }}
          />
        </section>

        {/* ============ TABS ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <FileText className="h-4 w-4" />
            Aktif
            <CountPill>{active.length}</CountPill>
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

        {/* ============ AKTIF TAB ============ */}
        {tab === "aktif" && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {activeQ.isLoading ? (
              <TableLoading />
            ) : activeQ.isError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat penawaran"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar penawaran. Pastikan kamu login & database tersedia."
                }
                onRetry={() => activeQ.refetch()}
              />
            ) : active.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={FileText}
                title="Belum ada penawaran"
                description="Buat penawaran pertama — biarkan AI menyusun item, syarat & email pengantar, lalu kirim ke pelanggan dan lacak dibuka/diterima."
                action={
                  <Button size="sm" onClick={() => setForm({ ...EMPTY_CREATE, open: true })}>
                    <Plus className="h-4 w-4" /> Buat penawaran
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Penawaran</th>
                      <th className="px-3 py-3 font-semibold">Pelanggan</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Tanggal</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {active.map((q) => {
                      const meta = STATUS_META[q.status] ?? STATUS_META.draft;
                      return (
                        <tr key={q.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <Link href={`/penawaran/${q.id}`} className="block min-w-0">
                              <p className="truncate font-medium text-foreground hover:text-primary">{q.title}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{q.number}</p>
                            </Link>
                          </td>
                          <td className="px-3 py-3">
                            <p className="truncate text-foreground/80">{q.customerName || "—"}</p>
                            {q.customerCompany && (
                              <p className="truncate text-[11px] text-muted-foreground">{q.customerCompany}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(q.total, q.currency)}</td>
                          <td className="px-3 py-3">
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.cls)}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(q.createdAt)}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Link
                                href={`/penawaran/${q.id}`}
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/50 hover:text-primary"
                              >
                                Buka
                              </Link>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(q)}
                                title="Hapus (ke Sampah)"
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                Penawaran yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif.
              </span>
              <span className="ml-auto text-muted-foreground">{trashed.length} penawaran</span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil penawaran yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : trashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title="Sampah kosong"
                description="Penawaran yang kamu hapus akan muncul di sini dan bisa dipulihkan."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Penawaran</th>
                      <th className="px-3 py-3 font-semibold">Pelanggan</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trashed.map((q) => (
                      <tr key={q.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="truncate font-medium text-foreground/80">{q.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{q.number}</p>
                        </td>
                        <td className="px-3 py-3 text-foreground/70">{q.customerName || "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {fmtMoney(q.total, q.currency)}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(q.deletedAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setRestoreTarget(q)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
                          >
                            <RotateCcw className="h-3 w-3" /> Pulihkan
                          </button>
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

      {/* ===================== CREATE DRAWER ===================== */}
      <AppDrawerRaw
        open={form.open}
        onClose={() => setForm((d) => ({ ...d, open: false }))}
        title="Buat penawaran"
        widthClassName="w-[420px] max-w-full"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FilePlus2 className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Buat penawaran</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Mulai draf — lengkapi item & kirim di editor
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
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Judul penawaran</label>
            <input
              type="text"
              autoFocus
              value={form.title}
              onChange={(e) => setForm((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
              }}
              placeholder="mis. Paket Website + SEO 6 bulan"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Nama pelanggan <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => setForm((d) => ({ ...d, customerName: e.target.value }))}
              placeholder="mis. Budi Santoso"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Perusahaan <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <input
              type="text"
              value={form.customerCompany}
              onChange={(e) => setForm((d) => ({ ...d, customerCompany: e.target.value }))}
              placeholder="mis. PT Maju Jaya"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Draf dibuat kosong lalu terbuka di editor — di sana AI bisa menyusun item, syarat &
            email pengantar sebelum dikirim.
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setForm((d) => ({ ...d, open: false }))}>
            Batal
          </Button>
          <Button size="sm" disabled={create.isPending} onClick={submitCreate}>
            {create.isPending ? "Membuat…" : "Buat & buka editor"}
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
            <span className="font-medium text-foreground">{deleteTarget?.title}</span> akan dihapus dan
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
        title="Pulihkan penawaran?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.title}</span> akan
            dikembalikan ke tab <b>Aktif</b>.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />
    </div>
  );
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
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
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
