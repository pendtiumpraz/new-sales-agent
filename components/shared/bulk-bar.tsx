"use client";

import { type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared bulk-action bar (redesign system §5). Replaces the toolbar when rows
 * are selected: "{count} dipilih" on the left, action buttons + "Batal" on the
 * right. Renders nothing when count is 0, so callers can mount it unconditionally.
 */
export function BulkBar({
  count,
  onClear,
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  /** Action buttons for the selection. */
  children: ReactNode;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
        <Sparkles className="h-3 w-3" />
        {count} dipilih
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" />
          Batal
        </Button>
      </div>
    </div>
  );
}
