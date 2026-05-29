"use client";

import {
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface FunnelDatum {
  label: string;
  value: number;
  fill: string;
}

export function PipelineFunnel({ data }: { data: FunnelDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <FunnelChart>
        <Tooltip
          formatter={(v: number) => [`${v} deal`, ""]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(24 24% 91%)",
            background: "#ffffff",
            color: "#1B1A19",
            fontSize: 12,
            boxShadow: "0 12px 28px -8px hsl(16 45% 30% / 0.16)",
          }}
          itemStyle={{ color: "#1B1A19" }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive>
          <LabelList
            position="right"
            fill="#1B1A19"
            stroke="none"
            dataKey="label"
            className="text-xs font-medium"
          />
          <LabelList
            position="left"
            fill="#78716C"
            stroke="none"
            dataKey="value"
            className="text-xs"
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
