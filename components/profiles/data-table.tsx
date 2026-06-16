"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

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

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  pageSize = 15,
  empty,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const activeColumn = useMemo(
    () => columns.find((c) => c.key === sortKey) ?? null,
    [columns, sortKey],
  );

  const sortedRows = useMemo(() => {
    if (!activeColumn) return rows;

    const resolve = (row: T): string | number => {
      if (activeColumn.sortValue) return activeColumn.sortValue(row);
      const rendered = activeColumn.render ? activeColumn.render(row) : (row as any)[activeColumn.key];
      if (typeof rendered === "string" || typeof rendered === "number") return rendered;
      return String(rendered ?? "");
    };

    const copy = [...rows];
    copy.sort((a, b) => {
      const av = resolve(a);
      const bv = resolve(b);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "id", { numeric: true, sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, activeColumn, sortDir]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const pagedRows = useMemo(() => {
    const start = safePage * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  function toggleSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border">
        {empty ?? (
          <div className="p-10 text-center text-sm text-muted-foreground">Tidak ada data.</div>
        )}
      </div>
    );
  }

  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {columns.map((col) => {
                const isActive = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "h-10 px-3 font-medium text-muted-foreground",
                      col.align === "right" ? "text-right" : "text-left",
                      col.sortable && "cursor-pointer select-none hover:text-foreground",
                    )}
                    onClick={() => toggleSort(col)}
                    aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.label}
                      {col.sortable &&
                        (isActive ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b last:border-0 transition-colors hover:bg-muted/40",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5 align-middle",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {col.render ? col.render(row) : ((row as any)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Menampilkan {from}–{to} dari {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage <= 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Sebelumnya
          </Button>
          <span className="tabular-nums">
            Halaman {safePage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
          >
            Berikutnya
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
