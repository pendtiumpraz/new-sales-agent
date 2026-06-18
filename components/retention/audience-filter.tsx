"use client";

import { useMemo, useState } from "react";
import { Filter, Save, Tag, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { estimateAudience } from "@/lib/api-mock/retention";
import { useRetentionStore } from "@/lib/stores/retention-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SEGMENTS = ["Semua", "UMKM", "Menengah", "Korporat", "Enterprise"];
const TAG_OPTIONS = ["VIP", "Repeat", "Baru", "Korporat", "Referral"];

/**
 * Audience filter panel — segment + interaction-history conditions for a
 * retention flow. Persists to the retention store (per flow) and shows a live
 * estimate computed from the candidate pool.
 */
export function AudienceFilter({
  flowId,
  initialSegment,
}: {
  flowId: string;
  initialSegment?: string;
}) {
  const candidates = useRetentionStore((s) => s.candidates);
  const saved = useRetentionStore((s) => s.audienceFilters[flowId]);
  const setAudienceFilter = useRetentionStore((s) => s.setAudienceFilter);
  const enrollAudience = useRetentionStore((s) => s.enrollAudience);

  const [segment, setSegment] = useState(
    saved?.segment ?? initialSegment ?? "Semua",
  );
  const [minDays, setMinDays] = useState(saved?.minDaysSinceInteraction ?? 0);
  const [maxDays, setMaxDays] = useState(saved?.maxDaysSinceInteraction ?? 90);
  const [tags, setTags] = useState<Set<string>>(
    new Set(saved?.tags ?? ["Repeat"]),
  );

  const currentFilter = useMemo(
    () => ({
      segment,
      minDaysSinceInteraction: minDays,
      maxDaysSinceInteraction: maxDays,
      tags: Array.from(tags),
    }),
    [segment, minDays, maxDays, tags],
  );

  // Real count from the candidate pool — now honors segment + tags + day-range
  // (candidates carry backing segment/tag data), so the number matches what
  // "Daftarkan audiens" actually enrolls.
  const estimate = useMemo(
    () => estimateAudience(candidates, currentFilter),
    [candidates, currentFilter],
  );

  function toggleTag(tag: string) {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function onSaveFilter() {
    setAudienceFilter(flowId, currentFilter);
    toast.success(`Filter audiens disimpan — ${estimate} pelanggan memenuhi.`);
  }

  function onEnrollAudience() {
    if (estimate === 0) {
      toast.error("Tidak ada kandidat yang cocok dengan filter ini.");
      return;
    }
    setAudienceFilter(flowId, currentFilter);
    enrollAudience(flowId, currentFilter);
    toast.success(
      `${estimate} pelanggan didaftarkan ke flow ini & keluar dari daftar kandidat.`,
    );
  }

  return (
    <Card className="border-primary/15">
      <CardHeader className="border-b border-primary/10 bg-gradient-to-r from-primary/5 via-card to-tertiary/5">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Filter className="h-3.5 w-3.5" />
          </span>
          Audiens & filter
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Saring pelanggan berdasarkan segmen produk dan riwayat interaksi.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div>
          <Label className="mb-1.5 block">Segmen produk</Label>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="min-days" className="mb-1.5 block">
              Min. hari sejak interaksi
            </Label>
            <Input
              id="min-days"
              type="number"
              min={0}
              value={minDays}
              onChange={(e) => setMinDays(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="max-days" className="mb-1.5 block">
              Maks. hari sejak interaksi
            </Label>
            <Input
              id="max-days"
              type="number"
              min={0}
              value={maxDays}
              onChange={(e) => setMaxDays(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Tag pelanggan</Label>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map((tag) => {
              const on = tags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-tertiary/20 bg-tertiary/5 p-3 text-xs">
          <span className="font-medium text-tertiary">Pratinjau filter:</span>
          <Badge
            variant="muted"
            className="bg-tertiary/10 text-tertiary"
          >
            Segmen: {segment}
          </Badge>
          <Badge
            variant="muted"
            className="tnum bg-warning/15 text-warning"
          >
            {minDays}–{maxDays} hari
          </Badge>
          {Array.from(tags).map((t) => (
            <Badge
              key={t}
              variant="secondary"
              className="bg-primary/10 text-primary"
            >
              {t}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Estimasi audiens</p>
            <p className="tnum text-lg font-semibold text-foreground">
              ~{estimate}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                kandidat cocok
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onSaveFilter}>
              <Save className="h-3.5 w-3.5" />
              Simpan filter
            </Button>
            <Button size="sm" onClick={onEnrollAudience} disabled={estimate === 0}>
              <UserPlus className="h-3.5 w-3.5" />
              Daftarkan audiens
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Filter menyaring kandidat berdasarkan segmen, tag, dan rentang hari
          sejak interaksi. “Daftarkan audiens” mendaftarkan semua kandidat yang
          cocok ke flow ini dan mengeluarkannya dari daftar kandidat.
        </p>
      </CardContent>
    </Card>
  );
}
