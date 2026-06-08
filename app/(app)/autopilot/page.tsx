"use client";

import { useEffect, useMemo, useRef } from "react";
import { Calendar, CheckCircle2, History, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityTimeline } from "@/components/autopilot/activity-timeline";
import { AudiencePicker } from "@/components/autopilot/audience-picker";
import { GuardrailsPanel } from "@/components/autopilot/guardrails-panel";
import { HeroBanner } from "@/components/autopilot/hero-banner";
import { RunSummary } from "@/components/autopilot/run-summary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runAutopilot } from "@/lib/autopilot/orchestrator";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import type { AutopilotRun, AutopilotRunConfig } from "@/lib/types/autopilot";
import type { ProspectLead } from "@/lib/types";

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
            <ActivityTimeline />
            <RunSummary />
            <HistoryCard history={history} currentRunId={currentRun?.id} />
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
