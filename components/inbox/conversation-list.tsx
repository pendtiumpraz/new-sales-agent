"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ReadinessDot } from "@/components/inbox/readiness-dot";
import { WaModeToggle } from "@/components/inbox/wa-mode-toggle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "@/lib/api-mock/hooks";
import { formatConversationTime } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

// Kept lean (channel masih bisa dicari): Semua · Belum dibaca · WA · Email.
const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum dibaca" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
] as const;

export function ConversationList({ className }: { className?: string }) {
  const { data: conversations, isLoading } = useConversations();
  const pathname = usePathname();
  const activeId = pathname.split("/")[2];
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  // Workspace scope (doc 44): ?workspace=<id> filters to that workspace's threads.
  const workspaceId = useSearchParams().get("workspace");

  const filtered = useMemo(() => {
    let list = conversations ?? [];
    if (workspaceId) list = list.filter((c) => (c as { workspaceId?: string | null }).workspaceId === workspaceId);
    if (filter === "unread") list = list.filter((c) => c.unread > 0);
    else if (filter !== "all") list = list.filter((c) => c.channel === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          (c.contactName ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.lastMessage ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [conversations, filter, query, workspaceId]);

  return (
    <div className={cn("flex w-full shrink-0 flex-col border-r bg-card md:w-80 lg:w-96", className)}>
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inbox</h2>
          <div className="flex items-center gap-2">
            <WaModeToggle />
            <span className="text-xs text-muted-foreground">{filtered.length} percakapan</span>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari percakapan..."
            className="pl-8"
          />
        </div>
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b p-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))
          : filtered.map((c) => {
              const active = c.id === activeId;
              return (
                <Link
                  key={c.id}
                  href={`/inbox/${c.id}`}
                  className={cn(
                    "flex gap-3 border-b p-3 transition-colors",
                    active ? "bg-accent" : "hover:bg-muted/40",
                  )}
                >
                  <div className="relative">
                    <UserAvatar name={c.contactName} color={c.avatarColor} className="h-10 w-10" />
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5">
                      <ChannelDot channel={c.channel} size={9} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{c.contactName}</p>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <ReadinessDot conversationId={c.id} />
                        <span className="text-[11px] text-muted-foreground">
                          {formatConversationTime(c.lastTimestamp)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {c.lastMessage}
                      </p>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
