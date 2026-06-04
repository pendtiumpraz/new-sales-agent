"use client";

import { Map, TrendingDown, TrendingUp } from "lucide-react";

import { SentimentBadge } from "@/components/inbox/sentiment-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productSentiments } from "@/lib/api-mock/handoff";
import { cn } from "@/lib/utils";
import type { ProductSentiment } from "@/lib/types/handoff";

/**
 * Aggregate "market mapping" — average sentiment per product mention,
 * derived from chat interactions. Exported for both the inbox view and
 * Wave 2E analytics.
 */
export function SentimentMap({
  data = productSentiments,
  className,
}: {
  data?: ProductSentiment[];
  className?: string;
}) {
  const sorted = [...data].sort((a, b) => b.mentions - a.mentions);

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Map className="h-4 w-4 text-tertiary" />
            Pemetaan sentimen produk
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Rata-rata sentimen per produk dari percakapan inbox.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {sorted.map((p) => (
            <ProductRow key={p.productName} item={p} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ProductRow({ item }: { item: ProductSentiment }) {
  const positive = item.averageScore >= 25;
  const negative = item.averageScore <= -15;
  const TrendIcon = item.trendVsLastWeek >= 0 ? TrendingUp : TrendingDown;
  const trendColor =
    item.trendVsLastWeek > 0
      ? "text-emerald-600"
      : item.trendVsLastWeek < 0
        ? "text-rose-600"
        : "text-muted-foreground";

  // Bar baseline at 50% (= score 0). Positive scores extend right; negative left.
  const pct = Math.max(-100, Math.min(100, item.averageScore));
  const right = pct >= 0;
  const widthPct = (Math.abs(pct) / 100) * 50;

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.productName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {item.mentions} sebutan
          </p>
        </div>
        <SentimentBadge score={item.averageScore} showTrend={false} />
        <span className={cn("flex w-12 items-center justify-end gap-0.5 tnum text-xs font-medium", trendColor)}>
          <TrendIcon className="h-3 w-3" />
          {item.trendVsLastWeek > 0 ? "+" : ""}
          {item.trendVsLastWeek}
        </span>
      </div>
      <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="relative h-full w-1/2 border-r border-white/80">
          {!right && (
            <div
              className="absolute right-0 top-0 h-full rounded-l-full bg-rose-400"
              style={{ width: `${widthPct * 2}%` }}
            />
          )}
        </div>
        <div className="relative h-full w-1/2">
          {right && (
            <div
              className={cn(
                "absolute left-0 top-0 h-full rounded-r-full",
                positive ? "bg-emerald-400" : "bg-slate-300",
              )}
              style={{ width: `${widthPct * 2}%` }}
            />
          )}
        </div>
      </div>
      {item.sampleQuote && (
        <p
          className={cn(
            "mt-2 line-clamp-1 rounded-md border-l-2 pl-2 text-[11px] italic text-muted-foreground",
            negative
              ? "border-rose-300"
              : positive
                ? "border-emerald-300"
                : "border-slate-300",
          )}
        >
          “{item.sampleQuote}”
        </p>
      )}
    </li>
  );
}
