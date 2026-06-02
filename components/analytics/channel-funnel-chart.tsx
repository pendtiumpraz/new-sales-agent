"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChannelFunnelDatum } from "@/lib/types/analytics";

// Coral → teal ramp (matches dashboard pipeline-stage-chart).
const STAGE_FILL = {
  prospect: "#FB5E3B",
  qualified: "#F6845C",
  offer: "#86C7BE",
  won: "#14B8A6",
};

const STAGE_LABEL: Record<keyof typeof STAGE_FILL, string> = {
  prospect: "Prospek",
  qualified: "Kualifikasi",
  offer: "Penawaran",
  won: "Menang",
};

/** Grouped horizontal funnel by channel (WhatsApp / Email / Instagram / Tokopedia). */
export function ChannelFunnelChart({ data }: { data: ChannelFunnelDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
        barCategoryGap={16}
      >
        <CartesianGrid stroke="hsl(24 24% 91%)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="channel"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 12 }}
        />
        <YAxis
          width={40}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "hsl(24 30% 96%)" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(24 24% 91%)",
            background: "#ffffff",
            color: "#1B1A19",
            fontSize: 12,
            boxShadow: "0 12px 28px -8px hsl(16 45% 30% / 0.16)",
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="prospect" name={STAGE_LABEL.prospect} fill={STAGE_FILL.prospect} radius={[4, 4, 0, 0]} />
        <Bar dataKey="qualified" name={STAGE_LABEL.qualified} fill={STAGE_FILL.qualified} radius={[4, 4, 0, 0]} />
        <Bar dataKey="offer" name={STAGE_LABEL.offer} fill={STAGE_FILL.offer} radius={[4, 4, 0, 0]} />
        <Bar dataKey="won" name={STAGE_LABEL.won} fill={STAGE_FILL.won} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
