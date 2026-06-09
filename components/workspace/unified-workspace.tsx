"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessagesSquare, Users } from "lucide-react";

import { MessageThread } from "@/components/inbox/message-thread";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CardErrorBoundary } from "@/components/workspace/card-error-boundary";
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

  // Reconcile active conversation against the available list. Computes the
  // *target* id first and only setState when it actually differs — prevents
  // a re-render cascade if myConversations recomputes with the same content.
  useEffect(() => {
    if (myConversations.length === 0) return;
    const stillValid =
      activeConversationId &&
      myConversations.some((c) => c.id === activeConversationId);
    if (!stillValid) {
      const nextId = myConversations[0].id;
      if (nextId !== activeConversationId) {
        setActiveConversationId(nextId);
      }
    }
    // Deps intentionally exclude activeConversationId — the effect should
    // only re-run when the conversation list changes, not when we set the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myConversations]);

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

  // Workspace requires at least one conversation — that's what binds the
  // chat, prospect, enrichment, and AI rails together. Block early with a
  // clear error + back button when the contact has nothing to show.
  if (myConversations.length === 0) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-8">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50 via-card to-amber-50/40 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <MessagesSquare className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Workspace memerlukan percakapan
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Kontak <span className="font-medium text-foreground">{contact.name}</span>{" "}
            ({contact.company}) belum memiliki percakapan aktif. Workspace
            terpadu membutuhkan minimal satu pesan untuk menyatukan chat,
            data prospek, dan rekomendasi AI dalam satu tampilan.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Mulai percakapan via {contact.channelPreference} lalu kembali lagi
            ke sini, atau pilih kontak lain yang sudah memiliki riwayat chat.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/contacts">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Kontak
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/contacts?focus=${contact.id}`}>
                Lihat profil kontak
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_360px]">
      {/* ── Left rail: contact header + conversation list ─────────────── */}
      <aside className="hidden min-h-0 flex-col border-r bg-card md:flex">
        <CardErrorBoundary name="Daftar percakapan">
          <WorkspaceConversationList
            contact={contact}
            conversations={myConversations}
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
          />
        </CardErrorBoundary>
      </aside>

      {/* ── Center: message thread ─────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-col">
        {activeConversationId && (
          <CardErrorBoundary name="Message thread">
            <MessageThread conversationId={activeConversationId} />
          </CardErrorBoundary>
        )}
      </section>

      {/* ── Right rail: unified context (Prospek → Enrichment → AI → Handoff) */}
      <aside className="scrollbar-thin hidden min-h-0 overflow-y-auto border-l bg-muted/20 xl:block">
        <div className="space-y-3 p-3">
          {/* Visual hero — Next Best Action goes first to dominate the eye */}
          <CardErrorBoundary name="Next Best Action">
            <NextBestActionCard
              contact={contact}
              deal={deal}
              conversationId={activeConversationId}
            />
          </CardErrorBoundary>
          <CardErrorBoundary name="Prospek">
            <ProspectCard contact={contact} />
          </CardErrorBoundary>
          <CardErrorBoundary name="Tahap Enrichment">
            <EnrichmentStageCard deal={deal} />
          </CardErrorBoundary>
          <CardErrorBoundary name="Handoff & sentimen">
            <WorkspaceHandoffCard conversationId={activeConversationId} />
          </CardErrorBoundary>
          <p className="px-1 pb-4 text-center text-[10px] text-muted-foreground">
            <Users className="mr-1 inline h-3 w-3" />
            Workspace terpadu — chat + prospek + enrichment dalam satu tampilan.
          </p>
        </div>
      </aside>
    </div>
  );
}
