"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

/* Per-type wayfinding dot color — mirrors the sidebar's 1-solid-color rule. */
const DOT_COLOR: Record<string, string> = {
  lead: "#14B8A6",
  deal: "#F59E0B",
  escalation: "#EF4444",
  quota: "#EAB308",
  marketplace: "#3B82F6",
  order: "#F97316",
  member: "#8B5CF6",
  tenant: "#6366F1",
};

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface FeedResponse {
  items: NotificationItem[];
  unread: number;
}

async function fetchFeed(): Promise<FeedResponse> {
  const r = await fetch("/api/notifications");
  if (!r.ok) return { items: [], unread: 0 };
  const j = (await r.json()) as { ok?: boolean; data?: FeedResponse };
  return j.data ?? { items: [], unread: 0 };
}

/**
 * Topbar notification bell — a persistent, DB-backed feed (replaces the old
 * bell → router.push("/inbox") stub). Unread badge from GET /api/notifications
 * (React Query, staleTime 30s, refetch on open). Clicking a row marks it read
 * and navigates to its link. Matches the profile-dropdown styling; accessible
 * via the Radix DropdownMenu (button + menu, focus-managed).
 */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchFeed,
    staleTime: 30_000,
  });
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;

  async function openRow(n: NotificationItem) {
    setOpen(false);
    // Optimistic: flip read + drop the badge locally, then reconcile with server.
    if (!n.read) {
      qc.setQueryData<FeedResponse>(["notifications"], (prev) =>
        prev
          ? {
              items: prev.items.map((it) => (it.id === n.id ? { ...it, read: true } : it)),
              unread: Math.max(0, prev.unread - 1),
            }
          : prev,
      );
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      } catch {
        /* best-effort — the badge already updated optimistically */
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    qc.setQueryData<FeedResponse>(["notifications"], (prev) =>
      prev ? { items: prev.items.map((it) => ({ ...it, read: true })), unread: 0 } : prev,
    );
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      /* best-effort */
    }
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) q.refetch(); // freshen on open
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifikasi">
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
                  aria-label={`${unread} notifikasi belum dibaca`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifikasi</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifikasi</span>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tandai semua dibaca
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Belum ada notifikasi</p>
              <p className="text-xs text-muted-foreground/70">
                Lead baru, deal menang, dan eskalasi akan muncul di sini.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openRow(n)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      !n.read && "bg-primary/[0.04]",
                    )}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: DOT_COLOR[n.type] ?? "#6B7280" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex-1 truncate text-sm",
                            n.read ? "font-medium text-foreground/80" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                        {formatRelativeID(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
