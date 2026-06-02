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
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} prospek
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
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
                className="cursor-pointer"
                onClick={() => open(deal)}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      name={deal.contactName}
                      color={deal.avatarColor}
                      className="h-8 w-8 text-[11px]"
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
                  <Badge variant="secondary" className="font-normal">
                    {STAGE_LABEL[analysis.stage] ?? analysis.stage}
                  </Badge>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {analysis.daysInStage} hari di tahap
                  </p>
                </TableCell>
                <TableCell>
                  {analysis.status === "aktif" ? (
                    <Badge variant="success" className="gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      Aktif
                    </Badge>
                  ) : (
                    <Badge variant="muted" className="gap-1.5">
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
                  <p className="flex items-start gap-1.5 text-xs text-tertiary">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2 text-foreground/80">
                      {analysis.aiSuggestion}
                    </span>
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {analysis.matchedProducts.map((pid) => {
                      const p = productById(pid, products);
                      if (!p) return null;
                      return (
                        <span
                          key={pid}
                          title={p.description}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            borderColor: p.accent ? `${p.accent}55` : undefined,
                            color: p.accent ?? "inherit",
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: p.accent ?? "#64748B" }}
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
