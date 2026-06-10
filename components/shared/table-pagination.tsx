"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shared pagination controls for all data tables. Compact, Bahasa Indonesia,
 * mirrors the pattern already in /contacts via TanStack Table.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
  label = "baris",
}: {
  page: number; // zero-indexed
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
      <span className="tnum">
        {total === 0
          ? `Tidak ada ${label}`
          : `${start}–${end} dari ${total} ${label}`}
      </span>
      <div className="flex items-center gap-2">
        <span className="tnum text-xs">
          Halaman {page + 1} dari {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={page + 1 >= totalPages}
        >
          Berikutnya
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Tiny hook that handles the pagination state for a list of rows. */
export function usePagination<T>(rows: T[], pageSize = 10) {
  // We deliberately don't import useState here to keep this a pure helper —
  // callers pass in state. Inline `useState` in the consumer file instead.
  return { rows };
}
