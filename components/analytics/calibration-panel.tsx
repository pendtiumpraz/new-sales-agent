"use client";

// Calibration dashboard (G7) — how well closing-readiness predicts reality, from
// recorded outcomes. Per-band empirical close rate, a Brier score (numeric
// calibration), and a weekly win-rate trend, filterable per workspace. Honest:
// derived from real won/lost/stalled marks, not a model. Lives in Reports.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Target, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Calibration, TrendPoint } from "@/lib/sales/calibration";
import type { ReadinessBand } from "@/lib/sales/predictive";
import { cn } from "@/lib/utils";

const BAND_META: Record<ReadinessBand, { label: string; color: string; bar: string }> = {
  dingin: { label: "Dingin", color: "#64748b", bar: "bg-slate-400" },
  hangat: { label: "Hangat", color: "#f59e0b", bar: "bg-amber-400" },
  panas: { label: "Panas", color: "#f43f5e", bar: "bg-rose-500" },
};

interface CalibrationResponse {
  calibration: Calibration;
  trend: TrendPoint[];
}
interface WorkspaceRow {
  id: string;
  name: string;
}

function fmtWeek(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// Brier: 0 perfect · 0.25 = coin-flip · →1 worst. Qualitative tag for the tile.
function brierTag(b: number): { label: string; variant: "success" | "warning" | "destructive" } {
  if (b < 0.15) return { label: "terkalibrasi baik", variant: "success" };
  if (b < 0.25) return { label: "lumayan", variant: "warning" };
  return { label: "perlu tuning", variant: "destructive" };
}

export function CalibrationPanel() {
  const [ws, setWs] = useState<string>(""); // "" = semua workspace

  const wsQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const r = await fetch("/api/workspaces");
      if (!r.ok) return [] as WorkspaceRow[];
      return ((await r.json()).data ?? []) as WorkspaceRow[];
    },
    staleTime: 60_000,
  });
  const workspaces = wsQuery.data ?? [];

  const q = useQuery({
    queryKey: ["sales-calibration", ws],
    queryFn: async () => {
      const r = await fetch(`/api/sales/calibration${ws ? `?workspaceId=${encodeURIComponent(ws)}` : ""}`);
      if (!r.ok) throw new Error("gagal memuat kalibrasi");
      return (await r.json()) as CalibrationResponse;
    },
    staleTime: 30_000,
  });

  const wsSelect =
    workspaces.length > 0 ? (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Workspace:</span>
        <Select value={ws || "all"} onValueChange={(v) => setWs(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-56 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua workspace</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        {wsSelect}
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-[280px] w-full rounded-xl" />
      </div>
    );
  }

  const cal = q.data?.calibration;
  const trend = q.data?.trend ?? [];
  const total = cal?.total ?? 0;
  const totalWon = cal?.byBand.reduce((s, b) => s + b.won, 0) ?? 0;
  const overall = total > 0 ? Math.round((totalWon / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="space-y-4">
        {wsSelect}
        <EmptyState
          icon={Target}
          title={ws ? "Belum ada outcome untuk workspace ini" : "Belum ada outcome tercatat"}
          description="Tandai hasil obrolan (Closing / Gagal / Stuck) di atas thread Inbox. Setelah beberapa ditandai, closing-rate per band readiness muncul di sini dan dipakai untuk mengkalibrasi prediksi."
        />
      </div>
    );
  }

  const chartData = trend.map((t) => ({ period: fmtWeek(t.period), rate: Math.round(t.closeRate * 100), total: t.total }));
  const brier = cal?.brier;
  const tag = brier != null ? brierTag(brier) : null;

  return (
    <div className="space-y-6">
      {wsSelect}

      {/* Headline strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Outcome tercatat</p>
            <p className="tnum mt-1 text-3xl font-semibold tracking-tight">{total}</p>
            <p className="mt-1 text-xs text-muted-foreground">won / lost / stuck</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Win rate keseluruhan</p>
            <p className="tnum mt-1 text-3xl font-semibold tracking-tight">{overall}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{totalWon} closing dari {total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Brier score</p>
            <p className="tnum mt-1 text-3xl font-semibold tracking-tight">{brier != null ? brier.toFixed(3) : "—"}</p>
            {tag ? (
              <Badge variant={tag.variant} className="mt-1">{tag.label}</Badge>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">perlu ≥{cal?.minSamples ?? 10} outcome</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center p-5">
            <p className="text-sm text-muted-foreground">Status kalibrasi</p>
            <div className="mt-1.5">
              {cal?.ready ? (
                <Badge variant="success" className="gap-1">
                  <TrendingUp className="h-3 w-3" /> Siap dipakai
                </Badge>
              ) : (
                <Badge variant="warning">Kumpulkan ≥{cal?.minSamples ?? 10} (kini {total})</Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Skor readiness diberi anotasi closing-rate band-nya saat data cukup.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-band table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" /> Closing-rate per band readiness
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Dari obrolan yang readiness-nya di band tertentu, berapa persen yang akhirnya closing. Inilah akurasi
            prediksi yang sebenarnya — makin tinggi band, harusnya makin tinggi closing-rate. Brier score di atas
            mengukurnya sebagai satu angka (makin kecil makin akurat).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Band</TableHead>
                <TableHead className="text-right">Outcome (n)</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead>Closing-rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(["panas", "hangat", "dingin"] as ReadinessBand[]).map((band) => {
                const s = cal?.byBand.find((b) => b.band === band);
                const meta = BAND_META[band];
                const pct = s && s.closeRate != null ? Math.round(s.closeRate * 100) : null;
                const enough = (s?.n ?? 0) >= 3;
                return (
                  <TableRow key={band}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="tnum text-right">{s?.n ?? 0}</TableCell>
                    <TableCell className="tnum text-right">{s?.won ?? 0}</TableCell>
                    <TableCell>
                      {pct == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", meta.bar)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={cn("tnum text-sm", !enough && "text-muted-foreground")}>
                            {pct}%{!enough && <span className="ml-1 text-[10px]">(n kecil)</span>}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Win-rate trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tren win-rate mingguan</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Persentase obrolan yang closing per minggu.</p>
        </CardHeader>
        <CardContent>
          {chartData.length < 2 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Belum cukup minggu untuk menggambar tren — perlu outcome di ≥2 minggu berbeda.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <RTooltip
                  formatter={(v: number, _n, p) => [`${v}% (${p?.payload?.total ?? 0} outcome)`, "Win rate"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="rate" stroke="#FB5E3B" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
