"use client";

import { Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
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

/** Kandidat re-engagement — feeds the dashboard table. */
export function CandidateTable() {
  const candidates = useRetentionStore((s) => s.candidates);
  const enroll = useRetentionStore((s) => s.enrollCandidate);

  if (candidates.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-muted-foreground">
        Tidak ada kandidat menunggu — pelanggan sudah terdaftar di alur yang
        sesuai.
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
          <TableRow>
            <TableHead className="min-w-[220px]">Pelanggan</TableHead>
            <TableHead className="hidden lg:table-cell">Pembelian terakhir</TableHead>
            <TableHead className="text-center">Selisih</TableHead>
            <TableHead>Alur disarankan AI</TableHead>
            <TableHead className="w-[120px] text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((c) => (
            <TableRow key={c.contactId}>
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
                  variant={
                    c.daysSincePurchase >= 30 ? "warning" : "muted"
                  }
                  className="tnum"
                >
                  {c.daysSincePurchase} hari
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
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
                  onClick={() =>
                    onEnroll(c.contactId, c.contactName, c.recommendedFlowName)
                  }
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Daftarkan
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
