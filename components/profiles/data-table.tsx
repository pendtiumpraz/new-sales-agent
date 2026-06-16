"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  empty?: React.ReactNode;
}

type SortDir = "asc" | "desc";

// Sortable + paginated table, styled to match the /contacts table (shadcn Table,
// rounded border card, zebra rows, primary hover).
export function DataTable<T>({ columns, rows, getRowId, onRowClick, pageSize = 15, empty }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = sortKey ? columns.find((c) => c.key === sortKey) : null;
    if (!col || !col.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  function toggleSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (total === 0 && empty) return <>{empty}</>;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={col.align === "right" ? "text-right" : undefined}>
                  {col.sortable ? (
                    <button className="flex items-center gap-1.5 hover:text-foreground" onClick={() => toggleSort(col)}>
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn("transition-colors even:bg-muted/30 hover:bg-primary/[0.06]", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.align === "right" ? "text-right" : undefined}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Menampilkan {cur * pageSize + 1}–{Math.min(total, cur * pageSize + pageSize)} dari {total}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              Hal {cur + 1}/{pageCount}
            </span>
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
