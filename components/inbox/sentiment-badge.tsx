"use client";

import { Minus, Smile, TrendingDown, TrendingUp, Frown, Meh } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SentimentTrend } from "@/lib/types/handoff";

/** Tone bucket inferred from a -100..+100 sentiment score. */
export type SentimentTone = "positive" | "neutral" | "negative";

export function toneFromScore(score: number): SentimentTone {
  if (score >= 25) return "positive";
  if (score <= -15) return "negative";
  return "neutral";
}

const TONE_STYLES: Record<SentimentTone, { pill: string; icon: string; label: string }> = {
  positive: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "text-emerald-600",
    label: "Positif",
  },
  neutral: {
    pill: "border-slate-200 bg-slate-50 text-slate-600",
    icon: "text-slate-500",
    label: "Netral",
  },
  negative: {
    pill: "border-rose-200 bg-rose-50 text-rose-700",
    icon: "text-rose-600",
    label: "Negatif",
  },
};

function TrendIcon({ trend, className }: { trend: SentimentTrend; className?: string }) {
  if (trend === "up") return <TrendingUp className={className} />;
  if (trend === "down") return <TrendingDown className={className} />;
  return <Minus className={className} />;
}

function FaceIcon({ tone, className }: { tone: SentimentTone; className?: string }) {
  if (tone === "positive") return <Smile className={className} />;
  if (tone === "negative") return <Frown className={className} />;
  return <Meh className={className} />;
}

interface SentimentBadgeProps {
  score: number;
  trend?: SentimentTrend;
  /** "compact" → small pill for lists. "default" → header-friendly. */
  size?: "compact" | "default";
  /** Show the numeric score next to the icon. */
  showScore?: boolean;
  /** Show the trend arrow. */
  showTrend?: boolean;
  className?: string;
}

/**
 * Pill showing sentiment tone (positive / neutral / negative) with optional
 * trend arrow and numeric score. Coral Sunset compatible.
 */
export function SentimentBadge({
  score,
  trend = "stable",
  size = "default",
  showScore = true,
  showTrend = true,
  className,
}: SentimentBadgeProps) {
  const tone = toneFromScore(score);
  const styles = TONE_STYLES[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "compact"
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-0.5 text-xs",
        styles.pill,
        className,
      )}
      title={`Sentimen ${styles.label} (${score > 0 ? "+" : ""}${score})`}
    >
      <FaceIcon
        tone={tone}
        className={cn(size === "compact" ? "h-3 w-3" : "h-3.5 w-3.5", styles.icon)}
      />
      {showScore ? (
        <span className="tnum">
          {score > 0 ? "+" : ""}
          {score}
        </span>
      ) : (
        <span>{styles.label}</span>
      )}
      {showTrend && (
        <TrendIcon
          trend={trend}
          className={cn(
            size === "compact" ? "h-2.5 w-2.5" : "h-3 w-3",
            styles.icon,
          )}
        />
      )}
    </span>
  );
}

/** A tiny sparkline rendered as inline SVG — used inside the handoff panel. */
export function SentimentSparkline({
  history,
  className,
}: {
  history: { timestamp: string; score: number }[];
  className?: string;
}) {
  if (history.length === 0) return null;
  const w = 120;
  const h = 28;
  const min = Math.min(...history.map((p) => p.score), -10);
  const max = Math.max(...history.map((p) => p.score), 10);
  const range = max - min || 1;
  const points = history
    .map((p, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((p.score - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = history[history.length - 1].score;
  const stroke = last >= 25 ? "#16A34A" : last <= -15 ? "#E11D48" : "#94A3B8";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-full", className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
