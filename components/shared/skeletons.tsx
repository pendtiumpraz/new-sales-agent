// Reusable loading skeletons (doc 45 — "skeletons everywhere"). Match the shape of
// the content they replace so first paint doesn't jank from empty → populated.
import { Skeleton } from "@/components/ui/skeleton";

/** A row of stat tiles (KPI cards). */
export function StatRowSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A responsive 3-col card grid (workspaces, quotes, marketplace, content…). */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A table (header + N rows × M columns). */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-3 border-b bg-muted/30 p-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 border-b p-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={c === 0 ? "h-4 flex-1" : "h-3 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A vertical list of avatar + two-line rows (activity feeds, tasks, audit logs). */
export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          {avatar && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
