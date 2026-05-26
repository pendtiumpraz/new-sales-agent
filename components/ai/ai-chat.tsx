"use client";

import { useEffect, useRef, useState } from "react";
import { Radar, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchAiResponse } from "@/lib/api-mock/hooks";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Buatkan cadence email untuk SaaS B2B",
  "Analisa pipeline saya",
  "Siapa lead terbaik minggu ini?",
];

const GREETING: ChatMessage = {
  id: 0,
  role: "assistant",
  content:
    "Halo! Saya asisten sales Anda. Saya bisa bantu pembuatan cadence, analisis pipeline, prospek scoring, dan optimasi pesan. Mau mulai dari mana?",
};

export function AiChat({ className }: { className?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  function send(text: string) {
    const prompt = text.trim();
    if (!prompt || typing) return;
    setMessages((m) => [...m, { id: nextId.current++, role: "user", content: prompt }]);
    setInput("");
    setTyping(true);
    // Canned response within ~800ms (build.md §11).
    setTimeout(() => {
      const res = matchAiResponse(prompt);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", content: res.body },
      ]);
      setTyping(false);
    }, 700);
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
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
                "max-w-[82%] whitespace-pre-line rounded-lg px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
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

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
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
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya apa saja tentang sales Anda..."
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || typing}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
