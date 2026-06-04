"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Inline KPI tile for the Retention dashboard — same visual rhythm as the
 * dashboard `StatTile` but local to this module so we don't reach into
 * private components from `app/(app)/dashboard/page.tsx`.
 */
export function RetentionStatTile({
  icon,
  accent,
  label,
  value,
  sub,
  delta,
  loading,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Signed % change vs. previous period. */
  delta?: number;
  loading?: boolean;
}) {
  const hasDelta = typeof delta === "number";
  const positive = hasDelta && delta! >= 0;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1A`, color: accent }}
          >
            {icon}
          </span>
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                positive
                  ? "bg-success/10 text-emerald-700"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {positive ? "+" : ""}
              {delta}%
            </span>
          ) : (
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/30" />
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-24" />
        ) : (
          <p className="tnum mt-1 text-2xl font-semibold tracking-tight">
            {value}
          </p>
        )}
        {sub && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}
