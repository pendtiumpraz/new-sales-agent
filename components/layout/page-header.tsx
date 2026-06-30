import { cn } from "@/lib/utils";

/** Consistent page title block (build.md §3.2 — display headers 28–32px / 600).
 *  Redesign system §5: optional breadcrumb above the title; actions in `children`
 *  follow the "≤1 primary + ≤2 secondary (rest in ⋯)" convention. */
export function PageHeader({
  breadcrumb,
  title,
  description,
  children,
  className,
}: {
  /** Optional breadcrumb node rendered above the H1 (for nested/detail pages). */
  breadcrumb?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {breadcrumb && (
          <div className="mb-1 text-xs text-muted-foreground">{breadcrumb}</div>
        )}
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}
