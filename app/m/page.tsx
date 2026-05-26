"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Navigation, Route } from "lucide-react";

import { MiniMap } from "@/components/mobile/mini-map";
import { Button } from "@/components/ui/button";
import { formatDateID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

const SCHEDULE = [
  { time: "09:00", customer: "PT Sentosa Jaya", area: "Sudirman, Jakarta", status: "selesai" },
  { time: "10:30", customer: "CV Mitra Sejahtera", area: "Kuningan, Jakarta", status: "selesai" },
  { time: "13:00", customer: "Toko Berkah Abadi", area: "Tanah Abang, Jakarta", status: "sekarang" },
  { time: "14:30", customer: "PT Cahaya Nusantara", area: "Menteng, Jakarta", status: "akan" },
  { time: "15:45", customer: "UD Sumber Rejeki", area: "Senen, Jakarta", status: "akan" },
  { time: "16:30", customer: "Koperasi Karyawan", area: "Gambir, Jakarta", status: "akan" },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  selesai: { label: "Selesai", cls: "bg-success/10 text-success" },
  sekarang: { label: "Sekarang", cls: "bg-primary/10 text-primary" },
  akan: { label: "Akan datang", cls: "bg-muted text-muted-foreground" },
};

export default function MobileHomePage() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Halo, Andi 👋</p>
          <p className="text-xs text-muted-foreground">{formatDateID("2026-05-25")}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">
          AH
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat icon={MapPin} label="Kunjungan" value="2 / 6" />
        <Stat icon={Route} label="Jarak tempuh" value="18 km" />
      </div>

      <MiniMap className="mt-4 h-36" />
      <Button className="mt-3 w-full" asChild>
        <Link href="/m/check-in">
          <Navigation className="h-4 w-4" />
          Mulai kunjungan berikutnya
        </Link>
      </Button>

      <h2 className="mb-2 mt-5 text-sm font-semibold">Jadwal hari ini</h2>
      <ul className="space-y-2">
        {SCHEDULE.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card p-3",
              s.status === "sekarang" && "border-primary ring-1 ring-primary",
            )}
          >
            <div className="w-12 shrink-0 text-center">
              <p className="text-sm font-semibold tnum">{s.time}</p>
              <p className="text-[10px] text-muted-foreground">WIB</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.customer}</p>
              <p className="truncate text-xs text-muted-foreground">{s.area}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                STATUS[s.status].cls,
              )}
            >
              {STATUS[s.status].label}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-lg font-semibold tnum">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
