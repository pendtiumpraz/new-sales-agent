import { formatIDR, formatIDRCompact } from "@/lib/utils/format-idr";
import { cn } from "@/lib/utils";

interface IDRAmountProps {
  value: number;
  compact?: boolean;
  className?: string;
}

/** Tabular-figure IDR amount (build.md §3.2 — never below 14px, tnum). */
export function IDRAmount({ value, compact = false, className }: IDRAmountProps) {
  return (
    <span className={cn("tnum tabular-nums", className)}>
      {compact ? formatIDRCompact(value) : formatIDR(value)}
    </span>
  );
}
