"use client";

import { Building2, CalendarClock, Trophy, UserRound } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
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
import { channelMeta } from "@/lib/utils/channel-config";
import { formatDateID } from "@/lib/utils/format-date-id";
import type { Deal, DealStage } from "@/lib/types";
import { toast } from "sonner";

const ACTIVITY = [
  { label: "Deal dibuat", when: "12 hari lalu" },
  { label: "Penawaran dikirim via email", when: "8 hari lalu" },
  { label: "Demo produk dilakukan", when: "5 hari lalu" },
  { label: "Negosiasi harga berlangsung", when: "1 hari lalu" },
];

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

              <Separator />

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Log aktivitas
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
              <Button variant="outline" className="flex-1">
                Kirim follow-up
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
