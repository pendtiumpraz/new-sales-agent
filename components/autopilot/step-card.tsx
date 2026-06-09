"use client";

import {
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Cpu,
  Loader2,
  Network,
  MessageSquare,
  Plug,
  Sparkles,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";

import { Badge } from "@/components/ui/badge";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import type {
  AutopilotStep,
  AutopilotStepEvent,
  AutopilotStepStatus,
} from "@/lib/types/autopilot";
import { cn } from "@/lib/utils";

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

const STEP_ICONS: Record<AutopilotStep, IconCmp> = {
  "select-audience": Users,
  "generate-li-notes": Sparkles,
  "send-li-requests": Network,
  "track-acceptances": Network,
  "generate-intro-dms": Sparkles,
  "send-intro-dms": MessageSquare,
  "track-replies": MessageSquare,
  "propose-meetings": Calendar,
  "book-meetings": Calendar,
  "deploy-cos": Bot,
};

/**
 * Classifies each pipeline step by the kind of work it performs:
 *  - "ai-text" — should call Deepseek for text generation (linkedin-note,
 *    intro-dm, meeting-agenda, cos-summary). When green it's real AI; when
 *    red it's the template fallback that runs if the Gateway is unreachable.
 *  - "mock-integration" — intentional third-party stub (LinkedIn send,
 *    Calendar book, etc). Always mock by design — no source badge needed.
 *  - "local" — pure local computation (filter/cap audiences).
 */
export const STEP_KIND: Record<
  AutopilotStep,
  "ai-text" | "mock-integration" | "local"
> = {
  "select-audience": "local",
  "generate-li-notes": "ai-text",
  "send-li-requests": "mock-integration",
  "track-acceptances": "mock-integration",
  "generate-intro-dms": "ai-text",
  "send-intro-dms": "mock-integration",
  "track-replies": "mock-integration",
  "propose-meetings": "ai-text",
  "book-meetings": "mock-integration",
  "deploy-cos": "ai-text",
};

const STATUS_META: Record<
  AutopilotStepStatus,
  {
    label: string;
    cls: string;
    dot: string;
    iconWrap: string;
    iconColor: string;
    badgeVariant: "default" | "secondary" | "success" | "destructive" | "muted";
  }
> = {
  pending: {
    label: "Menunggu",
    cls: "border-muted",
    dot: "bg-muted-foreground/30",
    iconWrap: "bg-muted text-muted-foreground",
    iconColor: "text-muted-foreground",
    badgeVariant: "muted",
  },
  running: {
    label: "Berjalan",
    cls: "border-primary/40 bg-primary/5",
    dot: "bg-primary",
    iconWrap: "bg-primary/10 text-primary",
    iconColor: "text-primary",
    badgeVariant: "default",
  },
  done: {
    label: "Selesai",
    cls: "border-emerald-200 bg-emerald-50/50",
    dot: "bg-emerald-500",
    iconWrap: "bg-emerald-100 text-emerald-700",
    iconColor: "text-emerald-700",
    badgeVariant: "success",
  },
  failed: {
    label: "Gagal",
    cls: "border-destructive/40 bg-destructive/5",
    dot: "bg-destructive",
    iconWrap: "bg-destructive/10 text-destructive",
    iconColor: "text-destructive",
    badgeVariant: "destructive",
  },
  skipped: {
    label: "Dilewati",
    cls: "border-muted",
    dot: "bg-muted-foreground/30",
    iconWrap: "bg-muted text-muted-foreground",
    iconColor: "text-muted-foreground",
    badgeVariant: "muted",
  },
};

function StatusIcon({ status }: { status: AutopilotStepStatus }) {
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  }
  if (status === "done") return <Check className="h-3.5 w-3.5" />;
  if (status === "failed") return <X className="h-3.5 w-3.5" />;
  return <CircleDashed className="h-3.5 w-3.5" />;
}

/** Always-visible badge advertising what KIND of step this is. */
function StepKindBadge({ kind }: { kind: "ai-text" | "mock-integration" | "local" }) {
  if (kind === "ai-text") {
    return (
      <Badge
        variant="default"
        className="gap-1 bg-primary text-primary-foreground text-[10px]"
      >
        <Sparkles className="h-3 w-3" />
        AI Deepseek
      </Badge>
    );
  }
  if (kind === "mock-integration") {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
        <Plug className="h-3 w-3" />
        Integrasi (mock)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Cpu className="h-3 w-3" />
      Lokal
    </Badge>
  );
}

/** Only shown for ai-text steps that are done/failed — proves which path ran. */
function SourceBadge({ source }: { source: "real" | "mock" }) {
  if (source === "real") {
    return (
      <Badge variant="success" className="gap-1 text-[10px]">
        <CheckCircle2 className="h-3 w-3" />
        Live
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 text-[10px]">
      <XCircle className="h-3 w-3" />
      Fallback (mock)
    </Badge>
  );
}

/** Format milliseconds as a compact pill string: "42ms", "1.2s", "12.4s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const s = ms / 1000;
  return `${s.toFixed(s < 10 ? 1 : 0)}s`;
}

/**
 * One activity timeline entry. Icon is keyed off the pipeline step; status
 * styling lights the card up (coral pulse while running, emerald check on
 * done). Surfaces two badges side-by-side (kind + source) plus the
 * end-to-end latency so the operator can tell at a glance whether AI
 * actually ran or fell back to the template.
 */
export function StepCard({
  event,
  isFirst,
  isLast,
}: {
  event: AutopilotStepEvent;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const Icon = STEP_ICONS[event.step] ?? Sparkles;
  const meta = STATUS_META[event.status];
  const ts = event.finishedAt ?? event.startedAt;
  const relative = secondsAgoLabel(ts);
  const kind = STEP_KIND[event.step];

  // Response time — only meaningful once a finishedAt exists.
  const durationMs =
    event.finishedAt && event.startedAt
      ? +new Date(event.finishedAt) - +new Date(event.startedAt)
      : null;

  // Source badge only renders for ai-text once the call concluded.
  const showSourceBadge =
    kind === "ai-text" && (event.status === "done" || event.status === "failed");

  // Expandable full-text drawer only available for ai-text steps with content
  // that is actually longer than the inline preview.
  const expandable = kind === "ai-text" && !!event.detail && event.detail.length > 200;
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="relative flex gap-3 pl-1">
      {/* Spine */}
      <div className="relative flex w-8 shrink-0 flex-col items-center">
        {!isFirst && <span className="absolute top-0 h-3 w-px bg-border" />}
        <span
          className={cn(
            "relative z-10 mt-3 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-background",
            meta.iconWrap,
            event.status === "running" &&
              "shadow-[0_0_0_4px_rgba(251,94,59,0.18)] animate-pulse",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 pb-4">
        <div
          className={cn(
            "rounded-2xl border bg-card px-4 py-3 transition-colors",
            meta.cls,
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {event.title}
                </p>
                <Badge variant={meta.badgeVariant} className="gap-1">
                  <StatusIcon status={event.status} />
                  {meta.label}
                </Badge>
              </div>
              {event.prospectName && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {event.prospectName}
                  </span>
                  {event.prospectCompany ? ` · ${event.prospectCompany}` : ""}
                </p>
              )}
            </div>
            <span className="tnum shrink-0 text-[11px] text-muted-foreground">
              {relative}
            </span>
          </div>

          {event.detail && (
            <>
              {expandable && expanded ? (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                  {event.detail}
                </pre>
              ) : (
                <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                  {event.detail}
                </p>
              )}
            </>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StepKindBadge kind={kind} />
            {showSourceBadge && <SourceBadge source={event.source} />}
            {durationMs !== null && (
              <Badge variant="muted" className="gap-1 tnum text-[10px]">
                {formatDuration(durationMs)}
              </Badge>
            )}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Tutup
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Lihat selengkapnya
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** "baru saja" within the last 8 seconds, otherwise delegate to formatRelativeID. */
function secondsAgoLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 8000) return "baru saja";
  return formatRelativeID(iso);
}
