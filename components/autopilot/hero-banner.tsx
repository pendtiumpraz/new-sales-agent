"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Circle, Loader2, Rocket, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import {
  AUTOPILOT_STEPS,
  type AutopilotRunConfig,
} from "@/lib/types/autopilot";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/components/autopilot/use-animated-number";

const GOAL_OPTIONS: {
  value: AutopilotRunConfig["goal"];
  label: string;
  hint: string;
}[] = [
  { value: "book-meeting", label: "Booking meeting", hint: "Optimasi untuk jadwal terkonfirmasi" },
  { value: "build-relationship", label: "Bangun relasi", hint: "Fokus koneksi & engagement" },
  { value: "qualify", label: "Kualifikasi", hint: "Saring kebutuhan & anggaran" },
];

const TOTAL_STEPS = AUTOPILOT_STEPS.length;

/**
 * Hero banner — the visual centerpiece of /autopilot.
 *
 * Three states, three vibes:
 *  - idle:    coral "aura" pulses around the giant Mulai Autopilot CTA, an
 *             animated count-up advertises matched prospects.
 *  - running: button morphs into a mission-control status bar with a smooth
 *             progress fill (events.done / TOTAL_STEPS), pulsing coral dot,
 *             and a kill-switch that slides in from the right.
 *  - done:    sparkles burst behind the CTA (700ms), KPIs cascade, and the
 *             button morphs into "Jalankan ulang" with a subtle bounce.
 *
 * All flashy animation respects `useReducedMotion()`.
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
  const reduce = useReducedMotion();

  // Live count-up for "Siap diluncurkan · N prospek terdeteksi".
  const animatedProspects = useAnimatedNumber(estimatedProspects, 500);

  // Pull live events to drive the running progress bar + active-step label.
  const events = useAutopilotStore((s) => s.currentRun?.events ?? []);
  const doneCount = useMemo(
    () => events.filter((e) => e.status === "done").length,
    [events],
  );
  const activeEvent = useMemo(
    () => [...events].reverse().find((e) => e.status === "running"),
    [events],
  );
  const activeIndex = useMemo(() => {
    if (!activeEvent) return Math.min(doneCount, TOTAL_STEPS - 1);
    const i = AUTOPILOT_STEPS.findIndex((s) => s.key === activeEvent.step);
    return i >= 0 ? i : doneCount;
  }, [activeEvent, doneCount]);
  const activeLabel =
    activeEvent?.title ?? AUTOPILOT_STEPS[activeIndex]?.label ?? "Bersiap…";
  const progressPct = Math.min(
    100,
    Math.round((doneCount / TOTAL_STEPS) * 100),
  );

  // Celebration sparkles — fires once whenever `done` flips true.
  const [sparkleSeed, setSparkleSeed] = useState(0);
  const prevDone = useRef(false);
  useEffect(() => {
    if (done && !prevDone.current) {
      setSparkleSeed((s) => s + 1);
    }
    prevDone.current = done;
  }, [done]);

  const summary =
    `AI akan menghubungi ${estimatedProspects} prospek ` +
    `${config.audienceSegment ?? "semua segmen"}, ` +
    `menjadwalkan meeting, dan menyiapkan ringkasan pasca-meeting.`;

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
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

        {/* Headline — animates on state change */}
        <div className="min-h-[78px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={running ? "running" : done ? "done" : "idle"}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {running
                  ? "AI sedang bekerja…"
                  : done
                    ? `Autopilot selesai — ${meetingsBooked} meeting dijadwalkan.`
                    : "Satu klik. Pipeline AI berjalan."}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {running
                  ? "Memilih audiens, menulis catatan personal, mengirim koneksi LinkedIn, menjadwalkan meeting, hingga memasang Chief of Staff AI."
                  : done
                    ? "Pantau metrik di bawah — semua angka di-update secara langsung."
                    : summary}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Action area */}
        <AnimatePresence mode="wait" initial={false}>
          {running ? (
            <motion.div
              key="running"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
            >
              <RunningStatusBar
                activeIndex={activeIndex}
                activeLabel={activeLabel}
                doneCount={doneCount}
                progressPct={progressPct}
                reduce={!!reduce}
              />
              <motion.div
                initial={reduce ? false : { x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={reduce ? undefined : { x: 24, opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
              >
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={onStop}
                  className="h-12 w-full px-6 text-base font-semibold sm:w-auto"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Hentikan Autopilot
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
            >
              <div className="relative inline-flex sm:flex-none">
                {/* Sparkle burst behind the CTA on completion. */}
                <SparkleBurst seed={sparkleSeed} reduce={!!reduce} />
                <motion.div
                  whileHover={reduce ? undefined : { scale: 1.04 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  animate={
                    done && !reduce
                      ? { y: [0, -6, 0, -3, 0] }
                      : undefined
                  }
                  transition={
                    done && !reduce
                      ? { duration: 0.6, ease: "easeOut" }
                      : { type: "spring", stiffness: 320, damping: 22 }
                  }
                  className={cn(
                    "relative rounded-2xl",
                    !done && !reduce && "animate-ap-aura",
                  )}
                >
                  <Button
                    size="lg"
                    onClick={onStart}
                    className="h-14 w-full text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto sm:px-10 sm:text-lg"
                  >
                    <Rocket className="h-5 w-5" />
                    {done ? "Jalankan ulang" : "Mulai Autopilot"}
                  </Button>
                </motion.div>
              </div>

              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {done ? (
                  <p>
                    <span className="tnum font-semibold text-foreground">
                      {meetingsBooked}
                    </span>{" "}
                    meeting berhasil dijadwalkan pada run terakhir.
                  </p>
                ) : (
                  <p>
                    Aman dijalankan — semua aksi tunduk pada batas{" "}
                    <span className="font-medium text-foreground">guardrails</span>{" "}
                    di sebelah kiri.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Siap diluncurkan ·{" "}
                  <span className="tnum font-semibold text-primary">
                    {Math.round(animatedProspects)}
                  </span>{" "}
                  prospek terdeteksi
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

/**
 * Mission-control status bar — replaces the CTA while a run is active. Shows
 * "Langkah N dari 10 · <step name>" with a coral dot and a smooth progress
 * fill that tracks `events.done / TOTAL_STEPS`.
 */
function RunningStatusBar({
  activeIndex,
  activeLabel,
  doneCount,
  progressPct,
  reduce,
}: {
  activeIndex: number;
  activeLabel: string;
  doneCount: number;
  progressPct: number;
  reduce: boolean;
}) {
  const stepNumber = Math.min(TOTAL_STEPS, Math.max(1, activeIndex + 1));
  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
      {/* Progress fill — sits behind the text */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary/15"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${progressPct}%` }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 80, damping: 20 }
        }
      />
      <div className="relative flex items-center gap-3">
        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
          {!reduce && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          )}
          <Circle className="relative h-3 w-3 fill-primary text-primary" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
            Langkah <span className="tnum">{stepNumber}</span> dari{" "}
            <span className="tnum">{TOTAL_STEPS}</span> ·{" "}
            <span className="tnum">{doneCount}</span> selesai
          </span>
          <span className="truncate text-sm font-semibold text-primary">
            {activeLabel}
          </span>
        </div>

        <Loader2
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-primary",
            !reduce && "animate-spin",
          )}
        />
      </div>
    </div>
  );
}

/**
 * Sparkle burst — five tiny coral dots radiate outward from the CTA over
 * ~700ms. Re-renders entirely each `seed` bump so the CSS animation restarts.
 * No-op when the user prefers reduced motion.
 */
function SparkleBurst({ seed, reduce }: { seed: number; reduce: boolean }) {
  if (seed === 0 || reduce) return null;
  // Fan dots in five directions around the button center.
  const dots = [
    { x: -56, y: -40, delay: 0 },
    { x: 56, y: -42, delay: 60 },
    { x: -64, y: 28, delay: 30 },
    { x: 60, y: 32, delay: 90 },
    { x: 0, y: -64, delay: 120 },
  ];
  return (
    <span
      key={seed}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-1 w-1"
    >
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute left-0 top-0 h-2 w-2 rounded-full bg-primary animate-ap-sparkle"
          style={
            {
              ["--ap-x"]: `${d.x}px`,
              ["--ap-y"]: `${d.y}px`,
              animationDelay: `${d.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
