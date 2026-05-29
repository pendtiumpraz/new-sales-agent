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
            border: "1px solid hsl(333 23% 31%)",
            background: "hsl(331 37% 14%)",
            color: "hsl(336 100% 93%)",
            fontSize: 12,
          }}
          itemStyle={{ color: "hsl(336 100% 93%)" }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive>
          <LabelList
            position="right"
            fill="#ffdce9"
            stroke="none"
            dataKey="label"
            className="text-xs font-medium"
          />
          <LabelList
            position="left"
            fill="#cd9eb1"
            stroke="none"
            dataKey="value"
            className="text-xs"
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
