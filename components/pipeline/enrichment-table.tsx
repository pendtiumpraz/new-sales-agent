"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { TempBadge } from "@/components/shared/temp-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { DealDetailSheet } from "@/components/pipeline/deal-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePagination } from "@/components/shared/table-pagination";
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

export function EnrichmentTable({ workspaceId }: { workspaceId?: string | null }) {
  const deals = usePipelineStore((s) => s.deals);
  const analyses = usePipelineStore((s) => s.analyses);
  const products = usePipelineStore((s) => s.products);
  const refreshDeals = usePipelineStore((s) => s.refreshDeals);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false); // doc 49 — Arsip view
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

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
    // Scope to the active workspace (doc 44) like the Kanban + hero.
    if (workspaceId) {
      list = list.filter((r) => (r.deal as { workspaceId?: string | null }).workspaceId === workspaceId);
    }
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
  }, [deals, analyses, status, search, workspaceId]);

  // Reset to the first page whenever the filter/search shrinks the result
  // set — otherwise the user can land on an empty page.
  const totalRows = rows.length;
  const visibleRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [rows, page],
  );
  useEffect(() => {
    if (page > 0 && page * PAGE_SIZE >= totalRows) setPage(0);
  }, [page, totalRows]);

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
        <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {showArchived ? "Lihat aktif" : "Lihat arsip"}
        </Button>
      </div>

      {showArchived ? (
        <ArchivedDealsPanel onRestored={refreshDeals} />
      ) : (
      <>
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
            {visibleRows.map(({ deal, analysis }) => (
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
                  {/* Colored dots only — hover to see the product names.
                      Cleaner than chips when a deal matches 2-3 products. */}
                  {analysis.matchedProducts.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 rounded-full border border-transparent px-1.5 py-1 transition-all hover:border-primary/30 hover:bg-primary/5"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(deal);
                          }}
                          aria-label={`${analysis.matchedProducts.length} produk cocok`}
                        >
                          {analysis.matchedProducts.slice(0, 4).map((pid, idx) => {
                            const p = productById(pid, products);
                            const accent =
                              p?.accent ??
                              PRODUCT_ACCENT_FALLBACK[
                                idx % PRODUCT_ACCENT_FALLBACK.length
                              ];
                            return (
                              <span
                                key={pid}
                                className="h-2.5 w-2.5 rounded-full ring-2 ring-card"
                                style={{ backgroundColor: accent }}
                              />
                            );
                          })}
                          {analysis.matchedProducts.length > 4 && (
                            <span className="ml-1 tnum text-[10px] font-medium text-muted-foreground">
                              +{analysis.matchedProducts.length - 4}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                          Produk cocok
                        </p>
                        <ul className="space-y-0.5 text-xs">
                          {analysis.matchedProducts.map((pid, idx) => {
                            const p = productById(pid, products);
                            if (!p) return null;
                            const accent =
                              p.accent ??
                              PRODUCT_ACCENT_FALLBACK[
                                idx % PRODUCT_ACCENT_FALLBACK.length
                              ];
                            return (
                              <li
                                key={pid}
                                className="flex items-center gap-1.5"
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: accent }}
                                />
                                <span className="font-medium">{p.name}</span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="pt-1 text-[10px] italic text-muted-foreground">
                          Klik untuk lihat detail deal
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRows}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
        label="prospek"
      />
      </>
      )}

      <DealDetailSheet
        deal={openDeal}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

// Arsip view (doc 49): soft-deleted deals fetched directly (they're excluded from
// the store) with one-click restore back to the active board.
function ArchivedDealsPanel({ onRestored }: { onRestored: () => void }) {
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/db/deals?archived=1");
      const j = (await r.json()) as { data: Deal[] };
      setRows(Array.isArray(j?.data) ? j.data : []);
    } catch {
      setRows([]);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function restore(id: string, name: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/data/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "deal", id, restore: true }) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error ?? "gagal");
      toast.success(`${name} dipulihkan`);
      setRows((rs) => (rs ?? []).filter((d) => d.id !== id));
      onRestored();
    } catch {
      toast.error("Gagal memulihkan");
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) return <p className="py-8 text-center text-sm text-muted-foreground">Memuat arsip…</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">Arsip kosong.</p>;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Deal</TableHead>
            <TableHead>Perusahaan</TableHead>
            <TableHead>Tahap</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.id} className="even:bg-muted/20">
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-muted-foreground">{d.company}</TableCell>
              <TableCell className="text-muted-foreground">{STAGE_LABEL[d.stage] ?? d.stage}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => restore(d.id, d.name)}>
                  <RotateCcw className="h-3.5 w-3.5" /> {busy === d.id ? "…" : "Pulihkan"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
