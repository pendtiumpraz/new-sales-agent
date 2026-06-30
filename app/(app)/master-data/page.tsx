"use client";

// Master Data — Industri & Pekerjaan (taxonomy) FRONTEND. Wired to the REAL
// taxonomy backend (no mock data): the AI master-data catalog that classifies
// crawled companies/people. Two flat catalogs (industry / occupation), each a
// UNION of the GLOBAL canonical BASE (tenant_id NULL, source="seed", read-only)
// and the tenant's OWN rows (source="ai" | "manual", editable / mergeable /
// deletable). Faithful to mockups/taxonomy.html (Coral Sunset):
//   - kind tabs: Industri · Pekerjaan · Antrian review (AI-created) · Sampah
//   - source filter: Semua / Base / AI / Manual
//   - stat strip: counts (industry / occupation), AI-to-review, unclassified*
//   - table: Nama + nameEn · Sumber badge (Base = read-only lock) · Induk ·
//     Dipakai* · Aksi (Lihat for Base; Edit/Hapus for own; Review for AI)
//   - right drawer to EDIT or REVIEW an AI entry: reason, edit name/EN/parent,
//     "used by"* , merge-into selector, Approve / Tolak usulan AI / soft-delete
//   - Sampah → restore / hard-delete (purge), and the merge flow.
//
// Endpoints (modules/taxonomy):
//   GET  /api/taxonomy/{industries|occupations}                 → live rows
//   GET  /api/taxonomy/{industries|occupations}/trashed         → Sampah
//   POST /api/taxonomy/{industries|occupations}                 → create (manual)
//   PATCH  /api/taxonomy/{kind}/[id]                            → rename / edit
//   DELETE /api/taxonomy/{kind}/[id]            (soft) / ?purge=1 (hard)
//   PATCH  /api/taxonomy/{kind}/[id]/restore                    → un-trash
//   POST   /api/taxonomy/{kind}/merge  { fromId, toId }         → merge
//
// HONESTY (*): the backend has NO per-row usage count or "used-by" list yet —
// there is no endpoint that joins taxonomy ids to crawled companies/contacts. So
// the "Dipakai" column and the drawer's "Dipakai oleh" band are shown as
// "belum terlacak" rather than fabricating numbers. "Belum diklasifikasi" in the
// stat strip is likewise marked as not-yet-tracked for the same reason. Every
// band has loading + empty + error states.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  GitMerge,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Tags,
  Trash2,
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

// ── API envelope + row shapes (REAL taxonomy backend — { ok, data }) ──────────

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

type Source = "seed" | "ai" | "manual";

/** Row from GET /api/taxonomy/{industries|occupations} (modules/taxonomy).
 *  tenantId NULL = the global canonical BASE (read-only). `industryId` exists
 *  on occupation rows only. */
interface TaxoRow {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  industryId?: string | null;
  nameEn: string | null;
  source: Source;
  confidence: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ── view enums ────────────────────────────────────────────────────────────────

type Kind = "industry" | "occupation";
/** Top-level tabs in the mockup: the two catalogs + the AI review queue + trash. */
type KindTab = "industry" | "occupation" | "review" | "trash";
type SourceFilter = "all" | "seed" | "ai" | "manual";

const KIND_OF_TAB: Record<KindTab, Kind> = {
  industry: "industry",
  occupation: "occupation",
  review: "industry", // review spans BOTH kinds; the row carries its own kind
  trash: "industry",
};

const KIND_NOUN: Record<Kind, string> = {
  industry: "industri",
  occupation: "pekerjaan",
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

/** Path segment for a kind ("industries" | "occupations"). */
function kindPath(kind: Kind): string {
  return kind === "industry" ? "industries" : "occupations";
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

// ── page ─────────────────────────────────────────────────────────────────────

export default function MasterDataPage() {
  const qc = useQueryClient();

  // Both catalogs load up front — the stat strip + review queue span both, and
  // the parent/merge selectors resolve ids → names across the active kind.
  const industriesQ = useQuery({
    queryKey: ["taxonomy", "industry", "list"],
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/industries")),
    retry: false,
  });
  const occupationsQ = useQuery({
    queryKey: ["taxonomy", "occupation", "list"],
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/occupations")),
    retry: false,
  });

  const industries = useMemo(() => industriesQ.data ?? [], [industriesQ.data]);
  const occupations = useMemo(() => occupationsQ.data ?? [], [occupationsQ.data]);

  const listByKind = (k: Kind) => (k === "industry" ? industries : occupations);

  // ── tabs / filters ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<KindTab>("industry");
  const [srcF, setSrcF] = useState<SourceFilter>("all");
  const activeKind = KIND_OF_TAB[tab];

  // Trash is lazy (only fetched when the Sampah tab opens), kept warm.
  const trashIndQ = useQuery({
    queryKey: ["taxonomy", "industry", "trashed"],
    enabled: tab === "trash",
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/industries/trashed")),
    retry: false,
  });
  const trashOccQ = useQuery({
    queryKey: ["taxonomy", "occupation", "trashed"],
    enabled: tab === "trash",
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/occupations/trashed")),
    retry: false,
  });

  // ── derived counts ───────────────────────────────────────────────────────────
  const countSplit = (rows: TaxoRow[]) => {
    let base = 0;
    let own = 0;
    for (const r of rows) {
      if (r.tenantId == null || r.source === "seed") base++;
      else own++;
    }
    return { total: rows.length, base, own };
  };
  const indStats = useMemo(() => countSplit(industries), [industries]);
  const occStats = useMemo(() => countSplit(occupations), [occupations]);
  const aiToReview = useMemo(
    () =>
      industries.filter((r) => r.source === "ai").length +
      occupations.filter((r) => r.source === "ai").length,
    [industries, occupations],
  );

  // ── name lookups (id → name) for the "Induk" column + selectors ─────────────
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...industries, ...occupations]) m.set(r.id, r.name);
    return m;
  }, [industries, occupations]);

  // ── the rows shown in the table for the current tab + source filter ─────────
  const reviewRows = useMemo<Array<TaxoRow & { kind: Kind }>>(
    () => [
      ...industries.filter((r) => r.source === "ai").map((r) => ({ ...r, kind: "industry" as const })),
      ...occupations.filter((r) => r.source === "ai").map((r) => ({ ...r, kind: "occupation" as const })),
    ],
    [industries, occupations],
  );

  const trashRows = useMemo<Array<TaxoRow & { kind: Kind }>>(
    () => [
      ...(trashIndQ.data ?? []).map((r) => ({ ...r, kind: "industry" as const })),
      ...(trashOccQ.data ?? []).map((r) => ({ ...r, kind: "occupation" as const })),
    ],
    [trashIndQ.data, trashOccQ.data],
  );

  /** Catalog rows for the active kind, post source-filter. */
  const catalogRows = useMemo<Array<TaxoRow & { kind: Kind }>>(() => {
    const rows = listByKind(activeKind).map((r) => ({ ...r, kind: activeKind }));
    if (srcF === "all") return rows;
    if (srcF === "seed") return rows.filter((r) => r.tenantId == null || r.source === "seed");
    return rows.filter((r) => r.source === srcF && r.tenantId != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industries, occupations, activeKind, srcF]);

  // ── drawer (edit / review one row) ───────────────────────────────────────────
  const [openRef, setOpenRef] = useState<{ id: string; kind: Kind } | null>(null);
  const active = useMemo(() => {
    if (!openRef) return null;
    return listByKind(openRef.kind).find((r) => r.id === openRef.id) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRef, industries, occupations]);
  const activeIsBase = !!active && active.tenantId == null;

  // editable drawer fields (seeded when a row opens)
  const [fName, setFName] = useState("");
  const [fNameEn, setFNameEn] = useState("");
  const [fParent, setFParent] = useState<string>(""); // "" = tanpa induk
  const [mergeTo, setMergeTo] = useState<string>("");

  useEffect(() => {
    if (!active) return;
    setFName(active.name);
    setFNameEn(active.nameEn ?? "");
    setFParent(active.parentId ?? "");
    setMergeTo("");
  }, [active]);

  // Esc closes the drawer (AppDrawerRaw also handles it; this keeps openRef in sync).
  useEffect(() => {
    if (!openRef) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRef(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openRef]);

  // parent candidates for the active kind (exclude self), name-sorted.
  const parentOptions = useMemo(() => {
    if (!active) return [] as TaxoRow[];
    return listByKind(openRef!.kind)
      .filter((r) => r.id !== active.id)
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, openRef, industries, occupations]);

  // merge-into candidates: tenant-owned OR base rows other than self (you merge
  // YOUR row away INTO any surviving live row).
  const mergeOptions = parentOptions;

  // ── create (manual) drawer ───────────────────────────────────────────────────
  const [createKind, setCreateKind] = useState<Kind | null>(null);
  const [cName, setCName] = useState("");
  const [cNameEn, setCNameEn] = useState("");
  const [cParent, setCParent] = useState("");

  function openCreate(kind: Kind) {
    setCreateKind(kind);
    setCName("");
    setCNameEn("");
    setCParent("");
  }

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<(TaxoRow & { kind: Kind }) | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<(TaxoRow & { kind: Kind }) | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<(TaxoRow & { kind: Kind }) | null>(null);
  const [rejectTarget, setRejectTarget] = useState<(TaxoRow & { kind: Kind }) | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refresh(kind: Kind) {
    qc.invalidateQueries({ queryKey: ["taxonomy", kind] });
  }

  const create = useMutation({
    mutationFn: async (vars: { kind: Kind; name: string; nameEn: string; parentId: string }) =>
      readJson<TaxoRow>(
        await fetch(`/api/taxonomy/${kindPath(vars.kind)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: vars.name,
            nameEn: vars.nameEn || null,
            parentId: vars.parentId || null,
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(`${vars.kind === "industry" ? "Industri" : "Pekerjaan"} ditambahkan`);
      refresh(vars.kind);
      setCreateKind(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambahkan"),
  });

  // Save edits (+ used by the AI review "Setujui & simpan": editing an AI row and
  // saving promotes it to a curated entry; the row simply keeps its id).
  const update = useMutation({
    mutationFn: async (vars: {
      kind: Kind;
      id: string;
      name: string;
      nameEn: string;
      parentId: string;
    }) =>
      readJson<TaxoRow>(
        await fetch(`/api/taxonomy/${kindPath(vars.kind)}/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: vars.name,
            nameEn: vars.nameEn || null,
            parentId: vars.parentId || null,
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success("Perubahan disimpan");
      refresh(vars.kind);
      setOpenRef(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan"),
  });

  const softDelete = useMutation({
    mutationFn: async (row: TaxoRow & { kind: Kind }) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/taxonomy/${kindPath(row.kind)}/${row.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, row) => {
      toast.success(`"${row.name}" dipindah ke Sampah`);
      refresh(row.kind);
      setDeleteTarget(null);
      setRejectTarget(null);
      if (openRef?.id === row.id) setOpenRef(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleteTarget(null);
      setRejectTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (row: TaxoRow & { kind: Kind }) =>
      readJson<TaxoRow>(
        await fetch(`/api/taxonomy/${kindPath(row.kind)}/${row.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, row) => {
      toast.success(`"${row.name}" dipulihkan`);
      refresh(row.kind);
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (row: TaxoRow & { kind: Kind }) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/taxonomy/${kindPath(row.kind)}/${row.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, row) => {
      toast.success(`"${row.name}" dihapus permanen`);
      refresh(row.kind);
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  const merge = useMutation({
    mutationFn: async (vars: { kind: Kind; fromId: string; toId: string }) =>
      readJson<TaxoRow>(
        await fetch(`/api/taxonomy/${kindPath(vars.kind)}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromId: vars.fromId, toId: vars.toId }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success("Kategori digabung");
      refresh(vars.kind);
      setOpenRef(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menggabungkan"),
  });

  // ── top-level loading / error (the active kind drives the catalog view) ─────
  const activeQ = activeKind === "industry" ? industriesQ : occupationsQ;
  const forbidden =
    (industriesQ.error instanceof Error && industriesQ.error.message === "forbidden") ||
    (occupationsQ.error instanceof Error && occupationsQ.error.message === "forbidden");
  const bothLoading = industriesQ.isLoading || occupationsQ.isLoading;

  const addLabel = activeKind === "industry" ? "Tambah industri" : "Tambah pekerjaan";

  return (
    <div>
      <PageHeader
        title="Master Data — Industri & Pekerjaan"
        description="Katalog yang dipakai AI untuk mengklasifikasi perusahaan & orang hasil crawl. Ada base bawaan (dipakai bersama, read-only) + tambahanmu sendiri (AI / manual)."
      >
        <Button
          size="sm"
          onClick={() => openCreate(activeKind)}
          disabled={tab === "review" || tab === "trash"}
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Industri"
            value={industriesQ.isLoading ? null : indStats.total}
            hint={
              industriesQ.isLoading
                ? undefined
                : `${indStats.base} base · ${indStats.own} punyamu`
            }
          />
          <StatCard
            label="Pekerjaan"
            value={occupationsQ.isLoading ? null : occStats.total}
            hint={
              occupationsQ.isLoading
                ? undefined
                : `${occStats.base} base · ${occStats.own} punyamu`
            }
          />
          <StatCard
            label="Dibuat AI (perlu review)"
            value={bothLoading ? null : aiToReview}
            badge={{ label: "AI", style: { background: "hsl(173 80% 40% / .12)", color: "#0d9488" } }}
            valueClass="text-tertiary"
            hint={bothLoading ? undefined : "klik Antrian review untuk menyetujui"}
          />
          <StatCard
            label="Belum diklasifikasi"
            value={0}
            valueClass="text-warning"
            hint="belum terlacak"
            placeholderDash
          />
        </section>

        {/* ============ KIND TABS + REVIEW QUEUE + TRASH ============ */}
        <div className="flex items-center gap-1 border-b border-border text-sm">
          <KindTabButton active={tab === "industry"} onClick={() => setTab("industry")}>
            Industri <CountSpan>{industriesQ.isLoading ? "…" : indStats.total}</CountSpan>
          </KindTabButton>
          <KindTabButton active={tab === "occupation"} onClick={() => setTab("occupation")}>
            Pekerjaan <CountSpan>{occupationsQ.isLoading ? "…" : occStats.total}</CountSpan>
          </KindTabButton>
          <KindTabButton active={tab === "review"} onClick={() => setTab("review")}>
            Antrian review
            {aiToReview > 0 && (
              <span className="ml-1 rounded-full bg-tertiary/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-tertiary">
                {aiToReview}
              </span>
            )}
          </KindTabButton>
          <KindTabButton active={tab === "trash"} onClick={() => setTab("trash")} className="ml-auto">
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashRows.length > 0 && (
              <span className="ml-1 rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashRows.length}
              </span>
            )}
          </KindTabButton>
        </div>

        {/* ============ TABLE CARD ============ */}
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          {/* toolbar: source filter (catalog tabs only) */}
          {(tab === "industry" || tab === "occupation") && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">Sumber:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "seed", label: "Base" },
                    { v: "ai", label: "AI" },
                    { v: "manual", label: "Manual" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSrcF(s.v)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs transition-colors",
                      srcF === s.v
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[11px] text-muted-foreground">
                <b className="text-foreground">{catalogRows.length}</b> baris
              </span>
            </div>
          )}

          {/* body: loading / error / empty / table per tab */}
          {tab === "trash" ? (
            <TrashView
              loading={trashIndQ.isLoading || trashOccQ.isLoading}
              error={trashIndQ.isError || trashOccQ.isError}
              rows={trashRows}
              onRetry={() => {
                trashIndQ.refetch();
                trashOccQ.refetch();
              }}
              onRestore={(r) => setRestoreTarget(r)}
              onPurge={(r) => setPurgeTarget(r)}
            />
          ) : activeQ.isLoading || (tab === "review" && bothLoading) ? (
            <TableLoading />
          ) : activeQ.isError ? (
            <ErrorState
              className="border-0"
              title={forbidden ? "Tidak punya akses" : "Gagal memuat master data"}
              description={
                forbidden
                  ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                  : "Tidak bisa mengambil katalog taksonomi. Pastikan kamu login & database tersedia."
              }
              onRetry={() => activeQ.refetch()}
            />
          ) : tab === "review" ? (
            reviewRows.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Sparkles}
                title="Tidak ada usulan AI"
                description="Saat AI mengklasifikasi hasil crawl & mengusulkan kategori baru, usulannya muncul di sini untuk kamu tinjau (Setujui / Tolak)."
              />
            ) : (
              <TaxoTable
                rows={reviewRows}
                isReview
                nameById={nameById}
                onOpen={(r) => setOpenRef({ id: r.id, kind: r.kind })}
                onDelete={(r) => setDeleteTarget(r)}
              />
            )
          ) : catalogRows.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Tags}
              title={srcF === "all" ? "Belum ada kategori" : "Tidak ada yang cocok"}
              description={
                srcF === "all"
                  ? `Katalog ${KIND_NOUN[activeKind]} masih kosong. Tambah manual, atau biarkan AI mengusulkan saat crawl berjalan.`
                  : "Coba ubah filter sumber (Base / AI / Manual)."
              }
              action={
                srcF === "all" ? (
                  <Button size="sm" onClick={() => openCreate(activeKind)}>
                    <Plus className="h-4 w-4" /> {addLabel}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TaxoTable
              rows={catalogRows}
              nameById={nameById}
              onOpen={(r) => setOpenRef({ id: r.id, kind: r.kind })}
              onDelete={(r) => setDeleteTarget(r)}
            />
          )}

          {/* legend footer */}
          {(tab === "industry" || tab === "occupation") && (
            <div className="border-t border-border bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
              Baris{" "}
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-semibold text-secondary-foreground">
                <Lock className="h-2.5 w-2.5" />
                Base
              </span>{" "}
              read-only (katalog bawaan, dipakai semua tenant). Tambahanmu (AI / Manual) bisa
              diedit, digabung, dihapus. Jumlah pemakaian per kategori belum terlacak.
            </div>
          )}
        </section>
      </div>

      {/* ===================== EDIT / REVIEW DRAWER ===================== */}
      <AppDrawerRaw
        open={!!openRef}
        onClose={() => setOpenRef(null)}
        title={active?.name ?? "Detail kategori"}
        widthClassName="w-[400px] max-w-full"
      >
        {active && openRef && (
          <>
            {/* header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">{active.name}</h2>
                <p className="truncate text-[11px] text-tertiary">
                  {active.source === "ai" ? (
                    <>
                      dibuat AI
                      {active.confidence != null
                        ? ` · keyakinan ${active.confidence.toFixed(2)}`
                        : ""}{" "}
                      · perlu review
                    </>
                  ) : activeIsBase ? (
                    <span className="text-muted-foreground">katalog base · read-only</span>
                  ) : (
                    <span className="text-muted-foreground">
                      manual · {KIND_NOUN[openRef.kind]}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setOpenRef(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* base read-only notice */}
              {activeIsBase && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Ini kategori <b className="text-foreground">base bawaan</b> — dipakai bersama
                    semua tenant dan tidak bisa diedit / dihapus. Buat kategori sendiri kalau butuh
                    variasi.
                  </span>
                </div>
              )}

              {/* AI review banner */}
              {active.source === "ai" && (
                <div className="rounded-lg border border-tertiary/30 bg-tertiary/[0.06] p-3 text-[11px] leading-relaxed">
                  <b>Alasan AI:</b>{" "}
                  {active.description?.trim() ||
                    "AI mengusulkan kategori ini saat tidak menemukan kandidat yang pas dari katalog yang ada. Tinjau nama & induknya, lalu setujui atau tolak."}
                </div>
              )}

              {/* Nama (ID) */}
              <Field label="Nama (ID)">
                <input
                  type="text"
                  value={fName}
                  disabled={activeIsBase}
                  onChange={(e) => setFName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted/40"
                />
              </Field>

              {/* Nama (EN) */}
              <Field label="Nama (EN)">
                <input
                  type="text"
                  value={fNameEn}
                  disabled={activeIsBase}
                  onChange={(e) => setFNameEn(e.target.value)}
                  placeholder="opsional"
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted/40"
                />
              </Field>

              {/* Induk (parent) */}
              <Field label="Induk (parent)">
                <SelectBox
                  value={fParent}
                  disabled={activeIsBase}
                  onChange={setFParent}
                  options={[
                    { value: "", label: "— tanpa induk —" },
                    ...parentOptions.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>

              {/* Dipakai oleh — honestly not tracked */}
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Dipakai oleh
                </h3>
                <div className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                  Jumlah perusahaan / kontak yang memakai kategori ini{" "}
                  <span className="italic">belum terlacak</span> — penghitungan pemakaian per
                  kategori akan muncul di sini setelah modul atribusi crawl aktif.
                </div>
              </div>

              {/* Merge — own rows only (you merge YOUR row away into a survivor) */}
              {!activeIsBase && (
                <div className="rounded-lg border border-border p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <GitMerge className="h-3.5 w-3.5" />
                    Gabung ke kategori lain
                  </h3>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Semua entitas yang menunjuk ke sini dipindah, lalu kategori ini diarsipkan ke
                    Sampah.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SelectBox
                        value={mergeTo}
                        onChange={setMergeTo}
                        small
                        options={[
                          { value: "", label: "Pilih kategori tujuan…" },
                          ...mergeOptions.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!mergeTo || merge.isPending}
                      onClick={() =>
                        mergeTo &&
                        merge.mutate({ kind: openRef.kind, fromId: active.id, toId: mergeTo })
                      }
                      className="h-8 shrink-0 rounded-lg border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {merge.isPending ? "…" : "Gabung"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* footer actions */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              {activeIsBase ? (
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpenRef(null)}>
                  Tutup
                </Button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ ...active, kind: openRef.kind })}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </button>
                  {active.source === "ai" && (
                    <button
                      type="button"
                      onClick={() => setRejectTarget({ ...active, kind: openRef.kind })}
                      className="ml-auto h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Tolak usulan AI
                    </button>
                  )}
                  <Button
                    size="sm"
                    className={active.source === "ai" ? "" : "ml-auto"}
                    disabled={update.isPending || !fName.trim()}
                    onClick={() =>
                      update.mutate({
                        kind: openRef.kind,
                        id: active.id,
                        name: fName.trim(),
                        nameEn: fNameEn.trim(),
                        parentId: fParent,
                      })
                    }
                  >
                    {update.isPending ? (
                      "Menyimpan…"
                    ) : active.source === "ai" ? (
                      <>
                        <Check className="h-4 w-4" /> Setujui & simpan
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Simpan
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </AppDrawerRaw>

      {/* ===================== CREATE (manual) DRAWER ===================== */}
      <AppDrawerRaw
        open={!!createKind}
        onClose={() => setCreateKind(null)}
        title="Tambah kategori"
        widthClassName="w-[400px] max-w-full"
      >
        {createKind && (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">
                  Tambah {createKind === "industry" ? "industri" : "pekerjaan"}
                </h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  kategori manual milik workspace-mu
                </p>
              </div>
              <button
                onClick={() => setCreateKind(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <Field label="Nama (ID)">
                <input
                  type="text"
                  value={cName}
                  autoFocus
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="mis. Konveksi & Garmen"
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </Field>
              <Field label="Nama (EN)">
                <input
                  type="text"
                  value={cNameEn}
                  onChange={(e) => setCNameEn(e.target.value)}
                  placeholder="opsional — mis. Apparel Manufacturing"
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </Field>
              <Field label="Induk (parent)">
                <SelectBox
                  value={cParent}
                  onChange={setCParent}
                  options={[
                    { value: "", label: "— tanpa induk —" },
                    ...listByKind(createKind)
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "id"))
                      .map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setCreateKind(null)}>
                Batal
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={create.isPending || !cName.trim()}
                onClick={() =>
                  create.mutate({
                    kind: createKind,
                    name: cName.trim(),
                    nameEn: cNameEn.trim(),
                    parentId: cParent,
                  })
                }
              >
                <Plus className="h-4 w-4" /> {create.isPending ? "Menyimpan…" : "Tambah"}
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
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b>. Entitas yang sudah dilabeli kategori ini tidak
            terhapus. Kamu masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== TOLAK USULAN AI (= soft-delete an AI row) ============ */}
      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        icon={<X className="h-5 w-5" />}
        tone="destructive"
        title="Tolak usulan AI?"
        body={
          <>
            Usulan{" "}
            <span className="font-medium text-foreground">{rejectTarget?.name}</span> akan diarsipkan
            ke <b>Sampah</b> dan tidak dipakai untuk mengklasifikasi. Bisa dipulihkan nanti.
          </>
        }
        confirmLabel="Ya, tolak"
        confirmPending={softDelete.isPending}
        onConfirm={() => rejectTarget && softDelete.mutate(rejectTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan kategori?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan
            dikembalikan ke katalog aktif.
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
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.name}</span> akan dihapus
            selamanya dari katalog.
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
  placeholderDash,
}: {
  label: string;
  value: number | null;
  hint?: string;
  badge?: { label: string; style: React.CSSProperties };
  valueClass?: string;
  /** Render a dash instead of the number (for not-yet-tracked metrics). */
  placeholderDash?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          <Skeleton className="h-7 w-12" />
        ) : placeholderDash ? (
          <span className={cn("text-2xl font-bold", valueClass)}>—</span>
        ) : (
          <span className={cn("text-2xl font-bold tabular-nums", valueClass)}>
            {value.toLocaleString("id-ID")}
          </span>
        )}
        {badge && value != null && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={badge.style}>
            {badge.label}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KindTabButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1 border-b-2 px-4 py-2.5 transition-colors",
        active
          ? "border-primary font-semibold text-foreground"
          : "border-transparent font-medium text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function CountSpan({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
  disabled,
  small,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted/40",
          small ? "h-8 text-[12px]" : "h-9 text-sm",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function SourceBadge({ source, isBase }: { source: Source; isBase: boolean }) {
  if (isBase || source === "seed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
        <Lock className="h-2.5 w-2.5" /> Base
      </span>
    );
  }
  if (source === "ai") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/[0.12] px-2 py-0.5 text-[10px] font-semibold text-tertiary">
        AI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/[0.12] px-2 py-0.5 text-[10px] font-semibold text-info">
      Manual
    </span>
  );
}

function ConfidencePill({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  return (
    <span className="ml-1 text-[10px] font-medium tabular-nums text-tertiary">
      {confidence.toFixed(2)}
    </span>
  );
}

function TaxoTable({
  rows,
  nameById,
  onOpen,
  onDelete,
  isReview,
}: {
  rows: Array<TaxoRow & { kind: Kind }>;
  nameById: Map<string, string>;
  onOpen: (r: TaxoRow & { kind: Kind }) => void;
  onDelete: (r: TaxoRow & { kind: Kind }) => void;
  isReview?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-2.5 font-semibold">{isReview ? "Kategori" : "Nama"}</th>
            <th className="px-4 py-2.5 font-semibold">Sumber</th>
            <th className="px-4 py-2.5 font-semibold">Induk</th>
            <th className="px-4 py-2.5 text-right font-semibold">Dipakai</th>
            <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const isBase = r.tenantId == null;
            const isAi = r.source === "ai";
            return (
              <tr
                key={`${r.kind}:${r.id}`}
                onClick={() => onOpen(r)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted/30",
                  isAi && "bg-tertiary/[0.04]",
                )}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    {r.name}
                    {isAi && <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />}
                    {isReview && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {r.kind === "industry" ? "Industri" : "Pekerjaan"}
                      </span>
                    )}
                  </div>
                  {r.nameEn && (
                    <div className="text-[11px] text-muted-foreground">{r.nameEn}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center">
                    <SourceBadge source={r.source} isBase={isBase} />
                    {isAi && <ConfidencePill confidence={r.confidence} />}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">
                  {r.parentId ? nameById.get(r.parentId) ?? "—" : "—"}
                </td>
                <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">—</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {isBase ? (
                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      className="h-7 rounded-md border border-border px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                    >
                      Lihat
                    </button>
                  ) : isReview ? (
                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      className="text-[11px] font-medium text-tertiary hover:underline"
                    >
                      Review ›
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpen(r)}
                        title="Edit"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r)}
                        title="Hapus"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrashView({
  loading,
  error,
  rows,
  onRetry,
  onRestore,
  onPurge,
}: {
  loading: boolean;
  error: boolean;
  rows: Array<TaxoRow & { kind: Kind }>;
  onRetry: () => void;
  onRestore: (r: TaxoRow & { kind: Kind }) => void;
  onPurge: (r: TaxoRow & { kind: Kind }) => void;
}) {
  if (loading) return <TableLoading />;
  if (error) {
    return (
      <ErrorState
        className="border-0"
        title="Gagal memuat sampah"
        description="Tidak bisa mengambil kategori yang dihapus."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        className="border-0"
        icon={Trash2}
        title="Sampah kosong"
        description="Kategori yang kamu hapus (atau usulan AI yang ditolak) muncul di sini dan bisa dipulihkan."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-2.5 font-semibold">Nama</th>
            <th className="px-4 py-2.5 font-semibold">Jenis</th>
            <th className="px-4 py-2.5 font-semibold">Sumber</th>
            <th className="px-4 py-2.5 font-semibold">Dihapus</th>
            <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.id}`} className="transition-colors hover:bg-muted/30">
              <td className="px-5 py-3">
                <div className="font-medium text-foreground/80">{r.name}</div>
                {r.nameEn && <div className="text-[11px] text-muted-foreground">{r.nameEn}</div>}
              </td>
              <td className="px-4 py-3 text-[11px] text-muted-foreground">
                {r.kind === "industry" ? "Industri" : "Pekerjaan"}
              </td>
              <td className="px-4 py-3">
                <SourceBadge source={r.source} isBase={r.tenantId == null} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{fmtRelID(r.deletedAt)}</td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRestore(r)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
                  >
                    <RotateCcw className="h-3 w-3" /> Pulihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => onPurge(r)}
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
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
