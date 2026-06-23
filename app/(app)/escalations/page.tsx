"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Check, Send, X } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface AutoReplyEvent {
  id: string;
  conversationId: string | null;
  decision: string;
  confidence: number | null;
  channel: string | null;
  reply: string | null;
  reason: string | null;
  category: string | null;
  createdAt: string;
}

const DECISION_CLS: Record<string, string> = {
  escalated: "bg-amber-100 text-amber-700",
  sent: "bg-success/10 text-success",
  dismissed: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

export default function EscalationsPage() {
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["auto-reply-events"],
    queryFn: async () => {
      const r = await fetch("/api/engagement/auto-reply");
      if (!r.ok) throw new Error();
      return ((await r.json()).data ?? []) as AutoReplyEvent[];
    },
  });

  const queue = (events.data ?? []).filter((e) => e.decision === "escalated");
  const history = (events.data ?? []).filter((e) => e.decision !== "escalated");

  const historyColumns: DataColumn<AutoReplyEvent>[] = [
    { key: "decision", header: "Keputusan", cell: (e) => <Badge className={DECISION_CLS[e.decision] ?? ""}>{e.decision}</Badge> },
    { key: "channel", header: "Channel", cell: (e) => <span className="text-xs uppercase text-muted-foreground">{e.channel ?? "—"}</span> },
    { key: "content", header: "Isi", cell: (e) => <span className="block max-w-md truncate text-muted-foreground">{e.reply ?? e.reason ?? "—"}</span> },
    {
      key: "createdAt",
      header: "Waktu",
      align: "right",
      sortValue: (e) => new Date(e.createdAt).getTime(),
      cell: (e) => <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("id-ID")}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Eskalasi AI"
        description="Balasan yang ditahan agen untuk ditinjau manusia — kirim sekali klik atau abaikan."
      />
      <div className="space-y-4 p-6">
        {events.isError ? (
          <ErrorState
            title="Gagal memuat eskalasi"
            description="Pastikan kamu login & punya akses (peran dengan izin campaign.manage). Ini beda dari antrian yang memang kosong."
            onRetry={() => events.refetch()}
          />
        ) : (
          <Tabs defaultValue="antrean">
            <TabsList>
              <TabsTrigger value="antrean" className="gap-1.5">
                <Bot className="h-4 w-4" /> Antrean
                <Badge variant="muted" className="ml-0.5">{queue.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
            </TabsList>

            <TabsContent value="antrean" className="mt-4 space-y-3">
              {events.isLoading ? (
                <ListSkeleton rows={3} />
              ) : queue.length === 0 ? (
                <EmptyState
                  icon={Bot}
                  title="Tidak ada eskalasi"
                  description="Jalankan Auto-reply di halaman Cadence — balasan yang tidak yakin/sensitif akan muncul di sini."
                />
              ) : (
                queue.map((e) => (
                  <EscalationCard
                    key={e.id}
                    ev={e}
                    onDone={() => qc.invalidateQueries({ queryKey: ["auto-reply-events"] })}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="riwayat" className="mt-4">
              <DataTable
                columns={historyColumns}
                data={history}
                rowKey={(e) => e.id}
                loading={events.isLoading}
                pageSize={15}
                emptyIcon={Bot}
                emptyTitle="Belum ada riwayat"
                emptyDescription="Balasan AI yang sudah dikirim atau diabaikan akan tercatat di sini."
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function EscalationCard({ ev, onDone }: { ev: AutoReplyEvent; onDone: () => void }) {
  const [reply, setReply] = useState(ev.reply ?? "");

  const resolve = useMutation({
    mutationFn: async (action: "send" | "dismiss") => {
      const r = await fetch("/api/engagement/auto-reply/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: ev.id, action, reply: action === "send" ? reply : undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
    },
    onSuccess: (_d, action) => {
      toast.success(action === "send" ? "Balasan terkirim" : "Eskalasi diabaikan");
      onDone();
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="muted" className="uppercase">{ev.channel}</Badge>
        {ev.category && <Badge variant="muted">{ev.category}</Badge>}
        <span className="text-muted-foreground">
          keyakinan {ev.confidence != null ? Math.round(ev.confidence * 100) : "?"}%
        </span>
        {ev.reason && <span className="text-amber-700">· {ev.reason}</span>}
      </div>
      <Textarea
        rows={4}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        className="mt-2 text-sm"
        placeholder="Tulis/edit balasan sebelum dikirim…"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={!reply.trim() || resolve.isPending} onClick={() => resolve.mutate("send")}>
          <Send className="h-3.5 w-3.5" />
          {resolve.isPending ? "Mengirim…" : "Kirim"}
        </Button>
        <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate("dismiss")}>
          <X className="h-3.5 w-3.5" /> Abaikan
        </Button>
        {ev.confidence != null && ev.confidence >= 0.9 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600">
            <Check className="h-3 w-3" /> draft kuat
          </span>
        )}
      </div>
    </div>
  );
}
