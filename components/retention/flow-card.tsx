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

// Each flow type gets its own coral / amber / teal accent. Hex powers the
// dynamic styles below; the matching Tailwind classes keep the rest of the
// card consistent with the design system tokens.
const TYPE_ACCENT = {
  "repeat-order": {
    hex: "#FB5E3B", // coral / primary
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    barClass: "bg-primary",
  },
  upsell: {
    hex: "#F59E0B", // amber
    bgClass: "bg-warning/15",
    textClass: "text-warning",
    barClass: "bg-warning",
  },
  "after-sales": {
    hex: "#14B8A6", // teal / tertiary
    bgClass: "bg-tertiary/10",
    textClass: "text-tertiary",
    barClass: "bg-tertiary",
  },
} as const;

/** Enrollment cap used to render the progress bar. Demo-only heuristic. */
const ENROLLMENT_CAP = 200;

/** A single retention flow card on the dashboard. */
export function FlowCard({ flow }: { flow: RetentionFlow }) {
  const Icon = TYPE_ICON[flow.type];
  const accent = TYPE_ACCENT[flow.type];
  const typeMeta = FLOW_TYPE_LABEL[flow.type];
  const statusMeta = FLOW_STATUS_LABEL[flow.status];
  const channelsUsed = Array.from(
    new Set(flow.steps.map((s) => s.channel)),
  );
  const pct = Math.min(100, Math.round((flow.enrolled / ENROLLMENT_CAP) * 100));
  const isActive = flow.status === "aktif";

  return (
    <Card
      className={cn(
        "group relative h-full overflow-hidden transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_12px_28px_-12px_rgba(251,94,59,0.35)] hover:ring-1 hover:ring-primary/15",
      )}
      style={{
        background: `linear-gradient(135deg, ${accent.hex}10 0%, hsl(var(--card)) 60%, ${accent.hex}1A 100%)`,
        borderColor: `${accent.hex}33`,
      }}
    >
      {/* Top type-tinted strip */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${accent.hex}cc, ${accent.hex}33)`,
        }}
      />
      {/* Corner halo */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-95"
        style={{
          background: `radial-gradient(circle at center, ${accent.hex}26, transparent 70%)`,
        }}
      />

      <CardContent className="relative flex h-full flex-col p-5 pt-6">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 ease-out group-hover:scale-105",
              accent.bgClass,
              accent.textClass,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex flex-col items-end gap-1">
            {/* Status pill — prominent dot + label */}
            <Badge
              variant={statusMeta.variant}
              className="gap-1.5 px-2.5 py-0.5"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive
                    ? "bg-success animate-pulse"
                    : flow.status === "jeda"
                      ? "bg-warning"
                      : "bg-muted-foreground/40",
                )}
              />
              {statusMeta.label}
            </Badge>
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
            <ChannelDot key={ch} channel={ch} size={9} />
          ))}
          <span className="text-xs text-muted-foreground">
            <span className="tnum font-medium text-foreground">
              {flow.steps.length}
            </span>{" "}
            langkah
          </span>
        </div>

        {/* Enrollment progress bar — colored by flow type */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="tnum font-medium text-foreground">
                {flow.enrolled}
              </span>{" "}
              dari {ENROLLMENT_CAP} kuota
            </span>
            <span className="tnum">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                accent.barClass,
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="tnum font-medium text-foreground">
              {flow.enrolled}
            </span>
            <span className="text-xs">terdaftar</span>
          </span>
          <span
            className={cn(
              "tnum font-semibold",
              flow.conversionRate >= 30 ? "text-tertiary" : "text-foreground",
            )}
          >
            {flow.conversionRate}% konversi
          </span>
        </div>

        <Button asChild variant="outline" size="sm" className="mt-3 group/btn">
          <Link href={`/retention/${flow.id}`}>
            Kelola
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
