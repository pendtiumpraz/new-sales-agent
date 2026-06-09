"use client";

import { motion, useReducedMotion } from "framer-motion";
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

export interface StageDatum {
  label: string;
  value: number;
  fill: string;
}

/** Horizontal bar chart of deal count per pipeline stage (coral → teal). */
export function PipelineStageChart({ data }: { data: StageDatum[] }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
          barCategoryGap={12}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={86}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#78716C", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(24 30% 96%)" }}
            formatter={(v: number) => [`${v} deal`, ""]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(24 24% 91%)",
              background: "#ffffff",
              color: "#1B1A19",
              fontSize: 12,
              boxShadow: "0 12px 28px -8px hsl(16 45% 30% / 0.16)",
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 8, 8, 0]}
            isAnimationActive={!reduce}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              fill="#1B1A19"
              className="text-xs font-medium"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
