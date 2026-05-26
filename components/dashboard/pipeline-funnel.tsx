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
            borderRadius: 8,
            border: "1px solid #E2E8F0",
            fontSize: 12,
          }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive>
          <LabelList
            position="right"
            fill="#0F172A"
            stroke="none"
            dataKey="label"
            className="text-xs font-medium"
          />
          <LabelList
            position="left"
            fill="#475569"
            stroke="none"
            dataKey="value"
            className="text-xs"
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
