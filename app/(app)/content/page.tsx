"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Eye,
  FileEdit,
  Megaphone,
  Plus,
  Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ContentLibrary } from "@/components/content/content-library";
import { ContentCalendar } from "@/components/content/content-calendar";
import { ContentCreateDialog } from "@/components/content/content-create-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContentStore } from "@/lib/stores/content-store";

const NOW = new Date("2026-05-25T00:00:00+07:00").getTime();
const WEEK_AHEAD = NOW + 7 * 864e5;
const MONTH_START = new Date("2026-05-01T00:00:00+07:00").getTime();

export default function ContentPage() {
  const items = useContentStore((s) => s.items);
  const [open, setOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  const stats = useMemo(() => {
    let drafts = 0;
    let review = 0;
    let scheduledWeek = 0;
    let publishedMonth = 0;
    let reach = 0;
    for (const it of items) {
      if (it.status === "draft") drafts++;
      else if (it.status === "review") review++;
      if (it.status === "scheduled" && it.scheduledFor) {
        const t = +new Date(it.scheduledFor);
        if (t >= NOW && t <= WEEK_AHEAD) scheduledWeek++;
      }
      if (it.status === "published" && it.scheduledFor) {
        const t = +new Date(it.scheduledFor);
        if (t >= MONTH_START) publishedMonth++;
      }
      if (it.reach) reach += it.reach;
    }
    return { drafts, review, scheduledWeek, publishedMonth, reach };
  }, [items]);

  function launchCreate(date?: string) {
    setDefaultDate(date);
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Konten"
        description="Buat dan jadwalkan broadcast WhatsApp, email, post Instagram, dan artikel."
      >
        <Button onClick={() => launchCreate()}>
          <Plus className="h-4 w-4" />
          Buat konten
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat icon={FileEdit} accent="#94A3B8" label="Draf" value={stats.drafts} />
          <Stat
            icon={Eye}
            accent="#F59E0B"
            label="Menunggu review"
            value={stats.review}
          />
          <Stat
            icon={CalendarClock}
            accent="#0D9488"
            label="Terjadwal 7 hari"
            value={stats.scheduledWeek}
          />
          <Stat
            icon={Sparkles}
            accent="#10B981"
            label="Diterbitkan bulan ini"
            value={stats.publishedMonth}
          />
          <Stat
            icon={Megaphone}
            accent="#6366F1"
            label="Total reach"
            value={stats.reach.toLocaleString("id-ID")}
          />
        </div>

        <Tabs defaultValue="library">
          <TabsList>
            <TabsTrigger value="library">Pustaka</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-5">
            <ContentLibrary />
          </TabsContent>

          <TabsContent value="calendar" className="mt-5">
            <ContentCalendar onCreate={launchCreate} />
          </TabsContent>
        </Tabs>
      </div>

      <ContentCreateDialog
        open={open}
        onOpenChange={setOpen}
        defaultDate={defaultDate}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  accent,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold tracking-tight tnum">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
