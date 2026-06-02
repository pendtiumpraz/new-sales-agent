"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { HandoffPanel } from "@/components/inbox/handoff-panel";
import { MessageThread } from "@/components/inbox/message-thread";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/lib/api-mock/hooks";

export default function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const { data } = useConversations();
  const convo = data?.find((c) => c.id === params.id);

  return (
    <>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <MessageThread conversationId={params.id} />
        {/* Floating deep-link to the unified workspace (Wave 3) — keeps the
            channel-centric inbox usable while exposing the new workbench. */}
        {convo && (
          <Button
            asChild
            size="sm"
            variant="default"
            className="absolute right-3 top-2 z-10 h-8 shadow-sm"
          >
            <Link
              href={`/workspace/${convo.contactId}?cv=${convo.id}`}
              title="Buka workspace terpadu — chat + prospek + enrichment"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Buka di workspace
            </Link>
          </Button>
        )}
      </div>
      <HandoffPanel conversationId={params.id} />
      {convo && <ContactPanel contactId={convo.contactId} />}
    </>
  );
}
