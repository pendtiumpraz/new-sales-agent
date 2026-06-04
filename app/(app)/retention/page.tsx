"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Gauge,
  HeartHandshake,
  Plus,
  Repeat2,
  Sparkles,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CandidateTable } from "@/components/retention/candidate-table";
import { FlowCard } from "@/components/retention/flow-card";
import { RetentionStatTile } from "@/components/retention/stat-tile";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRetentionStore } from "@/lib/stores/retention-store";
import { cn } from "@/lib/utils";

const TYPE_FILTERS: { key: "all" | "repeat-order" | "upsell" | "after-sales"; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "repeat-order", label: "Pesanan berulang" },
  { key: "upsell", label: "Upsell" },
  { key: "after-sales", label: "After-sales" },
];

export default function RetentionPage() {
  const flows = useRetentionStore((s) => s.flows);
  const candidates = useRetentionStore((s) => s.candidates);
  const kpi = useRetentionStore((s) => s.kpi);
  const [filter, setFilter] = useState<(typeof TYPE_FILTERS)[number]["key"]>("all");

  const visibleFlows =
    filter === "all" ? flows : flows.filter((f) => f.type === filter);
  const activeFlowCount = flows.filter((f) => f.status === "aktif").length;

  return (
    <div>
      <PageHeader
        title="Retensi & After-Sales"
        description="Alur otomatis untuk pesanan berulang, upsell, dan tindak lanjut pasca-pembelian."
      >
        <Badge variant="secondary" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {activeFlowCount} alur aktif
        </Badge>
        <Button asChild>
          <Link href="/retention/rf_repeat_30d">
            <Plus className="h-4 w-4" />
            Kelola alur
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* KPI tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RetentionStatTile
            icon={<Users className="h-5 w-5" />}
            accent="#FB5E3B"
            label="Pelanggan aktif retensi"
            value={kpi.activeCustomers}
            sub="terdaftar di seluruh alur"
            delta={kpi.activeCustomersTrend}
          />
          <RetentionStatTile
            icon={<Repeat2 className="h-5 w-5" />}
            accent="#14B8A6"
            label="Pesanan berulang bulan ini"
            value={kpi.repeatOrdersThisMonth}
            sub={<IDRAmount value={kpi.repeatOrderValueIDR} compact />}
          />
          <RetentionStatTile
            icon={<Sparkles className="h-5 w-5" />}
            accent="#F59E0B"
            label="Tingkat upsell"
            value={`${kpi.upsellRate}%`}
            sub="vs. periode sebelumnya"
            delta={kpi.upsellRateDelta}
          />
          <RetentionStatTile
            icon={<Gauge className="h-5 w-5" />}
            accent="#14B8A6"
            label="NPS rata-rata"
            value={kpi.averageNps}
            sub={
              kpi.averageNps >= 50
                ? "Pelanggan loyal"
                : "Perlu peningkatan layanan"
            }
          />
        </div>

        {/* Active flows */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Alur retensi
              </h2>
              <p className="text-xs text-muted-foreground">
                Tersusun otomatis dari Basis Pengetahuan klien — segmen, riwayat
                interaksi, dan upsell map.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFlows.map((flow) => (
              <FlowCard key={flow.id} flow={flow} />
            ))}
          </div>

          {visibleFlows.length === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Tidak ada alur untuk filter ini.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Candidates */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HeartHandshake className="h-5 w-5 text-primary" />
                Kandidat siap didaftarkan
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Pelanggan yang direkomendasikan AI untuk masuk alur retensi.
              </p>
            </div>
            <Badge variant="secondary" className="tnum">
              {candidates.length} kandidat
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <CandidateTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
