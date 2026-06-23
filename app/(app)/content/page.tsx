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
import { KpiStrip, KpiTile } from "@/components/shared/kpi-tile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContentStore } from "@/lib/stores/content-store";

const NOW = Date.now(); // real clock (was a hardcoded demo date → stale KPIs)
const WEEK_AHEAD = NOW + 7 * 864e5;
const _now = new Date();
const MONTH_START = new Date(_now.getFullYear(), _now.getMonth(), 1).getTime();

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
        {/* KPI strip — shared KpiTile */}
        <KpiStrip className="lg:grid-cols-5">
          <KpiTile icon={<FileEdit className="h-5 w-5" />} accent="#94A3B8" label="Draf" count={stats.drafts} />
          <KpiTile icon={<Eye className="h-5 w-5" />} accent="#F59E0B" label="Menunggu review" count={stats.review} />
          <KpiTile icon={<CalendarClock className="h-5 w-5" />} accent="#0D9488" label="Terjadwal 7 hari" count={stats.scheduledWeek} />
          <KpiTile icon={<Sparkles className="h-5 w-5" />} accent="#10B981" label="Diterbitkan bulan ini" count={stats.publishedMonth} />
          <KpiTile icon={<Megaphone className="h-5 w-5" />} accent="#6366F1" label="Total reach" value={stats.reach.toLocaleString("id-ID")} />
        </KpiStrip>

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

