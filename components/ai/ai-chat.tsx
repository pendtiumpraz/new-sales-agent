"use client";

// Global AI assistant — wired to real Deepseek via `/api/chat` using the
// AI SDK v6 `useChat` hook + `DefaultChatTransport`.
//
// Design intent (Coral Sunset / shadcn primitives):
//  - Sources chips + segment footer are computed CLIENT-SIDE via composeKbReply
//    (Option A from the plan). Cheap, deterministic, identical UI regardless
//    of whether the backend was real Deepseek or the mock fallback.
//  - The fetch is wrapped so we can read the `x-ai-source` response header and
//    surface a "Live · Deepseek" / "Demo · KB heuristic" badge at the top.
//  - Greeting + suggestion chips + Radar avatar + primary user bubble + muted
//    assistant bubble + typing dots are all preserved.

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { BookOpen, Radar, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useKbStore } from "@/lib/stores/kb-store";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";

const SUGGESTIONS = [
  "Berapa harga paket untuk UMKM?",
  "Produk apa yang cocok untuk tim 15 orang?",
  "Bagaimana strategi retensi pelanggan Enterprise?",
];

const GREETING_ID = "greeting";
const GREETING_TEXT =
  "Halo! Saya asisten sales Anda yang sudah belajar dari Basis Pengetahuan klien. Saya bisa bantu menjawab pertanyaan harga, kecocokan produk per segmen, strategi marketing, upsell, dan alur retensi. Mau mulai dari mana?";

const GREETING_MESSAGE: UIMessage = {
  id: GREETING_ID,
  role: "assistant",
  parts: [{ type: "text", text: GREETING_TEXT }],
};

type AiSource = "real" | "mock" | "unknown";

/** Pull all text content out of a UIMessage's `parts` array. */
function readMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function AiChat({ className }: { className?: string }) {
  const kb = useKbStore((s) => s.kb);

  // Source indicator badge — toggled by reading `x-ai-source` from the response.
  const [aiSource, setAiSource] = useState<AiSource>("unknown");

  // Build the transport once. We wrap `fetch` so we can sniff the response
  // header without losing the streaming body that `useChat` will consume.
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const src = res.headers.get("x-ai-source");
        if (src === "real" || src === "mock") {
          setAiSource(src);
        } else {
          setAiSource("unknown");
        }
        return res;
      },
    });
  }, []);

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: [GREETING_MESSAGE],
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isBusy = status === "submitted" || status === "streaming";

  // Auto-scroll on every new chunk + when typing dots appear/disappear.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isBusy]);

  // Find the last user-message text — used to deterministically compose the
  // "Sumber" chips + segment footer for the next assistant turn (Option A).
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user") return readMessageText(m);
    }
    return "";
  }, [messages]);

  // Cached KB-derived reply — gives us sources + segmentHit for every
  // assistant message that came after a user message.
  const kbReplyForLast = useMemo(() => {
    if (!lastUserText) return null;
    return composeKbReply(lastUserText, kb);
  }, [lastUserText, kb]);

  function submit(text: string) {
    const prompt = text.trim();
    if (!prompt || isBusy) return;
    setInput("");
    // Per-call body extension — Agent B's POST handler reads `kbSnapshot`.
    void sendMessage({ text: prompt }, { body: { kbSnapshot: kb } });
  }

  // Index of the last assistant message — only that bubble shows the
  // KB-derived sources/footer (older turns keep their text only).
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].id !== GREETING_ID) {
        return i;
      }
    }
    return -1;
  }, [messages]);

  const showSuggestions = messages.length <= 1;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Source indicator badge — Live (coral) vs Demo (muted). */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Radar className="h-3 w-3 text-primary" />
          Asisten Sales
        </div>
        <SourceBadge source={aiSource} />
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.map((m, idx) => {
          const text = readMessageText(m);
          const isLastAssistant = idx === lastAssistantIndex;
          return (
            <div
              key={m.id}
              className={cn(
                "flex gap-2.5",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Radar className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[82%] space-y-2",
                  m.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "whitespace-pre-line rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {text}
                </div>

                {/* Sources chips — only on the latest assistant reply, and
                    only when we have a user prompt to compose against. */}
                {m.role === "assistant" &&
                  isLastAssistant &&
                  kbReplyForLast &&
                  kbReplyForLast.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" />
                        Sumber
                      </span>
                      {kbReplyForLast.sources.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          <BookOpen className="h-2.5 w-2.5 text-primary/70" />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                {/* Segment footer — every assistant turn except the greeting. */}
                {m.role === "assistant" &&
                  m.id !== GREETING_ID &&
                  isLastAssistant && (
                    <p className="text-[10px] italic text-muted-foreground/70">
                      Disusun dari Basis Pengetahuan klien
                      {kbReplyForLast?.segmentHit
                        ? ` · segmen ${kbReplyForLast.segmentHit}`
                        : ""}
                    </p>
                  )}
              </div>
            </div>
          );
        })}

        {isBusy && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Radar className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya apa saja tentang sales Anda..."
          className="flex-1"
          disabled={isBusy}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || isBusy}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function SourceBadge({ source }: { source: AiSource }) {
  if (source === "real") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Live · Deepseek
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      Demo · KB heuristic
    </span>
  );
}
