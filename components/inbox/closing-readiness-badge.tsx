"use client";

// Closing-readiness badge for the inbox thread header — Module 6 FRONTEND
// (Sainskerta Loop Phase 04). Wired to the NEW sales backend (NO mock data):
//   • GET /api/sales/readiness/[conversationId] → 0..100 score + band
//       (cold|warm|hot → dingin/hangat/panas) + next-best-action.
//   • GET /api/sales/stage/[conversationId]     → current closing-flow stage
//       (rapport|discovery|value|objection|closing) → a small stage chip.
// Both rows are 1:1 satellites of a conversation; the GETs return `null` when the
// conversation hasn't been scored yet (we render a neutral "belum dinilai" pill —
// NO mutation, the badge is read-only). Every state is covered: loading (skeleton),
// null/empty (neutral pill), error (compact retry), and the live readiness gauge.
// Coral Sunset tokens; isolated so the inbox stays intact.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Flame, RotateCcw, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope ({ ok, data }) ──────────────────────────────────────────────
interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

// ── row shapes (modules/sales) — dates arrive as ISO strings over HTTP ────────
interface ReadinessRow {
  id: string;
  conversationId: string;
  score: number; // 0..100
  band: string; // cold | warm | hot
  factors: string[];
  nbaAction: string; // nurture | gali | value | objection | close | handoff
  nbaSuggestion: string | null;
  stage: string | null; // denormalized stage at scoring time
  source: string; // heuristic | ai
}

interface StageRow {
  id: string;
  conversationId: string;
  stage: string; // rapport | discovery | value | objection | closing
  previousStage: string | null;
  nextAction: string;
  guidance: string | null;
  source: string;
  turns: number;
}

// ── display metadata ─────────────────────────────────────────────────────────

// Band value (backend) → Indonesian label + Coral Sunset-friendly tone classes.
const BAND_META: Record<string, { label: string; chip: string; bar: string }> = {
  cold: {
    label: "Dingin",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    bar: "bg-sky-400",
  },
  warm: {
    label: "Hangat",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    bar: "bg-amber-400",
  },
  hot: {
    label: "Panas",
    chip: "border-primary/30 bg-primary/10 text-primary",
    bar: "bg-primary",
  },
};

// Stage value → Indonesian chip label (the closing-flow stage-machine).
const STAGE_LABEL: Record<string, string> = {
  rapport: "Rapport",
  discovery: "Gali kebutuhan",
  value: "Value",
  objection: "Objection",
  closing: "Closing",
};

// Next-best-action value → short, human label for the badge tail.
const NBA_LABEL: Record<string, string> = {
  nurture: "Bangun rapport",
  gali: "Gali kebutuhan",
  value: "Sampaikan value",
  objection: "Tangani keberatan",
  close: "Arahkan closing",
  handoff: "Handoff ke manusia",
};

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

/**
 * Closing-readiness + current-stage indicator for the open conversation. Reads
 * the NEW sales backend; renders inline in the inbox thread header. Self-contained
 * (own queries + states) so it can be dropped in without disturbing the inbox.
 */
export function ClosingReadinessBadge({
  conversationId,
  className,
}: {
  conversationId: string;
  className?: string;
}) {
  const readinessQ = useQuery({
    queryKey: ["inbox", "sales", "readiness", conversationId],
    enabled: !!conversationId,
    retry: false,
    staleTime: 30_000,
    queryFn: async () =>
      readJson<ReadinessRow | null>(
        await fetch(`/api/sales/readiness/${encodeURIComponent(conversationId)}`),
      ),
  });
  const stageQ = useQuery({
    queryKey: ["inbox", "sales", "stage", conversationId],
    enabled: !!conversationId,
    retry: false,
    staleTime: 30_000,
    queryFn: async () =>
      readJson<StageRow | null>(
        await fetch(`/api/sales/stage/${encodeURIComponent(conversationId)}`),
      ),
  });

  const readiness = readinessQ.data ?? null;
  const stage = stageQ.data ?? null;
  // Prefer the live stage row; fall back to the stage denormalized on readiness.
  const stageKey = stage?.stage ?? readiness?.stage ?? null;

  // ── loading ───────────────────────────────────────────────────────────────
  if (readinessQ.isLoading || stageQ.isLoading) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    );
  }

  // ── error (compact, inline retry) ─────────────────────────────────────────
  if (readinessQ.isError || stageQ.isError) {
    const forbidden =
      (readinessQ.error instanceof Error && readinessQ.error.message === "forbidden") ||
      (stageQ.error instanceof Error && stageQ.error.message === "forbidden");
    return (
      <button
        type="button"
        onClick={() => {
          readinessQ.refetch();
          stageQ.refetch();
        }}
        title={
          forbidden
            ? "Tidak punya izin baca data closing-readiness (data.read)."
            : "Gagal memuat closing-readiness. Klik untuk coba lagi."
        }
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/[0.06] px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/[0.12]",
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3" />
        {forbidden ? "Tanpa akses" : "Readiness gagal"}
        {!forbidden && <RotateCcw className="h-3 w-3" />}
      </button>
    );
  }

  const stageChip = stageKey ? (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70"
      title="Tahap closing-flow saat ini"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
      {STAGE_LABEL[stageKey] ?? stageKey}
    </span>
  ) : null;

  // ── not scored yet (null row) — neutral, read-only pill ───────────────────
  if (!readiness) {
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          title="Percakapan ini belum dinilai closing-readiness-nya. Skor muncul setelah ada balasan yang dievaluasi."
        >
          <TrendingUp className="h-3 w-3" />
          Readiness: belum dinilai
        </span>
        {stageChip}
      </div>
    );
  }

  // ── live readiness gauge ──────────────────────────────────────────────────
  const band = BAND_META[readiness.band] ?? BAND_META.cold;
  const score = Math.max(0, Math.min(100, readiness.score));
  const nbaLabel = NBA_LABEL[readiness.nbaAction] ?? readiness.nbaAction;
  const tooltip =
    `Closing-readiness ${score}% · ${band.label}` +
    (readiness.factors.length ? `\n• ${readiness.factors.join("\n• ")}` : "") +
    (readiness.nbaSuggestion ? `\n\nNext: ${readiness.nbaSuggestion}` : "");

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          band.chip,
        )}
        title={tooltip}
      >
        {readiness.band === "hot" ? (
          <Flame className="h-3 w-3" />
        ) : (
          <TrendingUp className="h-3 w-3" />
        )}
        <span className="tabular-nums">{score}%</span>
        <span className="opacity-90">· {band.label}</span>
        {/* tiny inline gauge */}
        <span className="ml-0.5 hidden h-1 w-10 overflow-hidden rounded-full bg-foreground/10 sm:inline-block">
          <span
            className={cn("block h-full rounded-full", band.bar)}
            style={{ width: `${score}%` }}
          />
        </span>
      </span>

      {/* next-best-action */}
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground/70"
        title={readiness.nbaSuggestion ?? "Langkah terbaik berikutnya"}
      >
        <span className="text-muted-foreground">NBA:</span> {nbaLabel}
      </span>

      {stageChip}
    </div>
  );
}
