// AI-backed running summary of a sales conversation. Server-only (imports the
// metered AI runner). Used by the chat route to compress older turns so the
// next turn carries a short summary instead of the full transcript.

import type { UIMessage } from "ai";

import type { TenantContext } from "@/lib/db/tenant-context";
import { meteredGenerateText } from "@/lib/ai/meter";
import { messagesToTranscript } from "@/lib/ai/chat-context";

const SUMMARY_SYSTEM = [
  "Kamu meringkas percakapan sales untuk dipakai sebagai konteks balasan berikutnya.",
  "Tulis ringkasan PADAT (maks ~120 kata) dalam Bahasa Indonesia, berisi:",
  "- kebutuhan / pain pelanggan yang sudah terungkap,",
  "- tahap closing saat ini (rapport / gali kebutuhan / value / objection / dekat closing),",
  "- value yang sudah disampaikan & objection yang muncul,",
  "- info penting (anggaran, timeline, decision maker) bila ada,",
  "- apakah harga sudah dibahas atau belum.",
  "Jangan mengarang detail yang tidak ada. Output poin-poin ringkas, bukan paragraf panjang.",
].join("\n");

/**
 * Summarize everything EXCEPT the last `keepRecent` turns (those stay verbatim).
 * Returns "" when there's nothing old enough to summarize, or on AI failure —
 * the caller then falls back to sending the full transcript.
 */
export async function summarizeConversation(
  ctx: TenantContext,
  messages: UIMessage[],
  keepRecent = 4,
): Promise<string> {
  const older = messages.slice(0, Math.max(0, messages.length - keepRecent));
  const transcript = messagesToTranscript(older);
  if (transcript.length < 40) return ""; // not enough history to bother

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "chat-summary",
      system: SUMMARY_SYSTEM,
      prompt: transcript,
      maxOutputTokens: 320,
    });
    return (text ?? "").trim();
  } catch (err) {
    console.error("[summarizeConversation] failed:", err);
    return "";
  }
}
