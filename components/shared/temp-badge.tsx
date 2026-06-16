import { cn } from "@/lib/utils";
import type { AiTemp } from "@/lib/types";

const TEMP: Record<AiTemp, { label: string; cls: string }> = {
  panas: { label: "Panas", cls: "bg-primary/10 text-primary" },
  hangat: { label: "Hangat", cls: "bg-warning/15 text-warning" },
  dingin: { label: "Dingin", cls: "bg-sky-500/10 text-sky-700" },
};

/** AI fit/intent score chip: numeric score + temperature label. */
export function TempBadge({
  score,
  temp,
  className,
}: {
  score: number;
  temp: AiTemp;
  className?: string;
}) {
  const t = TEMP[temp];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        t.cls,
        className,
      )}
    >
      <span className="tnum">{score}</span>
      {t.label}
    </span>
  );
}
