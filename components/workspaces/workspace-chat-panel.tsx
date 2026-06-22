"use client";

// Inline chat (step 5) — list this workspace's leads and chat with one WITHOUT
// leaving the hub. Clicking a lead ensures a workspace-scoped conversation exists
// (PUT /api/db/conversations) then embeds the self-contained MessageThread.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MessageThread } from "@/components/inbox/message-thread";

interface Lead {
  id: string;
  fullName: string;
  companyName: string | null;
}

export function WorkspaceChatPanel({
  workspaceId,
  leads,
}: {
  workspaceId: string;
  leads: Lead[];
}) {
  const qc = useQueryClient();
  const [convoId, setConvoId] = useState<string | null>(null);

  const open = useMutation({
    mutationFn: async (lead: Lead) => {
      const cid = `wsconv_${lead.id}`;
      const r = await fetch("/api/db/conversations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              id: cid,
              contactId: lead.id,
              contactName: lead.fullName,
              company: lead.companyName ?? null,
              channel: "whatsapp",
              workspaceId,
              unread: 0,
              lastTimestamp: new Date().toISOString(),
              avatarColor: "#14B8A6",
            },
          ],
        }),
      });
      if (!r.ok) throw new Error("gagal buka chat");
      return cid;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setConvoId(cid);
    },
    onError: () => toast.error("Gagal buka chat"),
  });

  if (convoId) {
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-2">
          <Button size="sm" variant="ghost" onClick={() => setConvoId(null)}>
            <ArrowLeft className="h-4 w-4" /> Daftar lead
          </Button>
        </div>
        <div className="flex h-[460px] flex-col">
          <MessageThread conversationId={convoId} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <p className="flex items-center gap-2 border-b p-3 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">5</span>
          <MessageSquare className="h-4 w-4 text-primary" /> Eksekusi — chat lead
        </p>
        {leads.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Belum ada lead — tambah dulu di langkah 3 (Discovery).
          </p>
        ) : (
          <ul className="divide-y">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar name={l.fullName} className="h-8 w-8 text-[11px]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.fullName}</p>
                    {l.companyName && (
                      <p className="truncate text-xs text-muted-foreground">{l.companyName}</p>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={open.isPending} onClick={() => open.mutate(l)}>
                  <MessageSquare className="h-3.5 w-3.5" /> Chat
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
