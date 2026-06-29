"use client";

// Retensi & Win-back — Module 9 (secondary) FRONTEND (Sainskerta Loop Phase 04,
// FINAL frontend tick). Wired to the NEW M9 retention backend (no mock data):
//   GET    /api/retention/flows                 → list flow retensi (RetentionFlowRow[])
//   GET    /api/retention/flows/trashed         → the Sampah view
//   POST   /api/retention/flows                 → create a flow
//   PATCH  /api/retention/flows/[id]            → edit a flow
//   DELETE /api/retention/flows/[id]            → SOFT delete (cascade → steps)
//   PATCH  /api/retention/flows/[id]/restore    → un-trash (cascade restore)
//   DELETE /api/retention/flows/[id]?purge=1    → HARD delete (cascade purge)
//   GET    /api/retention/flows/[id]/steps      → ordered steps of a flow
//   POST   /api/retention/steps                 → add a step
//   PATCH  /api/retention/steps/[id]            → edit a step
//   DELETE /api/retention/steps/[id]            → SOFT delete a step
// Matches the established Coral Sunset design system (contacts / admin / workspace):
// stat strip, Aktif | Sampah tabs, a kind/segment/status toolbar + search, a flow
// card grid, and a right drawer that does double duty as the create/edit flow form
// AND the per-flow step editor (channel · delay · offer · template). Every band has
// loading + empty + error states. Lives in the (app) shell.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  Gift,
  Heart,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M9 retention backend — { ok, data }) ──────

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

/** Row from GET /api/retention/flows (modules/retention · retention_flow). */
interface FlowRow {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  kind: string; // retention | win_back | onboarding | loyalty
  trigger: string; // no_activity_30d | churn_risk | post_purchase | manual | …
  segment: string; // b2c | b2b | all
  status: string; // active | paused | archived
  stepCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /trashed
}

/** Row from GET /api/retention/flows/[id]/steps (modules/retention · retention_step). */
interface StepRow {
  id: string;
  tenantId: string;
  flowId: string;
  sort: number;
  channel: string; // wa | email | call | sms
  delayDays: number;
  subject: string | null;
  template: string;
  offer: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "aktif" | "sampah";
type KindFilter = "all" | "retention" | "win_back" | "onboarding" | "loyalty";
type SegFilter = "all" | "b2c" | "b2b";
type StatusFilter = "all" | "active" | "paused" | "archived";

const KIND_META: Record<string, { label: string; style: React.CSSProperties }> = {
  retention: { label: "Retensi", style: { background: "hsl(14 90% 96%)", color: "#c2410c" } },
  win_back: { label: "Win-back", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  onboarding: { label: "Onboarding", style: { background: "hsl(217 91% 60% / .12)", color: "#2563eb" } },
  loyalty: { label: "Loyalty", style: { background: "#E1306C18", color: "#c01f5b" } },
};

const SEG_BADGE: Record<string, { label: string; cls: string }> = {
  b2b: { label: "B2B", cls: "bg-primary/10 text-primary" },
  b2c: { label: "B2C", cls: "bg-tertiary/15 text-tertiary" },
  all: { label: "Semua segmen", cls: "bg-muted text-muted-foreground" },
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  active: { label: "Aktif", cls: "bg-success/12 text-success", dot: "bg-success" },
  paused: { label: "Dijeda", cls: "bg-warning/12 text-warning", dot: "bg-warning" },
  archived: { label: "Arsip", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const CHANNEL_META: Record<
  string,
  { label: string; icon: typeof MessageSquare; color: string }
> = {
  wa: { label: "WhatsApp", icon: MessageSquare, color: "#25D366" },
  email: { label: "Email", icon: Mail, color: "#6366F1" },
  call: { label: "Telepon", icon: Phone, color: "#F59E0B" },
  sms: { label: "SMS", icon: Smartphone, color: "#0D9488" },
};

// Common enrollment triggers — surfaced as a select in the drawer; free-text is
// still accepted (the backend stores `trigger` as a plain string).
const TRIGGERS: { value: string; label: string }[] = [
  { value: "manual", label: "Manual (didaftarkan tangan)" },
  { value: "no_activity_30d", label: "Tidak ada aktivitas 30 hari" },
  { value: "no_activity_60d", label: "Tidak ada aktivitas 60 hari" },
  { value: "churn_risk", label: "Risiko churn (AI)" },
  { value: "post_purchase", label: "Setelah pembelian" },
  { value: "cart_abandoned", label: "Keranjang ditinggalkan" },
  { value: "subscription_ending", label: "Langganan hampir habis" },
];

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "retention", label: "Retensi" },
  { value: "win_back", label: "Win-back" },
  { value: "onboarding", label: "Onboarding" },
  { value: "loyalty", label: "Loyalty" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function triggerLabel(trigger: string): string {
  return TRIGGERS.find((t) => t.value === trigger)?.label ?? trigger.replace(/_/g, " ");
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

function delayLabel(days: number): string {
  if (days <= 0) return "Langsung";
  if (days === 1) return "+1 hari";
  return `+${days} hari`;
}

// ── drawer form state ──────────────────────────────────────────────────────

interface FlowForm {
  name: string;
  description: string;
  kind: string;
  trigger: string;
  segment: string;
  status: string;
}

const EMPTY_FLOW_FORM: FlowForm = {
  name: "",
  description: "",
  kind: "retention",
  trigger: "manual",
  segment: "all",
  status: "active",
};

interface StepForm {
  channel: string;
  delayDays: number;
  subject: string;
  offer: string;
  template: string;
}

const EMPTY_STEP_FORM: StepForm = {
  channel: "wa",
  delayDays: 0,
  subject: "",
  offer: "",
  template: "",
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function RetentionPage() {
  const qc = useQueryClient();

  // live flows
  const flowsQ = useQuery({
    queryKey: ["retention", "flows", "list"],
    queryFn: async () => readJson<FlowRow[]>(await fetch("/api/retention/flows")),
    retry: false,
  });
  const flows = useMemo(() => flowsQ.data ?? [], [flowsQ.data]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  const trashedQ = useQuery({
    queryKey: ["retention", "flows", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<FlowRow[]>(await fetch("/api/retention/flows/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [kindF, setKindF] = useState<KindFilter>("all");
  const [segF, setSegF] = useState<SegFilter>("all");
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    let active = 0;
    let winBack = 0;
    let steps = 0;
    for (const f of flows) {
      if (f.status === "active") active++;
      if (f.kind === "win_back") winBack++;
      steps += f.stepCount;
    }
    return { total: flows.length, active, winBack, steps };
  }, [flows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flows.filter((f) => {
      const okKind = kindF === "all" || f.kind === kindF;
      const okSeg = segF === "all" || f.segment === segF;
      const okStatus = statusF === "all" || f.status === statusF;
      const okSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q) ||
        f.trigger.toLowerCase().includes(q);
      return okKind && okSeg && okStatus && okSearch;
    });
  }, [flows, kindF, segF, statusF, search]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((f) => f.name.toLowerCase().includes(q));
  }, [trashed, search]);

  // ── drawer ───────────────────────────────────────────────────────────────────
  // mode "create" → new flow; "edit" → existing flow + step editor.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FlowForm>(EMPTY_FLOW_FORM);

  const editing = useMemo(() => flows.find((f) => f.id === editId) ?? null, [flows, editId]);

  function openCreate() {
    setDrawerMode("create");
    setEditId(null);
    setForm(EMPTY_FLOW_FORM);
    setDrawerOpen(true);
  }
  function openEdit(f: FlowRow) {
    setDrawerMode("edit");
    setEditId(f.id);
    setForm({
      name: f.name,
      description: f.description ?? "",
      kind: f.kind,
      trigger: f.trigger,
      segment: f.segment,
      status: f.status,
    });
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Steps of the flow open in the drawer — only fetched in edit mode.
  const stepsQ = useQuery({
    queryKey: ["retention", "steps", editId],
    enabled: drawerOpen && drawerMode === "edit" && !!editId,
    queryFn: async () =>
      readJson<StepRow[]>(await fetch(`/api/retention/flows/${editId}/steps`)),
    retry: false,
  });
  const steps = useMemo(() => stepsQ.data ?? [], [stepsQ.data]);

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<FlowRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<FlowRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<FlowRow | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshFlows() {
    qc.invalidateQueries({ queryKey: ["retention", "flows"] });
  }

  const createFlow = useMutation({
    mutationFn: async (f: FlowForm) =>
      readJson<FlowRow>(
        await fetch("/api/retention/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: f.name.trim(),
            description: f.description.trim() || null,
            kind: f.kind,
            trigger: f.trigger.trim() || "manual",
            segment: f.segment,
            status: f.status,
          }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Flow "${row.name}" dibuat`);
      refreshFlows();
      // Slide straight into edit mode so the user can add steps immediately.
      setDrawerMode("edit");
      setEditId(row.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat flow"),
  });

  const updateFlow = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<FlowForm> }) =>
      readJson<FlowRow>(
        await fetch(`/api/retention/flows/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...vars.patch,
            ...(vars.patch.name !== undefined ? { name: vars.patch.name.trim() } : {}),
            ...(vars.patch.description !== undefined
              ? { description: vars.patch.description.trim() || null }
              : {}),
          }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Flow "${row.name}" disimpan`);
      refreshFlows();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan flow"),
  });

  const softDelete = useMutation({
    mutationFn: async (f: FlowRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/retention/flows/${f.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, f) => {
      toast.success(`"${f.name}" dipindah ke Sampah`);
      refreshFlows();
      setDeleteTarget(null);
      if (editId === f.id) closeDrawer();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus flow");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (f: FlowRow) =>
      readJson<FlowRow>(await fetch(`/api/retention/flows/${f.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, f) => {
      toast.success(`"${f.name}" dipulihkan`);
      refreshFlows();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan flow");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (f: FlowRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/retention/flows/${f.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, f) => {
      toast.success(`"${f.name}" dihapus permanen`);
      refreshFlows();
      setPurgeTarget(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── step mutations (scoped to the flow open in the drawer) ─────────────────
  function refreshSteps() {
    qc.invalidateQueries({ queryKey: ["retention", "steps", editId] });
    refreshFlows(); // step_count is denormalized on the flow
  }

  const createStep = useMutation({
    mutationFn: async (vars: { flowId: string; step: StepForm }) =>
      readJson<StepRow>(
        await fetch("/api/retention/steps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: vars.flowId,
            channel: vars.step.channel,
            delayDays: vars.step.delayDays,
            subject: vars.step.subject.trim() || null,
            offer: vars.step.offer.trim() || null,
            template: vars.step.template,
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Langkah ditambahkan");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambah langkah"),
  });

  const updateStep = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<StepForm> }) =>
      readJson<StepRow>(
        await fetch(`/api/retention/steps/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...vars.patch,
            ...(vars.patch.subject !== undefined
              ? { subject: vars.patch.subject.trim() || null }
              : {}),
            ...(vars.patch.offer !== undefined ? { offer: vars.patch.offer.trim() || null } : {}),
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Langkah disimpan");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan langkah"),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/retention/steps/${id}`, { method: "DELETE" }),
      ),
    onSuccess: () => {
      toast.success("Langkah dihapus");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus langkah"),
  });

  function submitFlow() {
    if (!form.name.trim()) {
      toast.error("Nama flow wajib diisi");
      return;
    }
    if (drawerMode === "create") {
      createFlow.mutate(form);
    } else if (editId) {
      updateFlow.mutate({ id: editId, patch: form });
    }
  }

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = flowsQ.isError;
  const forbidden = flowsQ.error instanceof Error && flowsQ.error.message === "forbidden";
  const flowPending = createFlow.isPending || updateFlow.isPending;

  return (
    <div>
      <PageHeader
        title="Retensi & Win-back"
        description="Alur otomatis untuk menjaga & memenangkan kembali pelanggan — atur pemicu, segmen, dan langkah per channel (WA · email · telepon · SMS)."
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Buat flow
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total flow"
            value={flowsQ.isLoading ? null : stats.total}
            hint="retensi + win-back"
          />
          <StatCard
            label="Flow aktif"
            value={flowsQ.isLoading ? null : stats.active}
            hint="sedang berjalan"
            valueClass="text-success"
          />
          <StatCard
            label="Win-back"
            value={flowsQ.isLoading ? null : stats.winBack}
            hint="memenangkan kembali"
          />
          <StatCard
            label="Total langkah"
            value={flowsQ.isLoading ? null : stats.steps}
            hint="di seluruh flow"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Heart className="h-4 w-4" />
            Aktif
            <CountPill>{flows.length}</CountPill>
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
          <>
            {/* TOOLBAR */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
              {/* (1) KIND segmented control */}
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "retention", label: "Retensi" },
                    { v: "win_back", label: "Win-back" },
                    { v: "onboarding", label: "Onboarding" },
                    { v: "loyalty", label: "Loyalty" },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.v}
                    type="button"
                    onClick={() => setKindF(k.v)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs transition-colors",
                      kindF === k.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              {/* (2) SEGMENT pills */}
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Segmen:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "b2c", label: "B2C" },
                    { v: "b2b", label: "B2B" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSegF(s.v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      segF === s.v
                        ? "bg-foreground font-semibold text-background"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* (3) STATUS select */}
              <div className="relative">
                <select
                  value={statusF}
                  onChange={(e) => setStatusF(e.target.value as StatusFilter)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Status: Semua</option>
                  <option value="active">Aktif</option>
                  <option value="paused">Dijeda</option>
                  <option value="archived">Arsip</option>
                </select>
                <ArrowDownUp className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              </div>

              {/* (4) inline search */}
              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter nama / pemicu…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* FLOW GRID */}
            {flowsQ.isLoading ? (
              <GridLoading />
            ) : listError ? (
              <ErrorState
                title={forbidden ? "Tidak punya akses" : "Gagal memuat flow retensi"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar flow. Pastikan kamu login & database tersedia."
                }
                onRetry={() => flowsQ.refetch()}
              />
            ) : flows.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="Belum ada flow retensi"
                description="Buat flow pertama untuk menjaga pelanggan tetap aktif atau memenangkan kembali yang dorman — atur pemicu, segmen, dan langkah per channel."
                action={
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Buat flow
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Tidak ada flow yang cocok"
                description="Coba ubah filter jenis / segmen / status, atau kata kunci."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((f) => (
                  <FlowCard
                    key={f.id}
                    flow={f}
                    onEdit={() => openEdit(f)}
                    onDelete={() => setDeleteTarget(f)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* ============ SAMPAH (trash) view ============ */
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs shadow-soft">
              <span className="text-muted-foreground">
                Flow yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab Aktif
                (beserta langkahnya), <b>Hapus permanen</b> menghapus selamanya (cascade ke
                langkah).
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} flow
              </span>
            </div>

            {trashedQ.isLoading ? (
              <GridLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil flow yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Flow yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTrashed.map((f) => (
                  <TrashedFlowCard
                    key={f.id}
                    flow={f}
                    onRestore={() => setRestoreTarget(f)}
                    onPurge={() => {
                      setPurgeTarget(f);
                      setPurgeConfirm("");
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Jenis flow:{" "}
          {(["retention", "win_back", "onboarding", "loyalty"] as const).map((k, i) => (
            <span key={k}>
              {i > 0 && " · "}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={KIND_META[k].style}
              >
                {KIND_META[k].label}
              </span>
            </span>
          ))}
          . Klik <b>Edit</b> pada kartu untuk mengubah flow &amp; menyusun langkahnya (channel ·
          jeda · penawaran · template).
        </p>
      </div>

      {/* ===================== CREATE / EDIT DRAWER ===================== */}
      <div
        onClick={closeDrawer}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-full flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Heart className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-foreground">
                {drawerMode === "create" ? "Buat flow retensi" : "Edit flow & langkah"}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {drawerMode === "create"
                  ? "Atur pemicu, segmen & jenis flow"
                  : editing?.name || "—"}
              </p>
            </div>
          </div>
          <button
            onClick={closeDrawer}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* (A) FLOW FORM */}
          <div className="space-y-4">
            <Field label="Nama flow">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="mis. Win-back dorman 60 hari"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </Field>

            <Field label="Deskripsi" optional>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Tujuan flow ini — kapan pelanggan masuk & apa hasil yang diharapkan…"
                className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </Field>

            <Field label="Jenis flow">
              <div className="flex flex-wrap gap-1.5">
                {KIND_OPTIONS.map((k) => {
                  const on = form.kind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, kind: k.value }))}
                      className={cn(
                        "h-8 rounded-lg px-3 text-xs transition-colors",
                        on ? "font-semibold" : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                      )}
                      style={on ? KIND_META[k.value]?.style : undefined}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Pemicu enrollment">
                <div className="relative">
                  <select
                    value={form.trigger}
                    onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {TRIGGERS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Zap className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </Field>

              <Field label="Segmen target">
                <div className="relative">
                  <select
                    value={form.segment}
                    onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">Semua segmen</option>
                    <option value="b2c">B2C</option>
                    <option value="b2b">B2B</option>
                  </select>
                </div>
              </Field>
            </div>

            <Field label="Status">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "active", label: "Aktif" },
                    { v: "paused", label: "Dijeda" },
                    { v: "archived", label: "Arsip" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, status: s.v }))}
                    className={cn(
                      "h-7 rounded-md px-3.5 text-xs transition-colors",
                      form.status === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>

            {drawerMode === "edit" && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={flowPending}
                onClick={submitFlow}
              >
                <Check className="h-4 w-4" /> {updateFlow.isPending ? "Menyimpan…" : "Simpan perubahan flow"}
              </Button>
            )}
          </div>

          {/* (B) STEP EDITOR — only in edit mode (a flow must exist first) */}
          {drawerMode === "edit" && editId && (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-foreground">
                  Langkah flow{steps.length ? ` (${steps.length})` : ""}
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-tertiary" /> dijalankan berurutan
                </span>
              </div>

              {stepsQ.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : stepsQ.isError ? (
                <ErrorState
                  className="border-0 py-6"
                  title="Gagal memuat langkah"
                  description="Tidak bisa mengambil langkah flow ini."
                  onRetry={() => stepsQ.refetch()}
                />
              ) : steps.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                  Belum ada langkah. Tambah langkah pertama di bawah — channel, jeda, penawaran &amp;
                  template pesan.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {steps.map((s, i) => (
                    <StepEditorCard
                      key={s.id}
                      index={i}
                      step={s}
                      onSave={(patch) => updateStep.mutate({ id: s.id, patch })}
                      onDelete={() => deleteStep.mutate(s.id)}
                      saving={updateStep.isPending && updateStep.variables?.id === s.id}
                      deleting={deleteStep.isPending && deleteStep.variables === s.id}
                    />
                  ))}
                </div>
              )}

              {/* add-step form */}
              <AddStepForm
                onAdd={(step) => createStep.mutate({ flowId: editId, step })}
                pending={createStep.isPending}
              />
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <button
            onClick={closeDrawer}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            {drawerMode === "edit" ? "Tutup" : "Batal"}
          </button>
          {drawerMode === "create" && (
            <button
              onClick={submitFlow}
              disabled={flowPending}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {createFlow.isPending ? "Membuat…" : "Buat & tambah langkah"}
            </button>
          )}
        </div>
      </aside>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b> (cascade ke langkahnya). Kamu masih bisa
            memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmModal
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan flow?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan
            dikembalikan ke tab <b>Aktif</b> beserta langkahnya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setPurgeTarget(null);
            setPurgeConfirm("");
          }
        }}
        className={cn(
          "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
          purgeTarget ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className={cn(
            "w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-5 shadow-soft transition-all duration-200",
            purgeTarget ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-destructive">Hapus permanen?</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
                <span className="font-medium text-foreground">{purgeTarget?.name}</span> akan
                dihapus selamanya beserta seluruh langkahnya.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-[12px] text-muted-foreground">
              Ketik{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground">
                HAPUS
              </code>{" "}
              untuk konfirmasi.
            </label>
            <input
              type="text"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="HAPUS"
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setPurgeTarget(null);
                setPurgeConfirm("");
              }}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Batal
            </button>
            <button
              onClick={() => purgeTarget && purge.mutate(purgeTarget)}
              disabled={purge.isPending || purgeConfirm.trim().toUpperCase() !== "HAPUS"}
              className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {purge.isPending ? "Menghapus…" : "Hapus permanen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: number | null;
  hint: string;
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

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind] ?? { label: kind, style: { background: "hsl(0 0% 94%)", color: "#555" } };
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function SegBadge({ segment }: { segment: string }) {
  const meta = SEG_BADGE[segment] ?? SEG_BADGE.all;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.cls)}>
      {meta.label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.archived;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-soft transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={flow.kind} />
          <SegBadge segment={flow.segment} />
        </div>
        <StatusChip status={flow.status} />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-3 text-left"
      >
        <h3 className="truncate text-sm font-bold text-foreground">{flow.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {flow.description || "Tanpa deskripsi"}
        </p>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Zap className="h-3.5 w-3.5 text-warning" /> {triggerLabel(flow.trigger)}
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <b className="text-foreground/80">{flow.stepCount}</b> langkah
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card text-[11px] font-medium transition-colors hover:border-primary/40"
        >
          <Pencil className="h-3 w-3" /> Edit & langkah
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

      <p className="mt-2 text-[10px] text-muted-foreground">
        Diperbarui {fmtRelID(flow.updatedAt)}
      </p>
    </div>
  );
}

function TrashedFlowCard({
  flow,
  onRestore,
  onPurge,
}: {
  flow: FlowRow;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 opacity-90 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={flow.kind} />
          <SegBadge segment={flow.segment} />
        </div>
      </div>
      <h3 className="mt-3 truncate text-sm font-bold text-foreground/80">{flow.name}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Dihapus {fmtRelID(flow.deletedAt ?? null)} · {flow.stepCount} langkah
      </p>
      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
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
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(opsional)</span>}
      </label>
      {children}
    </div>
  );
}

function ChannelTag({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.wa;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: meta.color }}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}

/** One step in the flow's step editor — inline expand-to-edit. */
function StepEditorCard({
  index,
  step,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  index: number;
  step: StepRow;
  onSave: (patch: Partial<StepForm>) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StepForm>({
    channel: step.channel,
    delayDays: step.delayDays,
    subject: step.subject ?? "",
    offer: step.offer ?? "",
    template: step.template,
  });

  // Re-sync the draft if the underlying step changes (e.g. after a save refetch).
  useEffect(() => {
    setDraft({
      channel: step.channel,
      delayDays: step.delayDays,
      subject: step.subject ?? "",
      offer: step.offer ?? "",
      template: step.template,
    });
  }, [step.channel, step.delayDays, step.subject, step.offer, step.template]);

  if (!editing) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {index + 1}
            </span>
            <ChannelTag channel={step.channel} />
            <span className="text-[11px] text-muted-foreground">· {delayLabel(step.delayDays)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Edit langkah"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              title="Hapus langkah"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {step.offer && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-medium text-warning">
            <Gift className="h-3 w-3" /> {step.offer}
          </p>
        )}
        {step.subject && (
          <p className="mt-1.5 text-[11px] font-medium text-foreground/80">{step.subject}</p>
        )}
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
          {step.template || "Template kosong"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">Langkah {index + 1}</span>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Tutup
        </button>
      </div>
      <StepFields draft={draft} setDraft={setDraft} />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="h-8 rounded-lg border border-border px-3 text-[12px] font-medium transition-colors hover:bg-muted"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" /> {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

/** The add-step form at the bottom of the step editor. */
function AddStepForm({
  onAdd,
  pending,
}: {
  onAdd: (step: StepForm) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StepForm>(EMPTY_STEP_FORM);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(EMPTY_STEP_FORM);
          setOpen(true);
        }}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah langkah
      </button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">Langkah baru</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Tutup
        </button>
      </div>
      <StepFields draft={draft} setDraft={setDraft} />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 rounded-lg border border-border px-3 text-[12px] font-medium transition-colors hover:bg-muted"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onAdd(draft);
            setOpen(false);
          }}
          className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> {pending ? "Menambah…" : "Tambah"}
        </button>
      </div>
    </div>
  );
}

/** Shared field block for add + edit step forms. */
function StepFields({
  draft,
  setDraft,
}: {
  draft: StepForm;
  setDraft: React.Dispatch<React.SetStateAction<StepForm>>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Channel
          </label>
          <div className="inline-flex w-full items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(["wa", "email", "call", "sms"] as const).map((c) => {
              const meta = CHANNEL_META[c];
              const Icon = meta.icon;
              const on = draft.channel === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, channel: c }))}
                  title={meta.label}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center rounded-md transition-colors",
                    on ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={on ? { color: meta.color } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Jeda (hari)
          </label>
          <input
            type="number"
            min={0}
            value={draft.delayDays}
            onChange={(e) =>
              setDraft((d) => ({ ...d, delayDays: Math.max(0, parseInt(e.target.value, 10) || 0) }))
            }
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>

      {draft.channel === "email" && (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Subjek email
          </label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            placeholder="mis. Kami kangen kamu — ini hadiah kembali"
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Penawaran / insentif (opsional)
        </label>
        <input
          type="text"
          value={draft.offer}
          onChange={(e) => setDraft((d) => ({ ...d, offer: e.target.value }))}
          placeholder="mis. Voucher 20% · kode COMEBACK20"
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Template pesan
        </label>
        <textarea
          rows={3}
          value={draft.template}
          onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
          placeholder="Halo {{nama}}, sudah lama nggak ketemu! …"
          className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    </>
  );
}

function ConfirmModal({
  open,
  onClose,
  icon,
  tone,
  title,
  body,
  confirmLabel,
  confirmPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  tone: "destructive" | "tertiary";
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              tone === "destructive"
                ? "bg-destructive/[0.12] text-destructive"
                : "bg-tertiary/[0.12] text-tertiary",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmPending}
            className={cn(
              "h-9 rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60",
              tone === "destructive"
                ? "bg-destructive text-white"
                : "bg-tertiary text-tertiary-foreground",
            )}
          >
            {confirmPending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function GridLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-lg" />
      ))}
    </div>
  );
}
