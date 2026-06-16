"use client";

import { useState } from "react";
import { HeartHandshake, Repeat2, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { TablePagination } from "@/components/shared/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRetentionStore } from "@/lib/stores/retention-store";
import { formatDayMonthID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

/** Map a recommended flow id to its type-color, so the cell visually matches
 *  the corresponding FlowCard accent on the same page. */
function flowAccent(
  flowId: string,
  flowName: string,
): { className: string; Icon: typeof Sparkles } {
  const lower = `${flowId} ${flowName}`.toLowerCase();
  if (lower.includes("upsell")) {
    return {
      className: "bg-warning/15 text-warning ring-warning/30",
      Icon: Sparkles,
    };
  }
  if (lower.includes("after") || lower.includes("nps")) {
    return {
      className: "bg-tertiary/10 text-tertiary ring-tertiary/20",
      Icon: HeartHandshake,
    };
  }
  return {
    className: "bg-primary/10 text-primary ring-primary/20",
    Icon: Repeat2,
  };
}

/** Kandidat re-engagement — feeds the dashboard table. */
export function CandidateTable() {
  const candidates = useRetentionStore((s) => s.candidates);
  const enroll = useRetentionStore((s) => s.enrollCandidate);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;
  const visible = candidates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary/10 text-tertiary">
          <HeartHandshake className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-medium">Semua kandidat sudah terdaftar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pelanggan sudah masuk alur retensi yang sesuai — AI akan mendeteksi
            kandidat baru otomatis.
          </p>
        </div>
      </div>
    );
  }

  function onEnroll(contactId: string, name: string, flow: string) {
    enroll(contactId);
    toast.success(`${name} didaftarkan ke "${flow}"`);
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-[220px]">Pelanggan</TableHead>
            <TableHead className="hidden lg:table-cell">
              Pembelian terakhir
            </TableHead>
            <TableHead className="text-center">Selisih</TableHead>
            <TableHead>Alur disarankan AI</TableHead>
            <TableHead className="w-[120px] text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c, i) => {
            const accent = flowAccent(c.recommendedFlowId, c.recommendedFlowName);
            const FlowIcon = accent.Icon;
            return (
              <TableRow
                key={c.contactId}
                className={cn(
                  "transition-colors",
                  // Zebra tint — warm/peach on odd rows for warmth
                  i % 2 === 1 && "bg-primary/[0.025]",
                  "hover:bg-primary/[0.06]",
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar name={c.contactName} className="h-8 w-8" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.contactName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.company}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {formatDayMonthID(c.lastPurchase)}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={c.daysSincePurchase >= 30 ? "warning" : "muted"}
                    className="tnum"
                  >
                    {c.daysSincePurchase} hari
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                        accent.className,
                      )}
                    >
                      <FlowIcon className="h-3 w-3" />
                      {c.recommendedFlowName}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {c.aiNote}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() =>
                      onEnroll(c.contactId, c.contactName, c.recommendedFlowName)
                    }
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Daftarkan
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="border-t bg-card px-4 pb-3 pt-1">
        <TablePagination
          page={page}
          pageSize={PAGE_SIZE}
          total={candidates.length}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          label="kandidat"
        />
      </div>
    </div>
  );
}
