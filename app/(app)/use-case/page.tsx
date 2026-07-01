"use client";

// Market-Fit Analyzer page (/use-case). REPLACES the old stub that just
// redirect()ed to /onboarding — which sent anyone clicking "Analisis market-fit"
// from the workspace hub back into onboarding (the reported bug). This is the real
// analysis surface: it resolves the active workspace + its connected product,
// runs POST /api/market-fit (AI classify B2B/B2C/mix + ICP + confidence + which of
// the 17 closing techniques fit), and saves the result to the workspace via
// PUT /api/workspace/[id]/market-fit. NO redirect to onboarding — empty states
// point to /workspace (create workspace / connect a product) instead.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Package, Sparkles, Target } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";

// ── shapes ────────────────────────────────────────────────────────────────────
interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
interface WorkspaceRow {
  id: string;
  name: string;
  productId: string | null;
  status: string;
  updatedAt: string;
}
interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  valueProps: string[];
  pricingNotes: string | null;
  targetMarket: string | null;
}
interface MarketFitRow {
  marketType: string; // b2b | b2c | mix
  confidence: number | null; // 0..1
  icp: Record<string, unknown> | null;
  segments: string[];
  rationale: string | null;
  source: string | null;
}
/** POST /api/market-fit result (lib/types/market-fit · MarketFitResult). */
interface AnalyzeResult {
  marketType: "B2B" | "B2C" | "mix";
  confidence: number; // 0..100
  icp: Record<string, unknown>;
  segmentFit: { label: string; score: number; reason: string }[];
  rationale: string;
  source: "ai" | "heuristic";
}
interface AnalyzeResponse {
  result: AnalyzeResult;
  allowedTechniques: { id: string; nama: string }[];
}

const MARKET_META: Record<string, { label: string; cls: string }> = {
  b2b: { label: "B2B dominan", cls: "bg-primary/12 text-primary" },
  b2c: { label: "B2C dominan", cls: "bg-tertiary/15 text-tertiary" },
  mix: { label: "Mix (B2B + B2C)", cls: "bg-highlight/15 text-highlight-foreground" },
};

async function getEnvelope<T>(url: string): Promise<T | null> {
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error("gagal memuat");
  }
  return ((await r.json()) as ApiEnvelope<T>).data ?? null;
}

/** Compose a product description for the analyzer from the connected product. */
function describeProduct(p: ProductRow): string {
  return [p.category, ...(p.valueProps ?? []), p.pricingNotes]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(". ");
}

function icpRows(icp: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!icp) return [];
  return Object.entries(icp)
    .map(([k, v]) => {
      let value = "";
      if (Array.isArray(v)) value = v.join(", ");
      else if (v != null && (typeof v === "string" || typeof v === "number")) value = String(v);
      return { label: k.replace(/_/g, " "), value };
    })
    .filter((r) => r.value.length > 0)
    .slice(0, 8);
}

export default function UseCasePage() {
  const qc = useQueryClient();
  const storeActive = useWorkspaceStore((s) => s.active);

  const wsQ = useQuery({
    queryKey: ["m2", "workspace", "list"],
    queryFn: () => getEnvelope<WorkspaceRow[]>("/api/workspace"),
    retry: false,
  });
  const workspaces = useMemo<WorkspaceRow[]>(() => wsQ.data ?? [], [wsQ.data]);
  const activeWs = useMemo<WorkspaceRow | null>(() => {
    const live = workspaces.filter((w) => w.status !== "archived");
    if (live.length === 0) return null;
    if (storeActive) {
      const match = live.find((w) => w.id === storeActive.id);
      if (match) return match;
    }
    return [...live].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [workspaces, storeActive]);
  const wsId = activeWs?.id ?? null;

  const productQ = useQuery({
    queryKey: ["m2", "product", "list"],
    queryFn: () => getEnvelope<ProductRow[]>("/api/product"),
    retry: false,
  });
  const product = useMemo<ProductRow | null>(() => {
    if (!activeWs?.productId) return null;
    return (productQ.data ?? []).find((p) => p.id === activeWs.productId) ?? null;
  }, [activeWs, productQ.data]);

  const mfQ = useQuery({
    queryKey: ["m2", "workspace", wsId, "market-fit"],
    enabled: !!wsId,
    queryFn: () => getEnvelope<MarketFitRow>(`/api/workspace/${wsId}/market-fit`),
    retry: false,
  });
  const marketFit = mfQ.data ?? null;

  const [techniques, setTechniques] = useState<{ id: string; nama: string }[]>([]);

  const analyze = useMutation({
    mutationFn: async (): Promise<AnalyzeResponse> => {
      if (!product) throw new Error("Produk belum terhubung ke workspace ini");
      const r = await fetch("/api/market-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: product.name,
          productDescription: describeProduct(product) || product.name,
          segments: [],
        }),
      });
      const j = (await r.json()) as AnalyzeResponse & { error?: string };
      if (!r.ok || !j.result) throw new Error(j.error || "Analisis gagal");
      // Persist to the workspace (convert: B2B→b2b, confidence 0..100 → 0..1,
      // segmentFit → segment labels).
      const save = {
        marketType: j.result.marketType.toLowerCase(),
        confidence: Math.max(0, Math.min(1, (j.result.confidence ?? 0) / 100)),
        icp: j.result.icp ?? null,
        segments: (j.result.segmentFit ?? []).map((s) => s.label),
        rationale: j.result.rationale ?? null,
        source: j.result.source ?? "ai",
      };
      const put = await fetch(`/api/workspace/${wsId}/market-fit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(save),
      });
      if (!put.ok) throw new Error("Gagal menyimpan hasil market-fit");
      return j;
    },
    onSuccess: (j) => {
      setTechniques(j.allowedTechniques ?? []);
      toast.success("Market-fit dianalisis & disimpan ke workspace");
      qc.invalidateQueries({ queryKey: ["m2", "workspace", wsId, "market-fit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analisis gagal"),
  });

  const loading = wsQ.isLoading || productQ.isLoading;

  const header = (
    <PageHeader
      breadcrumb={
        <Link href="/workspace" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
          <ArrowLeft className="h-3 w-3" /> Workspace
        </Link>
      }
      title="Analisis Market-Fit"
      description="Klasifikasi produk jadi B2B / B2C / mix + ICP + teknik closing yang cocok. Hasilnya disimpan ke workspace & nyetir Discovery + Sales Play."
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="space-y-4 p-6">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (wsQ.isError) {
    return (
      <div>
        {header}
        <div className="p-6">
          <ErrorState
            title="Gagal memuat workspace"
            description="Tidak bisa mengambil data workspace. Pastikan kamu login & punya akses data."
            onRetry={() => wsQ.refetch()}
          />
        </div>
      </div>
    );
  }

  // No workspace → point to /workspace (NOT onboarding).
  if (!activeWs) {
    return (
      <div>
        {header}
        <div className="p-6">
          <EmptyState
            icon={Briefcase}
            title="Belum ada workspace aktif"
            description="Market-fit dianalisis per workspace (1 workspace = 1 produk). Buat workspace dulu, lalu kembali ke sini."
            action={
              <Button asChild>
                <Link href="/workspace">
                  <Briefcase className="h-4 w-4" /> Ke Workspace
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Workspace but no connected product → point to /workspace (NOT onboarding).
  if (!product) {
    return (
      <div>
        {header}
        <div className="p-6">
          <EmptyState
            icon={Package}
            title="Produk belum terhubung"
            description="Analisis market-fit butuh produk yang terhubung ke workspace ini. Hubungkan produk dulu di halaman Workspace."
            action={
              <Button asChild>
                <Link href="/workspace">
                  <Package className="h-4 w-4" /> Hubungkan produk
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const confidencePct = marketFit?.confidence != null ? Math.round(marketFit.confidence * 100) : null;
  const meta = marketFit ? MARKET_META[marketFit.marketType] ?? MARKET_META.mix : null;
  const icp = icpRows(marketFit?.icp);

  return (
    <div>
      {header}
      <div className="space-y-5 p-6">
        {/* product + run */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tertiary/15 text-tertiary">
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">
                {product.name}
                {product.category ? ` — ${product.category}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Workspace: <span className="font-medium text-foreground/80">{activeWs.name}</span>
                {product.targetMarket ? ` · target pasar ${product.targetMarket}` : ""}
              </p>
            </div>
            <Button
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
              className="shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              {analyze.isPending
                ? "Menganalisis…"
                : marketFit
                  ? "Analisis ulang"
                  : "Analisis market-fit"}
            </Button>
          </CardContent>
        </Card>

        {/* result */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Target className="h-4 w-4 text-primary" /> Hasil market-fit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mfQ.isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : !marketFit ? (
              <EmptyState
                className="border-0 py-8"
                icon={Sparkles}
                title="Belum dianalisis"
                description="Klik “Analisis market-fit” untuk menentukan tipe pasar (B2B / B2C / mix), ICP, dan teknik closing yang cocok untuk produk ini."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", meta?.cls)}>
                    {meta?.label}
                  </span>
                  {confidencePct != null && (
                    <span className="text-xs text-muted-foreground">
                      keyakinan <span className="font-medium text-foreground/80">{confidencePct}%</span>
                      {marketFit.source ? ` · sumber ${marketFit.source}` : ""}
                    </span>
                  )}
                </div>
                {marketFit.rationale && (
                  <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {marketFit.rationale}
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
                    <p className="font-semibold text-foreground/80">ICP — target ideal</p>
                    {icp.length === 0 ? (
                      <p className="text-muted-foreground">ICP belum terisi.</p>
                    ) : (
                      icp.map((r) => (
                        <div key={r.label} className="flex gap-2">
                          <span className="w-24 shrink-0 capitalize text-muted-foreground">{r.label}</span>
                          <span className="flex-1 text-foreground/90">{r.value}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
                    <p className="font-semibold text-foreground/80">Segmen target</p>
                    {(marketFit.segments ?? []).length === 0 ? (
                      <p className="text-muted-foreground">Belum ada segmen.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {marketFit.segments.map((s) => (
                          <span key={s} className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-foreground/80">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {techniques.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border p-3 text-xs">
                    <p className="font-semibold text-foreground/80">
                      Teknik closing yang kebuka ({techniques.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {techniques.map((t) => (
                        <Badge key={t.id} variant="muted">
                          {t.nama}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-1">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/workspace">
                      <ArrowLeft className="h-4 w-4" /> Kembali ke Workspace
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
