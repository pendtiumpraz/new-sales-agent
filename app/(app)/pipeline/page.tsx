"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  Flame,
  LayoutGrid,
  ListChecks,
  Settings2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { EnrichmentTable } from "@/components/pipeline/enrichment-table";
import { AiAnalysisPanel } from "@/components/pipeline/ai-analysis-panel";
import { ProductManagerDialog } from "@/components/pipeline/product-manager-dialog";
import { AnimatedHeroBg } from "@/components/dashboard/animated-hero-bg";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipelineStore } from "@/lib/stores/pipeline-store";

export default function PipelinePage() {
  const [productsOpen, setProductsOpen] = useState(false);
  const workspaceId = useSearchParams().get("workspace"); // doc 44 — scope kanban to a workspace
  const [wsAll, setWsAll] = useState(false);

  // Hydrate persisted deals from /api/db/deals once when the pipeline page mounts.
  // The store's hydrateDeals is idempotent (guarded by `dealsHydrated` + in-flight
  // promise) so this is safe across re-mounts and concurrent callers.
  const hydrateDeals = usePipelineStore((s) => s.hydrateDeals);
  useEffect(() => {
    void hydrateDeals();
  }, [hydrateDeals]);

  // ── Hero strip stats — derive from store (visual-only, no new hooks) ──────
  const analyses = usePipelineStore((s) => s.analyses);
  const heroStats = {
    hot: analyses.filter((a) => a.temperature === "panas").length,
    active: analyses.filter((a) => a.status === "aktif").length,
    avgDays:
      analyses.length > 0
        ? Math.round(
            analyses.reduce((s, a) => s + (a.daysInStage ?? 0), 0) /
              analyses.length,
          )
        : 0,
  };

  return (
    <div>
      <PageHeader
        title="Riset Prospek"
        description="Data prospek yang diperkaya AI — siapa yang masih aktif, siapa yang berhenti, dan langkah berikutnya."
      >
        <Button
          onClick={() => setProductsOpen(true)}
          className="bg-gradient-to-r from-primary to-tertiary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)] hover:shadow-[0_6px_18px_-4px_rgba(251,94,59,0.65)] hover:brightness-105"
        >
          <Settings2 className="h-4 w-4" />
          Atur Produk & Harga
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* ── Hero strip: AI Analysis summary ─────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/8 via-tertiary/6 to-card shadow-sm">
          <AnimatedHeroBg />
          <div className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-tertiary text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                  Analisis AI
                </p>
                <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                  Ringkasan enrichment hari ini
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Diperbarui otomatis dari sinyal percakapan & data perusahaan.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <HeroStat
                icon={<Flame className="h-4 w-4" />}
                accent="#FB5E3B"
                value={heroStats.hot}
                label="Prospek panas"
              />
              <HeroStat
                icon={<TrendingUp className="h-4 w-4" />}
                accent="#14B8A6"
                value={heroStats.active}
                label="Deal aktif"
              />
              <HeroStat
                icon={<Clock className="h-4 w-4" />}
                accent="#F59E0B"
                value={heroStats.avgDays}
                label="Rata-rata hari"
              />
            </div>
          </div>
        </div>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">
              <ListChecks className="h-4 w-4" />
              Daftar enrichment
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </TabsTrigger>
          </TabsList>

          {/* ── Default: Daftar enrichment (table + AI panel side-by-side) ── */}
          <TabsContent value="list" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-8 xl:col-span-9">
                <EnrichmentTable />
              </div>
              <aside className="lg:col-span-4 xl:col-span-3">
                <div className="lg:sticky lg:top-4">
                  <AiAnalysisPanel />
                </div>
              </aside>
            </div>
          </TabsContent>

          {/* ── Kanban (existing) ────────────────────────────────────────── */}
          <TabsContent value="kanban" className="mt-4">
            {workspaceId && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span>Pipeline difilter ke <b>workspace ini</b> — {wsAll ? "semua deal" : "deal workspace ini saja"}.</span>
                <button onClick={() => setWsAll((v) => !v)} className="ml-auto text-xs text-primary hover:underline">
                  {wsAll ? "Workspace saja" : "Lihat semua"}
                </button>
              </div>
            )}
            <div className="-mx-6 -mb-6">
              <KanbanBoard workspaceId={workspaceId && !wsAll ? workspaceId : null} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ProductManagerDialog
        open={productsOpen}
        onOpenChange={setProductsOpen}
      />
    </div>
  );
}

/**
 * Compact stat tile used in the pipeline hero strip. The accent color tints
 * the icon swatch + numeric value so coral / teal / amber stay visually
 * distinct at a glance.
 */
function HeroStat({
  icon,
  accent,
  value,
  label,
}: {
  icon: React.ReactNode;
  accent: string;
  value: number;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border bg-card/80 px-3 py-2 backdrop-blur-sm transition-shadow hover:shadow-sm"
      style={{ borderColor: `${accent}33` }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className="tnum text-lg font-semibold leading-none"
          style={{ color: accent }}
        >
          {value}
        </p>
        <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
