import { cn } from "@/lib/utils";
import type { ConsentStatus } from "@/lib/types";

const CONFIG: Record<
  ConsentStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  consented: {
    label: "Disetujui",
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
  },
  pending: {
    label: "Menunggu",
    dot: "bg-warning",
    text: "text-[#B45309]",
    bg: "bg-warning/10",
  },
  none: {
    label: "Tanpa izin",
    dot: "bg-danger",
    text: "text-danger",
    bg: "bg-danger/10",
  },
};

/** Consent status pill with a colored dot (build.md §5.4 — PDPA). */
export function ConsentBadge({
  status,
  variant = "pill",
  className,
}: {
  status: ConsentStatus;
  variant?: "pill" | "dot";
  className?: string;
}) {
  const c = CONFIG[status];
  if (variant === "dot") {
    return (
      <span
        className={cn("inline-block h-2 w-2 rounded-full", c.dot, className)}
        title={c.label}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
