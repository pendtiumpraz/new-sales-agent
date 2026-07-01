"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

// Command palette (⌘K / Ctrl+K) — dependency-free, Dialog-based. Lets the user
// jump to ANY page (so the slimmed sidebar doesn't hide routes). Grouping mirrors
// the workspace-first IA: Workspace is the primary flow; the retired contacts deep
// pages (profiles/discovery/map) live INSIDE a workspace now, so they're not
// surfaced here. Manager-only destinations are filtered out for reps.

interface Cmd {
  label: string;
  href: string;
  group: string;
  kw?: string;
  managerOnly?: boolean;
}

const COMMANDS: Cmd[] = [
  // Primary daily flow — Workspace first.
  { label: "Workspace (alur jualan)", href: "/workspace", group: "Utama", kw: "kelola fokus produk market-fit closing alur" },
  { label: "Dashboard", href: "/dashboard", group: "Utama", kw: "beranda home ringkasan" },
  { label: "Inbox", href: "/inbox", group: "Utama", kw: "percakapan chat wa email" },
  { label: "Laporan", href: "/reports", group: "Utama", kw: "analitik report kalibrasi" },

  // Leads are per-workspace; /contacts is just the funnel into workspaces.
  { label: "Kontak & Lead (funnel)", href: "/contacts", group: "Lead", kw: "kontak lead funnel" },
  { label: "Riset Prospek", href: "/pipeline", group: "Lead", kw: "pipeline enrichment positioning deal" },

  { label: "Cadence", href: "/cadences", group: "Jangkau", kw: "urutan pesan otomasi" },
  { label: "Buat cadence", href: "/cadences/new", group: "Jangkau", kw: "baru builder" },
  { label: "Autopilot", href: "/autopilot", group: "Jangkau", kw: "ai satu klik pipeline" },
  { label: "Eskalasi AI", href: "/escalations", group: "Jangkau", kw: "handoff manusia" },
  { label: "Konten", href: "/content", group: "Jangkau", kw: "marketing jadwal" },

  { label: "Penawaran", href: "/penawaran", group: "Closing", kw: "quote proposal" },
  { label: "Retensi", href: "/retention", group: "Closing", kw: "repeat upsell after-sales" },
  { label: "E-Commerce", href: "/ecommerce", group: "Closing", kw: "tokopedia shopee order keranjang" },

  { label: "Marketplace Data", href: "/marketplace", group: "Data & Tim", kw: "jual beli data bundle", managerOnly: true },
  { label: "Monitoring Sales", href: "/team", group: "Data & Tim", kw: "tim roster", managerOnly: true },
  { label: "Sales Lapangan", href: "/field", group: "Data & Tim", kw: "field peta kunjungan" },

  { label: "Panduan", href: "/documentation", group: "Atur", kw: "dokumentasi cara" },
  { label: "Analisa Market-Fit", href: "/workspace", group: "Atur", kw: "skenario industri market fit use case" },
  { label: "Pengaturan", href: "/settings", group: "Atur", kw: "settings akun" },
  { label: "Hubungkan WhatsApp / Extension", href: "/settings/extension", group: "Atur", kw: "wa whatsapp waha qr extension scan" },
  { label: "AI & Model", href: "/settings/ai", group: "Atur", kw: "model byok token" },
  { label: "Billing & Kuota", href: "/settings/billing", group: "Atur", kw: "tagihan paket" },
  { label: "Kepatuhan (PDP)", href: "/settings/compliance", group: "Atur", kw: "consent dpia dsar" },
  { label: "Mailbox", href: "/settings/mailboxes", group: "Atur", kw: "email smtp gmail" },
  { label: "Knowledge Base", href: "/settings/knowledge-base", group: "Atur", kw: "kb rag sumber" },
];

export function CommandPalette() {
  const router = useRouter();
  const isRep = useAuthStore((s) => s.currentUser.role) === "Sales Rep";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggles; the topbar button dispatches "maira:command" to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("maira:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("maira:command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const results = useMemo(() => {
    // Hide manager-only destinations from reps (matches the sidebar guard).
    const visible = COMMANDS.filter((c) => !c.managerOnly || !isRep);
    const s = q.trim().toLowerCase();
    if (!s) return visible;
    return visible.filter((c) =>
      `${c.label} ${c.group} ${c.kw ?? ""}`.toLowerCase().includes(s),
    );
  }, [q, isRep]);

  useEffect(() => setIdx(0), [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[idx]) {
      e.preventDefault();
      go(results[idx].href);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Cari &amp; lompat</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Cari halaman atau aksi…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Tidak ada yang cocok dengan “{q}”.
            </p>
          ) : (
            results.map((c, i) => (
              <button
                key={c.href}
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(c.href)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                  i === idx ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.group}</span>
                </span>
                {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
