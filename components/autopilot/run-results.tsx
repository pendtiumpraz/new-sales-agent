"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  CalendarCheck2,
  ChevronDown,
  Copy,
  Download,
  Network as Linkedin,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { cn } from "@/lib/utils";
import type {
  AutopilotRun,
  AutopilotStepEvent,
} from "@/lib/types/autopilot";

/* -------------------------------------------------------------------------- */
/* Derived per-prospect journey from a finished run's events.                 */
/* -------------------------------------------------------------------------- */

interface ProspectJourney {
  prospectId: string;
  prospectName: string;
  prospectCompany: string;
  linkedInNote: string | null;
  linkedInNoteSource: "real" | "mock" | null;
  liAccepted: boolean;
  introDm: string | null;
  introDmSource: "real" | "mock" | null;
  replied: boolean;
  meetingAgenda: string | null;
  meetingSlot: string | null;
  meetingUrl: string | null;
  cosSummary: string | null;
  cosSummarySource: "real" | "mock" | null;
}

function deriveJourneys(events: AutopilotStepEvent[]): ProspectJourney[] {
  const byProspect = new Map<string, ProspectJourney>();

  function get(e: AutopilotStepEvent): ProspectJourney | null {
    if (!e.prospectId) return null;
    let j = byProspect.get(e.prospectId);
    if (!j) {
      j = {
        prospectId: e.prospectId,
        prospectName: e.prospectName ?? "Prospek",
        prospectCompany: e.prospectCompany ?? "",
        linkedInNote: null,
        linkedInNoteSource: null,
        liAccepted: false,
        introDm: null,
        introDmSource: null,
        replied: false,
        meetingAgenda: null,
        meetingSlot: null,
        meetingUrl: null,
        cosSummary: null,
        cosSummarySource: null,
      };
      byProspect.set(e.prospectId, j);
    }
    return j;
  }

  for (const e of events) {
    if (e.status !== "done") continue;
    const j = get(e);
    if (!j) continue;

    switch (e.step) {
      case "generate-li-notes":
        j.linkedInNote = e.detail ?? null;
        j.linkedInNoteSource = e.source;
        break;
      case "generate-intro-dms":
        j.introDm = e.detail ?? null;
        j.introDmSource = e.source;
        j.liAccepted = true; // we only generate DMs for accepted prospects
        break;
      case "propose-meetings":
        j.meetingAgenda = e.detail ?? null;
        j.replied = true; // we only propose meetings to repliers
        break;
      case "book-meetings": {
        // Detail format from the orchestrator: "Slot: <label> · <meetingUrl>"
        const m = (e.detail ?? "").match(/Slot:\s*(.+?)\s*·\s*(\S+)/);
        if (m) {
          j.meetingSlot = m[1];
          j.meetingUrl = m[2];
        } else {
          j.meetingSlot = e.detail ?? null;
        }
        break;
      }
      case "deploy-cos":
        j.cosSummary = e.detail ?? null;
        j.cosSummarySource = e.source;
        break;
    }
  }

  return Array.from(byProspect.values());
}

/* -------------------------------------------------------------------------- */
/* RunResults — appears below the timeline when status === "done".            */
/* -------------------------------------------------------------------------- */

export function RunResults() {
  const run = useAutopilotStore((s) => s.currentRun);
  if (!run || run.status !== "done") return null;
  return <RunResultsInner run={run} />;
}

function RunResultsInner({ run }: { run: AutopilotRun }) {
  const journeys = useMemo(() => deriveJourneys(run.events), [run.events]);
  // Lazy initializer — only runs ONCE on first mount. Computing it eagerly on
  // every render was creating a fresh Set per render which, while not itself
  // a loop, multiplied work when run.events was being appended rapidly.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = deriveJourneys(run.events);
    return new Set(initial.slice(0, 1).map((j) => j.prospectId));
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyAll() {
    const text = journeys
      .map((j) => formatJourneyForExport(j))
      .join("\n\n────────────────────────────────────────\n\n");
    navigator.clipboard?.writeText(text);
    toast.success("Semua hasil disalin ke clipboard.");
  }

  function downloadCsv() {
    const rows = [
      [
        "Prospek",
        "Perusahaan",
        "LinkedIn note",
        "Diterima",
        "Intro DM",
        "Balas",
        "Slot meeting",
        "Meeting URL",
        "Ringkasan CoS",
        "Sumber AI",
      ],
      ...journeys.map((j) => [
        j.prospectName,
        j.prospectCompany,
        (j.linkedInNote ?? "").replace(/\s+/g, " "),
        j.liAccepted ? "Ya" : "Tidak",
        (j.introDm ?? "").replace(/\s+/g, " "),
        j.replied ? "Ya" : "Tidak",
        j.meetingSlot ?? "",
        j.meetingUrl ?? "",
        (j.cosSummary ?? "").replace(/\s+/g, " "),
        j.cosSummarySource === "real" ? "Deepseek" : "Mock",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopilot-${run.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV diunduh.");
  }

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-primary/15 bg-gradient-to-r from-primary/8 via-tertiary/5 to-amber-500/5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Hasil Autopilot per prospek
          <Badge variant="muted" className="ml-1 text-[10px]">
            {journeys.length} prospek
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={copyAll}>
            <Copy className="h-3.5 w-3.5" />
            Salin semua
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {journeys.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Belum ada hasil per prospek. Jalankan Autopilot untuk melihat
            konten yang AI buat.
          </div>
        ) : (
          <ul className="divide-y">
            {journeys.map((j) => (
              <JourneyRow
                key={j.prospectId}
                journey={j}
                expanded={expanded.has(j.prospectId)}
                onToggle={() => toggle(j.prospectId)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-prospect row — collapsed shows summary chips; expanded shows content.  */
/* -------------------------------------------------------------------------- */

function JourneyRow({
  journey,
  expanded,
  onToggle,
}: {
  journey: ProspectJourney;
  expanded: boolean;
  onToggle: () => void;
}) {
  const initials = journey.prospectName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Funnel stage reached by this prospect (visual indicator).
  const stage = journey.cosSummary
    ? "Meeting + CoS"
    : journey.meetingUrl
      ? "Meeting dijadwalkan"
      : journey.replied
        ? "Membalas positif"
        : journey.liAccepted
          ? "Koneksi diterima"
          : "Koneksi dikirim";

  const stageTone = journey.cosSummary
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : journey.meetingUrl
      ? "bg-tertiary/15 text-tertiary border-tertiary/30"
      : journey.replied
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : journey.liAccepted
          ? "bg-sky-100 text-sky-700 border-sky-200"
          : "bg-muted text-muted-foreground border-border";

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-tertiary text-xs font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">
              {journey.prospectName}
            </p>
            <span className="truncate text-xs text-muted-foreground">
              · {journey.prospectCompany}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                stageTone,
              )}
            >
              {stage}
            </span>
            {journey.linkedInNote && (
              <SignalDot tone="primary" icon={Linkedin} label="Catatan LI" />
            )}
            {journey.introDm && (
              <SignalDot tone="tertiary" icon={MessageCircle} label="DM" />
            )}
            {journey.meetingUrl && (
              <SignalDot tone="amber" icon={CalendarCheck2} label="Meeting" />
            )}
            {journey.cosSummary && (
              <SignalDot tone="emerald" icon={Bot} label="CoS" />
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t bg-muted/15 px-5 py-4">
          {/* Step 1: LinkedIn note */}
          <ContentBlock
            icon={Linkedin}
            tone="primary"
            title="Catatan koneksi LinkedIn"
            source={journey.linkedInNoteSource}
            body={journey.linkedInNote}
            empty="Belum dibuat."
          />

          {/* Step 2: Outcome */}
          <OutcomeStrip
            ok={journey.liAccepted}
            okText="Koneksi diterima"
            failText="Belum diterima"
          />

          {/* Step 3: Intro DM */}
          {journey.liAccepted && (
            <ContentBlock
              icon={MessageCircle}
              tone="tertiary"
              title="DM intro post-koneksi"
              source={journey.introDmSource}
              body={journey.introDm}
              empty="Belum dibuat."
            />
          )}

          {/* Step 4: Reply outcome */}
          {journey.liAccepted && (
            <OutcomeStrip
              ok={journey.replied}
              okText="Membalas positif"
              failText="Belum membalas"
            />
          )}

          {/* Step 5: Meeting agenda */}
          {journey.replied && (
            <ContentBlock
              icon={CalendarCheck2}
              tone="amber"
              title="Usulan meeting (agenda + slot)"
              source="real"
              body={journey.meetingAgenda}
              empty="Belum dibuat."
            />
          )}

          {/* Step 6: Calendar booking */}
          {journey.meetingUrl && (
            <div className="rounded-lg border border-tertiary/30 bg-tertiary/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-tertiary">
                <CalendarCheck2 className="h-3.5 w-3.5" />
                Booking kalender (mock)
              </p>
              <p className="mt-1 text-foreground">
                Slot: <span className="font-medium">{journey.meetingSlot}</span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {journey.meetingUrl}
              </p>
            </div>
          )}

          {/* Step 7: CoS summary */}
          {journey.meetingUrl && (
            <ContentBlock
              icon={Bot}
              tone="emerald"
              title="Ringkasan CoS pasca-meeting"
              source={journey.cosSummarySource}
              body={journey.cosSummary}
              empty="Belum disiapkan."
            />
          )}
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function SignalDot({
  tone,
  icon: Icon,
  label,
}: {
  tone: "primary" | "tertiary" | "amber" | "emerald";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const cls = {
    primary: "bg-primary/10 text-primary",
    tertiary: "bg-tertiary/10 text-tertiary",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
  }[tone];
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full",
        cls,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

function ContentBlock({
  icon: Icon,
  tone,
  title,
  source,
  body,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "tertiary" | "amber" | "emerald";
  title: string;
  source: "real" | "mock" | null;
  body: string | null;
  empty: string;
}) {
  const cls = {
    primary: "border-primary/25 bg-primary/5",
    tertiary: "border-tertiary/25 bg-tertiary/5",
    amber: "border-amber-300/40 bg-amber-50",
    emerald: "border-emerald-300/40 bg-emerald-50",
  }[tone];
  const iconCls = {
    primary: "text-primary",
    tertiary: "text-tertiary",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  }[tone];

  const clean = body ? stripMarkdown(body) : body; // doc 43 §1 — AI bodies rendered raw
  return (
    <div className={cn("rounded-lg border p-3 text-xs", cls)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className={cn("flex items-center gap-1.5 font-semibold", iconCls)}>
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        {source && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[9px]",
              source === "real"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-muted bg-muted text-muted-foreground",
            )}
          >
            {source === "real" ? "Live · Deepseek" : "Demo · template"}
          </Badge>
        )}
      </div>
      {clean ? (
        <pre className="scrollbar-thin max-h-44 overflow-auto whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-foreground">
          {clean}
        </pre>
      ) : (
        <p className="italic text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function OutcomeStrip({
  ok,
  okText,
  failText,
}: {
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border-l-2 py-1 pl-3 text-[11px]",
        ok
          ? "border-emerald-500 bg-emerald-50/40 text-emerald-700"
          : "border-slate-300 bg-slate-50 text-muted-foreground",
      )}
    >
      <Users className="h-3 w-3" />
      {ok ? okText : failText}
    </div>
  );
}

function formatJourneyForExport(j: ProspectJourney): string {
  const lines: string[] = [
    `# ${j.prospectName} — ${j.prospectCompany}`,
    "",
  ];
  if (j.linkedInNote) {
    lines.push("## Catatan koneksi LinkedIn", j.linkedInNote, "");
  }
  if (j.liAccepted) {
    lines.push("✅ Koneksi diterima", "");
    if (j.introDm) lines.push("## DM intro", j.introDm, "");
  }
  if (j.replied) {
    lines.push("✅ Membalas positif", "");
    if (j.meetingAgenda)
      lines.push("## Usulan meeting", j.meetingAgenda, "");
  }
  if (j.meetingUrl) {
    lines.push(`📅 Meeting: ${j.meetingSlot} · ${j.meetingUrl}`, "");
  }
  if (j.cosSummary) {
    lines.push("## Ringkasan Chief of Staff", j.cosSummary);
  }
  return lines.join("\n");
}
