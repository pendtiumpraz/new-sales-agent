"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Membership {
  tenantId: string;
  tenantName: string;
  role: string;
}
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  memberships: Membership[];
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  tenant_owner: "Owner",
  tenant_admin: "Sales Manager",
  member: "Sales Rep",
};

export function UserManagement() {
  const [search, setSearch] = useState("");
  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null);
  const [pw, setPw] = useState("");

  const q = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await fetch("/api/admin/users");
      if (!r.ok) return [] as AdminUser[];
      return ((await r.json()).data ?? []) as AdminUser[];
    },
  });

  const changePw = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pwTarget!.id, password: pw }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success(`Password ${pwTarget?.name} diubah`);
      setPwTarget(null);
      setPw("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal ganti password"),
  });

  const rows = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.memberships.some((m) => m.tenantName.toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> User Management
          <span className="text-xs font-normal text-muted-foreground">— semua tenant</span>
        </span>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama/email/tenant…" className="h-8 pl-8 text-sm" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Tenant</th>
              <th className="px-4 py-2 font-medium">Peran</th>
              <th className="px-4 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{u.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2.5">
                  {u.memberships.length === 0 ? (
                    <span className="text-xs text-muted-foreground">— Platform (tanpa tenant)</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.memberships.map((m) => (
                        <span key={m.tenantId} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {m.tenantName} <span className="text-muted-foreground">· {ROLE_LABEL[m.role] ?? m.role}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPwTarget(u); setPw(""); }}>
                    <KeyRound className="h-3.5 w-3.5" /> Password
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {search ? "Tak ada user cocok." : "Belum ada user."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pwTarget} onOpenChange={(v) => !v && setPwTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ganti password — {pwTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Password baru (min 6 karakter)</Label>
            <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password baru" />
            <p className="text-[11px] text-muted-foreground">Prototype: password disimpan plaintext (produksi → hash).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwTarget(null)}>Batal</Button>
            <Button onClick={() => changePw.mutate()} disabled={pw.length < 6 || changePw.isPending}>
              {changePw.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
