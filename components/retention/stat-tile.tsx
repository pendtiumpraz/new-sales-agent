"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Inline KPI tile for the Retention dashboard — same visual rhythm as the
 * dashboard `StatTile` but local to this module so we don't reach into
 * private components from `app/(app)/dashboard/page.tsx`.
 *
 * Tiles use an accent-tinted gradient backdrop so they feel alive even
 * before the user reads the number. A faint corner halo (radial-gradient
 * blob using the same accent hex) adds depth without noise.
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
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_12px_28px_-12px_rgba(251,94,59,0.35)] hover:ring-1 hover:ring-primary/15",
      )}
      style={{
        // Subtle accent-tinted background; alpha kept tiny so foreground text
        // stays WCAG-AA compliant against the warm-white canvas.
        background: `linear-gradient(135deg, ${accent}0D 0%, hsl(var(--card)) 55%, ${accent}14 100%)`,
        borderColor: `${accent}33`,
      }}
    >
      {/* Soft corner halo using the same accent — sits below content */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
        style={{
          background: `radial-gradient(circle at center, ${accent}26, transparent 70%)`,
        }}
      />
      <CardContent className="relative flex h-full flex-col p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 ease-out group-hover:scale-105"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            {icon}
          </span>
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                positive
                  ? "bg-success/15 text-emerald-700"
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
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary/60" />
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
