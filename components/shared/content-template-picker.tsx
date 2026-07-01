"use client";

// ContentTemplatePicker — the single, reusable "sisipkan dari Konten" affordance.
// A centered modal (Coral Sunset, matching cadence's EnrollModal chrome) that
// READS the M9 content backend (GET /api/content/templates), lets the user search +
// pick a template, and calls onPick(template) with { id, name, channel, subject, body }.
//
// Used by BOTH the Inbox composer and the Cadence step editor (single source) so
// Konten templates stop being a dead island and actually reach a sender.
//
// It only READS the content model — never mutates it. If the endpoint returns
// nothing / errors, it shows an empty/error state with a link to /content.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileText, Mail, MessageSquare, Search, Send, Sparkles, X } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── the template shape onPick hands back (subset of M9 content_template) ──────
export interface PickedTemplate {
  id: string;
  name: string;
  channel: string; // wa | email | instagram | linkedin | sms | other
  subject: string | null;
  body: string;
}

/** Full row from GET /api/content/templates (only the fields the picker needs). */
interface TemplateRow {
  id: string;
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  tags: string[];
  status: string;
}

// ── API envelope ({ ok, data }) — mirrors the pages' readJson helper ──────────
interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

const CHANNEL_META: Record<string, { label: string; color: string }> = {
  wa: { label: "WhatsApp", color: "#25D366" },
  email: { label: "Email", color: "#6366F1" },
  instagram: { label: "Instagram", color: "#E1306C" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  sms: { label: "SMS", color: "#0D9488" },
  call: { label: "Telepon", color: "#8B5CF6" },
  other: { label: "Lainnya", color: "#6B7280" },
};

function channelLabel(c: string): string {
  return CHANNEL_META[c]?.label ?? c;
}
function channelColor(c: string): string {
  return CHANNEL_META[c]?.color ?? "#6B7280";
}

export function ContentTemplatePicker({
  open,
  onClose,
  onPick,
  channel,
  title = "Sisipkan dari Konten",
  subtitle = "Pilih template pesan/konten untuk mengisi draf",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (template: PickedTemplate) => void;
  /** Optional current channel — matching templates are surfaced first (never filtered out). */
  channel?: string;
  title?: string;
  subtitle?: string;
}) {
  const [search, setSearch] = useState("");

  // Only fetch once the picker is actually open (kept warm across opens).
  const templatesQ = useQuery({
    queryKey: ["content", "templates", "picker"],
    enabled: open,
    queryFn: async () => readJson<TemplateRow[]>(await fetch("/api/content/templates")),
    retry: false,
  });
  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);

  // Reset the search box + close on Escape while open.
  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const forbidden =
    templatesQ.error instanceof Error && templatesQ.error.message === "forbidden";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = templates.filter((t) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        t.tags.some((g) => g.toLowerCase().includes(q))
      );
    });
    // Surface templates that match the caller's channel first (graceful — never hide).
    if (channel) {
      return [...rows].sort(
        (a, b) => Number(b.channel === channel) - Number(a.channel === channel),
      );
    }
    return rows;
  }, [templates, search, channel]);

  function pick(t: TemplateRow) {
    onPick({ id: t.id, name: t.name, channel: t.channel, subject: t.subject, body: t.body });
    onClose();
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / isi / tag template…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>

        {/* list */}
        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {templatesQ.isLoading ? (
            <div className="space-y-1.5 px-3 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : templatesQ.isError ? (
            <div className="px-3 py-6">
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat template"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil template dari Konten. Pastikan kamu login & database tersedia."
                }
                onRetry={() => templatesQ.refetch()}
              />
            </div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-6">
              <EmptyState
                className="border-0"
                icon={FileText}
                title="Belum ada template"
                description="Buat template pesan/konten reusable di Konten, lalu sisipkan di sini."
                action={
                  <Link
                    href="/content"
                    onClick={onClose}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
                  >
                    <FileText className="h-3.5 w-3.5" /> Buat di Konten
                  </Link>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6">
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada template yang cocok"
                description="Coba kata kunci lain, atau buat template baru di Konten."
              />
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((t) => {
                const matched = !!channel && t.channel === channel;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/[0.06]"
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${channelColor(t.channel)}1a`, color: channelColor(t.channel) }}
                    >
                      {t.channel === "email" ? (
                        <Mail className="h-3.5 w-3.5" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-foreground">{t.name}</p>
                        {matched && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-success/[0.14] px-1.5 py-0.5 text-[9px] font-semibold text-success">
                            <Sparkles className="h-2.5 w-2.5" /> cocok
                          </span>
                        )}
                      </div>
                      {t.subject && (
                        <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/70">
                          {t.subject}
                        </p>
                      )}
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {t.body || <span className="italic">Belum ada isi.</span>}
                      </p>
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: channelColor(t.channel) }}
                        />
                        {channelLabel(t.channel)}
                      </span>
                    </div>
                    <Send className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Link
            href="/content"
            onClick={onClose}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Kelola template di Konten →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-border px-3.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
