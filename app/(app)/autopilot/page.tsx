"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityTimeline } from "@/components/autopilot/activity-timeline";
import { AudiencePicker } from "@/components/autopilot/audience-picker";
import { GuardrailsPanel } from "@/components/autopilot/guardrails-panel";
import { HeroBanner } from "@/components/autopilot/hero-banner";
import { RunSummary } from "@/components/autopilot/run-summary";
import { runAutopilot } from "@/lib/autopilot/orchestrator";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useKbStore } from "@/lib/stores/kb-store";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import type { AutopilotRunConfig } from "@/lib/types/autopilot";
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

  const kb = useKbStore((s) => s.kb);
  const prospects = useProspectingStore((s) => s.prospects);

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
          </div>
        </div>
      </div>
    </div>
  );
}
