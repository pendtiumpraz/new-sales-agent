"use client";

import { type ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/components/dashboard/use-count-up";
import { cn } from "@/lib/utils";

// Shared KPI tile — one component replacing the per-page copies (dashboard,
// reports ×2, retention). Per the redesign system: label + big value + 1-line
// context, optional count-up, NO fabricated delta. Use inside <KpiStrip> (max 4).
export interface KpiTileProps {
  /** Small icon node (lucide), shown in an accent chip. Optional. */
  icon?: ReactNode;
  /** Hex accent for the icon chip (default coral). */
  accent?: string;
  label: string;
  /** Static value (string/node). Ignored when `count` is provided. */
  value?: ReactNode;
  /** When set, animates a count-up to this number (overrides `value`). */
  count?: number;
  suffix?: string;
  decimals?: number;
  /** One-line context (e.g. "bulan ini", "prospek → tutup"). No fake deltas. */
  sub?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function KpiTile({
  icon,
  accent = "#FB5E3B",
  label,
  value,
  count,
  suffix,
  decimals = 0,
  sub,
  loading,
  className,
}: KpiTileProps) {
  // Hook called unconditionally; duration 0 when not counting (static mode).
  const animated = useCountUp(count ?? 0, count != null ? 900 : 0);
  const display =
    count != null
      ? `${decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toLocaleString("id-ID")}${suffix ?? ""}`
      : value;

  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardContent className="flex h-full flex-col p-5">
        {icon && (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
        )}
        <p className={cn("text-sm text-muted-foreground", icon && "mt-4")}>{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-20" />
        ) : (
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{display}</p>
        )}
        {sub != null && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** KPI strip — responsive grid, max 4 tiles per the redesign system. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}
