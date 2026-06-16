"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ClipboardList, Smartphone } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFieldReps } from "@/lib/api-mock/hooks";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { FieldRep } from "@/lib/types";

const FieldMap = dynamic(
  () => import("@/components/field/field-map").then((m) => m.FieldMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

const STATUS: Record<FieldRep["status"], { label: string; dot: string }> = {
  kunjungan: { label: "Sedang di kunjungan", dot: "bg-success" },
  istirahat: { label: "Istirahat", dot: "bg-warning" },
  selesai: { label: "Selesai", dot: "bg-slate-400" },
};

export default function FieldPage() {
  const { data: reps, isLoading } = useFieldReps();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("live");

  const list = (reps ?? []).filter((r) =>
    tab === "live" ? r.status === "kunjungan" : true,
  );
  const selected = reps?.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Sales Lapangan"
        description="Pantau tim lapangan Anda secara real-time di Jakarta & Surabaya."
      >
        <Button variant="outline" asChild>
          <Link href="/field/visits">
            <ClipboardList className="h-4 w-4" />
            Log kunjungan
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col lg:h-[calc(100vh-9.25rem)] lg:flex-row">
        <aside className="order-2 flex w-full shrink-0 flex-col border-t bg-card lg:order-none lg:w-80 lg:border-r lg:border-t-0">
          <div className="border-b p-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="live" className="flex-1">
                  Live
                </TabsTrigger>
                <TabsTrigger value="all" className="flex-1">
                  Semua
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border-b p-3">
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))
              : list.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => setSelectedId(rep.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b p-3 text-left transition-colors",
                      rep.id === selectedId ? "bg-accent" : "hover:bg-muted/40",
                    )}
                  >
                    <UserAvatar name={rep.name} color={rep.avatarColor} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{rep.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS[rep.status].dot)} />
                        {STATUS[rep.status].label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {rep.visitsToday}/{rep.visitsPlanned}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelativeID(rep.lastCheckIn)}
                      </p>
                    </div>
                  </button>
                ))}
          </div>

          {selected && (
            <div className="border-t bg-card p-4">
              <p className="text-sm font-medium">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {selected.city} · {selected.route.length} titik rute hari ini
              </p>
              <Button className="mt-3 w-full" asChild>
                <Link href="/m">
                  <Smartphone className="h-4 w-4" />
                  Buka tampilan mobile
                </Link>
              </Button>
            </div>
          )}
        </aside>

        <div className="order-1 h-[52vh] min-w-0 lg:order-none lg:h-auto lg:flex-1">
          <FieldMap reps={list} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </div>
  );
}
