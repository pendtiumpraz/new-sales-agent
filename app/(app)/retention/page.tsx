"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Gauge,
  HeartHandshake,
  Repeat2,
  Sparkles,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CandidateTable } from "@/components/retention/candidate-table";
import { FlowCard } from "@/components/retention/flow-card";
import { KpiStrip, KpiTile } from "@/components/shared/kpi-tile";
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
  { key: "upsell", label: "Upsell", dot: "bg-warning" },
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
          className="gap-1.5 bg-success/15 text-success"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          {activeFlowCount} alur aktif
        </Badge>
        <Button
          asChild
          className="shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)] transition-all hover:-translate-y-px hover:shadow-[0_6px_18px_-4px_rgba(251,94,59,0.7)]"
        >
          <Link href="/retention/rf_repeat_30d">
            <HeartHandshake className="h-4 w-4" />
            Buka contoh alur
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* Honest banner: this screen is demo data held in the browser (same for
            every tenant, resets on logout). Real per-tenant retention needs a
            DB-backed, tenant-scoped source (like Monitoring Sales). */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <b>Mode demo</b> — alur & KPI retensi ini contoh (data lokal di browser, di-reset saat logout). Versi nyata ter-scope per-tenant via DB.
        </div>

        {/* KPI strip — shared KpiTile (no fabricated deltas) */}
        <KpiStrip>
          <KpiTile icon={<Users className="h-5 w-5" />} accent="#10B981" label="Pelanggan aktif retensi" count={kpi.activeCustomers} sub="terdaftar di seluruh alur" />
          <KpiTile icon={<Repeat2 className="h-5 w-5" />} accent="#FB5E3B" label="Pesanan berulang bulan ini" count={kpi.repeatOrdersThisMonth} sub={<IDRAmount value={kpi.repeatOrderValueIDR} compact />} />
          <KpiTile icon={<Sparkles className="h-5 w-5" />} accent="#F59E0B" label="Tingkat upsell" count={kpi.upsellRate} suffix="%" sub="dari pelanggan aktif" />
          <KpiTile icon={<Gauge className="h-5 w-5" />} accent="#14B8A6" label="NPS rata-rata" count={kpi.averageNps} sub={kpi.averageNps >= 50 ? "Pelanggan loyal" : "Perlu peningkatan layanan"} />
        </KpiStrip>

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
