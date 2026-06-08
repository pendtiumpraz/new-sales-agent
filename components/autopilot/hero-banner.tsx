"use client";

import { Bot, Loader2, Rocket, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AutopilotRunConfig } from "@/lib/types/autopilot";
import { cn } from "@/lib/utils";

const GOAL_OPTIONS: {
  value: AutopilotRunConfig["goal"];
  label: string;
  hint: string;
}[] = [
  { value: "book-meeting", label: "Booking meeting", hint: "Optimasi untuk jadwal terkonfirmasi" },
  { value: "build-relationship", label: "Bangun relasi", hint: "Fokus koneksi & engagement" },
  { value: "qualify", label: "Kualifikasi", hint: "Saring kebutuhan & anggaran" },
];

/**
 * Hero banner — the visual centerpiece of /autopilot.
 * Renders the giant "Mulai Autopilot" CTA, goal-chip selector, and a one-line
 * summary. When a run is active it morphs into a coral-pulsed status bar with
 * a "Hentikan Autopilot" kill switch.
 */
export function HeroBanner({
  config,
  onChangeGoal,
  onStart,
  onStop,
  running,
  done,
  estimatedProspects,
  meetingsBooked,
}: {
  config: AutopilotRunConfig;
  onChangeGoal: (goal: AutopilotRunConfig["goal"]) => void;
  onStart: () => void;
  onStop: () => void;
  running: boolean;
  done: boolean;
  estimatedProspects: number;
  meetingsBooked: number;
}) {
  const summary =
    `AI akan menghubungi ${estimatedProspects} prospek ` +
    `${config.audienceSegment ?? "semua segmen"}, ` +
    `menjadwalkan meeting, dan menyiapkan ringkasan pasca-meeting.`;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        {/* Top row: badge + goal chips */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Bot className="h-3.5 w-3.5" />
            Autopilot · pipeline AI penuh 10 tahap
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Tujuan:</span>
            {GOAL_OPTIONS.map((opt) => {
              const active = config.goal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={running}
                  onClick={() => onChangeGoal(opt.value)}
                  title={opt.hint}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                    running && "cursor-not-allowed opacity-60",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {running
              ? "AI sedang bekerja…"
              : done
                ? "Autopilot selesai"
                : "Satu klik. Pipeline AI berjalan."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {running
              ? "Memilih audiens, menulis catatan personal, mengirim koneksi LinkedIn, menjadwalkan meeting, hingga memasang Chief of Staff AI."
              : summary}
          </p>
        </div>

        {/* Action area */}
        {running ? (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3 rounded-full border border-primary/30 bg-primary/10 px-4 py-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
              </span>
              <span className="text-sm font-medium text-primary">
                Autopilot aktif — jangan tutup tab ini
              </span>
              <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
            </div>
            <Button
              size="lg"
              variant="destructive"
              onClick={onStop}
              className="h-12 px-6 text-base font-semibold"
            >
              <Square className="h-4 w-4 fill-current" />
              Hentikan Autopilot
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              onClick={onStart}
              className="h-14 flex-1 text-base font-semibold shadow-lg shadow-primary/20 sm:flex-none sm:px-10 sm:text-lg"
            >
              <Rocket className="h-5 w-5" />
              {done ? "Jalankan ulang" : "Mulai Autopilot"}
            </Button>
            {done ? (
              <p className="text-sm text-muted-foreground">
                <span className="tnum font-semibold text-foreground">
                  {meetingsBooked}
                </span>{" "}
                meeting berhasil dijadwalkan pada run terakhir.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aman dijalankan — semua aksi tunduk pada batas{" "}
                <span className="font-medium text-foreground">guardrails</span>{" "}
                di sebelah kiri.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
