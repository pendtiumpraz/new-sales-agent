"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCheck,
  HandHeart,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from "lucide-react";

import { AutoReplyCard } from "@/components/inbox/auto-reply-card";
import { SentimentBadge } from "@/components/inbox/sentiment-badge";
import { ReadinessBadge } from "@/components/inbox/readiness-badge";
import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAiDraft, getSentiment } from "@/lib/api-mock/handoff";
import { useConversation } from "@/lib/api-mock/hooks";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatTimeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@/lib/types";

// Canned AI-suggested replies (channel-agnostic, shown when the draft is empty).
const AI_SUGGESTIONS = [
  "Baik, saya kirimkan detailnya sekarang ya 🙏",
  "Terima kasih. Boleh saya jadwalkan demo 15 menit?",
  "Sudah saya catat. Ada lagi yang bisa saya bantu?",
];

export function MessageThread({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useConversation(conversationId);
  const togglePanel = useUiStore((s) => s.toggleInboxPanel);
  const panelOpen = useUiStore((s) => s.inboxPanelOpen);
  // Per-conversation effective auto-reply (override → else global default).
  const autoReplyEnabled = useHandoffStore(
    (s) => s.autoReplyOverrides[conversationId] ?? s.config.autoReplyEnabled,
  );
  const handoffState = useHandoffStore((s) => s.states[conversationId]);
  const activeTriggers = useHandoffStore((s) =>
    s.getActiveTriggers(conversationId),
  );
  const takeOver = useHandoffStore((s) => s.takeOver);
  const qc = useQueryClient();
  const [sent, setSent] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [dismissedDraft, setDismissedDraft] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Persist an outbound message to the DB so it survives reload (PUT is insert-
  // only). The optimistic copy in `sent` keeps the UI instant; on success we
  // refetch so the thread reconciles with the stored row (deduped by id below).
  async function persistMessage(msg: Message) {
    try {
      await fetch("/api/db/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [msg] }),
      });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      /* optimistic copy stays visible even if the write failed */
    }
  }

  // Reset locally-sent messages when switching conversations.
  useEffect(() => {
    setSent([]);
    setDraft("");
    setDismissedDraft(false);
  }, [conversationId]);

  // Mark the conversation read when its thread is open. Before this, opening /
  // replying never cleared `unread`, so the "Belum dibaca" badge stayed lit
  // forever. Optimistically clear the badge in both query caches (works for
  // seed + DB), then best-effort PUT the full row so it persists when DB-backed.
  const persistedRead = useRef<Set<string>>(new Set());
  useEffect(() => {
    const convo = data?.conversation;
    if (!convo || convo.unread <= 0) return;
    qc.setQueryData<Conversation[]>(["conversations"], (prev) =>
      prev?.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    );
    qc.setQueryData<{ conversation: Conversation | null; messages: Message[] }>(
      ["conversation", conversationId],
      (prev) =>
        prev?.conversation
          ? { ...prev, conversation: { ...prev.conversation, unread: 0 } }
          : prev,
    );
    if (!persistedRead.current.has(conversationId)) {
      persistedRead.current.add(conversationId);
      fetch("/api/db/conversations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [{ ...convo, unread: 0 }] }),
      }).catch(() => {});
    }
  }, [data?.conversation, conversationId, qc]);

  // Memoize `all` so its identity is stable when neither slice changes —
  // a fresh array literal each render was causing the conversationContext
  // useMemo + downstream useCallback in AutoReplyCard to thrash, which is
  // the prime suspect behind the React #185 'Maximum update depth' on
  // /workspace/[contactId].
  const all = useMemo(() => {
    if (!data) return [];
    // Dedup by id so the optimistic local copy and the refetched DB row (same id)
    // don't render twice after persistMessage invalidates the query.
    const seen = new Set<string>();
    const merged: Message[] = [];
    for (const m of [...data.messages, ...sent]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
    return merged;
  }, [data, sent]);
  // Pass the thread's messages so non-fixture (DB/new) conversations derive a
  // real-ish sentiment from their text instead of a stale neutral default.
  const sentiment = useMemo(() => getSentiment(conversationId, all), [conversationId, all]);
  const handedOff = handoffState?.status === "handed-off";
  const lastMessage = all[all.length - 1];
  const aiDraft = useMemo(
    () => (data?.conversation ? getAiDraft(conversationId, data.conversation.contactName) : ""),
    [conversationId, data?.conversation],
  );
  // Serialize the last 3–5 messages for the AI Gateway call. Bahasa labels
  // ("Pelanggan:" / "Anda:") help the model and our heuristic seed extractor
  // detect inbound vs outbound turns.
  const conversationContext = useMemo(() => {
    if (!data?.conversation) return "";
    const tail = all.slice(-5);
    return tail
      .map((m) => {
        const speaker = m.direction === "in" ? "Pelanggan" : "Anda";
        const body = (m.body ?? "").trim();
        return body ? `${speaker}: ${body}` : null;
      })
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }, [all, data?.conversation]);
  // Show the auto-reply card when: auto-reply is on, NOT yet handed off,
  // last message came from the prospect, user hasn't dismissed it locally,
  // and no draft is being composed.
  const showAutoReply =
    autoReplyEnabled &&
    !handedOff &&
    !dismissedDraft &&
    !draft.trim() &&
    lastMessage?.direction === "in";
  const showHandoffBanner = activeTriggers.length > 0 && !handedOff;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [all.length]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="h-16 border-b bg-card" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-16 w-3/5" />
        </div>
      </div>
    );
  }

  if (!data || !data.conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Percakapan tidak ditemukan.
      </div>
    );
  }

  const convo = data.conversation;
  const channel = convo.channel;
  const meta = channelMeta(channel);
  const isWa = channel === "whatsapp";
  const isEmail = channel === "email";

  function send() {
    const body = draft.trim();
    if (!body) return;
    const msg: Message = {
      id: `local_${Date.now()}`,
      conversationId,
      direction: "out",
      body,
      timestamp: new Date().toISOString(),
      status: "sent",
      subject: isEmail ? `Re: ${all.find((m) => m.subject)?.subject ?? "Pesan"}` : undefined,
    };
    setSent((s) => [...s, msg]);
    setDraft("");
    void persistMessage(msg);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Channel-themed top bar */}
      <div
        className="flex h-16 items-center gap-3 border-b px-4"
        style={{ backgroundColor: `${meta.color}12` }}
      >
        <Button variant="ghost" size="icon" className="md:hidden" asChild>
          <Link href="/inbox">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <UserAvatar name={convo.contactName} color={convo.avatarColor} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{convo.contactName}</p>
            <SentimentBadge
              score={sentiment.score}
              trend={sentiment.trend}
              size="compact"
            />
          </div>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <ChannelDot channel={channel} size={8} />
            {meta.label} · {convo.company}
            {handedOff && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-tertiary/15 px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                <UserCheck className="h-2.5 w-2.5" />
                Diambil alih oleh Anda
              </span>
            )}
          </p>
        </div>
        <ReadinessBadge conversationId={conversationId} className="mr-1 hidden sm:inline-flex" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={togglePanel} className="hidden xl:inline-flex">
              {panelOpen ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRightOpen className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {panelOpen ? "Sembunyikan panel kanan" : "Tampilkan panel kanan"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Handoff trigger banner */}
      {showHandoffBanner && (
        <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 text-danger" />
          <span className="flex-1 text-danger">
            <strong className="font-semibold">Pemicu handoff aktif:</strong>{" "}
            {activeTriggers
              .map((t) =>
                t === "sentiment"
                  ? "sentimen turun"
                  : t === "timeout"
                    ? "tanpa respons"
                    : "topik kompleks",
              )
              .join(" · ")}
            . AI menyarankan eskalasi ke agen.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-rose-300 bg-white text-danger hover:bg-rose-100"
            onClick={() => {
              takeOver(conversationId, "Anda");
            }}
          >
            <HandHeart className="h-3.5 w-3.5" />
            Ambil alih
          </Button>
        </div>
      )}

      {/* Messages */}
      <div
        className="scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6"
        style={isWa ? { backgroundColor: "#ECE5DD" } : undefined}
      >
        <div className={cn("mx-auto flex max-w-3xl flex-col gap-3", isEmail && "gap-4")}>
          {all.map((m) =>
            isEmail ? (
              <EmailMessage key={m.id} m={m} contactName={convo.contactName} />
            ) : (
              <ChatBubble key={m.id} m={m} color={meta.color} isWa={isWa} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t bg-card p-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {showAutoReply && (
            <AutoReplyCard
              conversationId={conversationId}
              conversationContext={conversationContext}
              contactName={convo.contactName}
              company={convo.company}
              initialDraft={aiDraft}
              onApprove={(liveDraft) => {
                const body = (liveDraft || aiDraft).trim();
                if (!body) return;
                const msg: Message = {
                  id: `local_${Date.now()}`,
                  conversationId,
                  direction: "out",
                  body,
                  timestamp: new Date().toISOString(),
                  status: "sent",
                };
                setSent((s) => [...s, msg]);
                setDismissedDraft(true);
                void persistMessage(msg);
              }}
              onEdit={(liveDraft) => {
                setDraft(liveDraft || aiDraft);
                setDismissedDraft(true);
              }}
            />
          )}
          {!draft.trim() && !showAutoReply && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] font-medium text-tertiary">
                <Sparkles className="h-3 w-3" />
                Balasan cepat
              </span>
              {AI_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft(s)}
                  className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-tertiary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {isEmail ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Tulis balasan email..."
                className="min-h-[88px]"
              />
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4" />
                  Lampiran
                </Button>
                <Button onClick={send} disabled={!draft.trim()}>
                  <Send className="h-4 w-4" />
                  Kirim email
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Ketik pesan ${meta.label}...`}
                className="flex-1 bg-background"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim()}
                style={{ backgroundColor: meta.color }}
                className="text-white hover:opacity-90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  m,
  color,
  isWa,
}: {
  m: Message;
  color: string;
  isWa: boolean;
}) {
  const out = m.direction === "out";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
          out ? "rounded-br-sm" : "rounded-bl-sm",
        )}
        style={
          out
            ? isWa
              ? { backgroundColor: "#D9FDD3", color: "#0F172A" }
              : { backgroundColor: color, color: "#fff" }
            : { backgroundColor: "#fff", color: "#0F172A", border: "1px solid #E2E8F0" }
        }
      >
        <p className="whitespace-pre-line">{m.body}</p>
        <span
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            out && !isWa ? "text-white/70" : "text-slate-500",
          )}
        >
          {formatTimeID(m.timestamp)}
          {out && m.status === "read" && <CheckCheck className="h-3 w-3 text-info" />}
          {out && m.status && m.status !== "read" && <CheckCheck className="h-3 w-3" />}
        </span>
      </div>
    </div>
  );
}

function EmailMessage({ m, contactName }: { m: Message; contactName: string }) {
  const out = m.direction === "out";
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserAvatar name={out ? "Anda" : contactName} className="h-7 w-7" />
          <span className="text-sm font-medium">{out ? "Anda" : contactName}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatTimeID(m.timestamp)}</span>
      </div>
      {m.subject && <p className="mt-3 text-sm font-semibold">{m.subject}</p>}
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
        {m.body}
      </p>
      {m.attachmentLabel && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5" />
          {m.attachmentLabel}
        </div>
      )}
    </div>
  );
}
