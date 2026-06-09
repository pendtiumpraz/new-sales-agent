"use client";

import { useState } from "react";
import { Filter, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
 * retention flow. State is local; saving is mocked.
 */
export function AudienceFilter({
  initialSegment,
}: {
  initialSegment?: string;
}) {
  const [segment, setSegment] = useState(initialSegment ?? "Semua");
  const [minDays, setMinDays] = useState(0);
  const [maxDays, setMaxDays] = useState(90);
  const [tags, setTags] = useState<Set<string>>(new Set(["Repeat"]));

  function toggleTag(tag: string) {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
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
            className="tnum bg-amber-100 text-amber-700"
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
      </CardContent>
    </Card>
  );
}
