"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Check, Send, X } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const history = (events.data ?? []).filter((e) => e.decision !== "escalated").slice(0, 15);

  return (
    <div>
      <PageHeader
        title="Eskalasi AI"
        description="Balasan yang ditahan agen untuk ditinjau manusia — kirim sekali klik atau abaikan (doc 36)."
      />
      <div className="max-w-3xl space-y-5 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" /> Antrian eskalasi
              <Badge variant="muted" className="ml-1">{queue.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {events.isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada eskalasi. Jalankan <span className="font-medium">Auto-reply</span> di halaman Cadence — balasan yang
                tidak yakin/sensitif akan muncul di sini.
              </p>
            ) : (
              queue.map((e) => <EscalationCard key={e.id} ev={e} onDone={() => qc.invalidateQueries({ queryKey: ["auto-reply-events"] })} />)
            )}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Riwayat</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {history.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-3 text-sm">
                    <Badge className={DECISION_CLS[e.decision] ?? ""}>{e.decision}</Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {e.channel} · {e.reply ?? e.reason ?? "—"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString("id-ID")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
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
