"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { can, type Role } from "@/lib/rbac/permissions";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  tenant_owner: "Owner",
  tenant_admin: "Admin",
  member: "Member",
};
// superadmin is a platform role — not assignable from the tenant UI.
const ASSIGNABLE: Role[] = ["tenant_owner", "tenant_admin", "member"];

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  name: string;
  email: string | null;
  avatarColor: string;
}
interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
}

async function fetchTeam() {
  const res = await fetch("/api/tenant/members");
  if (!res.ok) throw new Error("Gagal memuat tim");
  return res.json() as Promise<{ members: Member[]; invites: Invite[] }>;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "member") as Role;
  const canManage = can(role, "tenant.members.manage");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["team"] });

  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: fetchTeam });

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tenant/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Gagal mengundang");
    },
    onSuccess: () => {
      toast.success("Undangan dikirim");
      setEmail("");
      invalidate();
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role: r }: { id: string; role: Role }) => {
      const res = await fetch(`/api/tenant/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: r }),
      });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast.success("Peran diperbarui");
      invalidate();
    },
    onError: () => toast.error("Gagal memperbarui peran"),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tenant/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast.success("Anggota dihapus");
      invalidate();
    },
    onError: () => toast.error("Gagal menghapus anggota"),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tenant/invites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast.success("Undangan dibatalkan");
      invalidate();
    },
    onError: () => toast.error("Gagal membatalkan undangan"),
  });

  return (
    <div>
      <PageHeader
        title="Tim & Akses"
        description="Kelola anggota workspace, peran (RBAC), dan undangan."
      />

      <div className="max-w-3xl space-y-4 p-6">
        {!canManage && (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              Hanya Owner/Admin yang bisa mengelola anggota. Kamu bisa melihat tim.
            </CardContent>
          </Card>
        )}

        {canManage && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4 text-primary" />
                Undang anggota
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="nama@perusahaan.co.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Peran</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => invite.mutate()} disabled={!email || invite.isPending}>
                  {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Undang"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Anggota</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Memuat…</div>
            ) : (
              <ul className="divide-y">
                {data?.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 p-4">
                    <UserAvatar name={m.name} color={m.avatarColor} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email ?? m.userId}</p>
                    </div>
                    {canManage && m.role !== "superadmin" ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole.mutate({ id: m.id, role: v as Role })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="muted">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                    )}
                    {canManage && m.role !== "superadmin" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMember.mutate(m.id)}
                        aria-label="Hapus anggota"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {data?.invites?.length ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Undangan tertunda</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {data.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABELS[i.role] ?? i.role}
                      </p>
                    </div>
                    <Badge variant="muted">Pending</Badge>
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate(i.id)}>
                        Batalkan
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
