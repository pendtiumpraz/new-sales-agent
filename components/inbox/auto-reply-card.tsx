"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Pencil, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useKbStore } from "@/lib/stores/kb-store";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";
import { cn } from "@/lib/utils";

type DraftSource = "real" | "mock";

interface AutoReplyCardProps {
  /** Stable id used to key the fetch + refresh when switching conversations. */
  conversationId: string;
  /** Serialized last 3–5 messages of the conversation, sent to the AI. */
  conversationContext: string;
  /** Optional contact metadata included in the request payload for context. */
  contactName?: string;
  company?: string;
  /**
   * Optional pre-computed fallback draft. Shown only as a seed while the very
   * first fetch is in flight if the server is slow.
   */
  initialDraft?: string;
  /** Approve & send. Receives the LIVE draft that was rendered in the card. */
  onApprove: (draft: string) => void;
  /** Edit. Loads the LIVE draft into the parent composer. */
  onEdit: (draft: string) => void;
  className?: string;
}

interface AutoReplyResponse {
  draft: string;
  source: DraftSource;
}

/**
 * Soft card shown above the composer when the AI has drafted a reply.
 *
 * Fetches `/api/auto-reply` on mount and whenever `conversationId` changes,
 * sending a serialized conversation snippet + the live KB snapshot from
 * `useKbStore`. The endpoint returns a real Deepseek-generated draft when
 * the AI Gateway is wired, otherwise a KB heuristic mock.
 *
 * Two actions: approve & send (Kirim) or edit (loads draft into input).
 * A small badge in the top-right surfaces whether the draft came from the
 * real model or the demo fallback, plus a refresh button to regenerate.
 */
export function AutoReplyCard({
  conversationId,
  conversationContext,
  contactName,
  company,
  initialDraft,
  onApprove,
  onEdit,
  className,
}: AutoReplyCardProps) {
  const kb = useKbStore((s) => s.kb);
  const [draft, setDraft] = useState<string>(initialDraft ?? "");
  const [source, setSource] = useState<DraftSource>("mock");
  const [loading, setLoading] = useState<boolean>(true);
  // Abort in-flight fetches when the conversation changes or we unmount.
  const abortRef = useRef<AbortController | null>(null);

  const fetchDraft = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      // Cancel any prior request for this card instance.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!opts.silent) setLoading(true);

      try {
        const res = await fetch("/api/auto-reply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationContext,
            contactName,
            company,
            kbSnapshot: kb,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AutoReplyResponse;
        // Guard against late responses from a stale conversation.
        if (controller.signal.aborted) return;
        setDraft(data.draft ?? "");
        setSource(data.source ?? "mock");
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        // Surface a toast and degrade to the offline KB heuristic locally so
        // the card always shows *something* useful.
        toast.error("Gagal memanggil AI. Beralih ke mode demo.");
        const seed = lastInboundLine(conversationContext);
        setDraft(composeKbReply(seed, kb).body);
        setSource("mock");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    // We intentionally exclude `kb` from deps — re-fetching on every KB edit
    // would be noisy. The user can press "Regenerate" to pick up KB changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationContext, contactName, company, conversationId],
  );

  // Initial fetch + re-fetch when the conversation changes.
  useEffect(() => {
    void fetchDraft();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDraft]);

  const isReal = source === "real";

  return (
    <div
      className={cn(
        "rounded-2xl border border-tertiary/30 bg-tertiary/5 p-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tertiary/15 text-tertiary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">
              AI menyarankan balasan
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  isReal
                    ? "bg-tertiary/15 text-tertiary"
                    : "bg-muted text-muted-foreground",
                )}
                title={
                  isReal
                    ? "Draft dihasilkan oleh Deepseek via AI Gateway"
                    : "Mode demo — KB heuristik (AI Gateway tidak aktif)"
                }
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isReal ? "bg-tertiary" : "bg-muted-foreground/60",
                  )}
                />
                {isReal ? "Live · Deepseek" : "Demo · KB"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => void fetchDraft()}
                disabled={loading}
                aria-label="Buat ulang draft"
                title="Buat ulang draft"
              >
                <RefreshCw
                  className={cn("h-3 w-3", loading && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          {loading && !draft ? (
            <div
              className="mt-1.5 space-y-1.5"
              aria-busy="true"
              aria-live="polite"
            >
              <p className="text-xs italic text-muted-foreground">
                Menyusun balasan AI...
              </p>
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-9/12" />
              <Skeleton className="h-3 w-7/12" />
            </div>
          ) : (
            <p
              className={cn(
                "mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground",
                loading && "opacity-60",
              )}
            >
              {draft}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => onApprove(draft)}
              disabled={loading || !draft.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              Kirim
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(draft)}
              disabled={loading || !draft.trim()}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <BookOpen className="h-3 w-3" />
              Berbasis Basis Pengetahuan
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick the last inbound (from-prospect) line out of the serialized context.
 * Used as the KB heuristic seed when we have to fall back client-side.
 */
function lastInboundLine(context: string): string {
  if (!context) return "";
  const lines = context
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const inboundPrefix =
    /^(pelanggan|kontak|mereka|customer|user|prospek|client)\s*[:\-]/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (inboundPrefix.test(lines[i])) {
      return lines[i].replace(/^[^:\-]+[:\-]\s*/, "");
    }
  }
  return lines[lines.length - 1] ?? context;
}
