// Conversation OUTCOME store (Phase 4 / G7 training loop). Records how chats
// actually ended (won / lost / stalled) so the predictive scorer can be CALIBRATED
// against reality (per-band empirical close rate) instead of staying a blind
// heuristic. Zero-migration: platformSettingTable key/value.
//   convoutcome:<conversationId>  → latest OutcomeRecord for that chat
//   closeoutcomes:<tenantId>      → bounded JSON log (dedup by conversationId)

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";
import type { ReadinessBand } from "@/lib/sales/predictive";

export type Outcome = "won" | "lost" | "stalled";

export interface OutcomeRecord {
  conversationId: string;
  outcome: Outcome;
  score: number; // readiness score at outcome time (0–100)
  band: ReadinessBand; // band at outcome time
  source: "manual" | "auto";
  ts: string; // ISO
}

const LOG_CAP = 500; // keep the per-tenant log bounded (one key/value row)

async function getJson<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(platformSettingTable).where(eq(platformSettingTable.key, key)).limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}
async function setJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await db
    .insert(platformSettingTable)
    .values({ key, value: v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettingTable.key, set: { value: v, updatedAt: new Date() } });
}

export async function loadOutcome(conversationId: string): Promise<OutcomeRecord | null> {
  return getJson<OutcomeRecord>(`convoutcome:${conversationId}`);
}

export async function loadTenantOutcomes(tenantId: string): Promise<OutcomeRecord[]> {
  return (await getJson<OutcomeRecord[]>(`closeoutcomes:${tenantId}`)) ?? [];
}

// Record (or overwrite) a conversation's outcome + update the tenant log. The log
// is deduped by conversationId so a chat is never double-counted in calibration
// (a manual mark replaces an earlier auto-captured one).
export async function recordOutcome(tenantId: string, rec: OutcomeRecord): Promise<void> {
  await setJson(`convoutcome:${rec.conversationId}`, rec);
  const log = await loadTenantOutcomes(tenantId);
  const next = log.filter((r) => r.conversationId !== rec.conversationId);
  next.push(rec);
  await setJson(`closeoutcomes:${tenantId}`, next.slice(-LOG_CAP));
}

// HIGH-PRECISION outcome signals for AUTO-capture. Deliberately strict (explicit
// payment/cancel language) — the loose closingIntent ("oke", "lanjut") is NOT used
// here, so the calibration log isn't polluted with false wins.
const WON_CONFIRMED =
  /\b(sudah|udah|sdh|telah)\s+(transfer|tf|bayar|saya bayar|saya order|saya pesan)\b|\b(pembayaran berhasil|fix order|jadi (pesan|order|ambil)|deal ya)\b/i;
const LOST_CONFIRMED =
  /\b(gak|ga|nggak|tidak)\s+jadi\b|\b(batal(in)?|cancel|maaf belum|nggak dulu|gak dulu|pakai (yang|yg) lain|sudah pakai (kompetitor|merek lain))\b/i;

export function detectOutcome(text: string): Outcome | null {
  if (WON_CONFIRMED.test(text)) return "won";
  if (LOST_CONFIRMED.test(text)) return "lost";
  return null;
}
