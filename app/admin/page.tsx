"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldAlert } from "lucide-react";

interface TenantRow {
  id: string;
  name: string;
  status: string;
  plan: string;
  seats: number | null;
  members: number;
  sends: number;
  ai: { calls: number; tokens: number; cost: number };
  credit: { planTokens: number; granted: number; balance: number };
}
interface AuditRow { id: string; action: string; target: string | null; at: string }
interface Overview {
  tenants: TenantRow[];
  totals: { tenants: number; aiCalls: number; aiCost: number; sends: number } | null;
  audit: AuditRow[];
}

export default function AdminConsole() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const qc = useQueryClient();
  const isSuper = role === "superadmin";

  const { data, isLoading } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const r = await fetch("/api/admin");
      if (!r.ok) throw new Error();
      return (await r.json()) as Overview;
    },
    enabled: isSuper,
  });

  const toggle = useMutation({
    mutationFn: async ({ tenantId, action }: { tenantId: string; action: "suspend" | "activate" }) => {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      toast.success("Status tenant diperbarui");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Gagal mengubah status"),
  });

  const grant = useMutation({
    mutationFn: async ({ tenantId, tokens }: { tenantId: string; tokens: number }) => {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "grant_credit", tokens, reason: "manual top-up" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Kredit AI ditambahkan");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(`Gagal beri kredit (${e instanceof Error ? e.message : e})`),
  });

  function promptGrant(tenantId: string) {
    const raw = window.prompt("Tambah kredit AI (jumlah token, mis. 1000000). Pakai angka negatif untuk mengurangi.");
    if (raw == null) return;
    const tokens = Number(raw.replace(/[^\d-]/g, ""));
    if (!Number.isFinite(tokens) || tokens === 0) {
      toast.error("Jumlah token tidak valid");
      return;
    }
    grant.mutate({ tenantId, tokens });
  }

  if (status === "loading") return null;
  if (!isSuper) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-destructive" /> Area superadmin. Akun Anda tidak punya akses.
          <Link href="/dashboard" className="text-primary underline">Kembali</Link>
        </div>
      </div>
    );
  }

  const t = data?.totals;
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Superadmin Console</h1>
          <p className="text-xs text-muted-foreground">Lintas-tenant: usage, biaya AI, kill-switch, audit (doc 26).</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </header>

      <div className="space-y-6 p-6">
        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tenant", t?.tenants ?? 0],
            ["Panggilan AI", t?.aiCalls ?? 0],
            ["Biaya AI", `$${(t?.aiCost ?? 0).toFixed(4)}`],
            ["Email terkirim", t?.sends ?? 0],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-semibold tabular-nums">{val as string}</p>
              <p className="text-xs text-muted-foreground">{label as string}</p>
            </div>
          ))}
        </div>

        {/* Tenants */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Tenants</div>
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Memuat…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2">Tenant</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Anggota</th>
                  <th className="px-4 py-2">AI (calls / $)</th>
                  <th className="px-4 py-2">Kredit AI (sisa token)</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.tenants ?? []).map((tn) => (
                  <tr key={tn.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{tn.name}</td>
                    <td className="px-4 py-2">{tn.plan}{tn.seats ? ` · ${tn.seats} kursi` : ""}</td>
                    <td className="px-4 py-2 tabular-nums">{tn.members}</td>
                    <td className="px-4 py-2 tabular-nums">{tn.ai.calls} / ${tn.ai.cost.toFixed(4)}</td>
                    <td className={`px-4 py-2 tabular-nums ${tn.credit.balance <= 0 ? "text-destructive" : ""}`}>
                      {tn.credit.balance.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{tn.sends}</td>
                    <td className="px-4 py-2">
                      <span className={tn.status === "suspended" ? "text-destructive" : "text-emerald-600"}>{tn.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button className="text-xs text-primary hover:underline" disabled={grant.isPending} onClick={() => promptGrant(tn.id)}>
                          + Kredit
                        </button>
                        {tn.status === "suspended" ? (
                          <button className="text-xs text-emerald-600 hover:underline" onClick={() => toggle.mutate({ tenantId: tn.id, action: "activate" })}>
                            Aktifkan
                          </button>
                        ) : (
                          <button className="text-xs text-destructive hover:underline" onClick={() => toggle.mutate({ tenantId: tn.id, action: "suspend" })}>
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Audit (lintas-tenant)</div>
          <ul className="divide-y">
            {(data?.audit ?? []).slice(0, 20).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.target ?? "—"}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(a.at).toLocaleString("id-ID")}</span>
              </li>
            ))}
            {(data?.audit?.length ?? 0) === 0 && <li className="px-4 py-2 text-xs text-muted-foreground">Belum ada audit.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
