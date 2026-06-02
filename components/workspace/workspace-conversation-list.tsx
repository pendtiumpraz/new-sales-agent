"use client";

import { MessageCircle, Plus } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SentimentBadge } from "@/components/inbox/sentiment-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatConversationTime } from "@/lib/utils/format-date-id";
import { getSentiment } from "@/lib/api-mock/handoff";
import { cn } from "@/lib/utils";
import type { Contact, Conversation } from "@/lib/types";

interface WorkspaceConversationListProps {
  contact: Contact;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Compact left-rail list of all conversations belonging to the contact,
 * across every channel. Empty state is friendly because some contacts won't
 * yet have any messages — the workspace still works as a profile view.
 */
export function WorkspaceConversationList({
  contact,
  conversations,
  activeId,
  onSelect,
}: WorkspaceConversationListProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3">
      {/* Contact header card — pinned to the top of the rail */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 p-3">
          <UserAvatar
            name={contact.name}
            color={contact.avatarColor}
            className="h-9 w-9 text-xs"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact.company}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ChannelDot channel={contact.channelPreference} size={7} />
            {channelMeta(contact.channelPreference).label}
          </span>
          {activeId && (
            <SentimentBadge
              score={getSentiment(activeId).score}
              trend={getSentiment(activeId).trend}
              size="compact"
              showTrend={false}
            />
          )}
        </div>
      </Card>

      {/* Conversations heading */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Percakapan
        </p>
        <span className="text-[11px] text-muted-foreground">
          {conversations.length}
        </span>
      </div>

      {conversations.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-4 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </span>
          <p className="text-xs font-medium">Belum ada percakapan</p>
          <p className="text-[11px] text-muted-foreground">
            Mulai percakapan via {channelMeta(contact.channelPreference).label}
            .
          </p>
          <Button size="sm" variant="outline" className="mt-1 h-7 text-xs">
            <Plus className="h-3 w-3" />
            Mulai percakapan
          </Button>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  c.id === activeId
                    ? "border-primary/40 bg-primary/5 shadow-sm"
                    : "border-input bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <span className="relative shrink-0">
                  <UserAvatar
                    name={c.contactName}
                    color={c.avatarColor}
                    className="h-8 w-8 text-[10px]"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5">
                    <ChannelDot channel={c.channel} size={7} />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-medium">
                      {channelMeta(c.channel).label}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatConversationTime(c.lastTimestamp)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {c.lastMessage}
                  </p>
                  {c.unread > 0 && (
                    <span className="mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {c.unread} baru
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
