"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessagesSquare, Users } from "lucide-react";

import { MessageThread } from "@/components/inbox/message-thread";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ProspectCard } from "@/components/workspace/prospect-card";
import { EnrichmentStageCard } from "@/components/workspace/enrichment-stage-card";
import { NextBestActionCard } from "@/components/workspace/next-best-action-card";
import { WorkspaceHandoffCard } from "@/components/workspace/workspace-handoff-card";
import { WorkspaceConversationList } from "@/components/workspace/workspace-conversation-list";
import { useContact, useConversations, useDeals } from "@/lib/api-mock/hooks";
import { Skeleton } from "@/components/ui/skeleton";

interface UnifiedWorkspaceProps {
  contactId: string;
  /** Optional pre-selected conversation; otherwise the most-recent one is used. */
  initialConversationId?: string;
}

/**
 * The Wave 3 centerpiece. Three-column workbench that bonds:
 *  - Left: conversation list filtered to this contact (header card + threads)
 *  - Center: active conversation's message thread (with auto-reply card and
 *            handoff banner from Wave 2C — reused, no duplication)
 *  - Right: stacked panel with Prospek, Enrichment stage, AI next-best-action,
 *           and a compact Handoff card.
 *
 * All copy in Bahasa Indonesia. Coral Sunset palette.
 */
export function UnifiedWorkspace({
  contactId,
  initialConversationId,
}: UnifiedWorkspaceProps) {
  const { data: contact, isLoading: contactLoading } = useContact(contactId);
  const { data: conversations } = useConversations();
  const { data: deals } = useDeals();

  // All conversations for this contact, newest first.
  const myConversations = useMemo(() => {
    const list = (conversations ?? [])
      .filter((c) => c.contactId === contactId)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastTimestamp).getTime() -
          new Date(a.lastTimestamp).getTime(),
      );
    return list;
  }, [conversations, contactId]);

  // Resolve which conversation is active. Prefer URL hint → most-recent.
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(initialConversationId ?? null);

  useEffect(() => {
    if (!activeConversationId && myConversations.length > 0) {
      setActiveConversationId(myConversations[0].id);
    }
    // If the active id no longer matches this contact's conversations, reset it.
    if (
      activeConversationId &&
      myConversations.length > 0 &&
      !myConversations.some((c) => c.id === activeConversationId)
    ) {
      setActiveConversationId(myConversations[0].id);
    }
    // Allow null when contact has no conversations yet.
  }, [activeConversationId, myConversations]);

  const deal = useMemo(
    () => (deals ?? []).find((d) => d.contactId === contactId) ?? null,
    [deals, contactId],
  );

  if (contactLoading) {
    return (
      <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-3 p-4 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_360px]">
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
        <Skeleton className="hidden h-full xl:block" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-8">
        <EmptyState
          icon={Users}
          title="Kontak tidak ditemukan"
          description="Kontak yang Anda cari mungkin sudah dihapus atau tautan tidak valid."
          className="border-dashed"
          action={
            <Button asChild variant="outline">
              <Link href="/contacts">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Kontak
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_360px]">
      {/* ── Left rail: contact header + conversation list ─────────────── */}
      <aside className="hidden min-h-0 flex-col border-r bg-card md:flex">
        <WorkspaceConversationList
          contact={contact}
          conversations={myConversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
        />
      </aside>

      {/* ── Center: message thread (or friendly empty state) ──────────── */}
      <section className="flex min-h-0 min-w-0 flex-col">
        {activeConversationId ? (
          <MessageThread conversationId={activeConversationId} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={MessagesSquare}
              title="Belum ada percakapan"
              description={`Kontak ${contact.name} belum punya pesan masuk. Konteks AI di sebelah kanan tetap aktif berdasarkan data prospek + enrichment.`}
              className="border-0 bg-transparent"
              action={
                <Button asChild variant="outline">
                  <Link href="/contacts">
                    <ArrowLeft className="h-4 w-4" />
                    Kembali ke Kontak
                  </Link>
                </Button>
              }
            />
          </div>
        )}
      </section>

      {/* ── Right rail: unified context (Prospek → Enrichment → AI → Handoff) */}
      <aside className="scrollbar-thin hidden min-h-0 overflow-y-auto border-l bg-muted/20 xl:block">
        <div className="space-y-3 p-3">
          {/* Visual hero — Next Best Action goes first to dominate the eye */}
          <NextBestActionCard
            contact={contact}
            deal={deal}
            conversationId={activeConversationId}
          />
          <ProspectCard contact={contact} />
          <EnrichmentStageCard deal={deal} />
          <WorkspaceHandoffCard conversationId={activeConversationId} />
          <p className="px-1 pb-4 text-center text-[10px] text-muted-foreground">
            <Users className="mr-1 inline h-3 w-3" />
            Workspace terpadu — chat + prospek + enrichment dalam satu tampilan.
          </p>
        </div>
      </aside>
    </div>
  );
}
