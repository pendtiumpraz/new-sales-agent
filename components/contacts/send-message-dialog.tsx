"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, ExternalLink, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SendContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

function toWaDigits(phone: string): string {
  let d = (phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d;
}
function fill(t: string, c: SendContact): string {
  const first = (c.name ?? "").trim().split(/\s+/)[0] || "Kak";
  return (t ?? "")
    .replace(/\{\{?\s*nama\s*\}?\}/gi, first)
    .replace(/\{\{?\s*perusahaan\s*\}?\}/gi, c.company || "perusahaan Anda");
}

const TEMPLATES = [
  "Halo {{nama}} 👋 Kami punya solusi yang bisa bantu {{perusahaan}}. Boleh saya kirim info singkat / jadwalkan ngobrol 15 menit?",
  "Selamat pagi {{nama}}, perkenalkan kami dari tim sales. Banyak tim seperti {{perusahaan}} terbantu produk kami. Tertarik lihat demo?",
  "Hai {{nama}}, terima kasih sudah terhubung! Ada penawaran khusus untuk {{perusahaan}} bulan ini. Mau saya kirim detailnya?",
];

export function SendMessageDialog({ open, onOpenChange, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: SendContact[] }) {
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [subject, setSubject] = useState("Penawaran untuk {{perusahaan}}");
  const [body, setBody] = useState(TEMPLATES[0]);
  const [sending, setSending] = useState(false);

  const withPhone = contacts.filter((c) => c.phone);
  const withEmail = contacts.filter((c) => c.email);
  const targets = channel === "whatsapp" ? withPhone : withEmail;

  const waLink = (c: SendContact) => `https://wa.me/${toWaDigits(c.phone!)}?text=${encodeURIComponent(fill(body, c))}`;
  const mailtoLink = (c: SendContact) => `mailto:${c.email}?subject=${encodeURIComponent(fill(subject, c))}&body=${encodeURIComponent(fill(body, c))}`;
  const gmailLink = (c: SendContact) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(c.email!)}&su=${encodeURIComponent(fill(subject, c))}&body=${encodeURIComponent(fill(body, c))}`;
  const linkFor = (c: SendContact) => (channel === "whatsapp" ? waLink(c) : mailtoLink(c));

  // Open per-contact compose tabs (staggered so the browser doesn't block them).
  // This is the "extension / web" path — WA Web / Gmail compose, no server needed.
  function openAll(useGmail = false) {
    const links = targets.map((c) => (channel === "email" && useGmail ? gmailLink(c) : linkFor(c)));
    if (!links.length) { toast.error(channel === "whatsapp" ? "Tidak ada kontak dengan nomor HP" : "Tidak ada kontak dengan email"); return; }
    links.slice(0, 25).forEach((u, i) => setTimeout(() => window.open(u, "_blank", "noopener"), i * 350));
    if (links.length > 25) toast.info(`Membuka 25 dari ${links.length} (batasi agar browser tak memblokir). Ulangi untuk sisanya.`);
  }

  async function sendPlatform() {
    if (!body.trim()) { toast.error("Isi pesan dulu"); return; }
    setSending(true);
    try {
      const r = await fetch("/api/contacts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: contacts.map((c) => c.id), channel, subject, body }),
      });
      const j = await r.json();
      if (j?.source === "mock") toast.info("Mode demo — sambungkan DB untuk kirim otomatis.");
      else if (!r.ok || j.ok === false) {
        if (j?.needsManual) toast.error(`${j.error} Pakai mode manual di bawah.`);
        else throw new Error(j?.error ?? "gagal");
      } else if (channel === "email") {
        toast.success(`${j.queued} email diantri${j.skipped ? `, ${j.skipped} tanpa email` : ""}.`);
      } else {
        toast.success(`${j.sent} WhatsApp terkirim${j.skipped ? `, ${j.skipped} tanpa nomor` : ""}${j.failed ? `, ${j.failed} gagal` : ""}.`);
      }
    } catch (e) {
      toast.error(`Gagal kirim (${e instanceof Error ? e.message : e})`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Kirim pesan ke {contacts.length} kontak
          </DialogTitle>
          <DialogDescription>
            Personalisasi pakai <code className="rounded bg-muted px-1">{"{{nama}}"}</code> &amp; <code className="rounded bg-muted px-1">{"{{perusahaan}}"}</code>. Kirim otomatis via platform, atau buka WA Web / email (extension) per kontak.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Channel */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChannel("whatsapp")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium", channel === "whatsapp" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "text-muted-foreground hover:bg-accent")}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp <span className="text-xs">({withPhone.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setChannel("email")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium", channel === "email" ? "border-blue-400 bg-blue-50 text-blue-700" : "text-muted-foreground hover:bg-accent")}
            >
              <Mail className="h-4 w-4" /> Email <span className="text-xs">({withEmail.length})</span>
            </button>
          </div>

          {/* Templates */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-tertiary"><Sparkles className="h-3 w-3" /> Template:</span>
            {TEMPLATES.map((t, i) => (
              <button key={i} type="button" onClick={() => setBody(t)} className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Versi {i + 1}</button>
            ))}
          </div>

          {channel === "email" && (
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subjek email" className="h-9" />
          )}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Tulis pesan… pakai {{nama}} / {{perusahaan}}" />

          {/* Send automatically (platform: mailbox / WA gateway) */}
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium">Kirim otomatis (server)</p>
            <Button className="w-full" onClick={sendPlatform} disabled={sending || !targets.length}>
              <Send className="h-4 w-4" />
              {sending ? "Mengirim…" : channel === "whatsapp" ? `Kirim ${withPhone.length} WhatsApp (gateway)` : `Kirim ${withEmail.length} email (mailbox)`}
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground">Butuh mailbox terhubung (email) / WA gateway aktif. Kalau belum, pakai mode di bawah.</p>
          </div>

          {/* Manual / extension (WA Web / Gmail compose) */}
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium">Buka per kontak (extension / web — tanpa setup)</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openAll(false)} disabled={!targets.length}>
                <ExternalLink className="h-3.5 w-3.5" /> {channel === "whatsapp" ? `Buka WA Web (${withPhone.length})` : `Buka email (${withEmail.length})`}
              </Button>
              {channel === "email" && (
                <Button variant="outline" size="sm" onClick={() => openAll(true)} disabled={!withEmail.length}>
                  <ExternalLink className="h-3.5 w-3.5" /> Buka Gmail compose
                </Button>
              )}
            </div>
            <div className="mt-2 max-h-32 space-y-1 overflow-auto">
              {targets.slice(0, 50).map((c) => (
                <a key={c.id} href={channel === "email" ? gmailLink(c) : linkFor(c)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded border px-2 py-1 text-xs hover:bg-accent">
                  <span className="min-w-0 truncate">{c.name}<span className="text-muted-foreground"> · {channel === "whatsapp" ? c.phone : c.email}</span></span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
              ))}
              {!targets.length && <p className="text-xs text-muted-foreground">Tidak ada kontak dengan {channel === "whatsapp" ? "nomor HP" : "email"}.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
