"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, ShieldCheck, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { can, type Role } from "@/lib/rbac/permissions";

interface Mailbox {
  id: string;
  type: string;
  fromEmail: string;
  fromName: string | null;
  status: string;
  dailyLimit: number;
  sentToday: number;
}
interface SendRow {
  id: string;
  toEmail: string;
  subject: string;
  status: string;
  error: string | null;
}

const STATUS_CLS: Record<string, string> = {
  sent: "bg-success/10 text-success",
  skipped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-info/10 text-info",
};

export default function MailboxesPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "member") as Role;
  const canManage = can(role, "mailbox.connect");
  const qc = useQueryClient();

  const mailboxes = useQuery({
    queryKey: ["mailboxes"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/mailboxes");
      if (!r.ok) throw new Error();
      const j = await r.json();
      return {
        rows: (j.data ?? []) as Mailbox[],
        oauth: (j.oauth ?? { google: false, microsoft: false, esp: false }) as {
          google: boolean;
          microsoft: boolean;
          esp: boolean;
        },
      };
    },
  });

  // OAuth connect result lands back here as ?connect=success|error|norefresh.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("connect");
    if (!c) return;
    if (c === "success") toast.success("Mailbox OAuth terhubung");
    else if (c === "norefresh") toast.error("Tidak dapat refresh token — coba lagi & izinkan akses penuh");
    else toast.error("Gagal menghubungkan mailbox OAuth");
    window.history.replaceState({}, "", window.location.pathname);
    qc.invalidateQueries({ queryKey: ["mailboxes"] });
  }, [qc]);
  const sends = useQuery({
    queryKey: ["sends"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/sends");
      if (!r.ok) throw new Error();
      return ((await r.json()).data ?? []) as SendRow[];
    },
  });

  const [conn, setConn] = useState({ fromEmail: "", fromName: "", host: "smtp.gmail.com", port: 465, user: "", pass: "" });
  const [msg, setMsg] = useState({ sendingAccountId: "", toEmail: "", subject: "", body: "" });

  const connect = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tenant/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conn, secure: conn.port === 465 }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      toast.success("Mailbox terhubung");
      setConn((c) => ({ ...c, pass: "" }));
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: () => toast.error("Gagal connect mailbox"),
  });

  // Platform ESP (doc 33) — uses the From fields from the SMTP form below.
  const connectEsp = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tenant/mailboxes/esp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromEmail: conn.fromEmail, fromName: conn.fromName }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Mailbox platform (ESP) terhubung");
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });

  const removeMbx = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch("/api/tenant/mailboxes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      toast.success("Mailbox dihapus");
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tenant/sends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error();
      return j.result as { sent: number; skipped: number; failed: number };
    },
    onSuccess: (res) => {
      toast.success(`Antrian diproses — terkirim ${res.sent}, skip ${res.skipped}, gagal ${res.failed}`);
      setMsg((m) => ({ ...m, toEmail: "", subject: "", body: "" }));
      qc.invalidateQueries({ queryKey: ["sends"] });
      qc.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: () => toast.error("Gagal mengirim"),
  });

  return (
    <div>
      <PageHeader
        title="Email & Jangkauan"
        description="Kirim email dari identitas pengirim sendiri (SMTP), dengan suppression & unsubscribe (doc 23/25)."
      />
      <div className="space-y-4 p-6">
        {/* Mailboxes */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" /> Mailbox
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <ul className="divide-y">
              {(mailboxes.data?.rows ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.fromName ? `${m.fromName} · ` : ""}{m.fromEmail}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.type.toUpperCase()} · {m.sentToday}/{m.dailyLimit} hari ini · {m.status}
                    </p>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => removeMbx.mutate(m.id)} aria-label="Hapus">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
              {(mailboxes.data?.rows.length ?? 0) === 0 && !mailboxes.isLoading && (
                <li className="py-2.5 text-xs text-muted-foreground">Belum ada mailbox. Connect Gmail/Outlook (OAuth) atau SMTP di bawah.</li>
              )}
            </ul>

            {/* OAuth connect (doc 32) — buttons show only when the provider's
                client id/secret are configured; otherwise a setup hint. */}
            {canManage && (mailboxes.data?.oauth.google || mailboxes.data?.oauth.microsoft || mailboxes.data?.oauth.esp) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Hubungkan cepat
                </span>
                {mailboxes.data?.oauth.google && (
                  <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/mailboxes/oauth/google/start"; }}>
                    Connect Gmail
                  </Button>
                )}
                {mailboxes.data?.oauth.microsoft && (
                  <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/mailboxes/oauth/microsoft/start"; }}>
                    Connect Outlook
                  </Button>
                )}
                {mailboxes.data?.oauth.esp && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!conn.fromEmail || connectEsp.isPending}
                    title="Pakai From email di form bawah (harus di domain terverifikasi ESP)"
                    onClick={() => connectEsp.mutate()}
                  >
                    {connectEsp.isPending ? "Menghubungkan…" : "Pakai email platform (ESP)"}
                  </Button>
                )}
              </div>
            )}
            {canManage && !mailboxes.data?.oauth.google && !mailboxes.data?.oauth.microsoft && !mailboxes.data?.oauth.esp && (
              <p className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
                Connect cepat (Gmail/Outlook OAuth atau platform ESP) belum aktif — isi <code>GOOGLE_OAUTH_*</code>,{" "}
                <code>MICROSOFT_OAUTH_*</code>, atau <code>RESEND_API_KEY</code> di <code>.env.local</code> (lihat <code>docs/32</code>, <code>docs/33</code>). SMTP app-password di bawah tetap jalan.
              </p>
            )}

            {canManage && (
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">From email</Label>
                  <Input value={conn.fromEmail} onChange={(e) => setConn({ ...conn, fromEmail: e.target.value, user: conn.user || e.target.value })} placeholder="nama@gmail.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From name</Label>
                  <Input value={conn.fromName} onChange={(e) => setConn({ ...conn, fromName: e.target.value })} placeholder="Tim Sales" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SMTP host</Label>
                  <Input value={conn.host} onChange={(e) => setConn({ ...conn, host: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={conn.port} onChange={(e) => setConn({ ...conn, port: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SMTP user</Label>
                  <Input value={conn.user} onChange={(e) => setConn({ ...conn, user: e.target.value })} placeholder="nama@gmail.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">App password</Label>
                  <Input type="password" value={conn.pass} onChange={(e) => setConn({ ...conn, pass: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Button variant="outline" disabled={!conn.fromEmail || !conn.pass || connect.isPending} onClick={() => connect.mutate()}>
                    Connect SMTP
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test send */}
        {canManage && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-primary" /> Kirim email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Dari mailbox</Label>
                  <Select value={msg.sendingAccountId} onValueChange={(v) => setMsg({ ...msg, sendingAccountId: v })}>
                    <SelectTrigger><SelectValue placeholder="Pilih mailbox" /></SelectTrigger>
                    <SelectContent>
                      {(mailboxes.data?.rows ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.fromEmail}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ke</Label>
                  <Input type="email" value={msg.toEmail} onChange={(e) => setMsg({ ...msg, toEmail: e.target.value })} placeholder="prospek@perusahaan.co.id" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subjek</Label>
                <Input value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Isi</Label>
                <Textarea rows={5} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
              </div>
              <Button
                disabled={!msg.sendingAccountId || !msg.toEmail || !msg.subject || !msg.body || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? "Mengirim…" : "Kirim"}
              </Button>
              <p className="text-[11px] text-muted-foreground">Footer unsubscribe otomatis ditambahkan; penerima yang opt-out di-skip.</p>
            </CardContent>
          </Card>
        )}

        {/* WhatsApp (WAHA) */}
        {canManage && <WhatsAppCard />}

        {/* Recent sends */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Riwayat kirim</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(sends.data ?? []).slice(0, 15).map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.toEmail}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.subject}{s.error ? ` · ${s.error}` : ""}</p>
                  </div>
                  <Badge className={STATUS_CLS[s.status] ?? ""}>{s.status}</Badge>
                </li>
              ))}
              {(sends.data?.length ?? 0) === 0 && !sends.isLoading && (
                <li className="p-3 text-xs text-muted-foreground">Belum ada email terkirim.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── WhatsApp via WAHA (doc 34) ──────────────────────────────────────────────
// Inert-but-wired: shows a setup hint when WAHA isn't configured; otherwise a
// session-status badge + a test-send form. Cadence WA steps send via the same
// session through the processor.
function WhatsAppCard() {
  const status = useQuery({
    queryKey: ["wa-status"],
    queryFn: async () => {
      const r = await fetch("/api/wa/status");
      if (!r.ok) throw new Error();
      return (await r.json()) as {
        configured: boolean;
        session: string;
        status?: string;
        error?: string;
      };
    },
  });
  const [wa, setWa] = useState({ to: "", text: "" });
  const send = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/wa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wa),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("WhatsApp terkirim");
      setWa({ to: "", text: "" });
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });
  const s = status.data;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" /> WhatsApp (WAHA)
          {s?.configured && (
            <Badge className={s.status === "WORKING" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
              {s.status ?? s.error ?? "?"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {!s?.configured ? (
          <p className="text-[11px] text-muted-foreground">
            WAHA belum aktif — isi <code>WAHA_BASE_URL</code>, <code>WAHA_API_KEY</code>,{" "}
            <code>WAHA_SESSION</code> di <code>.env.local</code> (lihat <code>docs/34</code>). Step cadence
            channel WhatsApp tetap di-queue sampai aktif.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nomor (08.. / 62..)</Label>
                <Input value={wa.to} onChange={(e) => setWa({ ...wa, to: e.target.value })} placeholder="08123456789" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pesan</Label>
              <Textarea rows={3} value={wa.text} onChange={(e) => setWa({ ...wa, text: e.target.value })} />
            </div>
            <Button disabled={!wa.to || !wa.text || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? "Mengirim…" : "Kirim WhatsApp"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Sesi <span className="font-mono">{s.session}</span>: {s.status ?? s.error ?? "—"}. Cadence step
              WhatsApp kirim via sesi ini.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
