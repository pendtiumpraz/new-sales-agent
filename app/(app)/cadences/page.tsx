"use client";

// Cadence (Outreach) — Module 7 FRONTEND (Sainskerta Loop Phase 04). Wired to the
// NEW M7 / outreach backend (no mock data). A cadence is a named, ordered follow-up
// SEQUENCE that walks a contact across channels (wa/email/call) with a delay before
// each step. Reads/mutations against app/api/cadences:
//   GET  /api/cadences                       — list live cadences (name, step_count, status)
//   GET  /api/cadences/trashed               — the Sampah view (soft-deleted)
//   GET  /api/cadences/enrollments           — enrollments (to count enrolled per cadence)
//   GET  /api/cadences/[id]/steps            — ordered steps of the open cadence (drawer)
//   GET  /api/contacts                       — contact picker for the Enroll action
//   PATCH  /api/cadences/[id]                — edit name / description / status
//   POST   /api/cadences/[id]/steps          — append a step
//   PATCH  /api/cadences/steps/[id]          — edit a step (channel/delay/subject/template)
//   DELETE /api/cadences/steps/[id]          — remove a step
//   POST   /api/cadences/[id]/enroll         — enroll a contact (schedules first step)
//   DELETE /api/cadences/[id]                — SOFT delete (cascades to steps + enrollments)
//   PATCH  /api/cadences/[id]/restore        — un-trash
//   DELETE /api/cadences/[id]?purge=1        — HARD delete (permanent, irreversible)
// Faithful to the established Coral Sunset design system — mirrors app/(app)/contacts/
// page.tsx: stat strip, Aktif | Sampah tabs, list + right-drawer + trash/restore/purge.
// Every band has loading + empty + error states. Lives in the (app) shell.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Check,
  ChevronRight,
  Clock,
  Layers,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M7 / outreach backend — { ok, data }) ─────

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

/** Keyset page envelope returned by the list endpoints (data = { items, nextCursor }). */
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Row from GET /api/cadences (modules/outreach · cadence_v2). */
interface CadenceRow {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  status: string; // active | paused | archived
  stepCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/cadences/trashed
}

/** Row from GET /api/cadences/[id]/steps (modules/outreach · cadence_step_v2). */
interface StepRow {
  id: string;
  tenantId: string;
  cadenceId: string;
  sort: number;
  channel: string; // wa | email | call
  delayHours: number;
  subject: string | null;
  template: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Row from GET /api/cadences/enrollments (modules/outreach · cadence_enrollment_v2). */
interface EnrollmentRow {
  id: string;
  cadenceId: string;
  contactId: string;
  currentStep: number;
  status: string; // active | paused | completed | stopped
  nextRunAt: string | null;
  createdAt: string;
}

/** Row from GET /api/contacts (modules/crm · contact) — only the fields the picker needs. */
interface ContactRow {
  id: string;
  fullName: string;
  title: string | null;
  segment: string;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "aktif" | "sampah";
const STEP_CHANNELS = ["wa", "email", "call"] as const;
type StepChannel = (typeof STEP_CHANNELS)[number];

const CHANNEL_META: Record<string, { label: string; short: string; color: string; icon: typeof MessageCircle }> = {
  wa: { label: "WhatsApp", short: "WA", color: "#25D366", icon: MessageCircle },
  email: { label: "Email", short: "Email", color: "#6366F1", icon: Mail },
  call: { label: "Telepon", short: "Call", color: "#8B5CF6", icon: Phone },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-success/15 text-success" },
  paused: { label: "Jeda", cls: "bg-warning/15 text-warning" },
  archived: { label: "Arsip", cls: "bg-muted text-muted-foreground" },
};

const STEP_CHANNEL_FALLBACK = { label: "—", short: "—", color: "#94A3B8", icon: MessageCircle };

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function channelOf(c: string) {
  return CHANNEL_META[c] ?? STEP_CHANNEL_FALLBACK;
}

/** delay_hours → human label (jam → hari when ≥24h). */
function fmtDelay(hours: number): string {
  if (hours <= 0) return "Langsung";
  if (hours < 24) return `Tunggu ${hours} jam`;
  const days = Math.round(hours / 24);
  return `Tunggu ${days} hari`;
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

// ── page ─────────────────────────────────────────────────────────────────────

export default function CadencesPage() {
  const qc = useQueryClient();

  // live cadences + all enrollments (enrollments resolve the per-cadence enrolled count)
  const cadencesQ = useQuery({
    queryKey: ["outreach", "cadences", "list"],
    queryFn: async () => readJson<CadenceRow[]>(await fetch("/api/cadences")),
    retry: false,
  });
  const enrollmentsQ = useQuery({
    queryKey: ["outreach", "enrollments", "list"],
    queryFn: async () => readJson<EnrollmentRow[]>(await fetch("/api/cadences/enrollments")),
    retry: false,
  });

  const cadences = useMemo(() => cadencesQ.data ?? [], [cadencesQ.data]);
  const enrollments = useMemo(() => enrollmentsQ.data ?? [], [enrollmentsQ.data]);

  // enrolled count per cadence (active enrollments) + total active count
  const enrolledByCadence = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enrollments) {
      if (e.status === "active") m[e.cadenceId] = (m[e.cadenceId] ?? 0) + 1;
    }
    return m;
  }, [enrollments]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  const trashedQ = useQuery({
    queryKey: ["outreach", "cadences", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<CadenceRow[]>(await fetch("/api/cadences/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [statusF, setStatusF] = useState<"all" | "active" | "paused" | "archived">("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    let steps = 0;
    let active = 0;
    let paused = 0;
    for (const c of cadences) {
      steps += c.stepCount;
      if (c.status === "active") active++;
      else if (c.status === "paused") paused++;
    }
    const enrolled = Object.values(enrolledByCadence).reduce((a, b) => a + b, 0);
    return { total: cadences.length, steps, active, paused, enrolled };
  }, [cadences, enrolledByCadence]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cadences.filter((c) => {
      const okStatus = statusF === "all" || c.status === statusF;
      const okSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q);
      return okStatus && okSearch;
    });
  }, [cadences, statusF, search]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((c) => c.name.toLowerCase().includes(q));
  }, [trashed, search]);

  // ── drawer ───────────────────────────────────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);
  const active = useMemo(() => cadences.find((c) => c.id === openId) ?? null, [cadences, openId]);

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<CadenceRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<CadenceRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<CadenceRow | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["outreach", "cadences"] });
    qc.invalidateQueries({ queryKey: ["outreach", "enrollments"] });
  }

  // SOFT delete — moves an active cadence into "Sampah" (cascades to steps + enrollments).
  const softDelete = useMutation({
    mutationFn: async (c: CadenceRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/cadences/${c.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.name}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
      if (openId === c.id) setOpenId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus cadence");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the cadence to the active tab.
  const restore = useMutation({
    mutationFn: async (c: CadenceRow) =>
      readJson<CadenceRow>(await fetch(`/api/cadences/${c.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, c) => {
      toast.success(`"${c.name}" dipulihkan`);
      refreshAll();
      qc.invalidateQueries({ queryKey: ["outreach", "cadences", "trashed"] });
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan cadence");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent removal from trash. Irreversible.
  const purge = useMutation({
    mutationFn: async (c: CadenceRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/cadences/${c.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.name}" dihapus permanen`);
      qc.invalidateQueries({ queryKey: ["outreach", "cadences", "trashed"] });
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = cadencesQ.isError;
  const forbidden = cadencesQ.error instanceof Error && cadencesQ.error.message === "forbidden";

  return (
    <div>
      <PageHeader
        title="Cadence"
        description="Urutan follow-up otomatis lintas channel (WhatsApp · Email · Telepon). Tiap step menunggu jeda lalu mengirim template. Klik baris untuk lihat & edit step + daftarkan kontak."
      >
        <Button asChild size="sm">
          <a href="/cadences/new">
            <Plus className="h-4 w-4" /> Cadence baru
          </a>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total cadence"
            value={cadencesQ.isLoading ? null : stats.total}
            hint="urutan follow-up"
          />
          <StatCard
            label="Total step"
            value={cadencesQ.isLoading ? null : stats.steps}
            hint="di semua cadence"
          />
          <StatCard
            label="Kontak ter-enroll"
            value={enrollmentsQ.isLoading ? null : stats.enrolled}
            hint="enrollment aktif"
            valueClass="text-tertiary"
          />
          <StatCard
            label="Aktif berjalan"
            value={cadencesQ.isLoading ? null : stats.active}
            hint="status aktif"
            valueClass="text-success"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Workflow className="h-4 w-4" />
            Aktif
            <CountPill>{cadences.length}</CountPill>
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
            {/* TOOLBAR: status segmented control + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "active", label: "Aktif" },
                    { v: "paused", label: "Jeda" },
                    { v: "archived", label: "Arsip" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStatusF(s.v)}
                    className={cn(
                      "h-7 rounded-md px-3.5 text-xs transition-colors",
                      statusF === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* inline search */}
              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter nama cadence…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {cadencesQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat cadence"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar cadence. Pastikan kamu login & database tersedia."
                }
                onRetry={() => cadencesQ.refetch()}
              />
            ) : cadences.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Workflow}
                title="Belum ada cadence"
                description="Cadence adalah urutan follow-up otomatis. Buat satu, tambahkan step (WA / Email / Telepon + jeda + template), lalu daftarkan kontak."
                action={
                  <Button asChild size="sm">
                    <a href="/cadences/new">
                      <Plus className="h-4 w-4" /> Cadence baru
                    </a>
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada cadence yang cocok"
                description="Coba ubah filter status atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama cadence</th>
                      <th className="px-3 py-3 font-semibold">Channel</th>
                      <th className="px-3 py-3 font-semibold">Step</th>
                      <th className="px-3 py-3 font-semibold">Ter-enroll</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((c) => (
                      <CadenceTableRow
                        key={c.id}
                        cadence={c}
                        enrolled={enrolledByCadence[c.id] ?? 0}
                        onOpen={() => setOpenId(c.id)}
                        onDelete={() => setDeleteTarget(c)}
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
                Cadence yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif (beserta step &amp; enrollment), <b>Hapus permanen</b> menghapus selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} cadence
              </span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil cadence yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Cadence yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama cadence</th>
                      <th className="px-3 py-3 font-semibold">Step</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((c) => (
                      <TrashedTableRow
                        key={c.id}
                        cadence={c}
                        onRestore={() => setRestoreTarget(c)}
                        onPurge={() => setPurgeTarget(c)}
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
          Channel step:{" "}
          <ChannelLegend channel="wa" /> · <ChannelLegend channel="email" /> ·{" "}
          <ChannelLegend channel="call" />. Klik baris → panel kanan (edit cadence + step
          berurutan + daftarkan kontak).
        </p>
      </div>

      {/* ===================== RIGHT DRAWER ===================== */}
      <AppDrawerRaw
        open={!!openId && !!active}
        onClose={() => setOpenId(null)}
        title={active?.name ?? "Detail cadence"}
        widthClassName="w-[440px] max-w-full"
      >
        {active && (
          <CadenceDrawer
            cadence={active}
            enrolled={enrolledByCadence[active.id] ?? 0}
            onClose={() => setOpenId(null)}
            onDelete={() => setDeleteTarget(active)}
            onChanged={refreshAll}
          />
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
            dan dipindah ke tab <b>Sampah</b> (cascade ke step &amp; enrollment-nya). Kamu masih
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
        title="Pulihkan cadence?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan
            dikembalikan ke tab <b>Aktif</b> beserta step &amp; enrollment-nya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
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
            selamanya beserta step &amp; enrollment-nya.
          </>
        }
      />
    </div>
  );
}

// ───────────────────────── drawer (view/edit cadence + steps + enroll) ─────────

function CadenceDrawer({
  cadence,
  enrolled,
  onClose,
  onDelete,
  onChanged,
}: {
  cadence: CadenceRow;
  enrolled: number;
  onClose: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();

  // ── editable cadence header (name/description/status) ──────────────────────
  const [name, setName] = useState(cadence.name);
  const [description, setDescription] = useState(cadence.description ?? "");
  const [status, setStatus] = useState(cadence.status);

  // Re-seed local form whenever a different cadence opens.
  useEffect(() => {
    setName(cadence.name);
    setDescription(cadence.description ?? "");
    setStatus(cadence.status);
  }, [cadence.id, cadence.name, cadence.description, cadence.status]);

  const dirty =
    name.trim() !== cadence.name ||
    description !== (cadence.description ?? "") ||
    status !== cadence.status;

  // ── ordered steps ──────────────────────────────────────────────────────────
  const stepsQ = useQuery({
    queryKey: ["outreach", "cadence-steps", cadence.id],
    queryFn: async () => readJson<StepRow[]>(await fetch(`/api/cadences/${cadence.id}/steps`)),
    retry: false,
  });
  const steps = useMemo(() => stepsQ.data ?? [], [stepsQ.data]);

  function refreshSteps() {
    qc.invalidateQueries({ queryKey: ["outreach", "cadence-steps", cadence.id] });
    onChanged();
  }

  // PATCH cadence header
  const saveCadence = useMutation({
    mutationFn: async () =>
      readJson<CadenceRow>(
        await fetch(`/api/cadences/${cadence.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            status,
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Cadence diperbarui");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan cadence"),
  });

  // POST a new step (appended to the end)
  const addStep = useMutation({
    mutationFn: async (vars: { channel: StepChannel; delayHours: number; subject: string | null; template: string }) =>
      readJson<StepRow>(
        await fetch(`/api/cadences/${cadence.id}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        }),
      ),
    onSuccess: () => {
      toast.success("Step ditambahkan");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambah step"),
  });

  // PATCH a step
  const saveStep = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Pick<StepRow, "channel" | "delayHours" | "subject" | "template">> }) =>
      readJson<StepRow>(
        await fetch(`/api/cadences/steps/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars.patch),
        }),
      ),
    onSuccess: () => {
      toast.success("Step diperbarui");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan step"),
  });

  // DELETE a step (soft delete — backend de-counts step_count)
  const deleteStep = useMutation({
    mutationFn: async (id: string) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/cadences/steps/${id}`, { method: "DELETE" }),
      ),
    onSuccess: () => {
      toast.success("Step dihapus");
      refreshSteps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus step"),
  });

  // ── enroll contacts ────────────────────────────────────────────────────────
  const [enrollOpen, setEnrollOpen] = useState(false);

  return (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
            <Workflow className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{cadence.name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {cadence.stepCount} step · {enrolled} ter-enroll
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Tutup"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* (A) CADENCE HEADER — editable */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nama
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Deskripsi
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tujuan cadence ini…"
              className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["active", "paused", "archived"] as const).map((s) => {
                const meta = STATUS_META[s];
                const on = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      on
                        ? cn("font-semibold", meta.cls)
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-0.5">
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setName(cadence.name);
                  setDescription(cadence.description ?? "");
                  setStatus(cadence.status);
                }}
                className="h-7 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset
              </button>
            )}
            <Button
              size="sm"
              disabled={!dirty || !name.trim() || saveCadence.isPending}
              onClick={() => saveCadence.mutate()}
            >
              <Check className="h-3.5 w-3.5" />
              {saveCadence.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>

        {/* (B) ORDERED STEPS */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Step berurutan
            </h3>
            <span className="text-[11px] text-muted-foreground">{steps.length} step</span>
          </div>

          {stepsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : stepsQ.isError ? (
            <ErrorState
              className="border-0 py-6"
              title="Gagal memuat step"
              description="Tidak bisa mengambil step cadence ini."
              onRetry={() => stepsQ.refetch()}
            />
          ) : steps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-[12px] text-muted-foreground">
                Belum ada step. Tambahkan step pertama agar kontak bisa di-enroll.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {steps.map((step, i) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  index={i}
                  isLast={i === steps.length - 1}
                  onSave={(patch) => saveStep.mutate({ id: step.id, patch })}
                  saving={saveStep.isPending && saveStep.variables?.id === step.id}
                  onDelete={() => deleteStep.mutate(step.id)}
                  deleting={deleteStep.isPending && deleteStep.variables === step.id}
                />
              ))}
            </div>
          )}

          {/* add step */}
          <AddStepForm
            onAdd={(vars) => addStep.mutate(vars)}
            pending={addStep.isPending}
            nextIndex={steps.length}
          />
        </div>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" /> Hapus
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={steps.length === 0}
          onClick={() => setEnrollOpen(true)}
          title={steps.length === 0 ? "Tambahkan step dulu sebelum enroll" : undefined}
        >
          <UserPlus className="h-4 w-4" /> Daftarkan kontak
        </Button>
      </div>

      {/* enroll modal */}
      <EnrollModal
        open={enrollOpen}
        cadence={cadence}
        hasSteps={steps.length > 0}
        onClose={() => setEnrollOpen(false)}
        onEnrolled={onChanged}
      />
    </>
  );
}

// ───────────────────────── step editor (inline edit one step) ─────────────────

function StepEditor({
  step,
  index,
  isLast,
  onSave,
  saving,
  onDelete,
  deleting,
}: {
  step: StepRow;
  index: number;
  isLast: boolean;
  onSave: (patch: Partial<Pick<StepRow, "channel" | "delayHours" | "subject" | "template">>) => void;
  saving: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState<StepChannel>((step.channel as StepChannel) ?? "wa");
  const [delayHours, setDelayHours] = useState(step.delayHours);
  const [subject, setSubject] = useState(step.subject ?? "");
  const [template, setTemplate] = useState(step.template);

  useEffect(() => {
    setChannel((step.channel as StepChannel) ?? "wa");
    setDelayHours(step.delayHours);
    setSubject(step.subject ?? "");
    setTemplate(step.template);
  }, [step.id, step.channel, step.delayHours, step.subject, step.template]);

  const meta = channelOf(step.channel);
  const Icon = meta.icon;

  if (!editing) {
    return (
      <div className="relative">
        <div className="group flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: meta.color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-foreground">
                {index + 1}. {meta.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Clock className="h-2.5 w-2.5" /> {fmtDelay(step.delayHours)}
              </span>
            </div>
            {step.subject && (
              <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/80">
                {step.subject}
              </p>
            )}
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {step.template || <span className="italic">Template kosong</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit step"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Hapus step"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {!isLast && (
          <div className="flex justify-center py-0.5 text-muted-foreground/50">
            <ArrowDown className="h-3 w-3" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="space-y-2.5 rounded-lg border border-primary/40 bg-accent/40 p-3">
        {/* channel + delay */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {STEP_CHANNELS.map((c) => {
              const cm = channelOf(c);
              const on = channel === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] transition-colors",
                    on ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: cm.color }} /> {cm.short}
                </button>
              );
            })}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Jeda
            <input
              type="number"
              min={0}
              value={delayHours}
              onChange={(e) => setDelayHours(Math.max(0, Number(e.target.value) || 0))}
              className="h-7 w-16 rounded-md border border-border bg-card px-2 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            jam
          </label>
        </div>
        {/* subject (email only) */}
        {channel === "email" && (
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subjek email…"
            className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        )}
        {/* template */}
        <textarea
          rows={3}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="Isi pesan / skrip telepon…"
          className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-7 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Batal
          </button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => {
              onSave({
                channel,
                delayHours,
                subject: channel === "email" ? subject.trim() || null : null,
                template,
              });
              setEditing(false);
            }}
          >
            <Check className="h-3.5 w-3.5" /> {saving ? "Menyimpan…" : "Simpan step"}
          </Button>
        </div>
      </div>
      {!isLast && (
        <div className="flex justify-center py-0.5 text-muted-foreground/50">
          <ArrowDown className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── add step form ──────────────────────────────────────

function AddStepForm({
  onAdd,
  pending,
  nextIndex,
}: {
  onAdd: (vars: { channel: StepChannel; delayHours: number; subject: string | null; template: string }) => void;
  pending: boolean;
  nextIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<StepChannel>("wa");
  const [delayHours, setDelayHours] = useState(24);
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");

  function reset() {
    setChannel("wa");
    setDelayHours(24);
    setSubject("");
    setTemplate("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah step {nextIndex + 1}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2.5 rounded-lg border border-primary/40 bg-accent/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {STEP_CHANNELS.map((c) => {
            const cm = channelOf(c);
            const on = channel === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] transition-colors",
                  on ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: cm.color }} /> {cm.short}
              </button>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Jeda
          <input
            type="number"
            min={0}
            value={delayHours}
            onChange={(e) => setDelayHours(Math.max(0, Number(e.target.value) || 0))}
            className="h-7 w-16 rounded-md border border-border bg-card px-2 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          jam
        </label>
      </div>
      {channel === "email" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subjek email…"
          className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      )}
      <textarea
        rows={3}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        placeholder="Isi pesan / skrip telepon…"
        className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="h-7 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Batal
        </button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            onAdd({
              channel,
              delayHours,
              subject: channel === "email" ? subject.trim() || null : null,
              template,
            })
          }
        >
          <Plus className="h-3.5 w-3.5" /> {pending ? "Menambah…" : "Tambah step"}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── enroll modal (contact picker) ──────────────────────

function EnrollModal({
  open,
  cadence,
  hasSteps,
  onClose,
  onEnrolled,
}: {
  open: boolean;
  cadence: CadenceRow;
  hasSteps: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Contact picker — only fetch when the modal is actually open.
  const contactsQ = useQuery({
    queryKey: ["outreach", "enroll-contacts"],
    enabled: open,
    queryFn: async () =>
      (await readJson<Page<ContactRow>>(await fetch("/api/contacts?limit=200"))).items,
    retry: false,
  });
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected(new Set());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.fullName.toLowerCase().includes(q) || (c.title ?? "").toLowerCase().includes(q),
    );
  }, [contacts, search]);

  // Enroll the selected contacts one POST at a time (the backend upserts per contact).
  const enroll = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0;
      const errors: string[] = [];
      for (const contactId of ids) {
        try {
          await readJson<EnrollmentRow>(
            await fetch(`/api/cadences/${cadence.id}/enroll`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId }),
            }),
          );
          ok++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "gagal");
        }
      }
      return { ok, errors };
    },
    onSuccess: (res) => {
      if (res.ok > 0) toast.success(`${res.ok} kontak didaftarkan ke "${cadence.name}"`);
      if (res.errors.length > 0)
        toast.error(`${res.errors.length} kontak gagal didaftarkan (${res.errors[0]})`);
      onEnrolled();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mendaftarkan kontak"),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          "flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Daftarkan kontak</h3>
              <p className="text-[11px] text-muted-foreground">ke cadence “{cadence.name}”</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!hasSteps ? (
          <div className="px-5 py-8">
            <EmptyState
              className="border-0"
              icon={Layers}
              title="Cadence belum punya step"
              description="Tambahkan minimal satu step dulu — step pertama menentukan kapan pesan awal dijadwalkan."
            />
          </div>
        ) : (
          <>
            {/* search */}
            <div className="border-b border-border px-5 py-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kontak…"
                  className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>

            {/* list */}
            <div className="min-h-[180px] flex-1 overflow-y-auto px-2 py-2">
              {contactsQ.isLoading ? (
                <div className="space-y-1.5 px-3 py-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : contactsQ.isError ? (
                <ErrorState
                  className="border-0 py-8"
                  title="Gagal memuat kontak"
                  description="Tidak bisa mengambil daftar kontak untuk enroll."
                  onRetry={() => contactsQ.refetch()}
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  className="border-0 py-8"
                  icon={Users}
                  title={contacts.length === 0 ? "Belum ada kontak" : "Tidak ada yang cocok"}
                  description={
                    contacts.length === 0
                      ? "Jalankan Discovery / Enrichment dulu untuk mendapatkan kontak."
                      : "Coba kata kunci lain."
                  }
                />
              ) : (
                <div className="space-y-0.5">
                  {filtered.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggle(c.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                          on ? "bg-primary/[0.08]" : "hover:bg-muted/60",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {c.fullName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {c.title || "Perorangan"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-[12px] text-muted-foreground">
                <b className="text-foreground">{selected.size}</b> dipilih
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Batal
                </button>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={selected.size === 0 || enroll.isPending}
                  onClick={() => enroll.mutate(Array.from(selected))}
                >
                  <UserPlus className="h-4 w-4" />
                  {enroll.isPending ? "Mendaftarkan…" : `Daftarkan ${selected.size || ""}`.trim()}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── list rows / shared bits ─────────────────────────────

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
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
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
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

function ChannelLegend({ channel }: { channel: string }) {
  const meta = channelOf(channel);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-foreground/70">
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} /> {meta.label}
    </span>
  );
}

function CadenceTableRow({
  cadence,
  enrolled,
  onOpen,
  onDelete,
}: {
  cadence: CadenceRow;
  enrolled: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{cadence.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {cadence.description || "Tanpa deskripsi"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3">
        {/* Channel mix is unknown without loading steps; show generic channel dots
            keyed by the step count so the column reads as "multi-channel". */}
        <div className="flex items-center gap-1">
          {STEP_CHANNELS.map((c) => {
            const meta = channelOf(c);
            const Icon = meta.icon;
            return (
              <span
                key={c}
                title={meta.label}
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: `${meta.color}1f`, color: meta.color }}
              >
                <Icon className="h-2.5 w-2.5" />
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-foreground/80">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <b className="tabular-nums">{cadence.stepCount}</b>
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-foreground/80">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <b className="tabular-nums">{enrolled}</b>
        </span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={cadence.status} />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
          >
            Buka <ChevronRight className="h-3 w-3" />
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
  cadence,
  onRestore,
  onPurge,
}: {
  cadence: CadenceRow;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground/80">{cadence.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {cadence.description || "Tanpa deskripsi"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          <b className="tabular-nums">{cadence.stepCount}</b>
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {fmtRelID(cadence.deletedAt ?? null)}
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

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
