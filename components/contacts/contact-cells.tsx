// Shared contact-cell primitives — the SINGLE source of truth for how a contact
// row looks, so the full Contacts page (app/(app)/contacts/page.tsx) and the
// embedded Workspace › Kontak tab (app/(app)/workspace/page.tsx) render segment /
// fit / enrichment / source badges IDENTICALLY (they used to drift). Pure
// presentational + tiny helpers — no data fetching, no mutations.

import type { CSSProperties } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// Segment badge styling — B2B = teal tint, B2C = pink tint, unknown = dashed "belum".
export const SEG_BADGE: Record<string, { label: string; style: CSSProperties } | null> = {
  b2b: { label: "B2B", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  b2c: { label: "B2C", style: { background: "#E1306C18", color: "#c01f5b" } },
  unknown: null,
};

export const SOURCE_DOT: Record<string, string> = {
  Crawl: "#3B82F6",
  Hunter: "#8B5CF6",
  Impor: "#6B7280",
  "Impor CSV": "#6B7280",
  Web: "#0D9488",
};

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

/** fit_score 0..1 → 0..100 (or null). */
export function fitPct(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function fitColor(pct: number): string {
  return pct >= 80 ? "#10B981" : pct >= 65 ? "#F59E0B" : "#EF4444";
}

/** Normalise the free-text `source` into one of the known buckets for the dot/filter. */
export function sourceBucket(source: string | null): string {
  if (!source) return "—";
  const s = source.toLowerCase();
  if (s.includes("crawl")) return "Crawl";
  if (s.includes("hunter")) return "Hunter";
  if (s.includes("impor") || s.includes("import") || s.includes("csv")) return "Impor";
  if (s.includes("web")) return "Web";
  return source;
}

export function SegmentBadge({ segment }: { segment: string }) {
  const meta = SEG_BADGE[segment];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        belum
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

export function FitCell({ score }: { score: number | null }) {
  const pct = fitPct(score);
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const c = fitColor(pct);
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-[11px] font-bold" style={{ color: c }}>
        {pct}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  );
}

export function EnrichmentChip({ status }: { status: string }) {
  if (status === "enriched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
        <Check className="h-3 w-3" /> Enriched
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        Gagal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 py-0.5 text-[11px] font-medium text-warning">
      {status === "pending" ? "Diproses" : "Belum"}
    </span>
  );
}

export function SourceBadge({ source }: { source: string | null }) {
  const bucket = sourceBucket(source);
  if (bucket === "—") return <span className="text-xs text-muted-foreground">—</span>;
  const dot = SOURCE_DOT[bucket] ?? "#6B7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {bucket}
    </span>
  );
}

// Avatar initials chip (matches the Contacts table row avatar).
export function ContactAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
