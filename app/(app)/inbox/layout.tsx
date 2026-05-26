import { ConversationList } from "@/components/inbox/conversation-list";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ConversationList />
      <div className="hidden min-w-0 flex-1 md:flex">{children}</div>
    </div>
  );
}
