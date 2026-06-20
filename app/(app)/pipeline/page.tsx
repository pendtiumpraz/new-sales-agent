"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  Flame,
  LayoutGrid,
  ListChecks,
  Settings2,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { EnrichmentTable } from "@/components/pipeline/enrichment-table";
import { AiAnalysisPanel } from "@/components/pipeline/ai-analysis-panel";
import { ProductManagerDialog } from "@/components/pipeline/product-manager-dialog";
import { KpiStrip, KpiTile } from "@/components/shared/kpi-tile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { TableSkeleton } from "@/components/shared/skeletons";

export default function PipelinePage() {
  const [productsOpen, setProductsOpen] = useState(false);
  const workspaceId = useSearchParams().get("workspace"); // doc 44 — scope kanban to a workspace
  const [wsAll, setWsAll] = useState(false);

  // Hydrate persisted deals from /api/db/deals once when the pipeline page mounts.
  // The store's hydrateDeals is idempotent (guarded by `dealsHydrated` + in-flight
  // promise) so this is safe across re-mounts and concurrent callers.
  const hydrateDeals = usePipelineStore((s) => s.hydrateDeals);
  const dealsHydrated = usePipelineStore((s) => s.dealsHydrated);
  const hydrateProducts = usePipelineStore((s) => s.hydrateProducts);
  useEffect(() => {
    void hydrateDeals();
    void hydrateProducts(); // products are DB-backed now (audit #5)
  }, [hydrateDeals, hydrateProducts]);

  // ── Hero strip stats — scoped to the active workspace like the Kanban (doc 44).
  const analyses = usePipelineStore((s) => s.analyses);
  const deals = usePipelineStore((s) => s.deals);
  const scope = workspaceId && !wsAll ? workspaceId : null;
  const scopedDealIds = scope ? new Set(deals.filter((d) => (d as { workspaceId?: string | null }).workspaceId === scope).map((d) => d.id)) : null;
  const scopedAnalyses = scopedDealIds ? analyses.filter((a) => scopedDealIds.has(a.dealId)) : analyses;
  const heroStats = {
    hot: scopedAnalyses.filter((a) => a.temperature === "panas").length,
    active: scopedAnalyses.filter((a) => a.status === "aktif").length,
    avgDays:
      scopedAnalyses.length > 0
        ? Math.round(scopedAnalyses.reduce((s, a) => s + (a.daysInStage ?? 0), 0) / scopedAnalyses.length)
        : 0,
  };

  return (
    <div>
      <PageHeader
        title="Riset Prospek"
        description="Data prospek yang diperkaya AI — siapa yang masih aktif, siapa yang berhenti, dan langkah berikutnya."
      >
        <Button variant="outline" onClick={() => setProductsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          Atur Produk & Harga
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* KPI strip — enrichment summary (scoped to the active workspace) */}
        <KpiStrip className="lg:grid-cols-3">
          <KpiTile icon={<Flame className="h-5 w-5" />} accent="#FB5E3B" label="Prospek panas" count={heroStats.hot} />
          <KpiTile icon={<TrendingUp className="h-5 w-5" />} accent="#14B8A6" label="Deal aktif" count={heroStats.active} />
          <KpiTile icon={<Clock className="h-5 w-5" />} accent="#F59E0B" label="Rata-rata hari di tahap" count={heroStats.avgDays} suffix=" hr" />
        </KpiStrip>

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
                {dealsHydrated ? <EnrichmentTable workspaceId={scope} /> : <TableSkeleton rows={8} cols={6} />}
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

