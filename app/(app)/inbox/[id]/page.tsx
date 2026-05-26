"use client";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { MessageThread } from "@/components/inbox/message-thread";
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
      <MessageThread conversationId={params.id} />
      {convo && <ContactPanel contactId={convo.contactId} />}
    </>
  );
}
