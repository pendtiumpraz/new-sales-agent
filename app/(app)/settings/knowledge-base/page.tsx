"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  Database,
  Heart,
  Lightbulb,
  Package,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AiTestPanel } from "@/components/kb/ai-test-panel";
import { PricingTableEditor } from "@/components/kb/pricing-table";
import { ProductListEditor } from "@/components/kb/product-list-editor";
import { RetentionFlowsEditor } from "@/components/kb/retention-flows-editor";
import { SegmentsEditor } from "@/components/kb/segments-editor";
import { SourcesEditor } from "@/components/kb/sources-editor";
import { StrategyEditor } from "@/components/kb/strategy-editor";
import { UpsellMapEditor } from "@/components/kb/upsell-map-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKbStore } from "@/lib/stores/kb-store";
import { formatRelativeID } from "@/lib/utils/format-date-id";

export default function KnowledgeBasePage() {
  const router = useRouter();
  const kb = useKbStore((s) => s.kb);

  const stats = useMemo(
    () => [
      {
        icon: Database,
        label: "Sumber aktif",
        value: kb.sources.filter((s) => s.active).length,
        tone: "tertiary" as const,
      },
      {
        icon: Package,
        label: "Produk",
        value: kb.products.length,
        tone: "primary" as const,
      },
      {
        icon: Tag,
        label: "Tier harga",
        value: kb.pricing.length,
        tone: "warning" as const,
      },
      {
        icon: Users,
        label: "Segmen",
        value: kb.segments.length,
        tone: "tertiary" as const,
      },
      {
        icon: Lightbulb,
        label: "Catatan strategi",
        value: kb.marketingStrategy.length,
        tone: "warning" as const,
      },
      {
        icon: Sparkles,
        label: "Alur upsell",
        value: kb.upsellMap.length,
        tone: "primary" as const,
      },
      {
        icon: Heart,
        label: "Alur retensi aktif",
        value: kb.retentionFlows.filter((f) => f.active).length,
        tone: "success" as const,
      },
    ],
    [kb],
  );

  return (
    <div>
      <PageHeader
        title="Basis Pengetahuan"
        description="Konfigurasi produk, harga, segmen, dan alur retensi yang digunakan AI untuk merespon dan memberi rekomendasi."
      >
        <Button variant="outline" onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Pengaturan
        </Button>
        <Badge variant="muted" className="hidden sm:inline-flex">
          Pembaruan terakhir {formatRelativeID(kb.lastUpdated)}
        </Badge>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Hero — what this is */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BrainCircuit className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Basis pengetahuan untuk <span>{kb.clientName}</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Data ini menjadi sumber kebenaran untuk Advanced RAG. AI memakai
                produk, harga, segmen, dan playbook di bawah untuk menyusun
                jawaban non-linear pada Inbox, Pipeline, dan alur retensi.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {stats.map((s) => {
            const Icon = s.icon;
            const tone =
              s.tone === "primary"
                ? "bg-primary/10 text-primary"
                : s.tone === "warning"
                  ? "bg-warning/15 text-amber-700"
                  : s.tone === "success"
                    ? "bg-success/10 text-emerald-700"
                    : "bg-tertiary/10 text-tertiary";
            return (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold tnum leading-none">
                      {s.value}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {s.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Editor tabs */}
        <Tabs defaultValue="sumber">
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="sumber" className="gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Sumber
            </TabsTrigger>
            <TabsTrigger value="produk" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Produk
            </TabsTrigger>
            <TabsTrigger value="harga" className="gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Harga
            </TabsTrigger>
            <TabsTrigger value="segmen" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Segmen
            </TabsTrigger>
            <TabsTrigger value="strategi" className="gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              Strategi Pemasaran
            </TabsTrigger>
            <TabsTrigger value="upsell" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Upsell
            </TabsTrigger>
            <TabsTrigger value="retensi" className="gap-1.5">
              <Heart className="h-3.5 w-3.5" />
              Retensi
            </TabsTrigger>
            <TabsTrigger value="ai-test" className="gap-1.5">
              <BrainCircuit className="h-3.5 w-3.5" />
              AI Test
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sumber" className="mt-5">
            <SourcesEditor />
          </TabsContent>
          <TabsContent value="produk" className="mt-5">
            <ProductListEditor />
          </TabsContent>
          <TabsContent value="harga" className="mt-5">
            <PricingTableEditor />
          </TabsContent>
          <TabsContent value="segmen" className="mt-5">
            <SegmentsEditor />
          </TabsContent>
          <TabsContent value="strategi" className="mt-5">
            <StrategyEditor />
          </TabsContent>
          <TabsContent value="upsell" className="mt-5">
            <UpsellMapEditor />
          </TabsContent>
          <TabsContent value="retensi" className="mt-5">
            <RetentionFlowsEditor />
          </TabsContent>
          <TabsContent value="ai-test" className="mt-5">
            <AiTestPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
