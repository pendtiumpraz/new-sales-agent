import type { AiTemp } from "@/lib/types";

const TODAY = Date.parse("2026-05-29T00:00:00+07:00");

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function tempFromScore(score: number): AiTemp {
  return score >= 75 ? "panas" : score >= 50 ? "hangat" : "dingin";
}

/**
 * Deterministic AI lead score (0–100) for a CRM contact, so scoring is
 * consistent once a prospect becomes a contact. No data regeneration needed.
 */
export function leadScore(c: {
  id: string;
  consent?: string;
  tags?: string[];
  lastActivity?: string;
}): { score: number; temp: AiTemp } {
  let base = 35 + (hash(c.id) % 45); // 35–79 stable base
  if (c.consent === "consented") base += 10;
  else if (c.consent === "none") base -= 12;
  if (c.tags?.includes("hot-lead")) base += 14;
  if (c.tags?.includes("enterprise")) base += 6;
  if (c.tags?.includes("inbound")) base += 5;
  if (c.lastActivity) {
    const days = (TODAY - Date.parse(c.lastActivity)) / 86_400_000;
    if (days <= 7) base += 8;
    else if (days > 30) base -= 6;
  }
  const score = Math.max(6, Math.min(99, Math.round(base)));
  return { score, temp: tempFromScore(score) };
}
