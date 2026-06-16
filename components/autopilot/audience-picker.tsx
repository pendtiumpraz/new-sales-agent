"use client";

import { useMemo } from "react";
import { Filter, Sparkles, Target, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import { classifySegment, cityMatches, type Segment } from "@/lib/autopilot/audience";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/components/autopilot/use-animated-number";

const SEGMENTS: { value: Segment; label: string; hint: string }[] = [
  { value: "UMKM", label: "UMKM", hint: "< 50 karyawan" },
  { value: "Menengah", label: "Menengah", hint: "50–250 karyawan" },
  { value: "Korporat", label: "Korporat", hint: "250+ karyawan" },
];

/**
 * Audience picker — drives `useAutopilotStore.config` for segment, min AI
 * score, city, and cap. Renders a live "Y prospek cocok" estimate from the
 * Prospecting store so the operator sees what the run will actually hit.
 */
export function AudiencePicker({ disabled }: { disabled?: boolean }) {
  const config = useAutopilotStore((s) => s.config);
  const setConfig = useAutopilotStore((s) => s.setConfig);
  const prospects = useProspectingStore((s) => s.prospects);

  const matches = useMemo(() => {
    const segment = config.audienceSegment;
    const minScore = config.audienceMinScore ?? 0;
    return prospects.filter((p) => {
      if (segment && classifySegment(p.companySize) !== segment) return false;
      if (p.aiScore < minScore) return false;
      if (!cityMatches(p.city, config.audienceCity)) return false;
      return true;
    });
  }, [prospects, config.audienceSegment, config.audienceMinScore, config.audienceCity]);

  const cap = config.audienceCap ?? 0;
  const effective = cap > 0 ? Math.min(matches.length, cap) : matches.length;

  // Smoothly interpolate between consecutive matched-count values as the
  // operator nudges the segment chips / score slider / city filter / cap.
  const animatedEffective = useAnimatedNumber(effective, 400);
  const animatedTotal = useAnimatedNumber(matches.length, 400);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Audiens
        </CardTitle>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary/10 px-2.5 py-1 text-xs font-medium text-tertiary">
          <Sparkles className="h-3 w-3" />
          <span className="tnum">{Math.round(animatedEffective)}</span> prospek cocok
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Segment chips */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Segmen bisnis
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((seg) => {
              const active = config.audienceSegment === seg.value;
              return (
                <button
                  key={seg.value}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setConfig({
                      audienceSegment: active ? undefined : seg.value,
                    })
                  }
                  className={cn(
                    "inline-flex flex-col items-start rounded-2xl border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-card text-foreground hover:border-primary/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="text-sm font-medium">{seg.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {seg.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Min AI score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="ap-min-score"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Skor AI minimum
            </Label>
            <span className="tnum text-sm font-semibold text-foreground">
              {config.audienceMinScore ?? 0}
            </span>
          </div>
          <input
            id="ap-min-score"
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={config.audienceMinScore ?? 0}
            onChange={(e) =>
              setConfig({ audienceMinScore: Number(e.target.value) })
            }
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-[11px] text-muted-foreground">
            Hanya prospek dengan skor ≥ {config.audienceMinScore ?? 0} akan
            dihubungi.
          </p>
        </div>

        {/* City + cap */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ap-city" className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Filter className="h-3 w-3" /> Kota
            </Label>
            <Input
              id="ap-city"
              type="text"
              disabled={disabled}
              placeholder="Semua kota"
              value={config.audienceCity ?? ""}
              onChange={(e) =>
                setConfig({
                  audienceCity: e.target.value.trim() || undefined,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-cap" className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Users className="h-3 w-3" /> Maks. prospek
            </Label>
            <Input
              id="ap-cap"
              type="number"
              min={1}
              max={500}
              disabled={disabled}
              value={config.audienceCap ?? 0}
              onChange={(e) =>
                setConfig({
                  audienceCap: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </div>
        </div>

        {/* Live estimate footer */}
        <div className="rounded-2xl border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Total cocok di basis prospek</span>
            <span className="tnum font-semibold text-foreground">
              {Math.round(animatedTotal)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Akan dihubungi pada run ini</span>
            <span className="tnum font-semibold text-primary">
              {Math.round(animatedEffective)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
