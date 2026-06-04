"use client";

import { useMemo } from "react";
import {
  Activity,
  Clock,
  Flame,
  PauseCircle,
  Snowflake,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { IDRAmount } from "@/components/shared/idr-amount";
import { usePipelineStore, STAGES } from "@/lib/stores/pipeline-store";
import { cn } from "@/lib/utils";
import type { AiTemp, Deal, DealStage } from "@/lib/types";

interface EnrichmentStageCardProps {
  deal: Deal | null;
}

const TEMP_META: Record<AiTemp, { label: string; cls: string; icon: typeof Flame }> = {
  panas: { label: "Panas", cls: "bg-primary/10 text-primary", icon: Flame },
  hangat: { label: "Hangat", cls: "bg-warning/15 text-amber-700", icon: TrendingUp },
  dingin: { label: "Dingin", cls: "bg-sky-500/10 text-sky-700", icon: Snowflake },
};

/**
 * Right-rail card surfacing enrichment context for the linked deal AND the
 * interactive stage selector (the "pipeline status editable from chat"
 * requirement in §2). Calls `pipeline-store.moveDeal` directly — store stays
 * the single source of truth.
 */
export function EnrichmentStageCard({ deal }: EnrichmentStageCardProps) {
  const analyses = usePipelineStore((s) => s.analyses);
  const moveDeal = usePipelineStore((s) => s.moveDeal);
  // Reactively pick the latest deal record so stage moves are reflected here.
  const liveDeal = usePipelineStore((s) =>
    deal ? s.deals.find((d) => d.id === deal.id) ?? deal : null,
  );

  const analysis = useMemo(
    () => (liveDeal ? analyses.find((a) => a.dealId === liveDeal.id) ?? null : null),
    [analyses, liveDeal],
  );

  if (!liveDeal) {
    return (
      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tahap Enrichment
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Belum ada deal terkait untuk kontak ini. Mulai percakapan atau buat
          deal baru untuk mengaktifkan enrichment.
        </p>
      </Card>
    );
  }

  const status = analysis?.status ?? "aktif";
  const temp = analysis?.temperature ?? "dingin";
  const tempMeta = TEMP_META[temp];

  function handleMove(next: DealStage) {
    if (!liveDeal) return;
    if (next === liveDeal.stage) return;
    moveDeal(liveDeal.id, next);
    const label = STAGES.find((s) => s.key === next)?.label ?? next;
    toast.success(`Tahap diperbarui ke "${label}".`);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tahap Enrichment
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            status === "aktif"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600",
          )}
          title={status === "aktif" ? "Masih aktif" : "Berhenti > 14 hari"}
        >
          {status === "aktif" ? (
            <Activity className="h-3 w-3" />
          ) : (
            <PauseCircle className="h-3 w-3" />
          )}
          {status === "aktif" ? "Aktif" : "Berhenti"}
        </span>
      </div>

      <div className="space-y-2 p-4">
        <p className="truncate text-sm font-semibold">{liveDeal.name}</p>
        <IDRAmount
          value={liveDeal.value}
          className="text-sm font-semibold text-primary"
        />
      </div>

      <Separator />

      {/* Stage chips — clickable */}
      <div className="space-y-2 p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Geser tahap pipeline
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => {
            const active = s.key === liveDeal.stage;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleMove(s.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* AI score + days in stage */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Skor prioritas AI
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                tempMeta.cls,
              )}
            >
              <tempMeta.icon className="h-3 w-3" />
              <span className="tnum">{analysis?.priorityScore ?? "—"}</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              {tempMeta.label}
            </span>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Lama di tahap
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="tnum">{analysis?.daysInStage ?? 0}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              hari
            </span>
          </p>
        </div>
      </div>

      {analysis?.aiSuggestion && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Saran AI untuk tahap ini
            </p>
            <p className="mt-1 text-[11px] leading-snug text-foreground">
              {analysis.aiSuggestion}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
