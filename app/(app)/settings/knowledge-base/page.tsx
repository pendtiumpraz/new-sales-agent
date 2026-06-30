"use client";

// Knowledge Base — Module 8 FRONTEND (Settings cluster · Sainskerta Loop Phase 04).
// Wired to the NEW M8 backend (no mock data) — the `knowledge_base` table the
// settings domain OWNS (the grounding articles/snippets the AI reads):
//   - GET    /api/settings/kb            → list live KB rows (KbRow[])
//   - GET    /api/settings/kb?scope=…    → scope-filtered list (server-validated)
//   - GET    /api/settings/kb/trashed    → soft-deleted rows (the Sampah tab)
//   - POST   /api/settings/kb            → create  { title, body, scope, tags, pinned }
//   - PATCH  /api/settings/kb/[id]       → edit    (partial)
//   - DELETE /api/settings/kb/[id]       → SOFT delete (→ Sampah)
//   - DELETE /api/settings/kb/[id]?purge=1 → HARD delete (permanent, irreversible)
//   - PATCH  /api/settings/kb/[id]/restore → un-trash
//
// Matches the established design system (Coral Sunset, the (app) shell, PageHeader +
// cards + shared Empty/Error states) and renders inside the shared Settings sub-nav
// (app/(app)/settings/layout.tsx provides SettingsNav). Create/edit happen in a
// right Sheet (drawer); trash/restore/purge mirror the contacts/admin contract
// (soft-delete confirm · restore confirm · type-to-confirm purge). Every band has
// loading + empty + error states. Manage actions gate on tenant.settings.manage.

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { can, mapDemoRole, type Role } from "@/lib/rbac/permissions";

// ── NEW M8 envelope ({ ok, data }) + row shape ──────────────────────────────
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

/** Row from GET /api/settings/kb (modules/settings · knowledge_base). */
interface KbRow {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  scope: string; // general | product | objection | compliance | persona
  tags: string[];
  pinned: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from the trashed view
}

// ── scope metadata (mirror the service KB_SCOPES enum) ───────────────────────
type ScopeKey = "general" | "product" | "objection" | "compliance" | "persona";

const SCOPES: { key: ScopeKey; label: string; hint: string }[] = [
  { key: "general", label: "Umum", hint: "Pengetahuan umum & konteks brand" },
  { key: "product", label: "Produk", hint: "Detail produk, fitur, & paket" },
  { key: "objection", label: "Objeksi", hint: "Jawaban keberatan & sanggahan" },
  { key: "compliance", label: "Kepatuhan", hint: "Batasan & klausul wajib (PDP)" },
  { key: "persona", label: "Persona", hint: "Gaya bicara & nada brand" },
];

const SCOPE_STYLE: Record<string, { label: string; style: React.CSSProperties }> = {
  general: { label: "Umum", style: { background: "hsl(220 9% 46% / .12)", color: "#4b5563" } },
  product: { label: "Produk", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  objection: { label: "Objeksi", style: { background: "hsl(38 92% 50% / .15)", color: "#d97706" } },
  compliance: { label: "Kepatuhan", style: { background: "#E1306C18", color: "#c01f5b" } },
  persona: { label: "Persona", style: { background: "hsl(258 90% 66% / .14)", color: "#7c3aed" } },
};

function scopeMeta(scope: string): { label: string; style: React.CSSProperties } {
  return SCOPE_STYLE[scope] ?? SCOPE_STYLE.general;
}

type ScopeFilter = "all" | ScopeKey;
type MainTab = "aktif" | "sampah";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read the NEW M8 envelope. 403 → "forbidden" sentinel for the access state. */
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
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

// ── drawer form state ──────────────────────────────────────────────────────
interface DrawerState {
  open: boolean;
  mode: "create" | "edit";
  id: string | null;
  title: string;
  body: string;
  scope: ScopeKey;
  tagsRaw: string; // comma-separated, parsed on submit
  pinned: boolean;
}

const EMPTY_DRAWER: DrawerState = {
  open: false,
  mode: "create",
  id: null,
  title: "",
  body: "",
  scope: "general",
  tagsRaw: "",
  pinned: false,
};

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBaseSettingsPage() {
  const { data: session } = useSession();
  // Session role may be the canonical RBAC role (real auth) or a demo display role;
  // map either onto a canonical Role before gating.
  const role: Role = useMemo(() => {
    const raw = session?.user?.role;
    if (!raw) return "member";
    if ((["superadmin", "tenant_owner", "tenant_admin", "member"] as const).includes(raw as Role)) {
      return raw as Role;
    }
    return mapDemoRole(raw);
  }, [session?.user?.role]);
  const canManage = can(role, "tenant.settings.manage");

  const qc = useQueryClient();
  const refreshAll = () => qc.invalidateQueries({ queryKey: ["settings", "kb"] });

  // ── live KB list ───────────────────────────────────────────────────────────
  const listQ = useQuery({
    queryKey: ["settings", "kb", "list"],
    queryFn: async () => readJson<KbRow[]>(await fetch("/api/settings/kb")),
    retry: false,
  });
  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);
  const listError = listQ.isError;
  const forbidden = listQ.error instanceof Error && listQ.error.message === "forbidden";

  // ── tabs (Aktif | Sampah) ────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  // Trashed rows — lazy (only fetched when the Sampah tab opens), kept warm.
  const trashedQ = useQuery({
    queryKey: ["settings", "kb", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<KbRow[]>(await fetch("/api/settings/kb/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [scopeF, setScopeF] = useState<ScopeFilter>("all");
  const [search, setSearch] = useState("");

  const scopeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.scope] = (c[r.scope] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const okScope = scopeF === "all" || r.scope === scopeF;
        const okSearch =
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q));
        return okScope && okSearch;
      })
      // Pinned float to the top, then by sort, then most-recent.
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.sort !== b.sort) return a.sort - b.sort;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [rows, scopeF, search]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter(
      (r) => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q),
    );
  }, [trashed, search]);

  const pinnedCount = useMemo(() => rows.filter((r) => r.pinned).length, [rows]);

  // ── drawer (create / edit) ───────────────────────────────────────────────────
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);

  function openCreate() {
    setDrawer({ ...EMPTY_DRAWER, open: true, mode: "create" });
  }
  function openEdit(r: KbRow) {
    setDrawer({
      open: true,
      mode: "edit",
      id: r.id,
      title: r.title,
      body: r.body,
      scope: (SCOPES.some((s) => s.key === r.scope) ? r.scope : "general") as ScopeKey,
      tagsRaw: r.tags.join(", "),
      pinned: r.pinned,
    });
  }
  function closeDrawer() {
    setDrawer((d) => ({ ...d, open: false }));
  }

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<KbRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<KbRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<KbRow | null>(null);

  // ── mutations ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (d: DrawerState) =>
      readJson<KbRow>(
        await fetch("/api/settings/kb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: d.title.trim(),
            body: d.body.trim(),
            scope: d.scope,
            tags: parseTags(d.tagsRaw),
            pinned: d.pinned,
          }),
        }),
      ),
    onSuccess: (_res, d) => {
      toast.success(`Artikel "${d.title.trim()}" dibuat`);
      refreshAll();
      closeDrawer();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat artikel"),
  });

  const update = useMutation({
    mutationFn: async (d: DrawerState) => {
      if (!d.id) throw new Error("Artikel tidak valid");
      return readJson<KbRow>(
        await fetch(`/api/settings/kb/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: d.title.trim(),
            body: d.body.trim(),
            scope: d.scope,
            tags: parseTags(d.tagsRaw),
            pinned: d.pinned,
          }),
        }),
      );
    },
    onSuccess: (_res, d) => {
      toast.success(`Artikel "${d.title.trim()}" diperbarui`);
      refreshAll();
      closeDrawer();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan artikel"),
  });

  // SOFT delete — moves a live article into "Sampah" (deleted_at stamped).
  const softDelete = useMutation({
    mutationFn: async (r: KbRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/settings/kb/${r.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.title}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus artikel");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the article to the active tab.
  const restore = useMutation({
    mutationFn: async (r: KbRow) =>
      readJson<KbRow>(await fetch(`/api/settings/kb/${r.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, r) => {
      toast.success(`"${r.title}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan artikel");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent removal from trash. Irreversible.
  const purge = useMutation({
    mutationFn: async (r: KbRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/settings/kb/${r.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.title}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  const submitting = create.isPending || update.isPending;

  function submitDrawer() {
    if (!drawer.title.trim()) {
      toast.error("Judul wajib diisi");
      return;
    }
    if (!drawer.body.trim()) {
      toast.error("Isi artikel wajib diisi");
      return;
    }
    if (drawer.mode === "create") create.mutate(drawer);
    else update.mutate(drawer);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Artikel & snippet yang menjadi sumber kebenaran AI saat menjawab — produk, objeksi, persona, & klausul kepatuhan. Disimpan per-tenant, dipakai semua workspace."
      >
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Artikel baru
          </Button>
        ) : (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Hanya-baca
          </span>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total artikel"
            value={listQ.isLoading ? null : rows.length}
            hint="aktif di tenant ini"
          />
          <StatCard
            label="Disematkan"
            value={listQ.isLoading ? null : pinnedCount}
            hint="diprioritaskan AI"
            valueClass="text-tertiary"
          />
          <StatCard
            label="Cakupan terpakai"
            value={listQ.isLoading ? null : Object.keys(scopeCounts).length}
            hint={`dari ${SCOPES.length} cakupan`}
          />
          <StatCard
            label="Di Sampah"
            value={tab === "sampah" && !trashedQ.isLoading ? trashed.length : null}
            renderNull={tab === "sampah" ? undefined : "—"}
            hint="bisa dipulihkan"
            valueClass="text-warning"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <BookOpen className="h-4 w-4" />
            Aktif
            <CountPill>{rows.length}</CountPill>
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
            {/* TOOLBAR: scope segmented control + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
                <ScopeChip active={scopeF === "all"} onClick={() => setScopeF("all")}>
                  Semua
                </ScopeChip>
                {SCOPES.map((s) => (
                  <ScopeChip
                    key={s.key}
                    active={scopeF === s.key}
                    onClick={() => setScopeF(s.key)}
                  >
                    {s.label}
                    {scopeCounts[s.key] ? (
                      <span className="ml-1 text-[10px] opacity-70">{scopeCounts[s.key]}</span>
                    ) : null}
                  </ScopeChip>
                ))}
              </div>

              <div className="relative ml-auto w-52">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari judul / isi / tag…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* LIST */}
            {listQ.isLoading ? (
              <ListLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat Knowledge Base"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin tenant."
                    : "Tidak bisa mengambil daftar artikel. Pastikan kamu login & database tersedia."
                }
                onRetry={() => listQ.refetch()}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={BookOpen}
                title="Belum ada artikel"
                description="Tambahkan artikel/snippet yang menjadi sumber kebenaran AI — produk, jawaban objeksi, persona brand, & klausul kepatuhan."
                action={
                  canManage ? (
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" /> Artikel baru
                    </Button>
                  ) : undefined
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada artikel yang cocok"
                description="Coba ubah filter cakupan atau kata kunci pencarian."
              />
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((r) => (
                  <KbListItem
                    key={r.id}
                    row={r}
                    canManage={canManage}
                    onEdit={() => openEdit(r)}
                    onDelete={() => setDeleteTarget(r)}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          /* ============ SAMPAH (trash) view ============ */
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                Artikel yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif, <b>Hapus permanen</b> menghapus selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} artikel
              </span>
            </div>

            {trashedQ.isLoading ? (
              <ListLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil artikel yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Artikel yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {visibleTrashed.map((r) => (
                  <TrashedListItem
                    key={r.id}
                    row={r}
                    canManage={canManage}
                    onRestore={() => setRestoreTarget(r)}
                    onPurge={() => setPurgeTarget(r)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Grain: <b>Knowledge Base = per-tenant</b>. Cakupan (scope) menentukan kapan AI menjangkau
          sebuah artikel — Umum · Produk · Objeksi · Kepatuhan · Persona. Artikel{" "}
          <span className="inline-flex items-center gap-0.5 align-middle font-medium text-tertiary">
            <Pin className="h-3 w-3" /> disematkan
          </span>{" "}
          diprioritaskan saat retrieval. Hanya Owner/Admin tenant yang bisa membuat, mengubah, &
          menghapus.
        </p>
      </div>

      {/* ===================== CREATE / EDIT DRAWER (right Sheet) ===================== */}
      <Sheet open={drawer.open} onOpenChange={(o) => !submitting && (o ? undefined : closeDrawer())}>
        <SheetContent side="right" className="flex w-[460px] max-w-full flex-col p-0">
          <SheetHeader className="flex-row items-center gap-3 border-b border-border p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-bold">
                {drawer.mode === "create" ? "Artikel baru" : "Edit artikel"}
              </SheetTitle>
              <p className="truncate text-[11px] text-muted-foreground">
                {drawer.mode === "create"
                  ? "Tambah sumber kebenaran untuk AI"
                  : drawer.title || "Ubah konten & cakupan"}
              </p>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {/* Judul */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Judul
              </label>
              <Input
                type="text"
                value={drawer.title}
                onChange={(e) => setDrawer((d) => ({ ...d, title: e.target.value }))}
                placeholder='mis. "Paket Pro vs Enterprise"'
                className="h-10"
              />
            </div>

            {/* Cakupan */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Cakupan
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SCOPES.map((s) => {
                  const on = drawer.scope === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setDrawer((d) => ({ ...d, scope: s.key }))}
                      className={cn(
                        "h-8 rounded-full px-3 text-xs transition-colors",
                        on
                          ? "font-semibold"
                          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                      )}
                      style={on ? scopeMeta(s.key).style : undefined}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {SCOPES.find((s) => s.key === drawer.scope)?.hint}
              </p>
            </div>

            {/* Isi */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Isi artikel
              </label>
              <textarea
                rows={8}
                value={drawer.body}
                onChange={(e) => setDrawer((d) => ({ ...d, body: e.target.value }))}
                placeholder="Tulis konten yang akan dibaca AI saat menjawab… (teks biasa atau Markdown)"
                className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Tag <span className="font-normal text-muted-foreground">(pisahkan dengan koma)</span>
              </label>
              <Input
                type="text"
                value={drawer.tagsRaw}
                onChange={(e) => setDrawer((d) => ({ ...d, tagsRaw: e.target.value }))}
                placeholder="harga, enterprise, diskon"
                className="h-10"
              />
              {parseTags(drawer.tagsRaw).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parseTags(drawer.tagsRaw).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      <Tag className="h-2.5 w-2.5" /> {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Pin */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
              <input
                type="checkbox"
                checked={drawer.pinned}
                onChange={(e) => setDrawer((d) => ({ ...d, pinned: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                  <Pin className="h-3.5 w-3.5 text-tertiary" /> Sematkan artikel
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Artikel disematkan diprioritaskan AI saat menyusun jawaban.
                </span>
              </span>
            </label>
          </div>

          <SheetFooter className="flex-row gap-2.5 border-t border-border p-5">
            <button
              type="button"
              disabled={submitting}
              onClick={closeDrawer}
              className="h-9 flex-1 rounded-lg border border-border bg-card text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={submitDrawer}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                </>
              ) : drawer.mode === "create" ? (
                "Buat artikel"
              ) : (
                "Simpan perubahan"
              )}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.title}</span> akan dihapus
            dari Knowledge Base aktif dan dipindah ke tab <b>Sampah</b>. AI berhenti memakainya, tapi
            kamu masih bisa memulihkannya nanti.
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
        title="Pulihkan artikel?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.title}</span> akan
            dikembalikan ke tab <b>Aktif</b> dan kembali dipakai AI.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
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
            selamanya dari Knowledge Base.
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
  renderNull,
}: {
  label: string;
  value: number | null;
  hint: string;
  valueClass?: string;
  /** Shown verbatim when `value` is null but it's NOT a loading state. */
  renderNull?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          renderNull ? (
            <span className="text-2xl font-bold tabular-nums text-muted-foreground">
              {renderNull}
            </span>
          ) : (
            <Skeleton className="h-7 w-12" />
          )
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

function ScopeChip({
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
        "h-7 rounded-md px-3 text-xs transition-colors",
        active
          ? "bg-card font-semibold text-foreground shadow-sm"
          : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const meta = scopeMeta(scope);
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function KbListItem({
  row,
  canManage,
  onEdit,
  onDelete,
}: {
  row: KbRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      onClick={canManage ? onEdit : undefined}
      className={cn(
        "group flex items-start gap-3 px-4 py-3.5 transition-colors",
        canManage && "cursor-pointer hover:bg-muted/40",
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.1] text-primary">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {row.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-tertiary" />}
          <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
          <ScopeBadge scope={row.scope} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {row.body}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {row.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" /> {t}
            </span>
          ))}
          {row.tags.length > 5 && (
            <span className="text-[10px] text-muted-foreground">+{row.tags.length - 5}</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            Diperbarui {fmtRelID(row.updatedAt)}
          </span>
        </div>
      </div>
      {canManage && (
        <div
          className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
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
      )}
    </li>
  );
}

function TrashedListItem({
  row,
  canManage,
  onRestore,
  onPurge,
}: {
  row: KbRow;
  canManage: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground/80">{row.title}</p>
          <ScopeBadge scope={row.scope} />
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{row.body}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Dihapus {fmtRelID(row.deletedAt ?? null)}
        </p>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1.5">
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
      )}
    </li>
  );
}

function ListLoading() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
        </li>
      ))}
    </ul>
  );
}
