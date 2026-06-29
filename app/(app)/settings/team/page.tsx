"use client";

// Tim & Akses — Module 8 FRONTEND (Settings cluster · Sainskerta Loop Phase 04).
// Wired to the NEW tenant members API (no mock data):
//   - GET    /api/tenant/members           → { members, invites } (memberships + pending invites)
//   - POST   /api/tenant/members           → invite (email + role) [tenant.members.manage]
//   - PATCH  /api/tenant/members/[id]       → role change AND/OR seat status (active|disabled)
//   - DELETE /api/tenant/members/[id]       → remove a seat
//   - DELETE /api/tenant/invites/[id]       → revoke a pending invite
// Faithful to the established design system (Coral Sunset · the (app) shell): a
// stat strip, a table-as-card with a toolbar (search + role filter), a right
// slide-over drawer to invite, and custom confirm modals — every band has
// loading + empty + error states. Renders inside the shared Settings sub-nav
// (app/(app)/settings/layout.tsx). RBAC: only tenant.members.manage can mutate;
// everyone may view. You cannot disable / demote / remove your own seat.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { can, type Role } from "@/lib/rbac/permissions";
import { cn } from "@/lib/utils";

// ── row shapes (from /api/tenant/members — older tenant envelope: bare object) ──

interface Member {
  id: string;
  userId: string;
  role: string; // superadmin | tenant_owner | tenant_admin | member
  status: string; // active | disabled
  name: string;
  email: string | null;
  avatarColor: string;
}
interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
}
interface TeamPayload {
  members: Member[];
  invites: Invite[];
}

// ── role display metadata ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  tenant_owner: "Owner",
  tenant_admin: "Admin",
  member: "Member",
};

const ROLE_BADGE: Record<string, { style: React.CSSProperties }> = {
  superadmin: { style: { background: "hsl(14 90% 56% / .14)", color: "#c2410c" } },
  tenant_owner: { style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  tenant_admin: { style: { background: "hsl(38 92% 50% / .16)", color: "#b45309" } },
  member: { style: { background: "hsl(217 91% 60% / .12)", color: "#2563eb" } },
};

// superadmin is a platform role — never assignable from the tenant UI.
const ASSIGNABLE: Role[] = ["tenant_owner", "tenant_admin", "member"];

type RoleFilter = "all" | "tenant_owner" | "tenant_admin" | "member";

// ── helpers ──────────────────────────────────────────────────────────────────

/** The members API uses the older tenant shape (bare { members, invites }), not
 *  the { ok, data } CRM envelope. A 403 from the guard surfaces as "forbidden". */
async function fetchTeam(): Promise<TeamPayload> {
  const r = await fetch("/api/tenant/members");
  if (r.status === 403) throw new Error("forbidden");
  const j = (await r.json().catch(() => null)) as Partial<TeamPayload> | null;
  if (!r.ok || !j) throw new Error("Gagal memuat tim");
  return { members: j.members ?? [], invites: j.invites ?? [] };
}

async function mutateJson(r: Response): Promise<void> {
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    if (r.status === 403) throw new Error("Tidak punya izin mengelola anggota");
    throw new Error(j?.error ?? "Permintaan gagal");
  }
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "member") as Role;
  const canManage = can(role, "tenant.members.manage");
  const myEmail = session?.user?.email?.toLowerCase() ?? null;
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["team"] });

  const teamQ = useQuery({ queryKey: ["team"], queryFn: fetchTeam, retry: false });

  const members = useMemo(() => teamQ.data?.members ?? [], [teamQ.data]);
  const invites = useMemo(() => teamQ.data?.invites ?? [], [teamQ.data]);

  const forbidden = teamQ.error instanceof Error && teamQ.error.message === "forbidden";

  // The caller's own membership — never let them lock themselves out.
  const isSelf = (m: Member) => !!myEmail && m.email?.toLowerCase() === myEmail;

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let active = 0;
    let disabled = 0;
    let admins = 0;
    for (const m of members) {
      if (m.status === "disabled") disabled++;
      else active++;
      if (m.role === "tenant_owner" || m.role === "tenant_admin" || m.role === "superadmin") admins++;
    }
    return { total: members.length, active, disabled, admins, pending: invites.length };
  }, [members, invites]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [roleF, setRoleF] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const okRole = roleF === "all" || m.role === roleF;
      const hay = `${m.name} ${m.email ?? ""}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okRole && okSearch;
    });
  }, [members, roleF, search]);

  // ── invite drawer ────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => emailRef.current?.focus(), 320);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [drawerOpen]);

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);

  // ── mutations ────────────────────────────────────────────────────────────────
  const invite = useMutation({
    mutationFn: async () => {
      await mutateJson(
        await fetch("/api/tenant/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), role: inviteRole }),
        }),
      );
    },
    onSuccess: () => {
      toast.success(`Undangan dikirim ke ${email.trim()}`);
      setEmail("");
      setDrawerOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengundang"),
  });

  const changeRole = useMutation({
    mutationFn: async (vars: { id: string; role: Role }) => {
      await mutateJson(
        await fetch(`/api/tenant/members/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: vars.role }),
        }),
      );
    },
    onSuccess: (_d, vars) => {
      toast.success(`Peran diubah ke ${ROLE_LABELS[vars.role]}`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui peran"),
  });

  // Toggle a seat without removing it (membership.status). A disabled member keeps
  // their data + role but loses access until re-activated.
  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: "active" | "disabled" }) => {
      await mutateJson(
        await fetch(`/api/tenant/members/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: vars.status }),
        }),
      );
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "disabled" ? "Seat dinonaktifkan" : "Seat diaktifkan");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah seat"),
  });

  const removeMember = useMutation({
    mutationFn: async (m: Member) => {
      await mutateJson(await fetch(`/api/tenant/members/${m.id}`, { method: "DELETE" }));
    },
    onSuccess: (_d, m) => {
      toast.success(`${m.name} dikeluarkan dari tim`);
      setRemoveTarget(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus anggota");
      setRemoveTarget(null);
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async (i: Invite) => {
      await mutateJson(await fetch(`/api/tenant/invites/${i.id}`, { method: "DELETE" }));
    },
    onSuccess: (_d, i) => {
      toast.success(`Undangan ${i.email} dibatalkan`);
      setRevokeTarget(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal membatalkan undangan");
      setRevokeTarget(null);
    },
  });

  function submitInvite() {
    const e = email.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) {
      toast.error("Masukkan email yang valid");
      emailRef.current?.focus();
      return;
    }
    invite.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Tim & Akses"
        description="Kelola anggota workspace, peran (RBAC), seat, dan undangan. Anggota muncul setelah menerima undangan."
      >
        {canManage && (
          <Button size="sm" onClick={() => setDrawerOpen(true)}>
            <UserPlus className="h-4 w-4" /> Undang anggota
          </Button>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total anggota" value={teamQ.isLoading ? null : stats.total} hint="di workspace ini" />
          <StatCard label="Aktif" value={teamQ.isLoading ? null : stats.active} hint="punya akses" valueClass="text-success" />
          <StatCard
            label="Nonaktif"
            value={teamQ.isLoading ? null : stats.disabled}
            hint="seat ditangguhkan"
            valueClass={stats.disabled > 0 ? "text-warning" : undefined}
          />
          <StatCard label="Undangan tertunda" value={teamQ.isLoading ? null : stats.pending} hint="belum diterima" />
        </section>

        {/* ============ read-only notice ============ */}
        {!canManage && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="text-[13px] leading-relaxed">
              <b className="text-foreground">Hanya bisa melihat.</b>{" "}
              <span className="text-muted-foreground">
                Mengundang, mengubah peran, atau menonaktifkan seat butuh peran Owner / Admin.
              </span>
            </div>
          </div>
        )}

        {/* ============ MEMBERS TABLE ============ */}
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          {/* TOOLBAR: role segmented control + search */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {(
                [
                  { v: "all", label: "Semua" },
                  { v: "tenant_owner", label: "Owner" },
                  { v: "tenant_admin", label: "Admin" },
                  { v: "member", label: "Member" },
                ] as const
              ).map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setRoleF(r.v)}
                  className={cn(
                    "h-7 rounded-md px-3.5 text-xs transition-colors",
                    roleF === r.v
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="relative ml-auto w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter nama / email…"
                className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <span className="text-[11px] text-muted-foreground">
              <b className="text-foreground">{visible.length}</b> anggota
            </span>
          </div>

          {teamQ.isLoading ? (
            <TableLoading />
          ) : teamQ.isError ? (
            <ErrorState
              className="border-0"
              title={forbidden ? "Tidak punya akses" : "Gagal memuat tim"}
              description={
                forbidden
                  ? "Akun kamu tidak punya izin melihat tim workspace ini. Hubungi admin."
                  : "Tidak bisa mengambil daftar anggota. Pastikan kamu login & database tersedia."
              }
              onRetry={() => teamQ.refetch()}
            />
          ) : members.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Users}
              title="Belum ada anggota"
              description="Undang rekan tim lewat email — mereka muncul di sini setelah menerima undangan."
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setDrawerOpen(true)}>
                    <UserPlus className="h-4 w-4" /> Undang anggota
                  </Button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Search}
              title="Tidak ada anggota yang cocok"
              description="Coba ubah filter peran atau kata kunci pencarian."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Anggota</th>
                    <th className="px-4 py-3 font-semibold">Peran</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      self={isSelf(m)}
                      canManage={canManage}
                      onChangeRole={(r) => changeRole.mutate({ id: m.id, role: r })}
                      onToggleStatus={() =>
                        setStatus.mutate({
                          id: m.id,
                          status: m.status === "disabled" ? "active" : "disabled",
                        })
                      }
                      onRemove={() => setRemoveTarget(m)}
                      roleBusy={changeRole.isPending && changeRole.variables?.id === m.id}
                      statusBusy={setStatus.isPending && setStatus.variables?.id === m.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ============ PENDING INVITES ============ */}
        {!teamQ.isError && (teamQ.isLoading || invites.length > 0) && (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Undangan tertunda</h2>
              {!teamQ.isLoading && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {invites.length}
                </span>
              )}
            </div>
            {teamQ.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{i.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Diundang sebagai {ROLE_LABELS[i.role] ?? i.role}
                      </p>
                    </div>
                    <RoleBadge role={i.role} />
                    {canManage && (
                      <div className="ml-auto inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              ?.writeText(`${window.location.origin}/invite/${i.token}`)
                              .then(() => toast.success("Link undangan disalin"))
                              .catch(() => toast.error("Gagal menyalin link"));
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
                        >
                          Salin link
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(i)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          Batalkan
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          Peran:{" "}
          <RoleBadge role="tenant_owner" inline /> kelola semua + billing ·{" "}
          <RoleBadge role="tenant_admin" inline /> kelola tim & integrasi (tanpa billing) ·{" "}
          <RoleBadge role="member" inline /> kerjakan pekerjaan. Menonaktifkan seat menahan akses
          tanpa menghapus data; menghapus mengeluarkan anggota dari workspace.
        </p>
      </div>

      {/* ===================== INVITE DRAWER ===================== */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-full flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <UserPlus className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Undang anggota</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Kirim undangan via email + set peran
              </p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">
              Email anggota
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitInvite()}
              placeholder="nama@perusahaan.co.id"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Undangan + tautan bergabung dikirim ke email ini (berlaku 7 hari).
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">Peran</label>
            <div className="space-y-2">
              {ASSIGNABLE.map((r) => {
                const on = inviteRole === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      on ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/40",
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
                      <span className="block text-[13px] font-medium text-foreground">
                        {ROLE_LABELS[r]}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{ROLE_DESC[r]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={() => setDrawerOpen(false)}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={submitInvite}
            disabled={invite.isPending}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {invite.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Mengirim…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" /> Kirim undangan
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ===================== REMOVE MEMBER CONFIRM ===================== */}
      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        title="Keluarkan dari tim?"
        body={
          <>
            <span className="font-medium text-foreground">{removeTarget?.name}</span> akan kehilangan
            akses ke workspace ini. Tindakan ini <b>tidak bisa dibatalkan</b> — undang ulang untuk
            mengembalikannya.
          </>
        }
        confirmLabel="Ya, keluarkan"
        confirmPending={removeMember.isPending}
        onConfirm={() => removeTarget && removeMember.mutate(removeTarget)}
      />

      {/* ===================== REVOKE INVITE CONFIRM ===================== */}
      <ConfirmModal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        icon={<X className="h-5 w-5" />}
        title="Batalkan undangan?"
        body={
          <>
            Tautan undangan untuk{" "}
            <span className="font-medium text-foreground">{revokeTarget?.email}</span> akan hangus.
            Kamu bisa mengundang ulang kapan saja.
          </>
        }
        confirmLabel="Ya, batalkan"
        confirmPending={revokeInvite.isPending}
        onConfirm={() => revokeTarget && revokeInvite.mutate(revokeTarget)}
      />
    </div>
  );
}

// ── role descriptions (for the invite drawer) ────────────────────────────────
const ROLE_DESC: Record<string, string> = {
  tenant_owner: "Kelola semua + billing & kuota",
  tenant_admin: "Kelola tim, integrasi, AI (tanpa billing)",
  member: "Kerjakan pekerjaan — inbox, kontak, pipeline",
};

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

function RoleBadge({ role, inline }: { role: string; inline?: boolean }) {
  const meta = ROLE_BADGE[role] ?? ROLE_BADGE.member;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        inline && "text-[10px]",
      )}
      style={meta.style}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function MemberRow({
  member,
  self,
  canManage,
  onChangeRole,
  onToggleStatus,
  onRemove,
  roleBusy,
  statusBusy,
}: {
  member: Member;
  self: boolean;
  canManage: boolean;
  onChangeRole: (r: Role) => void;
  onToggleStatus: () => void;
  onRemove: () => void;
  roleBusy: boolean;
  statusBusy: boolean;
}) {
  const disabled = member.status === "disabled";
  // superadmin is a platform role; self-management is blocked so you can't lock
  // yourself out. Both fall back to read-only badges/actions.
  const editable = canManage && member.role !== "superadmin" && !self;

  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className={cn("flex items-center gap-2.5", disabled && "opacity-60")}>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: member.avatarColor }}
          >
            {initialsOf(member.name)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
              {member.name}
              {self && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  kamu
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{member.email ?? member.userId}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {editable ? (
          <div className="relative w-32">
            <select
              value={member.role}
              disabled={roleBusy}
              onChange={(e) => onChangeRole(e.target.value as Role)}
              className="h-8 w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-2.5 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
            >
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
          </div>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </td>
      <td className="px-4 py-3">
        {disabled ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 py-0.5 text-[11px] font-medium text-warning">
            Nonaktif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
            <Check className="h-3 w-3" /> Aktif
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {editable ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleStatus}
              disabled={statusBusy}
              title={disabled ? "Aktifkan seat" : "Nonaktifkan seat"}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2.5 text-[11px] font-medium transition-colors disabled:opacity-60",
                disabled
                  ? "border-border hover:border-success/50 hover:text-success"
                  : "border-border hover:border-warning/50 hover:text-warning",
              )}
            >
              {disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
              {disabled ? "Aktifkan" : "Nonaktifkan"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              title="Keluarkan dari tim"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">{self ? "—" : "Terkunci"}</span>
        )}
      </td>
    </tr>
  );
}

function ConfirmModal({
  open,
  onClose,
  icon,
  title,
  body,
  confirmLabel,
  confirmPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
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
            className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {confirmPending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
