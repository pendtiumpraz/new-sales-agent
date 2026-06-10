"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  History,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityTimeline } from "@/components/autopilot/activity-timeline";
import { AudiencePicker } from "@/components/autopilot/audience-picker";
import { GuardrailsPanel } from "@/components/autopilot/guardrails-panel";
import { HeroBanner } from "@/components/autopilot/hero-banner";
import { CardErrorBoundary } from "@/components/workspace/card-error-boundary";
import { RunResults } from "@/components/autopilot/run-results";
import { RunSummary } from "@/components/autopilot/run-summary";
import { STEP_KIND } from "@/components/autopilot/step-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runAutopilot } from "@/lib/autopilot/orchestrator";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import type { AutopilotRun, AutopilotRunConfig } from "@/lib/types/autopilot";
import type { ProspectLead } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Same heuristic the AudiencePicker uses — keep in sync. */
function classify(p: ProspectLead): AutopilotRunConfig["audienceSegment"] {
  const size = (p.companySize ?? "").toLowerCase();
  const m = size.match(/(\d+)/);
  const n = m ? Number(m[1]) : 0;
  if (
    size.includes("250") ||
    size.includes("500") ||
    size.includes("1000") ||
    n >= 250
  ) {
    return "Korporat";
  }
  if (n >= 50 || size.includes("100") || size.includes("menengah")) {
    return "Menengah";
  }
  return "UMKM";
}

/**
 * /autopilot — the one-button AI demo page.
 *
 * Layout:
 *  - PageHeader
 *  - HeroBanner (giant CTA + goal selector, morphs to KillSwitch when running)
 *  - 2-col body (lg+): AudiencePicker + GuardrailsPanel | ActivityTimeline + RunSummary
 */
export default function AutopilotPage() {
  const config = useAutopilotStore((s) => s.config);
  const setConfig = useAutopilotStore((s) => s.setConfig);
  const currentRun = useAutopilotStore((s) => s.currentRun);
  const history = useAutopilotStore((s) => s.history);

  const kb = useKbStore((s) => s.kb);
  const prospects = useProspectingStore((s) => s.prospects);

  // Pull past runs from Postgres once per mount. The store guards with
  // historyHydrated so this is safe to call unconditionally.
  useEffect(() => {
    void useAutopilotStore.getState().hydrateHistory();
  }, []);

  const running = currentRun?.status === "running";
  const done = currentRun?.status === "done";

  // Live "Y prospek cocok" estimate used in the hero summary copy.
  const estimatedProspects = useMemo(() => {
    const minScore = config.audienceMinScore ?? 0;
    const city = (config.audienceCity ?? "").trim().toLowerCase();
    const matched = prospects.filter((p) => {
      if (config.audienceSegment && classify(p) !== config.audienceSegment) {
        return false;
      }
      if (p.aiScore < minScore) return false;
      if (city && !p.city.toLowerCase().includes(city)) return false;
      return true;
    });
    const cap = config.audienceCap ?? 0;
    return cap > 0 ? Math.min(matched.length, cap) : matched.length;
  }, [
    prospects,
    config.audienceSegment,
    config.audienceMinScore,
    config.audienceCity,
    config.audienceCap,
  ]);

  // AI usage summary — counts ai-text events on the current run so the
  // operator can see at a glance whether Deepseek really ran or the
  // template fallback kicked in. Recomputes on every events.length change.
  const aiStatus = useMemo(() => {
    const events = currentRun?.events ?? [];
    let realCount = 0;
    let mockCount = 0;
    let totalMs = 0;
    for (const e of events) {
      if (STEP_KIND[e.step] !== "ai-text") continue;
      if (e.status !== "done") continue;
      if (e.source === "real") realCount += 1;
      else mockCount += 1;
      if (e.startedAt && e.finishedAt) {
        totalMs += +new Date(e.finishedAt) - +new Date(e.startedAt);
      }
    }
    const total = realCount + mockCount;
    const avgMs = total > 0 ? totalMs / total : 0;
    return { realCount, mockCount, total, avgMs };
  }, [currentRun?.events]);

  // Toast on completion — fires the moment status flips to "done".
  const lastNotifiedRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRun) return;
    if (currentRun.status !== "done") return;
    if (lastNotifiedRunId.current === currentRun.id) return;
    lastNotifiedRunId.current = currentRun.id;
    toast.success(
      `Autopilot selesai — ${currentRun.metrics.meetingsBooked} meeting berhasil dijadwalkan.`,
    );
  }, [currentRun]);

  const startAutopilot = async () => {
    // Snapshot the editing config into a fresh run.
    const snapshot: AutopilotRunConfig = {
      ...config,
      guardrails: { ...config.guardrails },
    };
    useAutopilotStore.getState().startRun(snapshot);

    toast("Autopilot dimulai — AI sedang bekerja…", {
      description: "Pantau timeline di sebelah kanan.",
    });

    try {
      await runAutopilot(snapshot, kb, {
        isStopped: () =>
          useAutopilotStore.getState().currentRun?.status === "stopped",
      });
      // If the orchestrator returned without setting "done", mark it done.
      const after = useAutopilotStore.getState().currentRun;
      if (after && after.status === "running") {
        useAutopilotStore.getState().setRunStatus("done");
      }
    } catch (err) {
      // Defensive: orchestrator is expected to handle its own failures, but
      // we still want a visible signal if it throws.
      useAutopilotStore.getState().setRunStatus("failed");
      toast.error("Autopilot gagal", {
        description: err instanceof Error ? err.message : "Kesalahan tidak diketahui.",
      });
    }
  };

  const stopAutopilot = () => {
    useAutopilotStore.getState().stopRun();
    toast("Autopilot dihentikan", {
      description: "Tidak ada pesan tambahan yang akan dikirim.",
    });
  };

  return (
    <div>
      <PageHeader
        title="Autopilot"
        description="Pipeline otomatis dari pemilihan audiens, koneksi LinkedIn, hingga booking meeting + Chief of Staff AI. Klik satu tombol untuk menjalankan."
      />

      <div className="space-y-4 p-6">
        <AiStatusLine status={aiStatus} />

        <HeroBanner
          config={config}
          onChangeGoal={(goal) => setConfig({ goal })}
          onStart={startAutopilot}
          onStop={stopAutopilot}
          running={running}
          done={done}
          estimatedProspects={estimatedProspects}
          meetingsBooked={currentRun?.metrics.meetingsBooked ?? 0}
        />

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left column — config */}
          <div className="space-y-4 lg:col-span-4">
            <AudiencePicker disabled={running} />
            <GuardrailsPanel disabled={running} />
          </div>

          {/* Right column — live activity + KPIs */}
          <div className="space-y-4 lg:col-span-8">
            <CardErrorBoundary name="Aktivitas">
              <ActivityTimeline />
            </CardErrorBoundary>
            <CardErrorBoundary name="Ringkasan run">
              <RunSummary />
            </CardErrorBoundary>
            <CardErrorBoundary name="Hasil per prospek">
              <RunResults />
            </CardErrorBoundary>
            <CardErrorBoundary name="Riwayat">
              <HistoryCard history={history} currentRunId={currentRun?.id} />
            </CardErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "Riwayat run" card listing the last 5 finished autopilot runs.
 * Hydrated from /api/db/autopilot-runs so it persists across sessions.
 */
function HistoryCard({
  history,
  currentRunId,
}: {
  history: AutopilotRun[];
  currentRunId?: string;
}) {
  // Exclude the run that's still front-and-center in the page header so the
  // list reads as strictly historical.
  const rows = history
    .filter((r) => r.id !== currentRunId)
    .slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          Riwayat run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {rows.map((r) => (
          <HistoryRow key={r.id} run={r} />
        ))}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ run }: { run: AutopilotRun }) {
  const started = new Date(run.startedAt);
  const startedLabel = isNaN(started.getTime())
    ? run.startedAt
    : started.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <StatusBadge status={run.status} />
        <span className="truncate text-muted-foreground">{startedLabel}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 tnum">
          <Users className="h-3.5 w-3.5" />
          {run.metrics.prospectsEngaged}
        </span>
        <span className="inline-flex items-center gap-1 tnum">
          <Calendar className="h-3.5 w-3.5" />
          {run.metrics.meetingsBooked}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact one-line summary of AI usage for the current run. Hidden until at
 * least one ai-text step has finished. Green when every Deepseek call
 * succeeded, amber when at least one fell back to the template.
 */
function AiStatusLine({
  status,
}: {
  status: { realCount: number; mockCount: number; total: number; avgMs: number };
}) {
  if (status.total === 0) return null;

  const avgSec = (status.avgMs / 1000).toFixed(1);
  const allReal = status.mockCount === 0;
  const allMock = status.realCount === 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2 text-sm",
        allReal
          ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
          : allMock
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-amber-200 bg-amber-50/60 text-amber-800",
      )}
    >
      {allReal ? (
        <Sparkles className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span className="font-medium">
        {allReal
          ? "AI Deepseek aktif"
          : allMock
            ? "AI fallback aktif"
            : "AI sebagian fallback"}
      </span>
      <span className="text-xs opacity-80">
        {allReal ? (
          <>
            <span className="tnum">{status.realCount}</span> panggilan berhasil ·
            rata-rata <span className="tnum">{avgSec}s</span>
          </>
        ) : allMock ? (
          <>
            <span className="tnum">{status.mockCount}</span> panggilan ke Deepseek
            gagal, memakai template
          </>
        ) : (
          <>
            <span className="tnum">{status.realCount}</span> live ·{" "}
            <span className="tnum">{status.mockCount}</span> fallback · rata-rata{" "}
            <span className="tnum">{avgSec}s</span>
          </>
        )}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: AutopilotRun["status"] }) {
  if (status === "done") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Selesai
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Gagal
      </Badge>
    );
  }
  if (status === "stopped") {
    return <Badge variant="outline">Dihentikan</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}
