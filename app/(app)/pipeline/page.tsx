"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, ListChecks, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { EnrichmentTable } from "@/components/pipeline/enrichment-table";
import { AiAnalysisPanel } from "@/components/pipeline/ai-analysis-panel";
import { ProductManagerDialog } from "@/components/pipeline/product-manager-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipelineStore } from "@/lib/stores/pipeline-store";

export default function PipelinePage() {
  const [productsOpen, setProductsOpen] = useState(false);

  // Hydrate persisted deals from /api/db/deals once when the pipeline page mounts.
  // The store's hydrateDeals is idempotent (guarded by `dealsHydrated` + in-flight
  // promise) so this is safe across re-mounts and concurrent callers.
  const hydrateDeals = usePipelineStore((s) => s.hydrateDeals);
  useEffect(() => {
    void hydrateDeals();
  }, [hydrateDeals]);

  return (
    <div>
      <PageHeader
        title="Data Enrichment"
        description="Data prospek yang diperkaya AI — siapa yang masih aktif, siapa yang berhenti, dan langkah berikutnya."
      >
        <Button variant="outline" onClick={() => setProductsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          Atur Produk & Harga
        </Button>
      </PageHeader>

      <div className="p-6">
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
            <div className="-mx-6 -mb-6">
              <KanbanBoard />
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
