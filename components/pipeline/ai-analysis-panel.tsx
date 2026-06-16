"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Flame,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { stripMarkdown } from "@/lib/ai/sanitize";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { productById } from "@/lib/api-mock/enrichment";
import { formatIDR } from "@/lib/utils/format-idr";
import { cn } from "@/lib/utils";
import type { EnrichmentProduct, EnrichmentInsights } from "@/lib/types/enrichment";
import type { KnowledgeBase } from "@/lib/types/kb";

/** Aggregate the analyses on the client — fast for ~50 rows. */
function useInsights(): EnrichmentInsights {
  const analyses = usePipelineStore((s) => s.analyses);
  const products = usePipelineStore((s) => s.products);

  return useMemo(() => {
    const highPriorityCount = analyses.filter(
      (a) => a.temperature === "panas",
    ).length;
    const droppedCount = analyses.filter((a) => a.status === "berhenti").length;

    const penawaran = analyses.filter((a) => a.stage === "penawaran");
    const avgDaysInPenawaran =
      penawaran.length === 0
        ? 0
        : Math.round(
            penawaran.reduce((s, a) => s + a.daysInStage, 0) / penawaran.length,
          );
    // Compare against a "previous period" baseline (mocked: +3 days).
    const avgDaysInPenawaranDelta = avgDaysInPenawaranDeltaFor(avgDaysInPenawaran);

    // Tally matched products per segment.
    const segmentTallies: Record<string, Map<string, number>> = {
      UMKM: new Map(),
      Menengah: new Map(),
      Enterprise: new Map(),
    };
    for (const a of analyses) {
      for (const pid of a.matchedProducts) {
        const p = productById(pid, products);
        if (!p) continue;
        const m = segmentTallies[p.targetSegment];
        m.set(pid, (m.get(pid) ?? 0) + 1);
      }
    }
    const top = (segment: string): string | null => {
      const m = segmentTallies[segment];
      if (!m || m.size === 0) return null;
      let bestId: string | null = null;
      let bestN = -1;
      m.forEach((n, id) => {
        if (n > bestN) {
          bestN = n;
          bestId = id;
        }
      });
      return bestId;
    };

    return {
      highPriorityCount,
      droppedCount,
      avgDaysInPenawaran,
      avgDaysInPenawaranDelta,
      topProductIdForUMKM: top("UMKM"),
      topProductIdForEnterprise: top("Enterprise"),
    };
  }, [analyses, products]);
}

function avgDaysInPenawaranDeltaFor(current: number): number {
  // Deterministic baseline: previous period avg ~= current + 3.
  // (Negative delta = improvement.)
  return current - (current + 3);
}

/**
 * Draft a Bahasa Indonesia WhatsApp opener for a segment's top product.
 * Pulls real numbers from the product so the demo doesn't read as boilerplate.
 *
 * Kept as a local fallback used only when the `/api/draft-message` fetch fails
 * — happy-path drafts now come from the route (real LLM or server template).
 */
function draftMessage(product: EnrichmentProduct, segment: string): string {
  const sizeBand = product.targetCompanySize?.join(" / ") ?? "";
  return [
    `Halo Bapak/Ibu {nama},`,
    ``,
    `Kami melihat tim di {perusahaan} cocok dengan paket *${product.name}* — disusun khusus untuk perusahaan skala ${segment}${sizeBand ? ` (${sizeBand} karyawan)` : ""}.`,
    ``,
    `${product.description}`,
    ``,
    `Investasi mulai *${formatIDR(product.priceIDR)}*/bulan, dengan benefit:`,
    `• Onboarding 7 hari, didampingi tim sales kami`,
    `• Integrasi WhatsApp Business API + multi-channel`,
    `• Support lokal jam kerja WIB`,
    ``,
    `Boleh kami jadwalkan demo 20 menit minggu ini?`,
    ``,
    `Terima kasih,`,
    `Tim Maira Sales`,
  ].join("\n");
}

/** Source of the draft currently shown in the dialog. */
type DraftSource = "real" | "mock" | null;

/**
 * Call the draft-message route and update local dialog state. Centralised so
 * the initial open and "Generate ulang" share identical error handling.
 */
async function fetchDraft(args: {
  product: EnrichmentProduct;
  segment: string;
  kbSnapshot: KnowledgeBase;
  regenerate: boolean;
}): Promise<{ draft: string; source: DraftSource }> {
  const res = await fetch("/api/draft-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segment: args.segment,
      productName: args.product.name,
      productDescription: args.product.description,
      productPriceIDR: args.product.priceIDR,
      targetCompanySize: args.product.targetCompanySize,
      kbSnapshot: args.kbSnapshot,
      regenerate: args.regenerate,
    }),
  });
  if (!res.ok) {
    throw new Error(`draft-message ${res.status}`);
  }
  const data = (await res.json()) as { draft: string; source: "real" | "mock" };
  return { draft: data.draft, source: data.source };
}

export function AiAnalysisPanel() {
  const insights = useInsights();
  const products = usePipelineStore((s) => s.products);
  const kb = useKbStore((s) => s.kb);
  const topUMKM = insights.topProductIdForUMKM
    ? productById(insights.topProductIdForUMKM, products)
    : null;
  const topEnt = insights.topProductIdForEnterprise
    ? productById(insights.topProductIdForEnterprise, products)
    : null;

  // Per-segment "Generate pesan" dialog state.
  const [drafting, setDrafting] = useState<{
    product: EnrichmentProduct;
    segment: string;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [draftSource, setDraftSource] = useState<DraftSource>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  async function runDraft(
    product: EnrichmentProduct,
    segment: string,
    regenerate: boolean,
  ) {
    setLoadingDraft(true);
    setDraftSource(null);
    try {
      const { draft: nextDraft, source } = await fetchDraft({
        product,
        segment,
        kbSnapshot: kb,
        regenerate,
      });
      setDraft(nextDraft);
      setDraftSource(source);
    } catch (err) {
      console.error("[ai-analysis-panel] draft fetch failed", err);
      toast.error("Gagal memanggil AI. Memakai template demo.");
      setDraft(stripMarkdown(draftMessage(product, segment))); // doc 43 §1 — WA opener must be plain text
      setDraftSource("mock");
    } finally {
      setLoadingDraft(false);
    }
  }

  function openDraft(product: EnrichmentProduct, segment: string) {
    setDrafting({ product, segment });
    setDraft("");
    setDraftSource(null);
    // Fire the request in the background — the textarea shows a skeleton
    // until it resolves.
    void runDraft(product, segment, false);
  }

  function closeDraft() {
    setDrafting(null);
    setDraft("");
    setDraftSource(null);
    setLoadingDraft(false);
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b bg-gradient-to-r from-primary/8 via-tertiary/6 to-transparent px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Analisis AI</p>
            <p className="text-[11px] text-muted-foreground">
              Ringkasan otomatis dari data enrichment minggu ini.
            </p>
          </div>
        </div>

        <ul className="divide-y">
          <InsightRow
            icon={<Flame className="h-4 w-4" />}
            accent="#FB5E3B"
            title={
              <>
                <span className="tnum font-semibold">
                  {insights.highPriorityCount}
                </span>{" "}
                prospek prioritas tinggi minggu ini
              </>
            }
            sub="Skor AI ≥ 75 — fokus tim sales di sini dulu."
          />

          <InsightRow
            icon={<AlertTriangle className="h-4 w-4" />}
            accent="#94A3B8"
            title={
              <>
                <span className="tnum font-semibold">
                  {insights.droppedCount}
                </span>{" "}
                prospek berhenti — perlu re-engagement
              </>
            }
            sub="Tidak ada aktivitas > 14 hari. Coba pesan pendinginan via WhatsApp."
            tone="warn"
          />

          {/* UMKM recommendation + generate-message button */}
          <InsightRow
            icon={<Package className="h-4 w-4" />}
            accent="#14B8A6"
            title={
              topUMKM ? (
                <>
                  Produk paling cocok untuk segmen UMKM:{" "}
                  <span
                    className="font-semibold"
                    style={{ color: topUMKM.accent ?? undefined }}
                  >
                    {topUMKM.name}
                  </span>
                </>
              ) : (
                <>Belum cukup data untuk merekomendasikan produk UMKM.</>
              )
            }
            sub={
              topUMKM && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 gap-1.5 text-xs"
                  onClick={() => openDraft(topUMKM, "UMKM")}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Buat pesan untuk UMKM
                </Button>
              )
            }
          />

          {/* Enterprise recommendation + generate-message button */}
          <InsightRow
            icon={<Package className="h-4 w-4" />}
            accent="#FB5E3B"
            title={
              topEnt ? (
                <>
                  Produk paling cocok untuk segmen Enterprise:{" "}
                  <span
                    className="font-semibold"
                    style={{ color: topEnt.accent ?? undefined }}
                  >
                    {topEnt.name}
                  </span>
                </>
              ) : (
                <>Belum cukup data untuk merekomendasikan produk Enterprise.</>
              )
            }
            sub={
              topEnt && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 gap-1.5 text-xs"
                  onClick={() => openDraft(topEnt, "Enterprise")}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Buat pesan untuk Enterprise
                </Button>
              )
            }
          />

          <InsightRow
            icon={
              insights.avgDaysInPenawaranDelta < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )
            }
            accent="#14B8A6"
            title={
              <>
                Rata-rata waktu di tahap Penawaran:{" "}
                <span className="tnum font-semibold">
                  {insights.avgDaysInPenawaran} hari
                </span>
              </>
            }
          />
        </ul>
      </CardContent>

      {/* Draft message dialog — AI-generated WA opener per segment */}
      <Dialog
        open={drafting !== null}
        onOpenChange={(open) => !open && closeDraft()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Draf pesan AI — {drafting?.segment}
            </DialogTitle>
            <DialogDescription>
              Disusun otomatis dari data enrichment + harga produk. Ganti
              variabel <code className="rounded bg-muted px-1 text-[11px]">{`{nama}`}</code>{" "}
              dan <code className="rounded bg-muted px-1 text-[11px]">{`{perusahaan}`}</code>{" "}
              sebelum kirim, atau biarkan cadence yang mengisinya otomatis.
            </DialogDescription>
          </DialogHeader>

          {/* Source badge — coral when live Deepseek answered, muted on mock. */}
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 text-[11px]",
                draftSource === "real"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-muted-foreground/20 bg-muted text-muted-foreground",
              )}
            >
              <Sparkles className="h-3 w-3" />
              {draftSource === "real"
                ? "Live · AI"
                : draftSource === "mock"
                ? "Demo · template"
                : loadingDraft
                ? "Menyusun…"
                : "Demo · template"}
            </Badge>
            {loadingDraft && (
              <span className="text-[11px] text-muted-foreground">
                Menyusun pesan AI…
              </span>
            )}
          </div>

          {loadingDraft ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
              <div className="pt-1 text-[11px] text-muted-foreground">
                Menyusun pesan AI…
              </div>
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              className="font-mono text-xs leading-relaxed"
            />
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={loadingDraft || !draft}
              onClick={() => {
                navigator.clipboard?.writeText(draft);
                toast.success("Pesan disalin ke clipboard.");
              }}
            >
              <Copy className="h-4 w-4" />
              Salin
            </Button>
            <Button
              variant="outline"
              disabled={loadingDraft || !drafting}
              onClick={() => {
                if (!drafting) return;
                void runDraft(drafting.product, drafting.segment, true);
              }}
            >
              <Wand2 className="h-4 w-4" />
              Generate ulang
            </Button>
            <Button disabled={loadingDraft || !draft} onClick={() => closeDraft()}>
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InsightRow({
  icon,
  accent,
  title,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  accent: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        )}
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", tone === "warn" && "text-foreground")}>
          {title}
        </p>
        {sub && (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        )}
      </div>
    </li>
  );
}
