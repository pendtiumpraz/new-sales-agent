"use client";

// Autopilot — Module 7 FRONTEND (Sainskerta Loop Phase 04). Wired to the NEW M7 /
// outreach backend (no mock data): GET /api/autopilot (list, AutopilotRunRow[]) +
// ?status= / ?mode= filters, GET /api/autopilot/trashed (the Sampah view), GET
// /api/autopilot/[id] (drawer detail + log), GET /api/conversations (resolve the
// optional conversation a run is attached to + the "start a run" picker).
// Mutations: POST /api/autopilot (start a run — AI auto-orchestration record),
// DELETE /api/autopilot/[id] (SOFT delete), PATCH /api/autopilot/[id]/restore
// (un-trash), DELETE /api/autopilot/[id]?purge=1 (HARD delete). Faithful to the
// established design system (Coral Sunset) — built CONSISTENT with the contacts +
// admin reference pages: stat strip, main tabs (Aktif / Sampah), segmented status +
// mode filters + search, table (Status · Mode · Trigger · Dimulai · Ringkasan ·
// Aksi), and a right drawer (status + meta + structured log trace). Every band has
// loading + empty + error states. Lives in the (app) shell (Outreach cluster).
//
// Read-only-ish: the run LIFECYCLE (status transitions, log entries, summary) is
// driven by the AI orchestrator elsewhere — this surface lists + inspects runs and
// lets an operator START one (records the lifecycle) + manage the trash. No log /
// metric values are fabricated here.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  CircleDot,
  Clock,
  Loader2,
  MessageSquare,
  Play,
  Rocket,
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
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M7 / outreach backend — { ok, data }) ──────

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

/** Row from GET /api/autopilot (modules/outreach · autopilot_run_v2). */
interface AutopilotRunRow {
  id: string;
  workspaceId: string | null;
  contactId: string | null;
  conversationId: string | null;
  enrollmentId: string | null;
  mode: string; // suggest | auto
  status: string; // queued | running | done | error | escalated
  trigger: string | null;
  log: Array<Record<string, unknown>>;
  summary: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/autopilot/trashed
}

/** Row from GET /api/conversations (modules/inbox · conversation_v2). Only the
 *  fields this page reads are typed; the rest of the row is ignored.
 *  NOTE: conversation_v2 has NO `subject` column — the human label is the last
 *  message preview (`lastMessage`), falling back to channel + short id. */
interface ConversationRow {
  id: string;
  contactId: string | null;
  channel: string | null;
  lastMessage: string | null;
  status: string | null;
  lastMessageAt: string | null;
}

/** A human label for a conversation row — last-message preview, else channel + id. */
function conversationLabel(c: ConversationRow): string {
  const preview = c.lastMessage?.trim();
  if (preview) return preview.length > 60 ? `${preview.slice(0, 59)}…` : preview;
  return `${c.channel ?? "chat"} · ${c.id.slice(0, 8)}`;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type StatusFilter = "all" | "queued" | "running" | "done" | "error" | "escalated";
type ModeFilter = "all" | "suggest" | "auto";
type MainTab = "aktif" | "sampah";

const STATUS_META: Record<
  string,
  { label: string; cls: string; dot: string; spin?: boolean }
> = {
  queued: {
    label: "Antri",
    cls: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  running: {
    label: "Berjalan",
    cls: "bg-info/12 text-info",
    dot: "bg-info",
    spin: true,
  },
  done: {
    label: "Selesai",
    cls: "bg-success/15 text-success",
    dot: "bg-success",
  },
  error: {
    label: "Gagal",
    cls: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  escalated: {
    label: "Eskalasi",
    cls: "bg-highlight/15 text-[color:#b45309]",
    dot: "bg-highlight",
  },
};

const MODE_META: Record<string, { label: string; hint: string; style: React.CSSProperties }> = {
  auto: {
    label: "Auto",
    hint: "AI bertindak penuh tanpa persetujuan per-langkah",
    style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" },
  },
  suggest: {
    label: "Saran",
    hint: "AI hanya menyarankan — manusia menyetujui",
    style: { background: "#FB5E3B18", color: "#c0432a" },
  },
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

function fmtRelID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) {
    const m = Math.floor(diff / 60_000);
    return m < 1 ? "Baru saja" : `${m} menit lalu`;
  }
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTimeID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Wall-clock duration of a run (started → finished, or → now if still live). */
function fmtDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec} dtk`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt`;
  const hr = Math.floor(min / 60);
  return `${hr} jam ${min % 60} mnt`;
}

/** A short, honest label for a run row — summary first, else trigger/contact ref. */
function runHeadline(run: AutopilotRunRow): string {
  if (run.summary && run.summary.trim()) return run.summary.trim();
  if (run.trigger) return `Dipicu: ${run.trigger}`;
  return "Run tanpa ringkasan";
}

/** Pull the most human-readable text out of a structured log entry. */
function logEntryText(entry: Record<string, unknown>): string {
  for (const k of ["message", "msg", "text", "step", "note", "detail"] as const) {
    const v = entry[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // Fall back to a compact key=value rendering of the non-`at` fields.
  const parts = Object.entries(entry)
    .filter(([k]) => k !== "at")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.length ? parts.join(" · ") : "(entri log kosong)";
}

function logEntryAt(entry: Record<string, unknown>): string | null {
  const at = entry["at"];
  return typeof at === "string" ? at : null;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AutopilotRunsPage() {
  const qc = useQueryClient();

  // live runs + conversations (conversations resolve conversationId → subject join
  // and feed the "start a run" picker)
  const runsQ = useQuery({
    queryKey: ["outreach", "autopilot", "list"],
    queryFn: async () => readJson<AutopilotRunRow[]>(await fetch("/api/autopilot")),
    retry: false,
  });
  const conversationsQ = useQuery({
    queryKey: ["inbox", "conversations", "list"],
    queryFn: async () => readJson<ConversationRow[]>(await fetch("/api/conversations")),
    retry: false,
  });

  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const conversationById = useMemo(() => {
    const m: Record<string, ConversationRow> = {};
    for (const c of conversationsQ.data ?? []) m[c.id] = c;
    return m;
  }, [conversationsQ.data]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  // Trashed runs — lazy (only fetched when the Sampah tab opens), kept warm.
  const trashedQ = useQuery({
    queryKey: ["outreach", "autopilot", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<AutopilotRunRow[]>(await fetch("/api/autopilot/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [modeF, setModeF] = useState<ModeFilter>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    let running = 0;
    let done = 0;
    let attention = 0; // error + escalated → needs a human
    for (const r of runs) {
      if (r.status === "running" || r.status === "queued") running++;
      else if (r.status === "done") done++;
      if (r.status === "error" || r.status === "escalated") attention++;
    }
    return { total: runs.length, running, done, attention };
  }, [runs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      const okStatus = statusF === "all" || r.status === statusF;
      const okMode = modeF === "all" || r.mode === modeF;
      const convoRow = r.conversationId ? conversationById[r.conversationId] : null;
      const convo = convoRow ? conversationLabel(convoRow) : "";
      const hay = `${runHeadline(r)} ${r.trigger ?? ""} ${convo} ${r.id}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okStatus && okMode && okSearch;
    });
  }, [runs, statusF, modeF, search, conversationById]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((r) => {
      const hay = `${runHeadline(r)} ${r.trigger ?? ""} ${r.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [trashed, search]);

  // ── drawer (run detail) ──────────────────────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);

  // Full run detail (log trace) — fetched fresh per open so the log is current
  // even after the orchestrator appends entries. Falls back to the list row.
  const detailQ = useQuery({
    queryKey: ["outreach", "autopilot", "detail", openId],
    enabled: !!openId,
    queryFn: async () =>
      readJson<AutopilotRunRow>(await fetch(`/api/autopilot/${openId}`)),
    retry: false,
    // Poll while the run is mid-flight so the log/status update live.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "queued" ? 2500 : false;
    },
  });
  const activeRow = useMemo(() => runs.find((r) => r.id === openId) ?? null, [runs, openId]);
  const active = detailQ.data ?? activeRow;

  // ── start-run drawer ─────────────────────────────────────────────────────────
  const [startOpen, setStartOpen] = useState(false);
  const [startMode, setStartMode] = useState<"suggest" | "auto">("suggest");
  const [startConvo, setStartConvo] = useState<string>(""); // "" = none
  const [startSummary, setStartSummary] = useState("");

  function openStart() {
    setStartMode("suggest");
    setStartConvo("");
    setStartSummary("");
    setStartOpen(true);
  }

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<AutopilotRunRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AutopilotRunRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AutopilotRunRow | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["outreach", "autopilot"] });
  }

  // START — POST a new autopilot run, then immediately DRIVE it server-side
  // (create → queued, then POST /[id]/run advances it: running → done/escalated).
  // The orchestrator reuses the WA closing-flow brain over the linked
  // conversation; no log/metric values are invented client-side.
  const startRun = useMutation({
    mutationFn: async () => {
      const created = await readJson<AutopilotRunRow>(
        await fetch("/api/autopilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: startMode,
            status: "queued",
            trigger: "manual",
            conversationId: startConvo || null,
            summary: startSummary.trim() || null,
          }),
        }),
      );
      // Advance it right away (server-side). Returns the finished run row.
      return readJson<AutopilotRunRow>(
        await fetch(`/api/autopilot/${created.id}/run`, { method: "POST" }),
      );
    },
    onSuccess: (row) => {
      toast.success("Autopilot run dijalankan");
      refreshAll();
      setStartOpen(false);
      setOpenId(row.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memulai run"),
  });

  // RUN — drive an EXISTING queued/error run to completion server-side.
  const runRun = useMutation({
    mutationFn: async (r: AutopilotRunRow) =>
      readJson<AutopilotRunRow>(
        await fetch(`/api/autopilot/${r.id}/run`, { method: "POST" }),
      ),
    onSuccess: (row) => {
      toast.success(
        row.status === "escalated"
          ? "Run selesai — dieskalasi ke rep"
          : row.status === "error"
            ? "Run gagal — cek detail"
            : "Run selesai",
      );
      refreshAll();
      qc.invalidateQueries({ queryKey: ["outreach", "autopilot", "detail", row.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menjalankan run"),
  });

  // SOFT delete — moves an active run into "Sampah" (deleted_at stamped).
  const softDelete = useMutation({
    mutationFn: async (r: AutopilotRunRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/autopilot/${r.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success("Run dipindah ke Sampah");
      refreshAll();
      setDeleteTarget(null);
      if (openId === r.id) setOpenId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus run");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the run to the active tab.
  const restore = useMutation({
    mutationFn: async (r: AutopilotRunRow) =>
      readJson<AutopilotRunRow>(await fetch(`/api/autopilot/${r.id}/restore`, { method: "PATCH" })),
    onSuccess: () => {
      toast.success("Run dipulihkan");
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan run");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent removal from trash. Irreversible.
  const purge = useMutation({
    mutationFn: async (r: AutopilotRunRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/autopilot/${r.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: () => {
      toast.success("Run dihapus permanen");
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = runsQ.isError;
  const forbidden = runsQ.error instanceof Error && runsQ.error.message === "forbidden";

  return (
    <div>
      <PageHeader
        title="Autopilot"
        description="Riwayat run orkestrasi AI atas percakapan & kontak — status, durasi, dan jejak log per langkah. Klik baris untuk lihat detail + log. Lifecycle dijalankan oleh orkestrator AI."
      >
        <FeatureGuide guide={FEATURE_GUIDES.autopilot} />
        <Button asChild variant="outline" size="sm">
          <Link href="/escalations">
            <Bot className="h-4 w-4" /> Eskalasi
          </Link>
        </Button>
        <Button size="sm" onClick={openStart} disabled={runsQ.isError}>
          <Play className="h-4 w-4" /> Mulai run
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total run"
            value={runsQ.isLoading ? null : stats.total}
            hint="di workspace ini"
          />
          <StatCard
            label="Aktif / antri"
            value={runsQ.isLoading ? null : stats.running}
            hint="sedang berjalan / menunggu"
            valueClass="text-info"
          />
          <StatCard
            label="Selesai"
            value={runsQ.isLoading ? null : stats.done}
            hint="orkestrasi tuntas"
            valueClass="text-success"
          />
          <StatCard
            label="Perlu perhatian"
            value={runsQ.isLoading ? null : stats.attention}
            hint="gagal / eskalasi ke manusia"
            valueClass="text-warning"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Rocket className="h-4 w-4" />
            Aktif
            <CountPill>{runs.length}</CountPill>
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
            {/* TOOLBAR: status segmented control + mode pills + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {/* (1) STATUS segmented control */}
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "running", label: "Berjalan" },
                    { v: "queued", label: "Antri" },
                    { v: "done", label: "Selesai" },
                    { v: "error", label: "Gagal" },
                    { v: "escalated", label: "Eskalasi" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStatusF(s.v)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs transition-colors",
                      statusF === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              {/* (2) MODE pills */}
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Mode:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "auto", label: "Auto" },
                    { v: "suggest", label: "Saran" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => setModeF(m.v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      modeF === m.v
                        ? "bg-foreground font-semibold text-background"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* (3) inline search */}
              <div className="relative ml-auto w-48">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter ringkasan / pemicu…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {runsQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat run"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar autopilot run. Pastikan kamu login & database tersedia."
                }
                onRetry={() => runsQ.refetch()}
              />
            ) : runs.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Rocket}
                title="Belum ada autopilot run"
                description="Run muncul di sini saat orkestrator AI mulai menangani percakapan / kontak — otomatis (inbound, jadwal) atau saat kamu memulainya manual."
                action={
                  <Button size="sm" onClick={openStart}>
                    <Play className="h-4 w-4" /> Mulai run
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada run yang cocok"
                description="Coba ubah filter status / mode, atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Mode</th>
                      <th className="px-3 py-3 font-semibold">Ringkasan</th>
                      <th className="px-3 py-3 font-semibold">Pemicu</th>
                      <th className="px-3 py-3 font-semibold">Dimulai</th>
                      <th className="px-3 py-3 font-semibold">Durasi</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((r) => (
                      <RunTableRow
                        key={r.id}
                        run={r}
                        conversation={
                          r.conversationId ? conversationById[r.conversationId] ?? null : null
                        }
                        onOpen={() => setOpenId(r.id)}
                        onDelete={() => setDeleteTarget(r)}
                        onRun={() => runRun.mutate(r)}
                        runPending={runRun.isPending && runRun.variables?.id === r.id}
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
                Run yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab Aktif,{" "}
                <b>Hapus permanen</b> menghapus selamanya beserta jejak log-nya.
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} run
              </span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil run yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Run yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Mode</th>
                      <th className="px-3 py-3 font-semibold">Ringkasan</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((r) => (
                      <TrashedTableRow
                        key={r.id}
                        run={r}
                        onRestore={() => setRestoreTarget(r)}
                        onPurge={() => setPurgeTarget(r)}
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
          Mode{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={MODE_META.auto.style}
          >
            Auto
          </span>{" "}
          = AI bertindak penuh ·{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={MODE_META.suggest.style}
          >
            Saran
          </span>{" "}
          = AI menyarankan, manusia menyetujui. Status{" "}
          <b className="text-[color:#b45309]">Eskalasi</b> berarti run minta takeover manusia
          (lihat Eskalasi). Klik baris → panel kanan (status + meta + jejak log).
        </p>
      </div>

      {/* ===================== RIGHT DRAWER (run detail) ===================== */}
      <AppDrawerRaw
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={active ? "Autopilot run" : "Detail run"}
        widthClassName="w-[420px] max-w-full"
      >
        {active && (
          <>
            {/* header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
                  <Rocket className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-foreground">Autopilot run</h2>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{active.id}</p>
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
              {/* (A) STATUS + MODE */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={active.status} />
                <ModeBadge mode={active.mode} />
                {detailQ.isFetching && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> menyegarkan…
                  </span>
                )}
              </div>

              {/* (B) SUMMARY / ERROR */}
              {active.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Error
                  </p>
                  <p className="text-[13px] leading-relaxed text-foreground/80">{active.error}</p>
                </div>
              ) : null}
              {active.summary ? (
                <div className="rounded-lg border border-border bg-accent/60 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-tertiary" /> Ringkasan AI
                  </p>
                  <p className="text-[13px] leading-relaxed text-foreground/80">{active.summary}</p>
                </div>
              ) : null}

              {/* (C) META */}
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Detail
                </h3>
                <div className="space-y-2 text-[13px]">
                  <MetaRow label="Pemicu" value={active.trigger} />
                  <MetaRow label="Dimulai" value={fmtDateTimeID(active.startedAt)} />
                  <MetaRow label="Selesai" value={fmtDateTimeID(active.finishedAt)} />
                  <MetaRow
                    label="Durasi"
                    value={fmtDuration(active.startedAt, active.finishedAt)}
                  />
                  <MetaRow label="Dibuat" value={fmtDateTimeID(active.createdAt)} />
                  {active.conversationId && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Percakapan</span>
                      <Link
                        href="/inbox"
                        className="inline-flex items-center gap-1 text-right font-medium text-primary hover:underline"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {(() => {
                          const c = conversationById[active.conversationId!];
                          return c ? conversationLabel(c) : "Buka percakapan";
                        })()}
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* (D) LOG TRACE */}
              <div>
                <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Jejak log</span>
                  <span className="tabular-nums">{active.log?.length ?? 0} langkah</span>
                </h3>
                {detailQ.isLoading && !activeRow ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : detailQ.isError ? (
                  <ErrorState
                    className="border-0 py-6"
                    title="Gagal memuat log"
                    description="Tidak bisa mengambil jejak log run ini."
                    onRetry={() => detailQ.refetch()}
                  />
                ) : (active.log?.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-4 text-center text-[12px] text-muted-foreground">
                    Belum ada entri log. Orkestrator menambah langkah saat run berjalan.
                  </p>
                ) : (
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {active.log.map((entry, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[1.3125rem] top-1 flex h-2.5 w-2.5 items-center justify-center">
                          <CircleDot className="h-2.5 w-2.5 text-tertiary" />
                        </span>
                        <p className="text-[12px] leading-relaxed text-foreground">
                          {logEntryText(entry)}
                        </p>
                        {logEntryAt(entry) && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {fmtDateTimeID(logEntryAt(entry))}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              {(active.status === "queued" || active.status === "error") && (
                <Button
                  size="sm"
                  disabled={runRun.isPending}
                  onClick={() => active && runRun.mutate(active)}
                >
                  {runRun.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Menjalankan…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> {active.status === "error" ? "Jalankan ulang" : "Jalankan"}
                    </>
                  )}
                </Button>
              )}
              {active.conversationId && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/inbox">
                    <MessageSquare className="h-4 w-4" style={{ color: "#25D366" }} /> Buka chat
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-destructive hover:border-destructive/40 hover:text-destructive"
                onClick={() => active && setDeleteTarget(active)}
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            </div>
          </>
        )}
      </AppDrawerRaw>

      {/* ===================== START-RUN DRAWER ===================== */}
      <AppDrawerRaw
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Mulai autopilot run"
        widthClassName="w-[420px] max-w-full"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
              <Play className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-foreground">Mulai autopilot run</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Catat run baru — orkestrator AI menjalankan langkahnya
              </p>
            </div>
          </div>
          <button
            onClick={() => setStartOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* mode */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(["suggest", "auto"] as const).map((m) => {
                const on = startMode === m;
                const meta = MODE_META[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setStartMode(m)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}
                  >
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={meta.style}
                    >
                      {meta.label}
                    </span>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                      {meta.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* conversation (optional) */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Percakapan <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <div className="relative">
              <select
                value={startConvo}
                onChange={(e) => setStartConvo(e.target.value)}
                disabled={conversationsQ.isLoading || conversationsQ.isError}
                className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              >
                <option value="">— Tanpa percakapan —</option>
                {(conversationsQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {conversationLabel(c)}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {conversationsQ.isError
                ? "Tidak bisa memuat percakapan — run tetap bisa dimulai tanpa tautan."
                : "Tautkan run ke percakapan inbox agar log-nya terhubung ke thread itu."}
            </p>
          </div>

          {/* summary (optional) */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Catatan / tujuan <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              rows={3}
              value={startSummary}
              onChange={(e) => setStartSummary(e.target.value)}
              placeholder="mis. Follow-up lead yang belum balas 3 hari…"
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
            <span>
              Run langsung <b className="text-foreground">dijalankan</b>: orkestrator AI membaca
              percakapan tertaut, menyusun balasan, dan mengisi log.{" "}
              <b className="text-foreground">Auto</b> mengirim balasan ke percakapan;{" "}
              <b className="text-foreground">Saran</b> hanya mencatatnya untuk kamu setujui.
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={() => setStartOpen(false)}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <Button size="sm" disabled={startRun.isPending} onClick={() => startRun.mutate()}>
            {startRun.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Memulai…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Mulai run
              </>
            )}
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
            Run ini akan dihapus dan dipindah ke tab <b>Sampah</b> beserta jejak log-nya. Kamu masih
            bisa memulihkannya nanti.
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
        title="Pulihkan run?"
        body={<>Run ini akan dikembalikan ke tab <b>Aktif</b> beserta jejak log-nya.</>}
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label="Run ini"
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>. Run ini akan dihapus selamanya beserta jejak
            log-nya.
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

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold",
        meta.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, meta.spin && "animate-pulse")} />
      {meta.label}
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const meta = MODE_META[mode];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {mode}
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function RunTableRow({
  run,
  conversation,
  onOpen,
  onDelete,
  onRun,
  runPending,
}: {
  run: AutopilotRunRow;
  conversation: ConversationRow | null;
  onOpen: () => void;
  onDelete: () => void;
  onRun: () => void;
  runPending: boolean;
}) {
  const duration = fmtDuration(run.startedAt, run.finishedAt);
  const canRun = run.status === "queued" || run.status === "error";
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-3 py-3">
        <ModeBadge mode={run.mode} />
      </td>
      <td className="px-3 py-3">
        <p className="max-w-[280px] truncate font-medium text-foreground">{runHeadline(run)}</p>
        {conversation && (
          <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {conversationLabel(conversation)}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-foreground/70">{run.trigger ?? "—"}</td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(run.startedAt)}</td>
      <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">{duration ?? "—"}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {canRun && (
            <button
              type="button"
              onClick={onRun}
              disabled={runPending}
              title={run.status === "error" ? "Jalankan ulang" : "Jalankan run"}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
            >
              {runPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {run.status === "error" ? "Ulangi" : "Jalankan"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
          >
            Detail <ChevronRight className="h-3 w-3" />
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

function TrashedTableRow({
  run,
  onRestore,
  onPurge,
}: {
  run: AutopilotRunRow;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-3 py-3">
        <ModeBadge mode={run.mode} />
      </td>
      <td className="px-3 py-3">
        <p className="max-w-[280px] truncate font-medium text-foreground/80">{runHeadline(run)}</p>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {fmtRelID(run.deletedAt ?? null)}
      </td>
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

function MetaRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
