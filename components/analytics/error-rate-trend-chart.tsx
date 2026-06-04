"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AiErrorTrendPoint } from "@/lib/types/analytics";

const TICK_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

/** Last 30-day AI error-rate trend (Coral Sunset coral fill). */
export function ErrorRateTrendChart({ data }: { data: AiErrorTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={data}
        margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      >
        <defs>
          <linearGradient id="errorRateFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FB5E3B" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#FB5E3B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(24 24% 91%)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => TICK_FMT.format(new Date(v))}
          interval={4}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 11 }}
        />
        <YAxis
          unit="%"
          width={40}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 11 }}
          domain={[0, "dataMax + 2"]}
        />
        <Tooltip
          cursor={{ stroke: "#FB5E3B", strokeWidth: 1, strokeDasharray: "3 3" }}
          formatter={(v: number) => [`${v.toFixed(2)}%`, "Tingkat kesalahan"]}
          labelFormatter={(v: string) =>
            new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(v))
          }
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(24 24% 91%)",
            background: "#ffffff",
            color: "#1B1A19",
            fontSize: 12,
            boxShadow: "0 12px 28px -8px hsl(16 45% 30% / 0.16)",
          }}
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke="#FB5E3B"
          strokeWidth={2}
          fill="url(#errorRateFill)"
          activeDot={{ r: 4, fill: "#FB5E3B", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
