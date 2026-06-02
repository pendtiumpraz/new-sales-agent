"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  HeartHandshake,
  Repeat2,
  Sparkles,
  Users,
} from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FLOW_STATUS_LABEL,
  FLOW_TYPE_LABEL,
} from "@/lib/stores/retention-store";
import type { RetentionFlow } from "@/lib/types/retention";
import { cn } from "@/lib/utils";

const TYPE_ICON = {
  "repeat-order": Repeat2,
  upsell: Sparkles,
  "after-sales": HeartHandshake,
} as const;

const TYPE_ACCENT = {
  "repeat-order": "#FB5E3B",
  upsell: "#F59E0B",
  "after-sales": "#14B8A6",
} as const;

/** A single retention flow card on the dashboard. */
export function FlowCard({ flow }: { flow: RetentionFlow }) {
  const Icon = TYPE_ICON[flow.type];
  const accent = TYPE_ACCENT[flow.type];
  const typeMeta = FLOW_TYPE_LABEL[flow.type];
  const statusMeta = FLOW_STATUS_LABEL[flow.status];
  const channelsUsed = Array.from(
    new Set(flow.steps.map((s) => s.channel)),
  );

  return (
    <Card className="h-full transition-shadow hover:shadow-sm">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            <Badge variant={typeMeta.variant} className="font-normal">
              {typeMeta.label}
            </Badge>
          </div>
        </div>

        <h3 className="mt-3 font-semibold leading-snug">{flow.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {flow.description}
        </p>

        <div className="mt-3 flex items-center gap-1.5">
          {channelsUsed.map((ch) => (
            <ChannelDot key={ch} channel={ch} size={8} />
          ))}
          <span className="text-xs text-muted-foreground">
            {flow.steps.length} langkah
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="tnum">{flow.enrolled}</span> terdaftar
          </span>
          <span
            className={cn(
              "tnum font-medium",
              flow.conversionRate >= 30 ? "text-tertiary" : "text-foreground",
            )}
          >
            {flow.conversionRate}% konversi
          </span>
        </div>

        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href={`/retention/${flow.id}`}>
            Kelola
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
