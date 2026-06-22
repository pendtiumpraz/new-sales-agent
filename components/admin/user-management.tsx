"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, Search, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const qc = useQueryClient();

  // Create-account dialog (superadmin provisioning, doc 41).
  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPw, setCPw] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cPlan, setCPlan] = useState("starter");
  const [cTenantId, setCTenantId] = useState("");
  const [cRole, setCRole] = useState("member");

  // Tenant options derived from existing users' memberships (no extra fetch).
  const tenants = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of q.data ?? []) for (const m of u.memberships) map.set(m.tenantId, m.tenantName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [q.data]);

  const createValid =
    cName.trim() && cEmail.trim() && cPw.length >= 6 &&
    (mode === "new" ? cCompany.trim() : cTenantId);

  const createUser = useMutation({
    mutationFn: async () => {
      const body =
        mode === "new"
          ? { name: cName, email: cEmail, password: cPw, company: cCompany, plan: cPlan }
          : { name: cName, email: cEmail, password: cPw, tenantId: cTenantId, role: cRole };
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
      return r.json();
    },
    onSuccess: () => {
      toast.success(mode === "new" ? "Tenant + owner dibuat" : "User ditambahkan ke tenant");
      setCreateOpen(false);
      setCName(""); setCEmail(""); setCPw(""); setCCompany(""); setCTenantId("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal buat akun"),
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
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama/email/tenant…" className="h-8 pl-8 text-sm" />
          </div>
          <Button size="sm" className="h-8 shrink-0" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Buat akun
          </Button>
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

      {/* Create-account dialog — new tenant+owner OR add a user into a tenant. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buat akun</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={
                  "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition " +
                  (mode === "new" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")
                }
              >
                Tenant baru + owner
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={
                  "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition " +
                  (mode === "existing" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")
                }
              >
                Tambah ke tenant
              </button>
            </div>

            {mode === "new" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama perusahaan</Label>
                  <Input value={cCompany} onChange={(e) => setCCompany(e.target.value)} placeholder="PT Contoh Sejahtera" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Paket</Label>
                  <Select value={cPlan} onValueChange={setCPlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tenant</Label>
                  <Select value={cTenantId} onValueChange={setCTenantId}>
                    <SelectTrigger><SelectValue placeholder="Pilih tenant" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tenants.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Belum ada tenant — buat tenant baru dulu.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Peran</Label>
                  <Select value={cRole} onValueChange={setCRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tenant_owner">Owner</SelectItem>
                      <SelectItem value="tenant_admin">Admin</SelectItem>
                      <SelectItem value="member">Member (Sales)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Nama user</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="nama@perusahaan.co.id" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password (min 6 karakter)</Label>
              <Input type="text" value={cPw} onChange={(e) => setCPw(e.target.value)} placeholder="password awal" />
            </div>
            <p className="text-[11px] text-muted-foreground">Prototype: password plaintext (produksi → hash). Tenant baru langsung aktif.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={() => createUser.mutate()} disabled={!createValid || createUser.isPending}>
              {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
