import { Radar } from "lucide-react";

import { cn } from "@/lib/utils";

/** Brand mark + wordmark. Teal used sparingly as a brand moment (build.md §3.1). */
export function BrandLogo({
  className,
  showWord = true,
  size = "default",
}: {
  className?: string;
  showWord?: boolean;
  size?: "default" | "sm";
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-lg bg-primary text-primary-foreground",
          box,
        )}
      >
        <Radar className={icon} />
      </span>
      {showWord && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Maira<span className="text-muted-foreground"> Sales</span>
        </span>
      )}
    </span>
  );
}
