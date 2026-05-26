import { MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

export default function InboxIndexPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        icon={MessagesSquare}
        title="Pilih percakapan"
        description="Pilih percakapan dari daftar untuk melihat pesan WhatsApp, email, dan Instagram dalam satu tampilan."
        className="border-0 bg-transparent"
      />
    </div>
  );
}
