"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { ProvincePoint } from "@/components/leads/leads-map";

// Leaflet needs the browser — load the map client-side only.
const LeadsMap = dynamic(() => import("@/components/leads/leads-map").then((m) => m.LeadsMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const SOURCES = [
  { v: "all", label: "Semua sumber" },
  { v: "crawl", label: "Crawl" },
  { v: "import", label: "Impor" },
  { v: "hunter", label: "Hunter" },
];
const LEADS = [
  { v: "all", label: "Semua tipe" },
  { v: "b2c_customer", label: "B2C Customer" },
  { v: "b2b_partner", label: "B2B Partner" },
];

interface ByProvinceResp {
  data: ProvincePoint[];
  unknown?: number;
}

export default function LeadsMapPage() {
  const [source, setSource] = useState("all");
  const [leadType, setLeadType] = useState("all");
  const [skill, setSkill] = useState("");
  const [skillApplied, setSkillApplied] = useState("");

  const q = useQuery({
    queryKey: ["by-province", source, leadType, skillApplied],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (source !== "all") params.set("source", source);
      if (leadType !== "all") params.set("leadType", leadType);
      if (skillApplied) params.set("skill", skillApplied);
      const r = await fetch(`/api/profiles/by-province?${params.toString()}`);
      if (!r.ok) throw new Error("gagal");
      return (await r.json()) as ByProvinceResp;
    },
  });

  const points = q.data?.data ?? [];
  const total = points.reduce((s, p) => s + p.people, 0);

  return (
    <div>
      <PageHeader
        title="Peta Sebaran Lead"
        description="Sebaran orang hasil crawl/impor per provinsi. Saring per sumber, tipe lead, atau bidang keahlian."
      />
      <div className="space-y-4 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sumber
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {SOURCES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tipe lead
            <select
              value={leadType}
              onChange={(e) => setLeadType(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {LEADS.map((l) => (
                <option key={l.v} value={l.v}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Bidang / jabatan
            <div className="flex gap-2">
              <input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSkillApplied(skill.trim())}
                placeholder="mis. logistik, marketing, procurement"
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm text-foreground"
              />
              <Button size="sm" variant="outline" onClick={() => setSkillApplied(skill.trim())}>
                <Search className="h-4 w-4" /> Saring
              </Button>
            </div>
          </label>
        </div>

        {/* Map + ranking */}
        {q.isLoading ? (
          <Skeleton className="h-[460px] w-full rounded-lg" />
        ) : points.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Belum ada data lokasi"
            description="Lokasi terisi saat crawl/impor menyertakan kota. Crawl lewat extension LinkedIn atau Discovery, lalu kembali ke sini."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="h-[460px] overflow-hidden rounded-lg border">
              <LeadsMap points={points} />
            </div>
            <div className="rounded-lg border">
              <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {total} orang terpetakan · {points.length} provinsi
                {q.data?.unknown ? ` · ${q.data.unknown} tanpa lokasi` : ""}
              </div>
              <ul className="max-h-[412px] divide-y overflow-auto">
                {points.map((p) => (
                  <li key={p.province} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      {p.province}
                    </span>
                    <b>{p.people}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
