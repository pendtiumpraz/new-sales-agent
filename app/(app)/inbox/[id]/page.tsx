"use client";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { HandoffPanel } from "@/components/inbox/handoff-panel";
import { MessageThread } from "@/components/inbox/message-thread";
import { WaDraftCard } from "@/components/inbox/wa-draft-card";
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
        <WaDraftCard conversationId={params.id} />
        <MessageThread conversationId={params.id} />
      </div>
      <HandoffPanel conversationId={params.id} />
      {convo && <ContactPanel contactId={convo.contactId} />}
    </>
  );
}
