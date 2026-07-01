"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";

/**
 * Superadmin console — PLATFORM-LEVEL (Sainskerta Loop Phase 04, Module 1 FE).
 *
 * Faithful to mockup `mockups/superadmin-users.html` (Coral Sunset theme via the
 * shared CSS vars). This is a brand-NEUTRAL platform shell — it deliberately sits
 * OUTSIDE the per-tenant white-label `(app)` shell, because the operator manages
 * EVERY tenant here, not their own workspace.
 *
 * Wired to the NEW backend (no mock / no hardcoded data):
 *   - GET    /api/superadmin/overview            → KPI strip
 *   - GET    /api/superadmin/tenants             → tenant table (TenantRow[])
 *   - GET    /api/tenant/[id]/quota              → per-tenant AI-token quota (merged)
 *   - PATCH  /api/superadmin/tenants/[id]/activation → activate + set durasi/kuota
 *   - POST   /api/tenant/[id]/suspend            → kill-switch
 *   - POST   /api/tenant/[id]/quota              → "+ Kredit" (top up ai_tokens_max)
 *   - POST   /api/superadmin/provision           → "Buat akun" (tenant + first admin)
 *
 * Guard: only `is_superadmin` (session.user.role === "superadmin").
 */

// ── Shared envelope + row shapes (mirror the rebuild service types) ──
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

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string; // pending | active | suspended | expired
  verticalKey: string | null;
  planKey: string | null;
  activeUntil: string | null;
  deletedAt?: string | null; // set on rows from /api/tenant/trashed
}

interface UsageCounterRow {
  id: string;
  tenantId: string;
  metric: string;
  period: string;
  used: number;
  quotaLimit: number | null;
}

interface Overview {
  tenants: { total: number; byStatus: Record<string, number> };
  users: { total: number; superadmins: number };
  auditEvents: number;
}

// Secrets & Config — mirrors lib/config/secrets.ts SecretStatus (never carries a
// full secret value; `preview` is a masked/truncated view only).
interface SecretStatus {
  key: string;
  label: string;
  category: string;
  secret: boolean;
  setInDb: boolean;
  hasEnv: boolean;
  preview: string;
}
interface SecretsResponse {
  secrets: SecretStatus[];
  hasMasterKey: boolean;
}

const AI_TOKENS_METRIC = "ai_tokens_max";

type StatusFilter = "all" | "pending" | "active" | "suspended";
type ConsoleTab = "aktif" | "sampah" | "secrets" | "docs";

// ── small helpers ──────────────────────────────────────────────────
async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function initialsOf(name: string): string {
  return (
    name
      .replace(/^(PT|CV|Toko|UD)\.?\s+/i, "")
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TN"
  );
}

function fmtDateID(iso: string | null): string {
  if (!iso) return "Tanpa batas";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Tanpa batas";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
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

function shortQuota(n: number | null): string {
  if (n == null) return "∞";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}rb`;
  return `${n}`;
}

function fmtInt(n: number): string {
  return Number(n).toLocaleString("id-ID");
}

function untilFromMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Disposable strong password for the provisioned admin — they reset it via the
 *  invite / set-password link (per the mockup copy), so it's never shown. */
function genPassword(): string {
  const a = crypto.randomUUID().replace(/-/g, "");
  return `Aa1!${a.slice(0, 16)}`;
}

const VERTICALS = [
  { value: "", label: "Pilih vertical…" },
  { value: "Sales", label: "Sales — outbound & pipeline" },
  { value: "HR", label: "HR — rekrutmen & talent" },
  { value: "Marketing", label: "Marketing — campaign & lead-gen" },
  { value: "Lainnya", label: "Lainnya / custom" },
];

const DUR_CHIPS = [1, 3, 6, 12];
const QUOTA_CHIPS = [100_000, 500_000, 1_000_000, 5_000_000];

// ── drawer form state ──────────────────────────────────────────────
interface DrawerState {
  open: boolean;
  mode: "create" | "activate";
  tenantId: string | null; // activate target
  name: string;
  email: string;
  vertical: string;
  until: string; // yyyy-mm-dd, "" = no expiry
  quota: number; // ai tokens ceiling
  note: string;
}

const EMPTY_DRAWER: DrawerState = {
  open: false,
  mode: "create",
  tenantId: null,
  name: "",
  email: "",
  vertical: "",
  until: untilFromMonths(12),
  quota: 500_000,
  note: "",
};

export default function SuperadminConsole() {
  const { data: session, status } = useSession();
  const isSuper = session?.user?.role === "superadmin" || session?.user?.isSuperadmin === true;
  const qc = useQueryClient();

  // ── queries ──────────────────────────────────────────────────────
  const overviewQ = useQuery({
    queryKey: ["superadmin", "overview"],
    enabled: isSuper,
    queryFn: async () => readJson<Overview>(await fetch("/api/superadmin/overview")),
  });

  const tenantsQ = useQuery({
    queryKey: ["superadmin", "tenants"],
    enabled: isSuper,
    queryFn: async () => readJson<TenantRow[]>(await fetch("/api/superadmin/tenants")),
  });

  const tenants = useMemo(() => tenantsQ.data ?? [], [tenantsQ.data]);

  // Soft-deleted tenants — the "Sampah" (trash) tab. Lazy: only fetched once the
  // operator opens that tab, but kept warm afterwards so soft-delete/restore feel
  // instant. Failures degrade to an inline error state (not a torn page).
  const [tab, setTab] = useState<ConsoleTab>("aktif");

  const trashedQ = useQuery({
    queryKey: ["superadmin", "trashed"],
    enabled: isSuper && tab === "sampah",
    queryFn: async () => readJson<TenantRow[]>(await fetch("/api/tenant/trashed")),
  });

  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // Per-tenant AI-token quota — one read each, in parallel, only for tenants we
  // actually have. Failures degrade gracefully to "no quota" (null) rather than
  // tearing the table down.
  const quotaQueries = useQueries({
    queries: tenants.map((t) => ({
      queryKey: ["superadmin", "quota", t.id],
      enabled: isSuper,
      staleTime: 60_000,
      queryFn: async () => {
        try {
          const rows = await readJson<UsageCounterRow[]>(
            await fetch(`/api/tenant/${t.id}/quota`),
          );
          return rows.find((r) => r.metric === AI_TOKENS_METRIC) ?? null;
        } catch {
          return null;
        }
      },
    })),
  });

  const quotaByTenant = useMemo(() => {
    const map: Record<string, UsageCounterRow | null> = {};
    tenants.forEach((t, i) => {
      map[t.id] = (quotaQueries[i]?.data as UsageCounterRow | null | undefined) ?? null;
    });
    return map;
  }, [tenants, quotaQueries]);

  // ── filters + search ─────────────────────────────────────────────
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c = { all: tenants.length, pending: 0, active: 0, suspended: 0 };
    for (const t of tenants) {
      if (t.status === "pending") c.pending++;
      else if (t.status === "active") c.active++;
      else if (t.status === "suspended") c.suspended++;
    }
    return c;
  }, [tenants]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      const okStatus = filter === "all" || t.status === filter;
      const hay = `${t.name} ${t.slug} ${t.verticalKey ?? ""}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okStatus && okSearch;
    });
  }, [tenants, filter, search]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((t) =>
      `${t.name} ${t.slug} ${t.verticalKey ?? ""}`.toLowerCase().includes(q),
    );
  }, [trashed, search]);

  // ── drawer ───────────────────────────────────────────────────────
  const [drawer, setDrawer] = useState<DrawerState>(EMPTY_DRAWER);
  const nameRef = useRef<HTMLInputElement | null>(null);

  function openCreate() {
    setDrawer({ ...EMPTY_DRAWER, open: true, mode: "create", until: untilFromMonths(12) });
  }
  function openActivate(t: TenantRow) {
    setDrawer({
      open: true,
      mode: "activate",
      tenantId: t.id,
      name: t.name,
      email: "",
      vertical: t.verticalKey ?? "",
      until: untilFromMonths(12),
      quota: 500_000,
      note: "",
    });
  }
  function closeDrawer() {
    setDrawer((d) => ({ ...d, open: false }));
  }

  // Autofocus the name field once the drawer's open animation settles.
  // (Esc-to-close, scroll-lock, and focus-trap are handled by AppDrawerRaw.)
  useEffect(() => {
    if (!drawer.open) return;
    const t = setTimeout(() => nameRef.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [drawer.open]);

  // ── confirm modals (suspend / soft-delete / restore / purge) ─────
  const [suspendTarget, setSuspendTarget] = useState<TenantRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TenantRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TenantRow | null>(null);

  // ── mutations ────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["superadmin"] });
  }

  const provision = useMutation({
    mutationFn: async (d: DrawerState) => {
      const body = {
        name: d.name.trim(),
        verticalKey: d.vertical || undefined,
        admin: {
          name: d.name.trim(),
          email: d.email.trim().toLowerCase(),
          password: genPassword(),
        },
        activate: true,
        activeUntil: d.until ? new Date(d.until).toISOString() : null,
        quotas: { [AI_TOKENS_METRIC]: d.quota || null },
      };
      return readJson<{ tenant: TenantRow }>(
        await fetch("/api/superadmin/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, d) => {
      toast.success(`Tenant "${d.name.trim()}" dibuat & diaktifkan`);
      refreshAll();
      closeDrawer();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat tenant"),
  });

  const activate = useMutation({
    mutationFn: async (d: DrawerState) => {
      if (!d.tenantId) throw new Error("Tenant tidak valid");
      const body = {
        activeUntil: d.until ? new Date(d.until).toISOString() : null,
        quotas: { [AI_TOKENS_METRIC]: d.quota || null },
      };
      return readJson<TenantRow>(
        await fetch(`/api/superadmin/tenants/${d.tenantId}/activation`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, d) => {
      toast.success(`"${d.name}" diaktifkan s/d ${fmtDateID(d.until ? new Date(d.until).toISOString() : null)}`);
      refreshAll();
      closeDrawer();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengaktifkan tenant"),
  });

  const suspend = useMutation({
    mutationFn: async (t: TenantRow) =>
      readJson<TenantRow>(await fetch(`/api/tenant/${t.id}/suspend`, { method: "POST" })),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" di-suspend`);
      refreshAll();
      setSuspendTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal suspend tenant");
      setSuspendTarget(null);
    },
  });

  const credit = useMutation({
    mutationFn: async (t: TenantRow) => {
      const current = quotaByTenant[t.id];
      const base = current?.quotaLimit ?? 0;
      const next = base + 1_000_000;
      return readJson<UsageCounterRow>(
        await fetch(`/api/tenant/${t.id}/quota`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric: AI_TOKENS_METRIC, limit: next, period: "lifetime" }),
        }),
      );
    },
    onSuccess: (_res, t) => {
      toast.info(`+ 1 jt token ditambahkan ke "${t.name}"`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambah kredit"),
  });

  // SOFT delete — moves an active-tab tenant into "Sampah" (deleted_at stamped).
  const softDelete = useMutation({
    mutationFn: async (t: TenantRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/tenant/${t.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus tenant");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the tenant to the active tab.
  const restore = useMutation({
    mutationFn: async (t: TenantRow) =>
      readJson<TenantRow>(await fetch(`/api/tenant/${t.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan tenant");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent row removal. Irreversible.
  const purge = useMutation({
    mutationFn: async (t: TenantRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/tenant/${t.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen");
    },
  });

  const submitting = provision.isPending || activate.isPending;

  function submitDrawer() {
    if (!drawer.name.trim()) {
      toast.error("Nama tenant wajib diisi");
      nameRef.current?.focus();
      return;
    }
    if (drawer.mode === "create" && !drawer.email.trim()) {
      toast.error("Email admin wajib diisi");
      return;
    }
    if (!drawer.vertical) {
      toast.error("Pilih vertical dulu");
      return;
    }
    if (drawer.mode === "create") provision.mutate(drawer);
    else activate.mutate(drawer);
  }

  // ── guards ───────────────────────────────────────────────────────
  if (status === "loading") {
    return <div className="min-h-screen bg-background" />;
  }
  if (!isSuper) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldIcon />
          </span>
          <div className="space-y-1">
            <p className="font-semibold">Area Superadmin</p>
            <p className="text-sm text-muted-foreground">
              Konsol platform ini hanya untuk akun superadmin. Akun Anda tidak punya akses.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-primary underline">
            Kembali ke dashboard
          </Link>
        </div>
      </div>
    );
  }

  const o = overviewQ.data;
  const ov = (s: string) => o?.tenants.byStatus[s] ?? 0;

  // ── render ───────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ===================== SIDEBAR (platform-level, brand-neutral) ===================== */}
      <aside className="chrome fixed inset-y-0 z-30 flex w-64 shrink-0 flex-col border-r">
        <div
          className="flex h-14 items-center gap-2.5 border-b px-4"
          style={{ borderColor: "hsl(14 70% 86%)" }}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">Superadmin</div>
            <div className="truncate text-[10px] text-muted-foreground">Konsol Platform</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto py-4 text-sm">
          <div>
            <p className="mb-1.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Utama
            </p>
            <span className="relative flex items-center gap-3 bg-primary/10 px-4 py-2 font-medium text-primary">
              <span className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r bg-primary" />
              <GridIcon className="h-[18px] w-[18px]" />
              Tenant
            </span>
          </div>
          <div>
            <p className="mb-1.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Platform
            </p>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-2 text-foreground/70 transition-colors hover:bg-primary/5 hover:text-foreground"
            >
              <BackIcon className="h-[18px] w-[18px]" />
              Kembali ke app
            </Link>
          </div>
        </nav>

        <div
          className="flex items-center gap-2.5 border-t px-4 py-3"
          style={{ borderColor: "hsl(14 70% 86%)" }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/85 text-xs font-semibold text-white">
            {initialsOf(session?.user?.name ?? "SA")}
          </div>
          <div className="min-w-0 flex-1 text-xs leading-tight">
            <div className="truncate font-medium">{session?.user?.name ?? "Superadmin"}</div>
            <div className="truncate text-muted-foreground">Superadmin</div>
          </div>
        </div>
      </aside>

      {/* ===================== MAIN COLUMN ===================== */}
      <div className="ml-64 flex min-w-0 flex-1 flex-col">
        {/* TOPBAR */}
        <header className="glass sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="relative w-72 max-w-[40vw]">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tenant, slug, atau vertical…"
              className="h-9 w-full rounded-lg border border-border bg-card/80 pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card pl-2.5 pr-3 text-sm">
              <span className="h-2 w-2 rounded-full bg-tertiary" />
              <span className="font-medium">Scope: Semua tenant</span>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/85 text-xs font-semibold text-white shadow-soft">
              {initialsOf(session?.user?.name ?? "SA")}
            </div>
          </div>
        </header>

        {/* BODY */}
        <main className="flex-1 overflow-auto">
          {/* Page header */}
          <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-1 pt-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Manajemen Tenant</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Aktifkan, suspend, atur kuota &amp; durasi — lintas-tenant (platform-level).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAll}
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:border-primary/40"
              >
                <RefreshIcon className="h-4 w-4" />
                Segarkan
              </button>
              <button
                onClick={openCreate}
                className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
              >
                <PlusIcon className="h-4 w-4" />
                Buat akun
              </button>
            </div>
          </div>

          <div className="space-y-5 p-6">
            {/* KPI STRIP */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Total tenant"
                value={overviewQ.isLoading ? null : (o?.tenants.total ?? 0)}
                hint={`${ov("active")} aktif · ${ov("suspended")} suspend`}
                icon={<GridIcon className="h-[18px] w-[18px]" />}
                iconClass="bg-primary/10 text-primary"
              />
              <KpiCard
                label="Menunggu aktivasi"
                value={overviewQ.isLoading ? null : ov("pending")}
                hint="Butuh tindakan superadmin"
                hintClass="text-[color:#b45309]"
                valueClass="text-highlight-foreground"
                icon={<ClockIcon className="h-[18px] w-[18px]" />}
                iconStyle={{ background: "hsl(38 92% 50% / .15)", color: "#d97706" }}
              />
              <KpiCard
                label="Total pengguna"
                value={overviewQ.isLoading ? null : (o?.users.total ?? 0)}
                hint={`${o?.users.superadmins ?? 0} superadmin`}
                icon={<BoltIcon className="h-[18px] w-[18px]" />}
                iconClass="bg-tertiary/[0.12] text-tertiary"
              />
              <KpiCard
                label="Peristiwa audit"
                value={overviewQ.isLoading ? null : (o?.auditEvents ?? 0)}
                hint="Jejak audit lintas-tenant"
                icon={<MsgIcon className="h-[18px] w-[18px]" />}
                iconStyle={{ background: "#25D36618", color: "#1faa52" }}
              />
            </section>

            {/* PRIMARY TABS: Aktif | Sampah */}
            <div className="flex items-center gap-1 border-b border-border">
              <ConsoleTabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
                <GridIcon className="h-4 w-4" />
                Aktif
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {tenants.length}
                </span>
              </ConsoleTabButton>
              <ConsoleTabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
                <TrashIcon className="h-4 w-4" />
                Sampah
                {trashed.length > 0 && (
                  <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                    {trashed.length}
                  </span>
                )}
              </ConsoleTabButton>
              <ConsoleTabButton active={tab === "secrets"} onClick={() => setTab("secrets")}>
                <KeyIcon className="h-4 w-4" />
                Secrets &amp; Config
              </ConsoleTabButton>
              <ConsoleTabButton active={tab === "docs"} onClick={() => setTab("docs")}>
                <BookIcon className="h-4 w-4" />
                Dokumentasi
              </ConsoleTabButton>
            </div>

            {tab === "aktif" && (
              <>
                {/* FILTER TABS */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
                    Semua <span className="opacity-80">({counts.all})</span>
                  </FilterTab>
                  <FilterTab active={filter === "pending"} onClick={() => setFilter("pending")} dot="bg-highlight">
                    Pending <span className="opacity-70">({counts.pending})</span>
                  </FilterTab>
                  <FilterTab active={filter === "active"} onClick={() => setFilter("active")} dot="bg-success">
                    Aktif <span className="opacity-70">({counts.active})</span>
                  </FilterTab>
                  <FilterTab
                    active={filter === "suspended"}
                    onClick={() => setFilter("suspended")}
                    dot="bg-muted-foreground"
                  >
                    Suspended <span className="opacity-70">({counts.suspended})</span>
                  </FilterTab>
                  <span className="ml-auto text-muted-foreground">
                    Menampilkan {visible.length} dari {tenants.length} tenant
                  </span>
                </div>

                {/* ACTIVE TABLE */}
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
                  {tenantsQ.isLoading ? (
                    <TableLoading />
                  ) : tenantsQ.isError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <AlertIcon />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Gagal memuat tenant</p>
                        <p className="text-xs text-muted-foreground">Terjadi kendala saat mengambil data.</p>
                      </div>
                      <button
                        onClick={() => tenantsQ.refetch()}
                        className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Nama Tenant</th>
                            <th className="px-5 py-3 font-semibold">Vertical</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Kuota Token</th>
                            <th className="px-5 py-3 font-semibold">Aktif s/d</th>
                            <th className="px-5 py-3 text-right font-semibold">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {visible.map((t) => (
                            <TenantTableRow
                              key={t.id}
                              tenant={t}
                              quota={quotaByTenant[t.id]}
                              onActivate={() => openActivate(t)}
                              onSuspend={() => setSuspendTarget(t)}
                              onCredit={() => credit.mutate(t)}
                              onDelete={() => setDeleteTarget(t)}
                              creditPending={credit.isPending}
                            />
                          ))}
                        </tbody>
                      </table>

                      {visible.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <SearchIcon className="h-6 w-6" />
                          </span>
                          <p className="text-sm font-medium">
                            {tenants.length === 0 ? "Belum ada tenant" : "Tidak ada tenant pada filter ini"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {tenants.length === 0
                              ? 'Buat tenant pertama lewat tombol "Buat akun".'
                              : "Coba ubah filter status atau kata kunci pencarian."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Legend */}
                <p className="text-[11px] text-muted-foreground">
                  Baris dengan latar{" "}
                  <span className="rounded bg-highlight/15 px-1.5 py-0.5 text-[color:#b45309]">amber</span> = tenant{" "}
                  <b>Pending</b> menunggu aktivasi. <b>Aktifkan</b> set durasi + kuota lewat drawer kanan ·{" "}
                  <b>+ Kredit</b> tambah token AI · <b>Suspend</b> kunci akses tenant · <b>Hapus</b> pindahkan ke
                  Sampah (bisa dipulihkan).
                </p>
              </>
            )}

            {tab === "sampah" && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Tenant yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab Aktif,{" "}
                    <b>Hapus permanen</b> menghapus selamanya.
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    Menampilkan {visibleTrashed.length} dari {trashed.length} tenant
                  </span>
                </div>

                {/* TRASH TABLE */}
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
                  {trashedQ.isLoading ? (
                    <TableLoading />
                  ) : trashedQ.isError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <AlertIcon />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Gagal memuat sampah</p>
                        <p className="text-xs text-muted-foreground">Terjadi kendala saat mengambil data.</p>
                      </div>
                      <button
                        onClick={() => trashedQ.refetch()}
                        className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Nama Tenant</th>
                            <th className="px-5 py-3 font-semibold">Vertical</th>
                            <th className="px-5 py-3 font-semibold">Status terakhir</th>
                            <th className="px-5 py-3 font-semibold">Dihapus</th>
                            <th className="px-5 py-3 text-right font-semibold">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {visibleTrashed.map((t) => (
                            <TrashedTableRow
                              key={t.id}
                              tenant={t}
                              onRestore={() => setRestoreTarget(t)}
                              onPurge={() => {
                                setPurgeTarget(t);
                              }}
                            />
                          ))}
                        </tbody>
                      </table>

                      {visibleTrashed.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <TrashIcon className="h-6 w-6" />
                          </span>
                          <p className="text-sm font-medium">
                            {trashed.length === 0 ? "Sampah kosong" : "Tidak ada tenant pada pencarian ini"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {trashed.length === 0
                              ? "Tenant yang Anda hapus akan muncul di sini."
                              : "Coba ubah kata kunci pencarian."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}

            {tab === "secrets" && <SecretsPanel />}

            {tab === "docs" && <DocsPanel />}
          </div>
        </main>
      </div>

      {/* ===================== BACKDROP + DRAWER ===================== */}
      <AppDrawerRaw
        open={drawer.open}
        onClose={closeDrawer}
        title={drawer.mode === "create" ? "Buat akun tenant" : "Aktifkan tenant"}
        widthClassName="w-full max-w-[420px]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldIcon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">
                {drawer.mode === "create" ? "Buat akun tenant" : "Aktifkan tenant"}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {drawer.mode === "create" ? "Set vertical, durasi aktif, & kuota token" : drawer.name}
              </p>
            </div>
          </div>
          <button
            onClick={closeDrawer}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Nama */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Nama Tenant / Perusahaan
            </label>
            <input
              ref={nameRef}
              type="text"
              value={drawer.name}
              onChange={(e) => setDrawer((d) => ({ ...d, name: e.target.value }))}
              placeholder="mis. PT Sinar Abadi"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Email — only in create mode */}
          {drawer.mode === "create" && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
                Email Admin Tenant
              </label>
              <input
                type="email"
                value={drawer.email}
                onChange={(e) => setDrawer((d) => ({ ...d, email: e.target.value }))}
                placeholder="admin@perusahaan.com"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Undangan + tautan set-password dikirim ke email ini.
              </p>
            </div>
          )}

          {/* Vertical */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Vertical / Usage</label>
            <div className="relative">
              <select
                value={drawer.vertical}
                onChange={(e) => setDrawer((d) => ({ ...d, vertical: e.target.value }))}
                className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {VERTICALS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Menentukan modul &amp; entitlement yang aktif untuk tenant ini.
            </p>
          </div>

          {/* Durasi */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Durasi Aktif</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {DUR_CHIPS.map((m) => {
                const on = drawer.until === untilFromMonths(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDrawer((d) => ({ ...d, until: untilFromMonths(m) }))}
                    className={
                      on
                        ? "h-8 rounded-lg border-2 border-primary bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors"
                        : "h-8 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:border-primary/40"
                    }
                  >
                    {m} bln
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={drawer.until}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDrawer((d) => ({ ...d, until: e.target.value }))}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Mengisi kolom &ldquo;Aktif s/d&rdquo;. Setelah tanggal ini, akses tenant otomatis terkunci.
            </p>
          </div>

          {/* Kuota */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Kuota Token AI</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {QUOTA_CHIPS.map((q) => {
                const on = drawer.quota === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDrawer((d) => ({ ...d, quota: q }))}
                    className={
                      on
                        ? "h-8 rounded-lg border-2 border-primary bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors"
                        : "h-8 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:border-primary/40"
                    }
                  >
                    {shortQuota(q)}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={drawer.quota ? fmtInt(drawer.quota) : ""}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
                setDrawer((d) => ({ ...d, quota: n }));
              }}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Batas pemakaian token AI per periode (grain = tenant). Bisa ditambah lewat &ldquo;+ Kredit&rdquo;.
            </p>
          </div>

          {/* Catatan */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Catatan internal <span className="font-normal text-muted-foreground">(opsional)</span>
            </label>
            <textarea
              rows={2}
              value={drawer.note}
              onChange={(e) => setDrawer((d) => ({ ...d, note: e.target.value }))}
              placeholder="Catatan superadmin — tidak terlihat oleh tenant…"
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Ringkasan entitlement */}
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-[11px]">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground/80">
              <CheckBadgeIcon className="h-3.5 w-3.5 text-tertiary" />
              Ringkasan entitlement
            </p>
            <SummaryRow label="Vertical" value={drawer.vertical || "—"} />
            <SummaryRow label="Aktif s/d" value={fmtDateID(drawer.until ? new Date(drawer.until).toISOString() : null)} />
            <SummaryRow label="Kuota token" value={drawer.quota ? fmtInt(drawer.quota) : "—"} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={closeDrawer}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={submitDrawer}
            disabled={submitting}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting
              ? "Memproses…"
              : drawer.mode === "create"
                ? "Buat & aktifkan"
                : "Aktifkan tenant"}
          </button>
        </div>
      </AppDrawerRaw>

      {/* ===================== SUSPEND CONFIRM ===================== */}
      <ConfirmDialog
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        icon={<AlertIcon className="h-5 w-5" />}
        tone="destructive"
        title="Suspend tenant?"
        body={
          <>
            Akses <span className="font-medium text-foreground">{suspendTarget?.name}</span> akan
            dikunci. Data tetap aman dan bisa diaktifkan kembali.
          </>
        }
        confirmLabel="Ya, suspend"
        confirmPending={suspend.isPending}
        onConfirm={() => suspendTarget && suspend.mutate(suspendTarget)}
      />

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<TrashIcon className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b>. Anda masih bisa memulihkannya nanti.
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
        icon={<RestoreIcon className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan tenant?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.name}</span> akan
            dikembalikan ke tab <b>Aktif</b> dengan status terakhirnya.
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
        confirmPhrase={purgeTarget?.slug ?? "HAPUS"}
        caseInsensitive={false}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.name}</span> akan dihapus
            selamanya dari platform.
          </>
        }
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function KpiCard({
  label,
  value,
  hint,
  hintClass,
  valueClass,
  icon,
  iconClass,
  iconStyle,
}: {
  label: string;
  value: number | null;
  hint: string;
  hintClass?: string;
  valueClass?: string;
  icon: React.ReactNode;
  iconClass?: string;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {value == null ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{fmtInt(value)}</p>
          )}
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass ?? ""}`}
          style={iconStyle}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-[11px] ${hintClass ?? "text-muted-foreground"}`}>{hint}</p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          : "rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground transition-colors hover:border-primary/40"
      }
    >
      {dot && !active && <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${dot}`} />}
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/[0.12] px-2 py-1 text-[11px] font-semibold text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Aktif
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-highlight/15 px-2 py-1 text-[11px] font-semibold"
        style={{ color: "#b45309" }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-highlight" />
        Pending
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Kadaluarsa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      Suspended
    </span>
  );
}

function VerticalBadge({ vertical }: { vertical: string | null }) {
  if (!vertical) return <span className="text-[11px] text-muted-foreground">—</span>;
  const isHr = /hr/i.test(vertical);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isHr ? "bg-tertiary/[0.12] text-tertiary" : "bg-primary/10 text-primary"
      }`}
    >
      {vertical}
    </span>
  );
}

function TenantTableRow({
  tenant: t,
  quota,
  onActivate,
  onSuspend,
  onCredit,
  onDelete,
  creditPending,
}: {
  tenant: TenantRow;
  quota: UsageCounterRow | null | undefined;
  onActivate: () => void;
  onSuspend: () => void;
  onCredit: () => void;
  onDelete: () => void;
  creditPending: boolean;
}) {
  const pending = t.status === "pending";
  const suspended = t.status === "suspended";
  const active = t.status === "active";

  const limit = quota?.quotaLimit ?? null;
  const used = quota?.used ?? 0;
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const untilPast =
    t.activeUntil && new Date(t.activeUntil).getTime() < Date.now() ? true : false;

  return (
    <tr
      className={
        pending
          ? "row-pending transition-colors"
          : suspended
            ? "text-muted-foreground transition-colors hover:bg-muted/30"
            : "transition-colors hover:bg-muted/40"
      }
    >
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
              pending
                ? "bg-highlight/20 text-highlight-foreground"
                : suspended
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/[0.12] text-primary"
            }`}
          >
            {initialsOf(t.name)}
          </span>
          <div className="min-w-0">
            <p className={`truncate font-semibold ${suspended ? "text-foreground/55" : ""}`}>{t.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <VerticalBadge vertical={t.verticalKey} />
      </td>
      <td className="px-5 py-3">
        <StatusBadge status={t.status} />
      </td>
      <td className="px-5 py-3">
        {pending ? (
          <span className="text-[13px] italic text-muted-foreground">belum diset</span>
        ) : (
          <>
            <p className="text-[13px] font-medium">
              {fmtInt(used)} <span className="font-normal text-muted-foreground">/ {shortQuota(limit)}</span>
            </p>
            {limit != null && (
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            )}
          </>
        )}
      </td>
      <td className="px-5 py-3">
        {pending ? (
          <span className="text-[13px] italic text-muted-foreground">belum diset</span>
        ) : (
          <span className={`text-[13px] ${untilPast ? "text-destructive" : ""}`}>
            {fmtDateID(t.activeUntil)}
            {untilPast && <span className="text-[11px]"> (lewat)</span>}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          {active ? (
            <>
              <button
                onClick={onCredit}
                disabled={creditPending}
                className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-tertiary transition-colors hover:bg-tertiary/5 disabled:opacity-60"
              >
                + Kredit
              </button>
              <button
                onClick={onSuspend}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-foreground/70 transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                Suspend
              </button>
            </>
          ) : (
            <button
              onClick={onActivate}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
            >
              Aktifkan
            </button>
          )}
          <button
            onClick={onDelete}
            title="Hapus (pindah ke Sampah)"
            aria-label="Hapus tenant"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground/60 transition-colors hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ConsoleTabButton({
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

function TrashedTableRow({
  tenant: t,
  onRestore,
  onPurge,
}: {
  tenant: TenantRow;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="text-muted-foreground transition-colors hover:bg-muted/30">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">
            {initialsOf(t.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground/60">{t.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <VerticalBadge vertical={t.verticalKey} />
      </td>
      <td className="px-5 py-3">
        <StatusBadge status={t.status} />
      </td>
      <td className="px-5 py-3">
        <span className="text-[13px]">{fmtDateTimeID(t.deletedAt)}</span>
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={onRestore}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-tertiary transition-colors hover:bg-tertiary/5"
          >
            <RestoreIcon className="h-4 w-4" />
            Pulihkan
          </button>
          <button
            onClick={onPurge}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <TrashIcon className="h-4 w-4" />
            Hapus permanen
          </button>
        </div>
      </td>
    </tr>
  );
}

// ───────────────────────── Secrets & Config panel ─────────────────────────

/**
 * Platform secrets/config editor. Reads the masked status catalog and lets the
 * operator set/clear each key. Full secret values are NEVER shown — the API only
 * ever returns masked `preview`s; the inputs are write-only (POST { key, value }).
 * Grouped by `category` for scanability.
 */
function SecretsPanel() {
  const secretsQ = useQuery({
    queryKey: ["superadmin", "secrets"],
    queryFn: async () => readJson<SecretsResponse>(await fetch("/api/superadmin/secrets")),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, SecretStatus[]>();
    for (const s of secretsQ.data?.secrets ?? []) {
      const arr = map.get(s.category) ?? [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return Array.from(map.entries());
  }, [secretsQ.data]);

  if (secretsQ.isLoading) {
    return (
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <TableLoading />
      </section>
    );
  }

  if (secretsQ.isError) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-12 text-center shadow-soft">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertIcon />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Gagal memuat secrets</p>
          <p className="text-xs text-muted-foreground">Terjadi kendala saat mengambil konfigurasi.</p>
        </div>
        <button
          onClick={() => secretsQ.refetch()}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  const hasMasterKey = secretsQ.data?.hasMasterKey ?? false;

  return (
    <div className="space-y-5">
      {!hasMasterKey && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertIcon className="h-5 w-5" />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-destructive">SECRETS_KEY belum di-set di env</p>
            <p className="text-xs text-muted-foreground">
              Secret tak bisa disimpan terenkripsi. Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">SECRETS_KEY</code> di
              environment agar console bisa menyimpan &amp; mengenkripsi secret.
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Nilai secret <b>tidak pernah</b> ditampilkan penuh — hanya preview tersamar. Kosongkan lalu
        Simpan untuk menghapus override DB (kembali ke nilai <b>env</b>).
      </p>

      {grouped.map(([category, rows]) => (
        <section key={category} className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <div className="border-b border-border bg-muted/50 px-5 py-2.5">
            <h3 className="text-sm font-semibold">{category}</h3>
          </div>
          <div className="divide-y divide-border">
            {rows.map((s) => (
              <SecretRow key={s.key} secret={s} disabled={!hasMasterKey} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SecretRow({ secret: s, disabled }: { secret: SecretStatus; disabled: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      readJson<{ key: string; saved: boolean }>(
        await fetch("/api/superadmin/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: s.key, value }),
        }),
      ),
    onSuccess: () => {
      toast.success(value.trim() ? `${s.label} disimpan` : `${s.label} dikosongkan (pakai env)`);
      setValue("");
      qc.invalidateQueries({ queryKey: ["superadmin", "secrets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan secret"),
  });

  const source: "DB" | "env" | "kosong" = s.setInDb ? "DB" : s.hasEnv ? "env" : "kosong";

  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{s.label}</p>
          <SourceBadge source={source} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{s.key}</code>
          <span className="tabular-nums">{s.preview || "— belum diset —"}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={s.setInDb ? "Ganti / kosongkan…" : "Set nilai…"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled && !save.isPending) save.mutate();
          }}
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60 md:w-56"
        />
        <button
          onClick={() => save.mutate()}
          disabled={disabled || save.isPending}
          className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? "…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "DB" | "env" | "kosong" }) {
  if (source === "DB") {
    return (
      <span className="rounded-full bg-success/[0.12] px-2 py-0.5 text-[10px] font-semibold text-success">
        DB
      </span>
    );
  }
  if (source === "env") {
    return (
      <span className="rounded-full bg-tertiary/[0.12] px-2 py-0.5 text-[10px] font-semibold text-tertiary">
        env
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      kosong
    </span>
  );
}

// ───────────────────────── Dokumentasi panel ─────────────────────────

// Tailwind arbitrary-variant styling for rendered markdown (no typography plugin).
const MD_CLASS =
  "text-[13px] leading-relaxed text-foreground/90 " +
  "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-bold first:[&_h1]:mt-0 " +
  "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-base [&_h2]:font-bold " +
  "[&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] " +
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:text-[11px] [&_pre]:leading-snug " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px] " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_hr]:my-4 [&_hr]:border-border " +
  "[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[12px] " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top";

/** Operator reference — subsystem summary + the FULL embedded docs (HLA / Features). */
function DocsPanel() {
  const [doc, setDoc] = useState<"HLA" | "FEATURES">("HLA");
  const docQ = useQuery({
    queryKey: ["superadmin", "docs", doc],
    queryFn: async () =>
      readJson<{ title: string; content: string }>(await fetch(`/api/superadmin/docs?doc=${doc}`)),
    retry: false,
  });
  const subsystems: { title: string; body: string }[] = [
    {
      title: "Multi-tenant + RLS",
      body: "Isolasi data per-tenant lewat withTenant/TenantContext + Postgres RLS (belt-and-suspenders). Grain = tenant/akun, bukan per-user.",
    },
    {
      title: "Auth & RBAC",
      body: "next-auth + role guards (lib/rbac). Superadmin = permission platform.manage; konsol ini di luar shell white-label per-tenant.",
    },
    {
      title: "AI metered + BYOK",
      body: "Setiap call live lewat meteredGenerateText: kill-switch, cek kredit tenant, satu model aktif per tenant (BYOK atau env fallback), log token+biaya ke ai_usage. Multi-provider (deepseek/anthropic/openai/google).",
    },
    {
      title: "Kuota / subscription + packs + Midtrans",
      body: "Batas token AI per tenant (ai_tokens_max), paket langganan + top-up pack, pembayaran via Midtrans (+ Stripe).",
    },
    {
      title: "WhatsApp gateway + extension",
      body: "Transport gateway-agnostic (WAHA server-gateway + Chrome MV3 extension). Brain (orchestrator/humanizer/stage-machine) tetap server-side; transport hanya poll outbox + push inbound.",
    },
    {
      title: "Discovery / enrichment",
      body: "RPA per-channel (LinkedIn/Maps/IG/marketplace) mengisi graph Company→People; AI mengklasifikasi taksonomi + memfilter product-fit + merekomendasikan.",
    },
    {
      title: "Secrets console",
      body: "Konfigurasi & secret platform (DB-first terenkripsi AES-256-GCM, fallback env) dikelola di tab Secrets & Config.",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-base font-bold">Arsitektur Platform</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Modular monolith (Next.js App Router + Postgres multi-tenant). Referensi operator
              ringkas — dokumentasi lengkap di{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">docs/HLA.md</code>{" "}
              &amp;{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">docs/FEATURES.md</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <div className="border-b border-border bg-muted/50 px-5 py-2.5">
          <h3 className="text-sm font-semibold">Subsistem utama</h3>
        </div>
        <ul className="divide-y divide-border">
          {subsystems.map((sub) => (
            <li key={sub.title} className="px-5 py-3.5">
              <div className="flex items-start gap-2.5">
                <CheckBadgeIcon className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
                <div>
                  <p className="text-sm font-semibold">{sub.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{sub.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Full embedded docs, rendered inline (react-markdown + GFM). */}
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-5 py-2.5">
          <h3 className="text-sm font-semibold">Dokumen lengkap</h3>
          <div className="ml-auto flex gap-1">
            {(["HLA", "FEATURES"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setDoc(k)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  doc === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {k === "HLA" ? "Arsitektur (HLA)" : "Katalog Fitur"}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">
          {docQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat dokumen…</p>
          ) : docQ.isError ? (
            <p className="text-sm text-destructive">Gagal memuat dokumen.</p>
          ) : (
            <div className={MD_CLASS}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docQ.data?.content ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── inline icons (match mockup strokes) ─────────────────────────
type IconProps = { className?: string };

function KeyIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m17 5 3 3" />
      <path d="m14 8 2.5 2.5" />
    </svg>
  );
}
function BookIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function ShieldIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function GridIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function BackIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}
function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function RefreshIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 9-9" />
      <path d="M3 4v5h5" />
    </svg>
  );
}
function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
function ClockIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function BoltIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m13 2-3 7h6l-3 7" />
      <path d="M5 13h2M17 13h2" />
      <circle cx="12" cy="20" r="1" />
    </svg>
  );
}
function MsgIcon({ className = "h-[18px] w-[18px]" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
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
function ChevronIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function CheckBadgeIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function AlertIcon({ className = "h-6 w-6" }: IconProps) {
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
