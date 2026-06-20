"use client";

import { type ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Shared list toolbar (redesign system §5): search on the LEFT, filters in the
 * middle, view/sort actions on the RIGHT — the same grammar on every list page.
 * When rows are selected, render <BulkBar> in place of this instead.
 */
export function Toolbar({
  search,
  onSearch,
  searchPlaceholder = "Cari…",
  filters,
  actions,
  className,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Filter chips / dropdowns (rendered after the search box). */
  filters?: ReactNode;
  /** Right-aligned actions (view toggle, sort, secondary buttons). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onSearch && (
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
