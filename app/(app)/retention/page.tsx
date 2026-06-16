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

const TYPE_FILTERS: {
  key: "all" | "repeat-order" | "upsell" | "after-sales";
  label: string;
  // Optional accent — chip dot when not active to hint at the flow type color
  dot?: string;
}[] = [
  { key: "all", label: "Semua" },
  { key: "repeat-order", label: "Pesanan berulang", dot: "bg-primary" },
  { key: "upsell", label: "Upsell", dot: "bg-amber-500" },
  { key: "after-sales", label: "After-sales", dot: "bg-tertiary" },
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
        title="Retensi & Purna-Jual"
        description="Alur otomatis untuk pesanan berulang, upsell, dan tindak lanjut pasca-pembelian."
      >
        <Badge
          variant="secondary"
          className="gap-1.5 bg-emerald-100 text-emerald-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {activeFlowCount} alur aktif
        </Badge>
        <Button
          asChild
          className="shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)] transition-all hover:-translate-y-px hover:shadow-[0_6px_18px_-4px_rgba(251,94,59,0.7)]"
        >
          <Link href="/retention/rf_repeat_30d">
            <Plus className="h-4 w-4" />
            Kelola alur
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* Hero strip — coral→teal radial gradient backdrop */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-tertiary/5 p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,94,59,0.25),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -bottom-16 h-60 w-60 rounded-full bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.22),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-1/3 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-2xl"
          />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary/15 text-tertiary">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  Pelanggan loyal, pertumbuhan stabil
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  AI menjaga setiap pelanggan tetap aktif — dari follow-up
                  pertama hingga upsell terakhir.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary/10 px-3 py-1.5 text-xs font-medium text-tertiary ring-1 ring-tertiary/20">
                <Repeat2 className="h-3.5 w-3.5" />
                <span className="text-muted-foreground/80">Pesanan ulang</span>
                <span className="tnum font-semibold text-foreground">
                  {kpi.repeatOrdersThisMonth}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-muted-foreground/80">Upsell</span>
                <span className="tnum font-semibold text-foreground">
                  {kpi.upsellRate}%
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* KPI tiles — color-coded per metric using the StatTile gradient */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RetentionStatTile
            icon={<Users className="h-5 w-5" />}
            accent="#10B981"
            label="Pelanggan aktif retensi"
            value={kpi.activeCustomers}
            sub="terdaftar di seluruh alur"
            delta={kpi.activeCustomersTrend}
          />
          <RetentionStatTile
            icon={<Repeat2 className="h-5 w-5" />}
            accent="#FB5E3B"
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
              {TYPE_FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)]"
                        : "bg-card text-muted-foreground hover:-translate-y-px hover:text-foreground hover:shadow-sm",
                    )}
                  >
                    {f.dot && !active && (
                      <span
                        aria-hidden
                        className={cn("h-1.5 w-1.5 rounded-full", f.dot)}
                      />
                    )}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFlows.map((flow) => (
              <FlowCard key={flow.id} flow={flow} />
            ))}
          </div>

          {visibleFlows.length === 0 && (
            <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
              <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <HeartHandshake className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    Tidak ada alur untuk filter ini
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Coba pilih jenis alur lain atau buat alur baru.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Candidates */}
        <Card className="overflow-hidden border-primary/15">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-primary/10 bg-gradient-to-r from-primary/5 via-card to-tertiary/5">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HeartHandshake className="h-4 w-4" />
                </span>
                Kandidat siap didaftarkan
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Pelanggan yang direkomendasikan AI untuk masuk alur retensi.
              </p>
            </div>
            <Badge
              variant="secondary"
              className="tnum bg-primary/10 text-primary"
            >
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
