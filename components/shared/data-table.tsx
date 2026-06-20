"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  type LucideIcon,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

// Shared DataTable (redesign system §5) — a lightweight columns+data API over
// @tanstack/react-table so every list page gets the same sticky header, sortable
// columns, right-aligned numbers, controlled row selection, pagination, loading
// skeleton, and empty state without re-implementing the boilerplate.

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Provide a sort key to make the column sortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

function alignClass(a?: "left" | "right" | "center") {
  return a === "right" ? "text-right tabular-nums" : a === "center" ? "text-center" : "text-left";
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectedIds,
  onSelectedChange,
  onRowClick,
  pageSize = 10,
  loading,
  emptyIcon = Inbox,
  emptyTitle = "Belum ada data",
  emptyDescription,
  emptyAction,
  className,
}: {
  columns: DataColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Controlled selection (Set of rowKey). Omit to hide the selection column. */
  selectedIds?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  loading?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const selectable = !!selectedIds && !!onSelectedChange;

  // tanstack is used only for sorting + pagination row models; cells/headers are
  // rendered from the `columns` config directly (no flexRender needed).
  const tableColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorFn: c.sortValue ? (row: T) => c.sortValue!(row) : () => null,
        enableSorting: !!c.sortValue,
      })),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const pageRows = table.getRowModel().rows;
  const pageIds = pageRows.map((r) => rowKey(r.original));
  const allPageSelected =
    selectable && pageIds.length > 0 && pageIds.every((id) => selectedIds!.has(id));

  const toggle = (id: string) => {
    if (!selectable) return;
    const next = new Set(selectedIds!);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange!(next);
  };
  const togglePage = () => {
    if (!selectable) return;
    const next = new Set(selectedIds!);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectedChange!(next);
  };

  if (loading) {
    return <TableSkeleton rows={pageSize} cols={columns.length + (selectable ? 1 : 0)} />;
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={togglePage}
                    aria-label="Pilih semua di halaman ini"
                  />
                </TableHead>
              )}
              {columns.map((c) => {
                const col = table.getColumn(c.key);
                const sorted = col?.getIsSorted();
                return (
                  <TableHead key={c.key} className={cn("text-xs", alignClass(c.align), c.className)}>
                    {c.sortValue ? (
                      <button
                        onClick={col?.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.header}
                        <ArrowUpDown className={cn("h-3 w-3", sorted ? "opacity-100" : "opacity-40")} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => {
              const id = rowKey(row.original);
              return (
                <TableRow
                  key={id}
                  data-state={selectable && selectedIds!.has(id) ? "selected" : undefined}
                  className={cn("group", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {selectable && (
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds!.has(id)}
                        onCheckedChange={() => toggle(id)}
                        aria-label="Pilih baris"
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(alignClass(c.align), c.className)}>
                      {c.cell(row.original)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Halaman {table.getState().pagination.pageIndex + 1} dari {table.getPageCount()} ·{" "}
            {data.length} baris
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
