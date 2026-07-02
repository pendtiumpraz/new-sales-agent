"use client";

// Settings → API Keys — per-account (BYOA) keys so a tenant's external agent can
// call the {ok,data} data-level API with a scoped, revocable Bearer key.
// Wired to the M-apikey backend (no mock):
//   - GET    /api/settings/api-keys      → list (public shape — no hash/plaintext)
//   - POST   /api/settings/api-keys      → create { label, scope } → returns key ONCE
//   - DELETE /api/settings/api-keys/[id] → revoke (sets revoked_at)
//
// Managing keys is an ADMIN action done with a SESSION (tenant.settings.manage);
// the KEYS themselves are what agents use. Coral Sunset, shared shell, TanStack
// Query + toast + invalidation. The plaintext is shown ONCE in a copy-box.

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { can, mapDemoRole, type Role } from "@/lib/rbac/permissions";

// ── envelope + row shapes ────────────────────────────────────────────────────
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

type Scope = "read" | "write";

interface KeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  scope: Scope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface CreatedKey extends KeyRow {
  key: string; // plaintext — ONCE
}

const SCOPES: { key: Scope; label: string; hint: string }[] = [
  { key: "read", label: "Read", hint: "Hanya baca data (GET) — mis. sinkronisasi kontak keluar." },
  { key: "write", label: "Write", hint: "Baca + tulis data (mis. impor kontak). Tidak termasuk aksi admin." },
];

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

export default function ApiKeysSettingsPage() {
  const { data: session } = useSession();
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
  const refreshAll = () => qc.invalidateQueries({ queryKey: ["settings", "api-keys"] });

  const listQ = useQuery({
    queryKey: ["settings", "api-keys", "list"],
    queryFn: async () => readJson<KeyRow[]>(await fetch("/api/settings/api-keys")),
    retry: false,
  });
  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);
  const forbidden = listQ.error instanceof Error && listQ.error.message === "forbidden";

  // ── create drawer ────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<Scope>("read");

  // ── reveal-once dialog ────────────────────────────────────────────────────
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // ── revoke confirm ────────────────────────────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState<KeyRow | null>(null);

  function openCreate() {
    setLabel("");
    setScope("read");
    setDrawerOpen(true);
  }

  const create = useMutation({
    mutationFn: async () =>
      readJson<CreatedKey>(
        await fetch("/api/settings/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), scope }),
        }),
      ),
    onSuccess: (res) => {
      setDrawerOpen(false);
      setCreated(res); // reveal ONCE
      setCopied(false);
      refreshAll();
      toast.success(`API key "${res.label}" dibuat`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat API key"),
  });

  const revoke = useMutation({
    mutationFn: async (r: KeyRow) =>
      readJson<{ id: string; revoked: boolean }>(
        await fetch(`/api/settings/api-keys/${r.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, r) => {
      toast.success(`"${r.label}" dicabut`);
      refreshAll();
      setRevokeTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal mencabut API key");
      setRevokeTarget(null);
    },
  });

  function submitCreate() {
    if (!label.trim()) {
      toast.error("Label wajib diisi");
      return;
    }
    create.mutate();
  }

  function copyKey() {
    if (!created) return;
    navigator.clipboard.writeText(created.key);
    setCopied(true);
    toast.success("API key disalin");
  }

  const activeCount = rows.filter((r) => !r.revokedAt).length;

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Kunci akses per-akun (BYOA) agar agen/otomasi eksternal memanggil API data ({ok,data}) dengan Bearer token yang ber-scope & bisa dicabut. Kunci hanya untuk aksi tingkat data — bukan aksi admin."
      >
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Buat API Key
          </Button>
        ) : (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Hanya Owner/Admin
          </span>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
            <KeyRound className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Kunci aktif</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold tabular-nums text-muted-foreground">
              {listQ.isLoading ? "…" : activeCount}
            </span>
            <span className="ml-auto text-muted-foreground">
              Kirim sebagai <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer msk_…</code>
            </span>
          </div>

          {listQ.isLoading ? (
            <ListLoading />
          ) : listQ.isError ? (
            <ErrorState
              className="border-0"
              title={forbidden ? "Tidak punya akses" : "Gagal memuat API Keys"}
              description={
                forbidden
                  ? "Hanya Owner/Admin tenant yang bisa mengelola API key."
                  : "Tidak bisa mengambil daftar kunci. Pastikan kamu login & database tersedia."
              }
              onRetry={() => listQ.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={KeyRound}
              title="Belum ada API key"
              description="Buat kunci untuk agen/otomasi eksternal. Kunci bisa dibatasi ke Read (baca) atau Write (baca+tulis) dan dicabut kapan saja."
              action={
                canManage ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Buat API Key
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <KeyListItem
                  key={r.id}
                  row={r}
                  canManage={canManage}
                  onRevoke={() => setRevokeTarget(r)}
                />
              ))}
            </ul>
          )}
        </section>

        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Grain: <b>API key = per-tenant</b>. Kunci hanya menjangkau endpoint tingkat data
          ({"{ok,data}"}) — <b>bukan</b> aksi admin/superadmin (kelola tim, billing, kill-switch),
          yang tetap butuh sesi login. <b>Read</b> hanya GET; <b>Write</b> boleh baca + tulis.
          Kunci disimpan sebagai hash (sha256) — plaintext hanya ditampilkan sekali saat dibuat.
        </p>
      </div>

      {/* ============ CREATE DRAWER ============ */}
      <Sheet
        open={drawerOpen}
        onOpenChange={(o) => !create.isPending && setDrawerOpen(o)}
      >
        <SheetContent side="right" className="flex w-[440px] max-w-full flex-col p-0">
          <SheetHeader className="flex-row items-center gap-3 border-b border-border p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm font-bold">API Key baru</SheetTitle>
              <p className="truncate text-[11px] text-muted-foreground">
                Beri label & pilih scope
              </p>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Label</label>
              <Input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='mis. "Zapier — sinkron kontak"'
                className="h-10"
                maxLength={80}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Nama untuk mengenali kunci ini nanti (di log & daftar).
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Scope</label>
              <div className="space-y-2">
                {SCOPES.map((s) => {
                  const on = scope === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setScope(s.key)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                        on
                          ? "border-primary bg-primary/[0.06]"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                          {s.key === "write" ? (
                            <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5 text-tertiary" />
                          )}
                          {s.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{s.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <SheetFooter className="flex-row gap-2.5 border-t border-border p-5">
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => setDrawerOpen(false)}
              className="h-9 flex-1 rounded-lg border border-border bg-card text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={submitCreate}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Membuat…
                </>
              ) : (
                "Buat kunci"
              )}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ============ REVEAL-ONCE DIALOG ============ */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" /> API key dibuat
            </DialogTitle>
            <DialogDescription>
              Salin kunci sekarang — <b className="text-foreground">disimpan sekali, tidak bisa
              dilihat lagi</b>. Setelah dialog ditutup kunci tidak dapat ditampilkan ulang.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2 text-[12px] text-foreground/80">
            Simpan di tempat aman (secret manager / .env). Jangan bagikan atau commit ke repo.
          </div>

          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[12px] text-foreground">
              {created?.key}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={copyKey}
              title="Salin"
            >
              {copied ? <Check className="h-4 w-4 text-tertiary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" onClick={copyKey} variant="outline" size="sm">
              <Copy className="h-3.5 w-3.5" /> Salin
            </Button>
            <Button type="button" onClick={() => setCreated(null)} size="sm">
              Selesai
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ REVOKE CONFIRM ============ */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        icon={<Ban className="h-5 w-5" />}
        tone="destructive"
        title="Cabut API key?"
        body={
          <>
            <span className="font-medium text-foreground">{revokeTarget?.label}</span> akan langsung
            berhenti berfungsi. Otomasi/agen yang memakainya akan menerima 401. Tindakan ini tidak
            bisa dibatalkan.
          </>
        }
        confirmLabel="Ya, cabut"
        confirmPending={revoke.isPending}
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget)}
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function ScopeBadge({ scope }: { scope: Scope }) {
  const write = scope === "write";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={
        write
          ? { background: "hsl(38 92% 50% / .15)", color: "#d97706" }
          : { background: "hsl(173 80% 40% / .14)", color: "#0d9488" }
      }
    >
      {write ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {write ? "Write" : "Read"}
    </span>
  );
}

function KeyListItem({
  row,
  canManage,
  onRevoke,
}: {
  row: KeyRow;
  canManage: boolean;
  onRevoke: () => void;
}) {
  const revoked = !!row.revokedAt;
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3.5", revoked && "opacity-60")}>
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          revoked ? "bg-muted text-muted-foreground" : "bg-primary/[0.1] text-primary",
        )}
      >
        <KeyRound className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
          <ScopeBadge scope={row.scope} />
          {revoked && (
            <span className="rounded-full bg-destructive/[0.12] px-2 py-0.5 text-[10px] font-semibold text-destructive">
              Dicabut
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground/70">{row.keyPrefix}••••••••</span>
          <span>Dibuat {fmtRelID(row.createdAt)}</span>
          <span>Terakhir dipakai {fmtRelID(row.lastUsedAt)}</span>
        </div>
      </div>
      {canManage && !revoked && (
        <button
          type="button"
          onClick={onRevoke}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Ban className="h-3 w-3" /> Cabut
        </button>
      )}
    </li>
  );
}

function ListLoading() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-7 w-16" />
        </li>
      ))}
    </ul>
  );
}
