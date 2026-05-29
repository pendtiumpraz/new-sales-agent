"use client";

import { usePathname } from "next/navigation";

import { ConversationList } from "@/components/inbox/conversation-list";
import { cn } from "@/lib/utils";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // On mobile, show either the list (index) or the thread (/inbox/[id]).
  const onThread = pathname !== "/inbox";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ConversationList className={cn(onThread && "hidden md:flex")} />
      <div
        className={cn(
          "min-w-0 flex-1",
          onThread ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
