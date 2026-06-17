"use client";

import {
  Activity,
  Archive,
  Building2,
  CalendarClock,
  Flame,
  Package,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STAGES, usePipelineStore } from "@/lib/stores/pipeline-store";
import { productById } from "@/lib/api-mock/enrichment";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatDateID } from "@/lib/utils/format-date-id";
import { formatIDR } from "@/lib/utils/format-idr";
import { cn } from "@/lib/utils";
import type { Deal, DealStage } from "@/lib/types";
import { toast } from "sonner";

const TEMP_PILL: Record<string, { label: string; cls: string }> = {
  panas: {
    label: "Panas",
    cls: "bg-primary/10 text-primary border-primary/30",
  },
  hangat: {
    label: "Hangat",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
  },
  dingin: {
    label: "Dingin",
    cls: "bg-sky-100 text-sky-700 border-sky-200",
  },
};

const ACTIVITY = [
  { label: "Deal dibuat", when: "12 hari lalu" },
  { label: "Penawaran dikirim via email", when: "8 hari lalu" },
  { label: "Demo produk dilakukan", when: "5 hari lalu" },
  { label: "Negosiasi harga berlangsung", when: "1 hari lalu" },
];

const AI_ACTION: Record<DealStage, string> = {
  prospek: "Kirim pesan pembuka WhatsApp dan tawarkan demo 15 menit.",
  kualifikasi: "Telepon untuk konfirmasi anggaran & timeline pembelian.",
  penawaran: "Follow up penawaran dalam 48 jam + lampirkan studi kasus sejenis.",
  negosiasi: "Tawarkan diskon tahunan dan jadwalkan closing call minggu ini.",
  tutup: "Kirim materi onboarding dan minta referral ke 2 kontak.",
};

export function DealDetailSheet({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const moveDeal = usePipelineStore((s) => s.moveDeal);
  const archiveDeal = usePipelineStore((s) => s.archiveDeal);
  const analyses = usePipelineStore((s) => s.analyses);
  const products = usePipelineStore((s) => s.products);

  // Pull the enrichment analysis for the open deal — exposes the same
  // matched products + AI priority that the Enrichment table column shows,
  // but with full product detail (description + price + target segment) so
  // the user has everything in one card.
  const analysis = deal
    ? analyses.find((a) => a.dealId === deal.id) ?? null
    : null;
  const matchedProducts = analysis
    ? analysis.matchedProducts
        .map((pid) => productById(pid, products))
        .filter((p): p is NonNullable<ReturnType<typeof productById>> => Boolean(p))
    : [];
  const tempMeta = analysis ? TEMP_PILL[analysis.temperature] ?? null : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
        {deal && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-1.5">
                <ChannelDot channel={deal.sourceChannel} size={8} />
                <span className="text-xs text-muted-foreground">
                  Sumber: {channelMeta(deal.sourceChannel).label}
                </span>
              </div>
              <SheetTitle>{deal.name}</SheetTitle>
              <IDRAmount value={deal.value} className="text-2xl font-semibold text-primary" />
            </SheetHeader>

            <div className="space-y-5 p-6">
              <div className="grid gap-3 text-sm">
                <Row icon={UserRound} label="Kontak" value={deal.contactName} />
                <Row icon={Building2} label="Perusahaan" value={deal.company} />
                <Row
                  icon={CalendarClock}
                  label="Perkiraan closing"
                  value={formatDateID(deal.expectedClose)}
                />
                <Row icon={UserRound} label="Pemilik" value={deal.owner} />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tahap
                </p>
                <Select
                  value={deal.stage}
                  onValueChange={(v) => {
                    moveDeal(deal.id, v as DealStage);
                    toast.success(
                      `${deal.name} dipindahkan ke ${STAGES.find((s) => s.key === v)?.label}.`,
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                className="w-full justify-center text-destructive hover:text-destructive"
                onClick={() => {
                  void archiveDeal(deal.id);
                  toast.success(`${deal.name} diarsipkan`);
                  onOpenChange(false);
                }}
              >
                <Archive className="h-4 w-4" /> Arsipkan deal
              </Button>

              <div className="rounded-xl border border-tertiary/30 bg-tertiary/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-tertiary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Saran aksi per tahap
                </p>
                <p className="mt-1 text-sm">{AI_ACTION[deal.stage]}</p>
              </div>

              {/* Enrichment summary — matched products + AI priority. Mirrors
                  the dot column in the Enrichment table, expanded here so the
                  user sees the full pitch context for the deal. */}
              {analysis && (
                <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-tertiary/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Package className="h-3.5 w-3.5" />
                      Produk direkomendasikan AI
                    </p>
                    <div className="flex items-center gap-1.5">
                      {tempMeta && (
                        <Badge
                          variant="outline"
                          className={cn("gap-1 text-[10px]", tempMeta.cls)}
                        >
                          {analysis.temperature === "panas" && (
                            <Flame className="h-3 w-3" />
                          )}
                          {tempMeta.label}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="tnum gap-1 border-tertiary/30 bg-tertiary/10 text-[10px] text-tertiary"
                      >
                        <Activity className="h-3 w-3" />
                        Skor {analysis.priorityScore}
                      </Badge>
                    </div>
                  </div>

                  {matchedProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Belum ada produk yang cocok dengan profil prospek ini.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {matchedProducts.map((p, idx) => {
                        const accent =
                          p.accent ??
                          ["#FB5E3B", "#14B8A6", "#F59E0B", "#0EA5E9"][idx % 4];
                        return (
                          <li
                            key={p.id}
                            className="flex items-start gap-2 rounded-lg border bg-card p-2.5"
                            style={{ borderColor: `${accent}40` }}
                          >
                            <span
                              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                              style={{ backgroundColor: accent }}
                            >
                              <Package className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-semibold">
                                  {p.name}
                                </p>
                                <span
                                  className="tnum shrink-0 text-xs font-medium"
                                  style={{ color: accent }}
                                >
                                  {formatIDR(p.priceIDR)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                {p.description}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge variant="muted" className="text-[10px]">
                                  {p.targetSegment}
                                </Badge>
                                {p.targetCompanySize?.slice(0, 2).map((band) => (
                                  <span
                                    key={band}
                                    className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {band} karyawan
                                  </span>
                                ))}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {analysis.aiSuggestion && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-tertiary/8 p-2 text-[11px] leading-snug text-foreground/85">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-tertiary" />
                      <span>
                        <span className="font-semibold text-tertiary">
                          Saran AI:
                        </span>{" "}
                        {analysis.aiSuggestion}
                      </span>
                    </p>
                  )}
                </div>
              )}

              <Separator />

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Log aktivitas <span className="normal-case text-muted-foreground/60">(contoh)</span>
                </p>
                <ol className="space-y-3">
                  {ACTIVITY.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        {i < ACTIVITY.length - 1 && (
                          <span className="mt-1 h-full w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className="-mt-0.5 pb-1">
                        <p className="text-sm">{a.label}</p>
                        <p className="text-xs text-muted-foreground">{a.when}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t bg-card p-4">
              <Button
                className="flex-1"
                onClick={() => {
                  moveDeal(deal.id, "tutup");
                  toast.success(`Selamat! ${deal.name} ditandai menang.`);
                  onOpenChange(false);
                }}
              >
                <Trophy className="h-4 w-4" />
                Tandai menang
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
