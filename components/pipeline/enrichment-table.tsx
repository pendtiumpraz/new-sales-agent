"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";

import { TempBadge } from "@/components/shared/temp-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { DealDetailSheet } from "@/components/pipeline/deal-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STAGES, usePipelineStore } from "@/lib/stores/pipeline-store";
import { productById } from "@/lib/api-mock/enrichment";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import type {
  EnrichmentActivityStatus,
  EnrichmentDealAnalysis,
} from "@/lib/types/enrichment";

type StatusFilter = "all" | EnrichmentActivityStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "aktif", label: "Aktif" },
  { key: "berhenti", label: "Berhenti" },
];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.label]),
);

// Per-stage color tints — keeps the Coral Sunset language consistent.
// prospek=muted slate, kualifikasi=info-blue, penawaran=amber, negosiasi=coral,
// tutup=success-green. Used for the stage pill in the table + workspace.
const STAGE_PILL: Record<string, string> = {
  prospek: "border-slate-300/70 bg-slate-100 text-slate-700",
  kualifikasi: "border-sky-300/70 bg-sky-100 text-sky-700",
  penawaran: "border-amber-300/70 bg-amber-100 text-amber-800",
  negosiasi: "border-primary/40 bg-primary/10 text-primary",
  tutup: "border-emerald-300/70 bg-emerald-100 text-emerald-700",
};

// Fallback accents for product chips when a product has no `accent` set.
// Rotates coral → teal → amber so the chips visibly punctuate the row.
const PRODUCT_ACCENT_FALLBACK = ["#FB5E3B", "#14B8A6", "#F59E0B"];

export function EnrichmentTable() {
  const deals = usePipelineStore((s) => s.deals);
  const analyses = usePipelineStore((s) => s.analyses);
  const products = usePipelineStore((s) => s.products);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Join deals with their analyses, then filter/sort.
  const rows = useMemo(() => {
    const byDealId = new Map<string, EnrichmentDealAnalysis>(
      analyses.map((a) => [a.dealId, a]),
    );
    let list = deals
      .map((d) => ({ deal: d, analysis: byDealId.get(d.id) }))
      .filter(
        (r): r is { deal: Deal; analysis: EnrichmentDealAnalysis } =>
          !!r.analysis,
      );
    if (status !== "all") {
      list = list.filter((r) => r.analysis.status === status);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.deal.contactName.toLowerCase().includes(q) ||
          r.deal.company.toLowerCase().includes(q) ||
          r.deal.name.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.analysis.priorityScore - a.analysis.priorityScore);
  }, [deals, analyses, status, search]);

  function open(deal: Deal) {
    setOpenDeal(deal);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari prospek, perusahaan, atau deal..."
            className="pl-8"
          />
        </div>
        {STATUS_FILTERS.map((f) => {
          const isActive = status === f.key;
          const activeAccent =
            f.key === "aktif"
              ? "border-emerald-300 bg-emerald-100 text-emerald-700"
              : f.key === "berhenti"
                ? "border-slate-300 bg-slate-100 text-slate-700"
                : "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(251,94,59,0.55)]";
          return (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                isActive
                  ? activeAccent
                  : "bg-card text-muted-foreground hover:-translate-y-px hover:text-foreground hover:shadow-sm",
              )}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} prospek
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-primary/10 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-primary/10 bg-gradient-to-r from-primary/5 via-tertiary/4 to-transparent hover:bg-transparent">
              <TableHead>Prospek</TableHead>
              <TableHead>Tahap</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Skor AI</TableHead>
              <TableHead>Saran AI</TableHead>
              <TableHead>Produk cocok</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Tidak ada prospek yang cocok dengan filter ini.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ deal, analysis }) => (
              <TableRow
                key={deal.id}
                className="group cursor-pointer transition-all duration-150 even:bg-muted/20 hover:bg-primary/5 hover:shadow-[inset_3px_0_0_0_rgba(251,94,59,0.7)] active:scale-[0.998]"
                onClick={() => open(deal)}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      name={deal.contactName}
                      color={deal.avatarColor}
                      className="h-8 w-8 text-[11px] ring-2 ring-transparent transition-shadow group-hover:ring-primary/30"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{deal.contactName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {deal.company}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                      STAGE_PILL[analysis.stage] ?? STAGE_PILL.prospek,
                    )}
                  >
                    {STAGE_LABEL[analysis.stage] ?? analysis.stage}
                  </span>
                  <p
                    className={cn(
                      "mt-1 text-[11px]",
                      analysis.daysInStage > 7
                        ? "font-medium text-amber-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {analysis.daysInStage} hari di tahap
                  </p>
                </TableCell>
                <TableCell>
                  {analysis.status === "aktif" ? (
                    <Badge variant="success" className="gap-1.5 border border-emerald-300/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shadow-[0_0_0_2px_rgba(16,185,129,0.18)]" />
                      Aktif
                    </Badge>
                  ) : (
                    <Badge variant="muted" className="gap-1.5 border border-slate-300/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                      Berhenti
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <TempBadge
                    score={analysis.priorityScore}
                    temp={analysis.temperature}
                  />
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <p className="flex items-start gap-1.5 text-xs">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-tertiary" />
                    <span className="line-clamp-2 text-foreground/80">
                      {analysis.aiSuggestion}
                    </span>
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {analysis.matchedProducts.map((pid, idx) => {
                      const p = productById(pid, products);
                      if (!p) return null;
                      const accent =
                        p.accent ??
                        PRODUCT_ACCENT_FALLBACK[
                          idx % PRODUCT_ACCENT_FALLBACK.length
                        ];
                      return (
                        <span
                          key={pid}
                          title={p.description}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-shadow hover:shadow-sm"
                          style={{
                            borderColor: `${accent}55`,
                            backgroundColor: `${accent}12`,
                            color: accent,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          {p.name}
                        </span>
                      );
                    })}
                    {analysis.matchedProducts.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DealDetailSheet
        deal={openDeal}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
