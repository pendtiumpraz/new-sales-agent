"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CONTENT_STATUS_META,
  CONTENT_TYPE_META,
} from "@/lib/utils/content-config";
import { useContentStore } from "@/lib/stores/content-store";
import { formatTimeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentStatus } from "@/lib/types";

const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// Anchor the demo calendar at May 2026 (matches the rest of the mock dataset)
const DEFAULT_MONTH = new Date("2026-05-01T00:00:00+07:00");
const TODAY = new Date("2026-05-25T00:00:00+07:00");

export function ContentCalendar({ onCreate }: { onCreate: (dateISO: string) => void }) {
  const items = useContentStore((s) => s.items);
  const [viewing, setViewing] = useState<Date>(DEFAULT_MONTH);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewing), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewing), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewing]);

  const scheduled = useMemo(
    () => items.filter((i) => i.scheduledFor),
    [items],
  );

  const monthLabel = viewing.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const monthlyCount = scheduled.filter(
    (i) => i.scheduledFor && isSameMonth(new Date(i.scheduledFor), viewing),
  ).length;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewing((v) => subMonths(v, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[180px] text-lg font-semibold capitalize tracking-tight">
            {monthLabel}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewing((v) => addMonths(v, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewing(DEFAULT_MONTH)}
          >
            Hari ini
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {monthlyCount} item terjadwal di bulan ini
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {DOW.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
          {days.map((day) => {
            const dayItems = scheduled
              .filter((i) => isSameDay(new Date(i.scheduledFor!), day))
              .sort(
                (a, b) =>
                  +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!),
              );
            const inMonth = isSameMonth(day, viewing);
            const isToday_ = isSameDay(day, TODAY);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "group relative min-h-[110px] border-b border-r p-1.5 text-xs transition-colors",
                  !inMonth && "bg-muted/20 text-muted-foreground/60",
                  isToday_ && "bg-primary/[0.04]",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tnum",
                      isToday_
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "font-medium",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {inMonth && (
                    <button
                      onClick={() =>
                        onCreate(day.toISOString().slice(0, 10))
                      }
                      className="rounded p-0.5 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-muted-foreground/60"
                      title="Buat konten untuk hari ini"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <CalendarChip key={item.id} item={item} />
                  ))}
                  {dayItems.length > 3 && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      + {dayItems.length - 3} lainnya
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarChip({ item }: { item: ContentItem }) {
  const setStatus = useContentStore((s) => s.setStatus);
  const meta = CONTENT_TYPE_META[item.type];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:opacity-90"
          style={{
            backgroundColor: `${meta.color}1A`,
            color: meta.color,
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="truncate">{item.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: meta.color }}
          >
            <meta.icon className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-muted-foreground">{meta.label}</p>
          </div>
          <Badge variant={CONTENT_STATUS_META[item.status].variant}>
            {CONTENT_STATUS_META[item.status].label}
          </Badge>
        </div>
        {item.scheduledFor && (
          <p className="mt-3 text-xs text-muted-foreground">
            Jadwal: {formatTimeID(item.scheduledFor)} · audiens {item.audience}
          </p>
        )}
        <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs text-foreground">
          {item.body}
        </p>
        <div className="mt-3 flex gap-2">
          {item.status === "scheduled" && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => setStatus(item.id, "published")}
            >
              Tandai diterbitkan
            </Button>
          )}
          {item.status === "published" && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled
            >
              Diterbitkan{item.reach ? ` · ${item.reach.toLocaleString("id-ID")} reach` : ""}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Re-export status type for convenience
export type { ContentStatus };
