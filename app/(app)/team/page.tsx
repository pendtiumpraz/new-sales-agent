"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CircleDot, Crown, TrendingUp, UserCog, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { StatRowSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { KpiStrip, KpiTile } from "@/components/shared/kpi-tile";
import { Toolbar } from "@/components/shared/toolbar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
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

  const reps = useMemo(() => q.data ?? [], [q.data]);
  const totals = reps.reduce(
    (a, r) => ({ leads: a.leads + r.leadsOwned, won: a.won + r.won, wonValue: a.wonValue + r.wonValue }),
    { leads: 0, won: 0, wonValue: 0 },
  );

  const [search, setSearch] = useState("");
  const filteredReps = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return reps;
    return reps.filter(
      (r) => r.name.toLowerCase().includes(s) || (ROLE_LABEL[r.role] ?? r.role).toLowerCase().includes(s),
    );
  }, [reps, search]);

  const columns: DataColumn<RepRow>[] = [
    {
      key: "name",
      header: "Sales",
      sortValue: (r) => r.name.toLowerCase(),
      cell: (r) => (
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
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <CircleDot className={"h-3 w-3 " + (r.active ? "text-emerald-500" : "text-slate-300")} />
          {r.active ? "Aktif" : "Idle"}
          <span className="text-muted-foreground">· {lastActive(r.lastActiveAt)}</span>
        </span>
      ),
    },
    { key: "leadsOwned", header: "Lead", align: "right", sortValue: (r) => r.leadsOwned, cell: (r) => <span className="font-medium">{r.leadsOwned}</span> },
    { key: "deals", header: "Deal", align: "right", sortValue: (r) => r.deals, cell: (r) => r.deals },
    { key: "won", header: "Closing", align: "right", sortValue: (r) => r.won, cell: (r) => <span className="font-semibold text-emerald-600">{r.won}</span> },
    { key: "wonValue", header: "Nilai closing", align: "right", sortValue: (r) => r.wonValue, cell: (r) => (r.wonValue ? formatIDR(r.wonValue) : "—") },
    { key: "aiCost", header: "AI (biaya)", align: "right", cell: (r) => (r.aiCalls ? `$${r.aiCost.toFixed(3)}` : "—") },
  ];

  return (
    <div>
      <PageHeader title="Monitoring Sales" description="Pantau tim sales: siapa aktif, closing dari siapa, lead/partner dipegang siapa." />
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
            <KpiStrip className="lg:grid-cols-3">
              <KpiTile icon={<Users className="h-5 w-5" />} accent="#FB5E3B" label="Total lead dipegang" count={totals.leads} />
              <KpiTile icon={<TrendingUp className="h-5 w-5" />} accent="#14B8A6" label="Total closing" count={totals.won} />
              <KpiTile icon={<Activity className="h-5 w-5" />} accent="#6366F1" label="Nilai closing" value={formatIDR(totals.wonValue)} />
            </KpiStrip>

            <Toolbar search={search} onSearch={setSearch} searchPlaceholder="Cari sales…" />

            <DataTable
              columns={columns}
              data={filteredReps}
              rowKey={(r) => r.userId}
              pageSize={12}
              emptyIcon={Users}
              emptyTitle={search ? "Tidak ada sales yang cocok" : "Belum ada anggota tim"}
              emptyDescription={search ? undefined : "Undang anggota di Pengaturan → Tim."}
            />
            <p className="text-[11px] text-muted-foreground">
              “Aktif” = ada aktivitas AI dalam 7 hari terakhir. Closing = deal di tahap “tutup”. Lead = kontak yang di-assign ke sales itu.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
