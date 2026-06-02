"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AiErrorTypeBreakdown } from "@/lib/types/analytics";

// Reds → amber ramp (errors get warmer with severity).
const TYPE_FILL = ["#DC2626", "#F97316", "#F59E0B", "#FACC15"];

/** Horizontal bar chart of AI error counts by type. */
export function ErrorTypeBreakdownChart({
  data,
}: {
  data: AiErrorTypeBreakdown[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 32, top: 4, bottom: 4 }}
        barCategoryGap={10}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="type"
          width={170}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#1B1A19", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "hsl(24 30% 96%)" }}
          formatter={(v: number, _n, item) => {
            const rate = (item?.payload as AiErrorTypeBreakdown | undefined)?.rate;
            return [`${v} kasus${rate != null ? ` · ${rate.toFixed(2)}%` : ""}`, ""];
          }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(24 24% 91%)",
            background: "#ffffff",
            color: "#1B1A19",
            fontSize: 12,
            boxShadow: "0 12px 28px -8px hsl(16 45% 30% / 0.16)",
          }}
        />
        <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive>
          {data.map((_, i) => (
            <Cell key={i} fill={TYPE_FILL[i % TYPE_FILL.length]} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fill="#1B1A19"
            className="text-xs font-medium"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
