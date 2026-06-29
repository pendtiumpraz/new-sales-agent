"use client";

import { usePathname } from "next/navigation";

import { ConversationList } from "@/components/inbox/conversation-list";
import { cn } from "@/lib/utils";

// The M4 rebuild inbox (`/inbox` → page.tsx) is a SELF-CONTAINED 3-column view
// (list + thread + context panel, in-page selection) wired to the new API. It
// owns its own full-height layout, so for the index route we render children
// full-bleed and do NOT wrap them in the legacy split shell.
//
// The legacy per-conversation route (`/inbox/[id]`, still mock-backed and linked
// from a few other screens — settings/handoff, next-best-action, workspace) keeps
// the original list + thread split so those deep links don't 404.
export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onThread = pathname !== "/inbox";

  // Index → the rebuild page renders the whole 3-column workspace itself.
  if (!onThread) return <>{children}</>;

  // Legacy thread route → keep the original split shell.
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ConversationList className={cn(onThread && "hidden md:flex")} />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
