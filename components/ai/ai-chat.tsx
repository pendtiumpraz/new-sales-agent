"use client";

// Global AI assistant — wired to real Deepseek via `/api/chat` using the
// AI SDK v6 `useChat` hook + `DefaultChatTransport`.
//
// Design intent (Coral Sunset / shadcn primitives + framer-motion):
//  - Sources chips + segment footer are computed CLIENT-SIDE via composeKbReply
//    (Option A from the plan). Cheap, deterministic, identical UI regardless
//    of whether the backend was real Deepseek or the mock fallback.
//  - The fetch is wrapped so we can read the `x-ai-source` response header and
//    surface a "Live · Deepseek" / "Demo · KB heuristic" badge at the top.
//  - Greeting + suggestion chips + Radar avatar + primary user bubble + muted
//    assistant bubble + typing dots are all preserved.
//  - Premium polish via framer-motion: staggered bubble entrance, wave-style
//    typing dots, streaming text fade + blinking cursor, source chip pop-in,
//    radar scan on mount, send-button success state. All respect
//    useReducedMotion().

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { BookOpen, Check, Loader2, Radar, Send, Sparkles } from "lucide-react";

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

/** Bubble entrance spring — keep stiffness/damping consistent across components. */
const BUBBLE_SPRING: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 24,
  mass: 0.9,
};

export function AiChat({ className }: { className?: string }) {
  const kb = useKbStore((s) => s.kb);
  const reduceMotion = useReducedMotion();

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
  const isStreaming = status === "streaming";

  // Brief success flash on the send button after a stream completes.
  const [justSent, setJustSent] = useState(false);
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (wasBusyRef.current && !isBusy) {
      setJustSent(true);
      const t = setTimeout(() => setJustSent(false), 900);
      return () => clearTimeout(t);
    }
    wasBusyRef.current = isBusy;
  }, [isBusy]);

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
  const hasInput = input.trim().length > 0;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Scoped keyframes — radar scan sweep + cursor blink + focus ring. */}
      <style jsx>{`
        @keyframes radar-scan {
          0% {
            transform: rotate(0deg);
            opacity: 0.95;
          }
          80% {
            opacity: 0.95;
          }
          100% {
            transform: rotate(360deg);
            opacity: 1;
          }
        }
        @keyframes cursor-blink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }
        .radar-scan-once {
          animation: radar-scan 1.5s cubic-bezier(0.22, 1, 0.36, 1) 1 both;
          transform-origin: 50% 50%;
        }
        .stream-cursor {
          display: inline-block;
          width: 0.45rem;
          margin-left: 2px;
          line-height: 1;
          animation: cursor-blink 1s steps(2, start) infinite;
        }
        /* Coral focus ring on the input — subtle expand. */
        .coral-focus :global(input):focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px hsl(var(--background)),
            0 0 0 4px hsl(var(--primary) / 0.55);
          transition: box-shadow 180ms ease-out;
        }
      `}</style>

      {/* Source indicator badge — Live (coral) vs Demo (muted/amber). */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Radar className="h-3 w-3 text-primary" />
          Asisten Sales
        </div>
        <SourceBadge source={aiSource} reduce={!!reduceMotion} />
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => {
            const rawText = readMessageText(m);
            // doc 43 §1 — streamed assistant text can't be JSON-parsed, so strip markdown on render.
            const text = m.role === "assistant" ? stripMarkdown(rawText) : rawText;
            const isLastAssistant = idx === lastAssistantIndex;
            const isUser = m.role === "user";
            const isGreeting = m.id === GREETING_ID;
            // Cursor only on the streaming assistant message.
            const showCursor =
              !isUser && isLastAssistant && isStreaming && text.length > 0;

            const fromX = reduceMotion ? 0 : isUser ? 20 : -20;

            return (
              <motion.div
                key={m.id}
                layout="position"
                initial={{ opacity: 0, x: fromX }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: fromX * 0.6 }}
                transition={reduceMotion ? { duration: 0.15 } : BUBBLE_SPRING}
                className={cn(
                  "flex gap-2.5",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "assistant" && (
                  <motion.div
                    initial={
                      reduceMotion ? false : { scale: 0.7, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0.15 }
                        : { type: "spring", stiffness: 260, damping: 22 }
                    }
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    {/* Greeting avatar gets a one-shot radar scan on mount. */}
                    <Radar
                      className={cn(
                        "h-3.5 w-3.5",
                        isGreeting && !reduceMotion && "radar-scan-once",
                      )}
                    />
                  </motion.div>
                )}
                <div
                  className={cn(
                    "max-w-[82%] space-y-2",
                    isUser ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "whitespace-pre-line rounded-lg px-3 py-2 text-sm leading-relaxed",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {/* Streaming text — gentle opacity transition on chunk
                        updates. `key={text.length}` re-fires the transition
                        without forcing re-mount of the parent bubble. */}
                    {isUser ? (
                      text
                    ) : (
                      <>
                        <motion.span
                          key={`t-${m.id}-${text.length}`}
                          initial={
                            reduceMotion ? false : { opacity: 0.55 }
                          }
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.1, ease: "easeOut" }}
                          className="inline"
                        >
                          {text}
                        </motion.span>
                        {showCursor && (
                          <span
                            aria-hidden
                            className="stream-cursor text-primary"
                          >
                            ▍
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Sources chips — pop-in stagger after the message is done. */}
                  {m.role === "assistant" &&
                    isLastAssistant &&
                    kbReplyForLast &&
                    kbReplyForLast.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <motion.span
                          initial={
                            reduceMotion ? false : { opacity: 0, y: 4 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          <Sparkles className="h-3 w-3 text-primary" />
                          Sumber
                        </motion.span>
                        {kbReplyForLast.sources.map((s, sIdx) => (
                          <SourceChip
                            key={s}
                            label={s}
                            delay={reduceMotion ? 0 : 0.08 * sIdx + 0.05}
                            reduce={!!reduceMotion}
                          />
                        ))}
                      </div>
                    )}

                  {/* Segment footer — every assistant turn except the greeting. */}
                  {m.role === "assistant" &&
                    m.id !== GREETING_ID &&
                    isLastAssistant && (
                      <motion.p
                        initial={
                          reduceMotion ? false : { opacity: 0, y: 4 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: 0.15 }}
                        className="text-[10px] italic text-muted-foreground/70"
                      >
                        Disusun dari Basis Pengetahuan klien
                        {kbReplyForLast?.segmentHit
                          ? ` · segmen ${kbReplyForLast.segmentHit}`
                          : ""}
                      </motion.p>
                    )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <AnimatePresence>
          {isBusy && (
            <TypingIndicator key="typing" reduce={!!reduceMotion} />
          )}
        </AnimatePresence>
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s, idx) => (
            <SuggestionChip
              key={s}
              label={s}
              delay={reduceMotion ? 0 : 0.1 * idx + 0.05}
              reduce={!!reduceMotion}
              onPick={() => submit(s)}
            />
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="coral-focus flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya apa saja tentang sales Anda..."
          className="flex-1"
          disabled={isBusy}
        />
        <motion.div
          animate={
            reduceMotion
              ? undefined
              : { scale: hasInput && !isBusy ? 1.05 : 1 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
        >
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isBusy}
            className={cn(
              "transition-[filter,opacity] duration-200",
              hasInput && !isBusy && "brightness-110",
            )}
            aria-label="Kirim"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isBusy ? (
                <motion.span
                  key="spin"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.15 }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </motion.span>
              ) : justSent ? (
                <motion.span
                  key="check"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                >
                  <Check className="h-4 w-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="send"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                >
                  <Send className="h-4 w-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SourceBadge — pulsing dot + spring-from-above entrance.                     */
/* -------------------------------------------------------------------------- */
function SourceBadge({
  source,
  reduce,
}: {
  source: AiSource;
  reduce: boolean;
}) {
  const isLive = source === "real";
  const dotColor = isLive
    ? "bg-emerald-500 shadow-[0_0_0_0_rgba(16,185,129,0.6)]"
    : "bg-amber-500 shadow-[0_0_0_0_rgba(245,158,11,0.6)]";

  const containerClass = isLive
    ? "bg-primary/10 text-primary"
    : "border bg-card text-muted-foreground";

  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 240, damping: 22 }
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        containerClass,
      )}
    >
      <motion.span
        aria-hidden
        animate={
          reduce
            ? undefined
            : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
        }
        transition={
          reduce
            ? undefined
            : { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }
        className={cn("h-1.5 w-1.5 rounded-full", dotColor)}
      />
      {isLive ? "Live · AI aktif" : "Demo · KB heuristic"}
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* TypingIndicator — wave dots + slow-rotating Sparkles + delayed "thinking". */
/* -------------------------------------------------------------------------- */
function TypingIndicator({ reduce }: { reduce: boolean }) {
  const [showLabel, setShowLabel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowLabel(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={
        reduce ? { duration: 0.15 } : { type: "spring", stiffness: 220, damping: 24 }
      }
      className="flex gap-2.5"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <motion.span
          animate={reduce ? undefined : { rotate: 360 }}
          transition={
            reduce
              ? undefined
              : { duration: 6, repeat: Infinity, ease: "linear" }
          }
          className="opacity-90"
          aria-hidden
        >
          <Sparkles className="h-3.5 w-3.5" />
        </motion.span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
              initial={{ opacity: 0.25 }}
              animate={
                reduce
                  ? { opacity: 0.6 }
                  : { opacity: [0.2, 1, 0.2], y: [0, -1.5, 0] }
              }
              transition={
                reduce
                  ? { duration: 0.2 }
                  : {
                      duration: 1.05,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.15,
                    }
              }
            />
          ))}
        </div>
        <AnimatePresence>
          {showLabel && (
            <motion.span
              key="label"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[11px] italic text-muted-foreground/80"
            >
              Sedang berpikir...
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* SourceChip — pop-in scale spring + hover lift/icon spin.                    */
/* -------------------------------------------------------------------------- */
function SourceChip({
  label,
  delay,
  reduce,
}: {
  label: string;
  delay: number;
  reduce: boolean;
}) {
  return (
    <motion.span
      initial={reduce ? false : { scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      transition={
        reduce
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 320, damping: 18, delay }
      }
      className="group inline-flex cursor-default items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <motion.span
        whileHover={reduce ? undefined : { rotate: 18 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="inline-flex"
      >
        <BookOpen className="h-2.5 w-2.5 text-primary/70 group-hover:text-primary" />
      </motion.span>
      {label}
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* SuggestionChip — staggered entrance + hover lift + click feedback.          */
/* -------------------------------------------------------------------------- */
function SuggestionChip({
  label,
  delay,
  reduce,
  onPick,
}: {
  label: string;
  delay: number;
  reduce: boolean;
  onPick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onPick}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={
        reduce
          ? undefined
          : {
              y: -2,
              backgroundColor: "hsl(var(--primary) / 0.08)",
              borderColor: "hsl(var(--primary) / 0.45)",
            }
      }
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={
        reduce
          ? { duration: 0.15 }
          : { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay }
      }
      className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </motion.button>
  );
}
