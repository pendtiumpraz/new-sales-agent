"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCheck,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Send,
} from "lucide-react";

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
import { useConversation } from "@/lib/api-mock/hooks";
import { useUiStore } from "@/lib/stores/ui-store";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatTimeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

export function MessageThread({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useConversation(conversationId);
  const togglePanel = useUiStore((s) => s.toggleInboxPanel);
  const panelOpen = useUiStore((s) => s.inboxPanelOpen);
  const [sent, setSent] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset locally-sent messages when switching conversations.
  useEffect(() => {
    setSent([]);
    setDraft("");
  }, [conversationId]);

  const all = data ? [...data.messages, ...sent] : [];

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
    setSent((s) => [
      ...s,
      {
        id: `local_${Date.now()}`,
        conversationId,
        direction: "out",
        body,
        timestamp: new Date().toISOString(),
        status: "sent",
        subject: isEmail ? `Re: ${all.find((m) => m.subject)?.subject ?? "Pesan"}` : undefined,
      },
    ]);
    setDraft("");
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
          <p className="truncate font-semibold">{convo.contactName}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <ChannelDot channel={channel} size={8} />
            {meta.label} · {convo.company}
          </p>
        </div>
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
            {panelOpen ? "Sembunyikan info kontak" : "Tampilkan info kontak"}
          </TooltipContent>
        </Tooltip>
      </div>

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
        <div className="mx-auto max-w-3xl">
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
          {out && m.status === "read" && <CheckCheck className="h-3 w-3 text-sky-500" />}
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
