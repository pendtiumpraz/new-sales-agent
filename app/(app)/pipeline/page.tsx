"use client";

/**
 * Pipeline · Deal — Module 3 FRONTEND (Sainskerta Loop Phase 04, CRM kanban).
 *
 * Faithful to `mockups/pipeline.html` (Coral Sunset theme via the shared CSS
 * vars). Renders INSIDE the per-tenant white-label `(app)` shell — the sidebar +
 * topbar come from `app/(app)/layout.tsx`, so this page is just the board body.
 *
 * Wired to the NEW CRM backend (NO mock / NO hardcoded data — { ok, data }
 * envelope). Every band has loading + empty + error states:
 *   - GET    /api/pipeline                       → boards (pick default/first)
 *   - GET    /api/pipeline/stages?pipelineId=    → kanban columns (ordered by sort)
 *   - GET    /api/deals?pipelineId=              → deal cards
 *   - GET    /api/contacts                       → resolve kontak (name/segment/channel)
 *   - GET    /api/deals/trashed                  → trash view
 *   - PATCH  /api/deals/[id]                     → move stage / mark won/lost
 *   - DELETE /api/deals/[id]                     → SOFT delete (→ Sampah)
 *   - PATCH  /api/deals/[id]/restore             → restore from Sampah
 *   - DELETE /api/deals/[id]?purge=1             → HARD delete (purge, irreversible)
 *
 * Segment (B2C/B2B) is carried by the CONTACT, not the deal — so each card's
 * segment badge + the segment filter are derived from the deal's linked contact
 * (consistent with the Kontak page). The segment band is always visible.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import type { ApiResult, Page } from "@/modules/_shared/api";

// Render on demand (never statically prerender). This page reads the persisted
// workspace store on the client; forcing dynamic avoids the static-prerender ↔
// client-hydration mismatch that surfaces as "Application error: a client-side
// exception has occurred".
export const dynamic = "force-dynamic";

// ── API row shapes (mirror modules/crm/schema · selected fields) ─────────────
interface PipelineRow {
  id: string;
  name: string;
  workspaceId: string | null;
  isDefault: boolean;
}

interface StageRow {
  id: string;
  pipelineId: string;
  name: string;
  sort: number;
  probability: number | null;
  isWon: boolean;
  isLost: boolean;
}

interface DealRow {
  id: string;
  name: string;
  pipelineId: string | null;
  stageId: string | null;
  contactId: string | null;
  companyId: string | null;
  workspaceId: string | null;
  value: number; // raw IDR
  currency: string;
  status: string; // open | won | lost
  sourceChannel: string | null;
  expectedClose: string | null;
  deletedAt?: string | null;
  updatedAt: string;
}

interface ContactRow {
  id: string;
  fullName: string;
  title: string | null;
  segment: string; // b2c | b2b | unknown
  whatsapp: string | null;
  email: string | null;
  channelPreference: string | null;
  fitScore: number | null;
}

type Segment = "all" | "b2c" | "b2b";
type Tab = "kanban" | "sampah";

// ── fetch helper (throws on the { ok:false } envelope) ───────────────────────
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

// ── formatting ───────────────────────────────────────────────────────────────
/** Compact IDR: ≥1 M shows "M", ≥1 jt shows "jt", else raw rupiah. Coerces any
 *  null/NaN (e.g. a deal with no value) to 0 so it can never throw at render. */
function rpCompact(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  if (v >= 1_000_000_000)
    return `Rp ${(v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000_000)
    return `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function rpFull(n: number): string {
  return `Rp ${(Number.isFinite(n) ? n : 0).toLocaleString("id-ID")}`;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/[ —]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function fmtDateTimeID(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Channel chip metadata — matches the mockup's CHAN map (Coral Sunset). */
const CHAN: Record<string, { c: string; label: string }> = {
  wa: { c: "#25D366", label: "WhatsApp" },
  whatsapp: { c: "#25D366", label: "WhatsApp" },
  ig: { c: "#E1306C", label: "Instagram" },
  instagram: { c: "#E1306C", label: "Instagram" },
  email: { c: "#6366F1", label: "Email" },
  shopee: { c: "#EE4D2D", label: "Shopee" },
};

function normSegment(s: string | undefined): "b2c" | "b2b" | "unknown" {
  if (s === "b2b") return "b2b";
  if (s === "b2c") return "b2c";
  return "unknown";
}

export default function PipelinePage() {
  const qc = useQueryClient();
  // Workspace scope from the active-workspace store (doc 44 workspace-first nav) —
  // NOT useSearchParams(), which without a &lt;Suspense&gt; boundary throws a client-side
  // "application error" in the production build.
  const workspaceId = useWorkspaceStore((s) => s.active?.id ?? null);
  const [wsAll, setWsAll] = useState(false);
  const scope = workspaceId && !wsAll ? workspaceId : null;

  const [tab, setTab] = useState<Tab>("kanban");
  const [segment, setSegment] = useState<Segment>("all");

  // ── (1) pipelines → pick the active board (default first, else first row) ──
  const pipelinesQ = useQuery({
    queryKey: ["crm", "pipelines", scope],
    queryFn: async () =>
      readJson<PipelineRow[]>(
        await fetch(`/api/pipeline${scope ? `?workspaceId=${encodeURIComponent(scope)}` : ""}`),
      ),
  });
  const pipelines = useMemo(() => pipelinesQ.data ?? [], [pipelinesQ.data]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  // Resolve the active board once pipelines load (or when the list changes).
  useEffect(() => {
    if (pipelines.length === 0) {
      setActivePipelineId(null);
      return;
    }
    setActivePipelineId((cur) => {
      if (cur && pipelines.some((p) => p.id === cur)) return cur;
      return (pipelines.find((p) => p.isDefault) ?? pipelines[0]).id;
    });
  }, [pipelines]);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  // ── (2) stages of the active board → kanban columns ──
  const stagesQ = useQuery({
    queryKey: ["crm", "stages", activePipelineId],
    enabled: !!activePipelineId,
    queryFn: async () =>
      readJson<StageRow[]>(
        await fetch(`/api/pipeline/stages?pipelineId=${encodeURIComponent(activePipelineId!)}`),
      ),
  });
  const stages = useMemo(
    () => [...(stagesQ.data ?? [])].sort((a, b) => a.sort - b.sort),
    [stagesQ.data],
  );

  // ── (3) deals of the active board ──
  const dealsQ = useQuery({
    queryKey: ["crm", "deals", activePipelineId],
    enabled: !!activePipelineId,
    queryFn: async () =>
      (
        await readJson<Page<DealRow>>(
          await fetch(`/api/deals?pipelineId=${encodeURIComponent(activePipelineId!)}&limit=200`),
        )
      ).items,
  });
  const deals = useMemo(() => dealsQ.data ?? [], [dealsQ.data]);

  // ── (4) contacts → resolve kontak name + SEGMENT + channel per deal ──
  const contactsQ = useQuery({
    queryKey: ["crm", "contacts", scope],
    // /api/contacts returns a PAGE ({ items, nextCursor }), NOT a raw array — read
    // .items (same as /api/deals above). Reading it as an array made the for..of
    // below throw "object is not iterable" and crashed the whole board.
    queryFn: async () =>
      (
        await readJson<Page<ContactRow>>(
          await fetch(`/api/contacts${scope ? `?workspaceId=${encodeURIComponent(scope)}` : ""}`),
        )
      ).items,
  });
  const contacts = useMemo(
    () => (Array.isArray(contactsQ.data) ? contactsQ.data : []),
    [contactsQ.data],
  );
  const contactById = useMemo(() => {
    const m = new Map<string, ContactRow>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  // The deal's segment is its contact's segment (deal carries no segment).
  function dealSegment(d: DealRow): "b2c" | "b2b" | "unknown" {
    return normSegment(d.contactId ? contactById.get(d.contactId)?.segment : undefined);
  }

  // ── (5) trash view (lazy: only when the Sampah tab is open) ──
  const trashedQ = useQuery({
    queryKey: ["crm", "deals", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<DealRow[]>(await fetch("/api/deals/trashed")),
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── segment-filtered live deals ──
  const segmentedDeals = useMemo(
    () => (segment === "all" ? deals : deals.filter((d) => dealSegment(d) === segment)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, segment, contactById],
  );

  // ── KPI strip (derived from the live, scoped board) ──
  const kpis = useMemo(() => {
    const open = segmentedDeals.filter((d) => d.status === "open");
    const hot = segmentedDeals.filter((d) => {
      const fit = d.contactId ? contactById.get(d.contactId)?.fitScore ?? 0 : 0;
      return fit >= 0.8;
    });
    const pipelineValue = open.reduce((s, d) => s + (d.value || 0), 0);
    return {
      hot: hot.length,
      active: open.length,
      value: pipelineValue,
      stages: stages.length,
    };
  }, [segmentedDeals, contactById, stages.length]);

  // ── drawer (deal detail) ──
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const openDeal = useMemo(
    () => deals.find((d) => d.id === openDealId) ?? null,
    [deals, openDealId],
  );
  useEffect(() => {
    if (!openDealId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDealId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openDealId]);

  // ── confirm modals (soft-delete / restore / purge) ──
  const [deleteTarget, setDeleteTarget] = useState<DealRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DealRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DealRow | null>(null);

  // ── create/edit surfaces (Deal baru · Buat pipeline · Tambah tahap · Lost) ──
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newStageOpen, setNewStageOpen] = useState(false);
  // When a deal is moved into a Lost stage we capture a reason before writing.
  const [lostTarget, setLostTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);

  function refreshDeals() {
    qc.invalidateQueries({ queryKey: ["crm", "deals"] });
  }

  // ── mutations ──
  const moveStage = useMutation({
    mutationFn: async (vars: {
      deal: DealRow;
      stageId: string;
      status?: string;
      lostReason?: string;
    }) =>
      readJson<DealRow>(
        await fetch(`/api/deals/${vars.deal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stageId: vars.stageId,
            ...(vars.status ? { status: vars.status } : {}),
            ...(vars.lostReason !== undefined ? { lostReason: vars.lostReason } : {}),
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      const st = stages.find((s) => s.id === vars.stageId);
      toast.success(`Tahap diperbarui → ${st?.name ?? "tahap baru"}`);
      refreshDeals();
      setLostTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memindah tahap");
      setLostTarget(null);
    },
  });

  // Edit a deal's core fields from the detail drawer (name / value / expectedClose).
  const editDeal = useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: { name?: string; value?: number; expectedClose?: string | null };
    }) =>
      readJson<DealRow>(
        await fetch(`/api/deals/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars.patch),
        }),
      ),
    onSuccess: () => {
      toast.success("Deal diperbarui");
      refreshDeals();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui deal"),
  });

  // Create a new deal (name + value + contact + stage + expectedClose + channel).
  const createDeal = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      readJson<DealRow>(
        await fetch(`/api/deals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Deal "${row.name}" dibuat`);
      refreshDeals();
      setNewDealOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat deal"),
  });

  // Create a pipeline (board) — offered from the empty state / filter bar.
  const createPipeline = useMutation({
    mutationFn: async (payload: { name: string; isDefault: boolean }) =>
      readJson<PipelineRow>(
        await fetch(`/api/pipeline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, workspaceId: scope ?? null }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Pipeline "${row.name}" dibuat`);
      qc.invalidateQueries({ queryKey: ["crm", "pipelines"] });
      setActivePipelineId(row.id);
      setNewPipelineOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat pipeline"),
  });

  // Create a stage on the active pipeline (appended at the end).
  const createStage = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      readJson<StageRow>(
        await fetch(`/api/pipeline/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Tahap "${row.name}" ditambahkan`);
      qc.invalidateQueries({ queryKey: ["crm", "stages"] });
      setNewStageOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambah tahap"),
  });

  const softDelete = useMutation({
    mutationFn: async (d: DealRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/deals/${d.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, d) => {
      toast.success(`"${d.name}" dipindah ke Sampah`);
      refreshDeals();
      setDeleteTarget(null);
      setOpenDealId((cur) => (cur === d.id ? null : cur));
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus deal");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (d: DealRow) =>
      readJson<DealRow>(await fetch(`/api/deals/${d.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, d) => {
      toast.success(`"${d.name}" dipulihkan`);
      refreshDeals();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan deal");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (d: DealRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/deals/${d.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, d) => {
      toast.success(`"${d.name}" dihapus permanen`);
      refreshDeals();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  const boardLoading = pipelinesQ.isLoading || stagesQ.isLoading || dealsQ.isLoading;
  const boardError = pipelinesQ.isError || stagesQ.isError || dealsQ.isError;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-card px-6 py-5">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Pipeline · Deal</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Papan kanban CRM per tahap. Klik kartu untuk membuka detail &amp; pindah tahap di panel
            kanan. <span className="font-semibold text-foreground/80">1 workspace = 1 produk.</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => refreshDeals()}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40"
          >
            <RefreshIcon className="h-4 w-4 text-muted-foreground" />
            Segarkan
          </button>
          <button
            type="button"
            onClick={() => setNewDealOpen(true)}
            disabled={!activePipelineId || stages.length === 0}
            title={
              stages.length === 0 ? "Buat pipeline & tahap dulu untuk menambah deal" : undefined
            }
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Deal baru
          </button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {/* WORKSPACE SCOPE BANNER (only when scoped to a workspace) */}
        {workspaceId && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.06] px-3.5 py-2.5 text-sm">
            <BriefcaseIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground/80">
              Pipeline difilter ke <b className="text-foreground">workspace ini</b> —{" "}
              {wsAll ? "menampilkan deal semua workspace." : "menampilkan deal workspace ini saja."}
            </span>
            <button
              type="button"
              onClick={() => setWsAll((v) => !v)}
              className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline"
            >
              {wsAll ? "Kembali ke workspace ini" : "Lihat semua workspace"}
            </button>
          </div>
        )}

        {/* KPI STRIP */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Prospek panas"
            value={boardLoading ? null : kpis.hot}
            iconStyle={{ background: "#FB5E3B18", color: "#FB5E3B" }}
            icon={<FlameIcon className="h-4 w-4" />}
          />
          <KpiCard
            label="Deal aktif"
            value={boardLoading ? null : kpis.active}
            iconStyle={{ background: "hsl(173 80% 40% / .14)", color: "#14B8A6" }}
            icon={<TrendingUpIcon className="h-4 w-4" />}
          />
          <KpiCard
            label="Nilai pipeline"
            value={boardLoading ? null : kpis.value}
            display={boardLoading ? undefined : rpCompact(kpis.value)}
            iconStyle={{ background: "hsl(12 96% 67% / .14)", color: "hsl(12 80% 55%)" }}
            icon={<CoinsIcon className="h-4 w-4" />}
          />
          <KpiCard
            label="Jumlah tahap"
            value={boardLoading ? null : kpis.stages}
            iconStyle={{ background: "#F59E0B18", color: "#F59E0B" }}
            icon={<ColumnsIcon className="h-4 w-4" />}
          />
        </section>

        {/* PRIMARY TABS: Kanban | Sampah */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "kanban"} onClick={() => setTab("kanban")}>
            <KanbanIcon className="h-4 w-4" />
            Kanban
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <TrashIcon className="h-4 w-4" />
            Sampah
            {trashed.length > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashed.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "kanban" ? (
          <>
            {/* FILTERS: board picker + segment chips */}
            <div className="flex flex-wrap items-center gap-3">
              {pipelines.length > 1 && (
                <div className="relative">
                  <select
                    value={activePipelineId ?? ""}
                    onChange={(e) => setActivePipelineId(e.target.value)}
                    className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}

              {/* SEGMENT FILTER (B2C/B2B always visible) */}
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Segmen:</span>
                <SegButton active={segment === "all"} onClick={() => setSegment("all")}>
                  Semua
                </SegButton>
                <SegButton active={segment === "b2c"} onClick={() => setSegment("b2c")}>
                  B2C
                </SegButton>
                <SegButton active={segment === "b2b"} onClick={() => setSegment("b2b")}>
                  B2B
                </SegButton>
              </div>

              {/* board/stage authoring — always reachable once a pipeline exists */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewPipelineOpen(true)}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40"
                >
                  <PlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Buat pipeline
                </button>
                {activePipelineId && stages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNewStageOpen(true)}
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40"
                  >
                    <PlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Tambah tahap
                  </button>
                )}
              </div>

              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <b className="text-foreground">{segmentedDeals.length}</b> deal di papan
              </span>
            </div>

            {/* BOARD */}
            {boardLoading ? (
              <BoardSkeleton />
            ) : boardError ? (
              <BandError
                title="Gagal memuat pipeline"
                onRetry={() => {
                  pipelinesQ.refetch();
                  stagesQ.refetch();
                  dealsQ.refetch();
                }}
              />
            ) : pipelines.length === 0 ? (
              <BandEmpty
                icon={<KanbanIcon className="h-6 w-6" />}
                title="Belum ada pipeline"
                hint="Buat pipeline (board) lebih dulu untuk mulai menyusun deal per tahap."
                action={
                  <button
                    type="button"
                    onClick={() => setNewPipelineOpen(true)}
                    className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Buat pipeline
                  </button>
                }
              />
            ) : stages.length === 0 ? (
              <BandEmpty
                icon={<ColumnsIcon className="h-6 w-6" />}
                title="Pipeline ini belum punya tahap"
                hint={`"${activePipeline?.name ?? "Pipeline"}" belum punya kolom tahap. Tambahkan tahap untuk menampilkan kanban.`}
                action={
                  <button
                    type="button"
                    onClick={() => setNewStageOpen(true)}
                    className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Tambah tahap
                  </button>
                }
              />
            ) : (
              <div className="scroll-x -mx-6 overflow-x-auto px-6 pb-3">
                <div className="flex min-w-[1100px] items-start gap-4">
                  {stages.map((st) => {
                    const inStage = segmentedDeals.filter((d) => d.stageId === st.id);
                    const total = inStage.reduce((s, d) => s + (d.value || 0), 0);
                    return (
                      <section key={st.id} className="w-72 shrink-0">
                        <div className="flex items-start justify-between rounded-t-lg border border-b-0 border-border bg-card px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ background: stageDot(st) }}
                              />
                              <span className="text-[13px] font-semibold text-foreground">
                                {st.name}
                              </span>
                            </div>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {rpCompact(total)}
                            </span>
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                            {inStage.length}
                          </span>
                        </div>
                        <div className="min-h-[420px] space-y-2 rounded-b-lg border border-border bg-muted/40 p-2">
                          {inStage.length === 0 ? (
                            <div className="py-8 text-center text-[11px] text-muted-foreground/70">
                              Belum ada deal
                            </div>
                          ) : (
                            inStage.map((d) => (
                              <DealCard
                                key={d.id}
                                deal={d}
                                segment={dealSegment(d)}
                                contact={d.contactId ? contactById.get(d.contactId) : undefined}
                                onClick={() => setOpenDealId(d.id)}
                              />
                            ))
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LEGEND */}
            <p className="max-w-3xl text-[11px] text-muted-foreground">
              Badge segmen: <SegBadge segment="b2c" /> (perorangan) · <SegBadge segment="b2b" />{" "}
              (perusahaan) — konsisten dengan halaman Kontak. Kartu menampilkan nilai, segmen,
              kontak &amp; kanal akuisisi. Klik kartu untuk detail + pindah tahap.
            </p>
          </>
        ) : (
          /* ===================== SAMPAH (trash) ===================== */
          <>
            <p className="text-xs text-muted-foreground">
              Deal yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke papan,{" "}
              <b>Hapus permanen</b> menghapus selamanya (tidak bisa dibatalkan).
            </p>
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
              {trashedQ.isLoading ? (
                <TableLoading />
              ) : trashedQ.isError ? (
                <BandError title="Gagal memuat sampah" onRetry={() => trashedQ.refetch()} />
              ) : trashed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <TrashIcon className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium">Sampah kosong</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Deal yang Anda hapus akan muncul di sini.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Deal</th>
                        <th className="px-5 py-3 font-semibold">Segmen</th>
                        <th className="px-5 py-3 font-semibold">Nilai</th>
                        <th className="px-5 py-3 font-semibold">Dihapus</th>
                        <th className="px-5 py-3 text-right font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {trashed.map((d) => {
                        const seg = normSegment(
                          d.contactId ? contactById.get(d.contactId)?.segment : undefined,
                        );
                        return (
                          <tr
                            key={d.id}
                            className="text-muted-foreground transition-colors hover:bg-muted/30"
                          >
                            <td className="px-5 py-3">
                              <p className="truncate font-semibold text-foreground/70">{d.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">#{d.id.slice(0, 12)}</p>
                            </td>
                            <td className="px-5 py-3">
                              <SegBadge segment={seg} />
                            </td>
                            <td className="px-5 py-3 text-[13px] font-medium text-foreground/80">
                              {rpFull(d.value)}
                            </td>
                            <td className="px-5 py-3 text-[13px]">{fmtDateTimeID(d.deletedAt)}</td>
                            <td className="whitespace-nowrap px-5 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => setRestoreTarget(d)}
                                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-tertiary transition-colors hover:bg-tertiary/5"
                                >
                                  <RestoreIcon className="h-4 w-4" />
                                  Pulihkan
                                </button>
                                <button
                                  onClick={() => {
                                    setPurgeTarget(d);
                                  }}
                                  className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                  Hapus permanen
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
          </>
        )}
      </div>

      {/* ===================== DRAWER (deal detail) ===================== */}
      <AppDrawerRaw
        open={!!openDeal}
        onClose={() => setOpenDealId(null)}
        title={openDeal?.name ?? "Detail deal"}
        widthClassName="w-full max-w-[400px]"
      >
        {openDeal && (
          <DealDrawer
            deal={openDeal}
            stages={stages}
            segment={dealSegment(openDeal)}
            contact={openDeal.contactId ? contactById.get(openDeal.contactId) : undefined}
            onClose={() => setOpenDealId(null)}
            onMoveStage={(stageId, status) => {
              // A move into a Lost stage must capture a reason first (below).
              if (status === "lost") setLostTarget({ deal: openDeal, stageId });
              else moveStage.mutate({ deal: openDeal, stageId, status });
            }}
            onDelete={() => setDeleteTarget(openDeal)}
            onSaveEdit={(patch) => editDeal.mutate({ id: openDeal.id, patch })}
            savePending={editDeal.isPending}
            movePending={moveStage.isPending}
          />
        )}
      </AppDrawerRaw>

      {/* SOFT-DELETE CONFIRM */}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="destructive"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b>. Anda masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel={softDelete.isPending ? "Memproses…" : "Ya, hapus"}
        confirmDisabled={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* RESTORE CONFIRM */}
      <ConfirmDialog
        open={!!restoreTarget}
        tone="tertiary"
        icon={<RestoreIcon className="h-5 w-5" />}
        title="Pulihkan deal?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan
            dikembalikan ke papan kanban.
          </>
        }
        confirmLabel={restore.isPending ? "Memproses…" : "Ya, pulihkan"}
        confirmDisabled={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* HARD-DELETE (PURGE) CONFIRM — strong, type-to-confirm */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.name ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
      />

      {/* ===================== NEW DEAL ===================== */}
      <NewDealModal
        open={newDealOpen}
        onClose={() => setNewDealOpen(false)}
        pipelineId={activePipelineId}
        stages={stages}
        contacts={contacts}
        pending={createDeal.isPending}
        onSubmit={(payload) => createDeal.mutate(payload)}
      />

      {/* ===================== NEW PIPELINE ===================== */}
      <NewPipelineModal
        open={newPipelineOpen}
        onClose={() => setNewPipelineOpen(false)}
        pending={createPipeline.isPending}
        onSubmit={(payload) => createPipeline.mutate(payload)}
      />

      {/* ===================== NEW STAGE ===================== */}
      <NewStageModal
        open={newStageOpen}
        onClose={() => setNewStageOpen(false)}
        pipelineId={activePipelineId}
        pipelineName={activePipeline?.name ?? "Pipeline"}
        nextSort={stages.length}
        pending={createStage.isPending}
        onSubmit={(payload) => createStage.mutate(payload)}
      />

      {/* ===================== MARK LOST (capture reason) ===================== */}
      <LostReasonDialog
        open={!!lostTarget}
        dealName={lostTarget?.deal.name ?? ""}
        pending={moveStage.isPending}
        onClose={() => setLostTarget(null)}
        onConfirm={(reason) =>
          lostTarget &&
          moveStage.mutate({
            deal: lostTarget.deal,
            stageId: lostTarget.stageId,
            status: "lost",
            lostReason: reason,
          })
        }
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

/** A stage dot colour — terminal won = success, lost = danger, else primary. */
function stageDot(st: StageRow): string {
  if (st.isWon) return "#10B981";
  if (st.isLost) return "#EF4444";
  return "hsl(12 96% 67%)";
}

function KpiCard({
  label,
  value,
  display,
  icon,
  iconStyle,
}: {
  label: string;
  value: number | null;
  display?: string;
  icon: React.ReactNode;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={iconStyle}
        >
          {icon}
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      {value == null ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums">
          {display ?? value.toLocaleString("id-ID")}
        </p>
      )}
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
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SegButton({
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
      className={
        active
          ? "h-7 rounded-full bg-foreground px-3 text-xs font-semibold text-background"
          : "h-7 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40"
      }
    >
      {children}
    </button>
  );
}

/** Segment badge — colours consistent with the Kontak page (B2C pink, B2B teal). */
function SegBadge({ segment }: { segment: "b2c" | "b2b" | "unknown" }) {
  if (segment === "b2b") {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: "hsl(173 80% 40% / .14)", color: "#0d9488" }}
      >
        B2B
      </span>
    );
  }
  if (segment === "b2c") {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: "#E1306C18", color: "#c01f5b" }}
      >
        B2C
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      Lainnya
    </span>
  );
}

function ChannelChip({ channel }: { channel: string | null }) {
  if (!channel) return null;
  const c = CHAN[channel.toLowerCase()];
  if (!c) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
      title={`Kanal akuisisi: ${c.label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.c }} />
      {c.label}
    </span>
  );
}

function DealCard({
  deal,
  segment,
  contact,
  onClick,
}: {
  deal: DealRow;
  segment: "b2c" | "b2b" | "unknown";
  contact?: ContactRow;
  onClick: () => void;
}) {
  const channel = deal.sourceChannel ?? contact?.channelPreference ?? null;
  const hot = (contact?.fitScore ?? 0) >= 0.8;
  const contactName = contact?.fullName ?? "Tanpa kontak";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-soft transition-all hover:-translate-y-px hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-1.5">
        <h4 className="text-[13px] font-semibold leading-snug text-foreground">{deal.name}</h4>
        {hot && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium"
            style={{ color: "#FB5E3B" }}
            title="Prospek panas (fit tinggi)"
          >
            <FlameIcon className="h-3 w-3" filled />
            panas
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[13px] font-bold text-foreground">{rpCompact(deal.value)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SegBadge segment={segment} />
        <ChannelChip channel={channel} />
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-border/70 pt-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
          {initialsOf(contactName)}
        </span>
        <span className="flex-1 truncate text-[11px] text-muted-foreground">{contactName}</span>
      </div>
    </button>
  );
}

function DealDrawer({
  deal,
  stages,
  segment,
  contact,
  onClose,
  onMoveStage,
  onDelete,
  onSaveEdit,
  savePending,
  movePending,
}: {
  deal: DealRow;
  stages: StageRow[];
  segment: "b2c" | "b2b" | "unknown";
  contact?: ContactRow;
  onClose: () => void;
  onMoveStage: (stageId: string, status?: string) => void;
  onDelete: () => void;
  onSaveEdit: (patch: { name?: string; value?: number; expectedClose?: string | null }) => void;
  savePending: boolean;
  movePending: boolean;
}) {
  const channel = deal.sourceChannel ?? contact?.channelPreference ?? null;
  const ch = channel ? CHAN[channel.toLowerCase()] : undefined;
  const fit = Math.round((contact?.fitScore ?? 0) * 100);
  const fitColor = fit >= 80 ? "#10B981" : fit >= 65 ? "#F59E0B" : "#EF4444";
  const wonStage = stages.find((s) => s.isWon);
  const lostStage = stages.find((s) => s.isLost);

  // ── inline edit (name / value / expectedClose) ──
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deal.name);
  const [value, setValue] = useState(String(deal.value ?? 0));
  const [expectedClose, setExpectedClose] = useState(
    deal.expectedClose ? deal.expectedClose.slice(0, 10) : "",
  );
  // Re-seed the form whenever the drawer switches to a different deal.
  useEffect(() => {
    setEditing(false);
    setName(deal.name);
    setValue(String(deal.value ?? 0));
    setExpectedClose(deal.expectedClose ? deal.expectedClose.slice(0, 10) : "");
  }, [deal.id, deal.name, deal.value, deal.expectedClose]);

  function submitEdit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const num = Number(value);
    onSaveEdit({
      name: trimmed,
      value: Number.isFinite(num) && num >= 0 ? num : 0,
      expectedClose: expectedClose ? expectedClose : null,
    });
    setEditing(false);
  }

  return (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-foreground">{deal.name}</h2>
          <p className="text-[11px] text-muted-foreground">Deal #{deal.id.slice(0, 12)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* value + segment (view) OR edit form */}
        {editing ? (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Edit deal
              </span>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Batal
              </button>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Nama deal</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Nilai (Rp)</span>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Perkiraan closing
              </span>
              <input
                type="date"
                value={expectedClose}
                onChange={(e) => setExpectedClose(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <button
              type="button"
              onClick={submitEdit}
              disabled={savePending || !name.trim()}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {savePending ? "Menyimpan…" : "Simpan perubahan"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nilai deal
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  Edit
                </button>
              </div>
              <div className="mt-1 text-lg font-bold text-foreground">{rpCompact(deal.value)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{rpFull(deal.value)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Closing: {fmtDateTimeID(deal.expectedClose)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Segmen
              </div>
              <div className="mt-1.5">
                <SegBadge segment={segment} />
              </div>
              <div className="mt-1.5 text-[11px] capitalize text-muted-foreground">
                Status: {deal.status === "won" ? "Won" : deal.status === "lost" ? "Lost" : "Aktif"}
              </div>
            </div>
          </div>
        )}

        {/* move stage */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tahap
          </h3>
          <div className="relative">
            <select
              value={deal.stageId ?? ""}
              disabled={movePending}
              onChange={(e) => {
                const stageId = e.target.value;
                const st = stages.find((s) => s.id === stageId);
                const status = st?.isWon ? "won" : st?.isLost ? "lost" : "open";
                onMoveStage(stageId, status);
              }}
              className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
            >
              {!deal.stageId && <option value="">Pilih tahap…</option>}
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* contact */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Kontak
          </h3>
          {contact ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-xs font-semibold text-primary">
                {initialsOf(contact.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {contact.fullName}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{contact.title ?? "Kontak"}</span>
                  {ch && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.c }} />
                      {ch.label}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href="/contacts"
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
              >
                Profil
                <ChevronRightIcon className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
              Deal ini belum tertaut ke kontak.
            </div>
          )}
        </div>

        {/* fit score */}
        {contact?.fitScore != null && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Skor Fit
            </h3>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Product-fit</span>
                <span className="text-[13px] font-bold" style={{ color: fitColor }}>
                  {fit}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${fit}%`, background: fitColor }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <TrashIcon className="h-4 w-4" />
          Hapus
        </button>
        <div className="ml-auto flex items-center gap-2">
          {lostStage && deal.stageId !== lostStage.id && (
            <button
              type="button"
              onClick={() => onMoveStage(lostStage.id, "lost")}
              disabled={movePending}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              <CloseIcon className="h-4 w-4" />
              Tandai Lost
            </button>
          )}
          {wonStage && deal.stageId !== wonStage.id && (
            <button
              type="button"
              onClick={() => onMoveStage(wonStage.id, "won")}
              disabled={movePending}
              className="flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "#10B981" }}
            >
              <CheckIcon className="h-4 w-4" />
              Tandai Won
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── state bands ──────────────────────────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="-mx-6 overflow-hidden px-6">
      <div className="flex min-w-[1100px] items-start gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0">
            <div className="h-14 rounded-t-lg border border-b-0 border-border bg-card" />
            <div className="min-h-[420px] space-y-2 rounded-b-lg border border-border bg-muted/40 p-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BandError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-12 text-center shadow-soft">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertIcon className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">Terjadi kendala saat mengambil data.</p>
      </div>
      <button
        onClick={onRetry}
        className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        Coba lagi
      </button>
    </div>
  );
}

function BandEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card py-14 text-center shadow-soft">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-44 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── create/edit modals ─────────────────────────

/** Centered modal chrome (Coral Sunset — mirrors cadence's EnrollModal). */
function ModalShell({
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className={`flex max-h-[88vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200 ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              {icon}
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Label + control row for the modal forms. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function NewDealModal({
  open,
  onClose,
  pipelineId,
  stages,
  contacts,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pipelineId: string | null;
  stages: StageRow[];
  contacts: ContactRow[];
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [sourceChannel, setSourceChannel] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setValue("");
    setContactId("");
    setExpectedClose("");
    setSourceChannel("");
    setStageId(stages[0]?.id ?? "");
  }, [open, stages]);

  const canSubmit = !!name.trim() && !!stageId && !!pipelineId && !pending;

  function submit() {
    if (!canSubmit) return;
    const st = stages.find((s) => s.id === stageId);
    const status = st?.isWon ? "won" : st?.isLost ? "lost" : "open";
    const num = Number(value);
    onSubmit({
      name: name.trim(),
      value: Number.isFinite(num) && num >= 0 ? num : 0,
      pipelineId,
      stageId,
      status,
      contactId: contactId || null,
      expectedClose: expectedClose || null,
      sourceChannel: sourceChannel || null,
    });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={<PlusIcon className="h-4 w-4" />}
      title="Deal baru"
      subtitle="Tambahkan deal ke papan ini"
    >
      <div className="space-y-3.5 overflow-y-auto px-5 py-4">
        <Field label="Nama deal *">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Paket Pro — PT Sinar Jaya"
            className={inputCls}
          />
        </Field>
        <Field label="Nilai (Rp)">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className={`${inputCls} tabular-nums`}
          />
        </Field>
        <Field label="Kontak">
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">— Tanpa kontak —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
                {c.title ? ` · ${c.title}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tahap *">
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Perkiraan closing">
          <input
            type="date"
            value={expectedClose}
            onChange={(e) => setExpectedClose(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Kanal akuisisi">
          <select
            value={sourceChannel}
            onChange={(e) => setSourceChannel(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">—</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="shopee">Shopee</option>
          </select>
        </Field>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={submit}
        disabled={!canSubmit}
        label={pending ? "Menyimpan…" : "Buat deal"}
      />
    </ModalShell>
  );
}

function NewPipelineModal({
  open,
  onClose,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSubmit: (payload: { name: string; isDefault: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName("");
    setIsDefault(false);
  }, [open]);
  const canSubmit = !!name.trim() && !pending;
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={<KanbanIcon className="h-4 w-4" />}
      title="Buat pipeline"
      subtitle="Papan CRM baru untuk workspace ini"
    >
      <div className="space-y-3.5 px-5 py-4">
        <Field label="Nama pipeline *">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Pipeline Penjualan"
            className={inputCls}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Jadikan papan default
        </label>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={() => canSubmit && onSubmit({ name: name.trim(), isDefault })}
        disabled={!canSubmit}
        label={pending ? "Menyimpan…" : "Buat pipeline"}
      />
    </ModalShell>
  );
}

function NewStageModal({
  open,
  onClose,
  pipelineId,
  pipelineName,
  nextSort,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pipelineId: string | null;
  pipelineName: string;
  nextSort: number;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"open" | "won" | "lost">("open");
  const [probability, setProbability] = useState("");
  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("open");
    setProbability("");
  }, [open]);
  const canSubmit = !!name.trim() && !!pipelineId && !pending;
  function submit() {
    if (!canSubmit) return;
    const prob = probability === "" ? null : Number(probability);
    onSubmit({
      pipelineId,
      name: name.trim(),
      sort: nextSort,
      isWon: kind === "won",
      isLost: kind === "lost",
      probability: prob != null && Number.isFinite(prob) ? prob : null,
    });
  }
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={<ColumnsIcon className="h-4 w-4" />}
      title="Tambah tahap"
      subtitle={`Kolom baru di "${pipelineName}"`}
    >
      <div className="space-y-3.5 px-5 py-4">
        <Field label="Nama tahap *">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Negosiasi"
            className={inputCls}
          />
        </Field>
        <Field label="Jenis tahap">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "open" | "won" | "lost")}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="open">Aktif (dalam proses)</option>
            <option value="won">Menang (Won)</option>
            <option value="lost">Kalah (Lost)</option>
          </select>
        </Field>
        <Field label="Probabilitas (%) — opsional">
          <input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            placeholder="cth. 40"
            className={`${inputCls} tabular-nums`}
          />
        </Field>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={submit}
        disabled={!canSubmit}
        label={pending ? "Menyimpan…" : "Tambah tahap"}
      />
    </ModalShell>
  );
}

function LostReasonDialog({
  open,
  dealName,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  dealName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={<CloseIcon className="h-4 w-4" />}
      title="Tandai deal sebagai Lost"
      subtitle={dealName}
    >
      <div className="space-y-3 px-5 py-4">
        <Field label="Alasan kalah (opsional)">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="cth. Harga terlalu tinggi / pilih kompetitor / anggaran ditunda"
            className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Deal akan dipindah ke tahap Lost dan alasan disimpan untuk analisis kekalahan.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim())}
          disabled={pending}
          className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Memproses…" : "Tandai Lost"}
        </button>
      </div>
    </ModalShell>
  );
}

/** Shared Batal + primary-submit footer for the create modals. */
function ModalFooter({
  onClose,
  onSubmit,
  disabled,
  label,
}: {
  onClose: () => void;
  onSubmit: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
      <button
        type="button"
        onClick={onClose}
        className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        Batal
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}

// ───────────────────────── inline icons (match mockup strokes) ─────────────────────────
type IconProps = { className?: string };

function RefreshIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 9-9" />
      <path d="M3 4v5h5" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function BriefcaseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
    </svg>
  );
}
function FlameIcon({ className = "h-4 w-4", filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
    </svg>
  );
}
function TrendingUpIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M22 7 13.5 15.5l-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  );
}
function CoinsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function ColumnsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 3v18h18" />
      <rect x="7" y="9" width="3" height="9" rx="1" />
      <rect x="12" y="5" width="3" height="13" rx="1" />
      <rect x="17" y="12" width="3" height="6" rx="1" />
    </svg>
  );
}
function KanbanIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="11" rx="1.5" />
    </svg>
  );
}
function ChevronIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function ChevronRightIcon({ className = "h-3 w-3" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function AlertIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
function TrashIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function RestoreIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 7v6h6" />
      <path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7" />
    </svg>
  );
}
