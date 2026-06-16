"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CircleDot, Crown, TrendingUp, UserCog, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { StatRowSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { formatIDR } from "@/lib/utils/format-idr";

interface RepRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string | null;
  leadsOwned: number;
  deals: number;
  won: number;
  wonValue: number;
  aiCalls: number;
  aiCost: number;
  lastActiveAt: string | null;
  active: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  tenant_owner: "Manajer (Owner)",
  tenant_admin: "Sales Manager",
  member: "Sales Rep",
};

function lastActive(iso: string | null): string {
  if (!iso) return "belum ada aktivitas";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export default function MonitoringPage() {
  const q = useQuery({
    queryKey: ["team-monitoring"],
    queryFn: async () => {
      const r = await fetch("/api/team/monitoring");
      if (r.status === 403) throw new Error("forbidden");
      if (!r.ok) throw new Error("gagal");
      return ((await r.json()).data ?? []) as RepRow[];
    },
    retry: false,
  });

  const reps = q.data ?? [];
  const totals = reps.reduce(
    (a, r) => ({ leads: a.leads + r.leadsOwned, won: a.won + r.won, wonValue: a.wonValue + r.wonValue }),
    { leads: 0, won: 0, wonValue: 0 },
  );

  return (
    <div>
      <PageHeader title="Monitoring Sales" description="Pantau tim sales: siapa aktif, closing dari siapa, lead/partner dipegang siapa (doc 41)." />
      <div className="space-y-4 p-6">
        {q.isError ? (
          <EmptyState icon={UserCog} title="Khusus manajer" description="Halaman ini hanya untuk Manajer/Owner tenant. Login sebagai manajer untuk memantau tim." />
        ) : q.isLoading ? (
          <>
            <StatRowSkeleton n={3} />
            <TableSkeleton rows={8} cols={7} />
          </>
        ) : (
          <>
            {/* Summary */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Users, label: "Total lead dipegang", val: totals.leads },
                { icon: TrendingUp, label: "Total closing", val: totals.won },
                { icon: Activity, label: "Nilai closing", val: formatIDR(totals.wonValue) },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <s.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-lg font-semibold leading-none">{s.val}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Roster */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Sales</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 text-right font-medium">Lead</th>
                        <th className="px-3 py-2.5 text-right font-medium">Deal</th>
                        <th className="px-3 py-2.5 text-right font-medium">Closing</th>
                        <th className="px-3 py-2.5 text-right font-medium">Nilai closing</th>
                        <th className="px-4 py-2.5 text-right font-medium">AI (biaya)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reps.map((r) => (
                        <tr key={r.userId} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <UserAvatar name={r.name} color={r.avatarColor ?? undefined} className="h-7 w-7" />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1 truncate font-medium">
                                  {r.name}
                                  {r.role !== "member" && <Crown className="h-3 w-3 text-amber-500" />}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <CircleDot className={"h-3 w-3 " + (r.active ? "text-emerald-500" : "text-slate-300")} />
                              {r.active ? "Aktif" : "Idle"}
                              <span className="text-muted-foreground">· {lastActive(r.lastActiveAt)}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium">{r.leadsOwned}</td>
                          <td className="px-3 py-2.5 text-right">{r.deals}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">{r.won}</td>
                          <td className="px-3 py-2.5 text-right">{r.wonValue ? formatIDR(r.wonValue) : "—"}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {r.aiCalls ? `$${r.aiCost.toFixed(3)}` : "—"}
                          </td>
                        </tr>
                      ))}
                      {reps.length === 0 && !q.isLoading && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            Belum ada anggota tim.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <p className="text-[11px] text-muted-foreground">
              “Aktif” = ada aktivitas AI dalam 7 hari terakhir. Closing = deal di tahap “tutup”. Lead = kontak yang di-assign ke sales itu.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
