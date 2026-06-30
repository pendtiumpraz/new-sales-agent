"use client";

// Inbox / WhatsApp — Module 4 FRONTEND (Sainskerta Loop Phase 04). Wired to the
// NEW M4 inbox/wa backend (no mock data). Faithful to mockups/inbox.html (Coral
// Sunset): a full-height 3-column workspace —
//   • LEFT   — conversation list (filter chips Semua/Belum dibaca/WA/Email, unread
//              badge, channel badge, readiness dot, search) + a "Sampah" view with
//              soft-delete / restore / hard-purge.
//   • CENTER — chat thread (in/out bubbles, date separators, WA wallpaper),
//              composer (send → POST /api/messages), quick replies.
//   • RIGHT  — context panel (contact, Segment B2C/B2B override, Sumber, channel,
//              deal terkait, closing-readiness gauge).
// Selecting a conversation loads its thread in the center (in-page, no route hop).
//
// API surface (all real, no fabricated values):
//   GET    /api/conversations                     → ConversationRow[] (list)
//   GET    /api/conversations/trashed             → ConversationRow[] (Sampah)
//   DELETE /api/conversations/[id]                → SOFT delete (→ Sampah, cascades msgs)
//   PATCH  /api/conversations/[id]/restore        → restore (un-trash)
//   DELETE /api/conversations/[id]?purge=1        → HARD delete (permanent)
//   PATCH  /api/conversations/[id]  {markRead}    → reset unread on select
//   GET    /api/messages?conversationId=          → MessageRow[] (thread, oldest→newest)
//   POST   /api/messages                          → append out message (send / approve draft)
//   GET    /api/contacts                          → ContactRow[] (resolve name/seg/phone/source)
//   PATCH  /api/contacts/[id]      {segment}      → segment override (B2C/B2B)
//   GET    /api/deals?contactId=                  → DealRow[] (deal terkait)
//   GET/PUT /api/wa/mode                          → WA reply mode (auto | semi)
//
// Conversations carry only a `contactId` soft ref — the contact's name, segment,
// phone, source live in the CRM (M3). We join them client-side. Every band has
// loading + empty + error states. Lives in the (app) shell.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Inbox as InboxIcon,
  Mail,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { ClosingReadinessBadge } from "@/components/inbox/closing-readiness-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope ({ ok, data }) ──────────────────────────────────────────────
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

/** Keyset page envelope returned by the list endpoints (data = { items, nextCursor }). */
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ── row shapes (NEW M4 inbox + M3 crm backends) ──────────────────────────────

/** Row from GET /api/conversations (modules/inbox · conversation_v2). */
interface ConversationRow {
  id: string;
  tenantId: string;
  contactId: string;
  workspaceId: string | null;
  channel: string; // wa | email | instagram | linkedin
  channelAccountId: string | null;
  assignedUserId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  status: string; // open | snoozed | closed
  avatarColor: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/conversations/trashed
}

/** Row from GET /api/messages (modules/inbox · message_v2). */
interface MessageRow {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: string; // in | out
  body: string;
  channel: string | null;
  status: string; // queued | sent | delivered | read | failed
  isAiGenerated: boolean;
  attachmentLabel: string | null;
  meta: Record<string, unknown> | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Subset of GET /api/contacts (modules/crm · contact) used to enrich a thread. */
interface ContactRow {
  id: string;
  companyId: string | null;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  location: string | null;
  segment: string; // b2c | b2b | unknown
  source: string | null;
  consentStatus: string;
  avatarColor: string | null;
}

/** Row from GET /api/deals?contactId= (modules/crm · deal). */
interface DealRow {
  id: string;
  name: string;
  value: number;
  currency: string;
  status: string;
}

// ── display metadata ─────────────────────────────────────────────────────────

type ConvFilter = "all" | "unread" | "wa" | "email";
type MainView = "inbox" | "sampah";

const CHANNEL_META: Record<string, { dot: string; label: string }> = {
  wa: { dot: "#25D366", label: "WhatsApp" },
  email: { dot: "#6366F1", label: "Email" },
  instagram: { dot: "#E1306C", label: "Instagram" },
  linkedin: { dot: "#0A66C2", label: "LinkedIn" },
};

const SEG_BADGE: Record<string, { label: string; style: React.CSSProperties } | null> = {
  b2b: { label: "B2B", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  b2c: { label: "B2C", style: { background: "#E1306C18", color: "#c01f5b" } },
  unknown: null,
};

const SOURCE_DOT: Record<string, string> = {
  Crawl: "#3B82F6",
  Hunter: "#8B5CF6",
  Impor: "#6B7280",
  Web: "#0D9488",
};

const QUICK_REPLIES = [
  "Kirim detail harga",
  "Jadwalkan demo",
  "Kirim katalog",
  "Ada lagi yang bisa dibantu?",
];

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

function sourceBucket(source: string | null): string {
  if (!source) return "—";
  const s = source.toLowerCase();
  if (s.includes("crawl")) return "Crawl";
  if (s.includes("hunter")) return "Hunter";
  if (s.includes("impor") || s.includes("import") || s.includes("csv")) return "Impor";
  if (s.includes("web")) return "Web";
  if (s.includes("iklan") || s.includes("ads") || s.includes("meta")) return source;
  return source;
}

/** Short clock (HH:mm) for a message bubble timestamp. */
function fmtClock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** A coarse, human "today / yesterday / date" key for date separators in a thread. */
function dayKey(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** Relative "X menit/jam/hari lalu" for the list row time + trash timestamp. */
function fmtRelID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return fmtClock(iso);
  const days = Math.floor(h / 24);
  if (days === 1) return "Kemarin";
  if (days < 30) return `${days} hr lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function fmtIDR(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("id-ID")}`;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const qc = useQueryClient();

  // Live conversations + contacts (contacts resolve contactId → name/seg/phone/source).
  const convosQ = useQuery({
    queryKey: ["inbox", "conversations", "list"],
    queryFn: async () => readJson<ConversationRow[]>(await fetch("/api/conversations")),
    retry: false,
  });
  const contactsQ = useQuery({
    queryKey: ["inbox", "contacts", "list"],
    queryFn: async () =>
      (await readJson<Page<ContactRow>>(await fetch("/api/contacts?limit=200"))).items,
    retry: false,
  });

  const convos = useMemo(() => convosQ.data ?? [], [convosQ.data]);
  const contactById = useMemo(() => {
    const m: Record<string, ContactRow> = {};
    for (const c of contactsQ.data ?? []) m[c.id] = c;
    return m;
  }, [contactsQ.data]);

  // ── view (Inbox | Sampah) ────────────────────────────────────────────────
  const [view, setView] = useState<MainView>("inbox");
  const trashedQ = useQuery({
    queryKey: ["inbox", "conversations", "trashed"],
    enabled: view === "sampah",
    queryFn: async () => readJson<ConversationRow[]>(await fetch("/api/conversations/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters / search ─────────────────────────────────────────────────────
  const [filter, setFilter] = useState<ConvFilter>("all");
  const [search, setSearch] = useState("");

  const nameOf = (c: ConversationRow) => contactById[c.contactId]?.fullName ?? "Kontak";
  const segOf = (c: ConversationRow) => contactById[c.contactId]?.segment ?? "unknown";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return convos.filter((c) => {
      const okFilter =
        filter === "all" ||
        (filter === "unread" && c.unreadCount > 0) ||
        (filter === "wa" && c.channel === "wa") ||
        (filter === "email" && c.channel === "email");
      const name = nameOf(c).toLowerCase();
      const preview = (c.lastMessage ?? "").toLowerCase();
      const okSearch = !q || name.includes(q) || preview.includes(q);
      return okFilter && okSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convos, contactById, filter, search]);

  const unreadThreads = useMemo(() => convos.filter((c) => c.unreadCount > 0).length, [convos]);
  const unreadTotal = useMemo(
    () => convos.reduce((sum, c) => sum + (c.unreadCount > 0 ? c.unreadCount : 0), 0),
    [convos],
  );

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((c) => nameOf(c).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashed, contactById, search]);

  // ── selection ────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => convos.find((c) => c.id === activeId) ?? null, [convos, activeId]);
  const activeContact = active ? contactById[active.contactId] ?? null : null;

  // Auto-select the first visible conversation once data lands (mockup opens c1).
  useEffect(() => {
    if (view !== "inbox") return;
    if (activeId && convos.some((c) => c.id === activeId)) return;
    if (visible.length > 0) setActiveId(visible[0].id);
  }, [view, activeId, convos, visible]);

  // ── messages (lazy, per selected conversation) ───────────────────────────
  const messagesQ = useQuery({
    queryKey: ["inbox", "messages", activeId],
    enabled: !!activeId,
    queryFn: async () =>
      (await readJson<Page<MessageRow>>(await fetch(`/api/messages?conversationId=${activeId}`)))
        .items,
    retry: false,
  });
  const messages = useMemo(() => messagesQ.data ?? [], [messagesQ.data]);

  // related deals for the open contact (right panel)
  const dealsQ = useQuery({
    queryKey: ["inbox", "deals", active?.contactId],
    enabled: !!active?.contactId,
    queryFn: async () =>
      (await readJson<Page<DealRow>>(await fetch(`/api/deals?contactId=${active!.contactId}`)))
        .items,
    retry: false,
  });

  // mark a thread read on open (reset unread_count to 0)
  const markRead = useMutation({
    mutationFn: async (id: string) =>
      readJson<ConversationRow>(
        await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox", "conversations"] }),
  });

  function selectConvo(c: ConversationRow) {
    setActiveId(c.id);
    if (c.unreadCount > 0) markRead.mutate(c.id);
  }

  // ── composer / send ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const sendMsg = useMutation({
    mutationFn: async (vars: { conversationId: string; body: string; isAiGenerated?: boolean }) =>
      readJson<MessageRow>(
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: vars.conversationId,
            direction: "out",
            body: vars.body,
            isAiGenerated: vars.isAiGenerated ?? false,
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["inbox", "messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengirim pesan"),
  });

  function doSend() {
    const body = draft.trim();
    if (!body || !activeId) return;
    sendMsg.mutate({ conversationId: activeId, body });
  }

  // keep the thread scrolled to the newest bubble
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  // ── segment override (reuses M3 PATCH /api/contacts/[id]) ─────────────────
  const reclassify = useMutation({
    mutationFn: async (vars: { id: string; segment: string }) =>
      readJson<ContactRow>(
        await fetch(`/api/contacts/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segment: vars.segment }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(`Segmen di-override → ${vars.segment.toUpperCase()}`);
      qc.invalidateQueries({ queryKey: ["inbox", "contacts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah segmen"),
  });

  // ── WA reply mode (auto | semi) — plain { mode } envelope ─────────────────
  const waModeQ = useQuery({
    queryKey: ["inbox", "wa", "mode"],
    queryFn: async () => {
      const r = await fetch("/api/wa/mode");
      if (!r.ok) throw new Error("mode");
      return (await r.json()) as { mode: string };
    },
    retry: false,
  });
  const waMode = waModeQ.data?.mode === "semi" ? "semi" : "auto";
  const setWaMode = useMutation({
    mutationFn: async (mode: "auto" | "semi") => {
      const r = await fetch("/api/wa/mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) throw new Error("mode");
      return (await r.json()) as { ok: boolean; mode?: string };
    },
    onSuccess: (_res, mode) => {
      qc.invalidateQueries({ queryKey: ["inbox", "wa", "mode"] });
      toast.success(mode === "auto" ? "Mode WA: AI auto-reply" : "Mode WA: Manual (semi)");
    },
    onError: () => toast.error("Gagal mengubah mode WA (butuh izin admin)"),
  });

  // ── soft-delete / restore / purge (conversation grain) ────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ConversationRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ConversationRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ConversationRow | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  function refreshConvos() {
    qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
  }

  const softDelete = useMutation({
    mutationFn: async (c: ConversationRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/conversations/${c.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`Percakapan "${nameOf(c)}" dipindah ke Sampah`);
      refreshConvos();
      setDeleteTarget(null);
      if (activeId === c.id) setActiveId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal mengarsipkan percakapan");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (c: ConversationRow) =>
      readJson<ConversationRow>(
        await fetch(`/api/conversations/${c.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`Percakapan "${nameOf(c)}" dipulihkan`);
      refreshConvos();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan percakapan");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (c: ConversationRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/conversations/${c.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`Percakapan "${nameOf(c)}" dihapus permanen`);
      refreshConvos();
      setPurgeTarget(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── derived top-level states ──────────────────────────────────────────────
  const listLoading = convosQ.isLoading || contactsQ.isLoading;
  const listError = convosQ.isError;
  const forbidden = convosQ.error instanceof Error && convosQ.error.message === "forbidden";

  // group thread messages by day for date separators
  const grouped = useMemo(() => {
    const out: { key: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const k = dayKey(m.sentAt ?? m.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(m);
      else out.push({ key: k, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
      {/* ============ COLUMN 1 — CONVERSATION LIST ============ */}
      {/* Below lg this is a single pane: full-width list; when a thread is open
          (inbox view + active) it hides and the thread takes over (see col 2). */}
      <section
        className={cn(
          "flex min-h-0 shrink-0 flex-col border-r border-border bg-card",
          "w-full lg:w-[336px]",
          view === "inbox" && active ? "hidden lg:flex" : "flex",
        )}
      >
        {/* header: title + WA mode toggle + search + view tabs + filter chips */}
        <div className="shrink-0 space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight">Inbox</h2>
            <button
              type="button"
              disabled={setWaMode.isPending}
              onClick={() => setWaMode.mutate(waMode === "auto" ? "semi" : "auto")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2 text-[11px] font-semibold transition-colors disabled:opacity-60",
                waMode === "auto"
                  ? "border-tertiary/30 bg-tertiary/10 text-tertiary"
                  : "border-border bg-card text-muted-foreground",
              )}
              title="Mode balasan WhatsApp"
            >
              <span
                className={cn(
                  "relative inline-block h-3.5 w-7 rounded-full transition-colors",
                  waMode === "auto" ? "bg-tertiary" : "bg-muted-foreground/40",
                )}
              >
                <span
                  className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all"
                  style={waMode === "auto" ? { right: 2 } : { left: 2 }}
                />
              </span>
              {waMode === "auto" ? "AI auto" : "Manual"}
            </button>
          </div>

          {/* search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari percakapan…"
              className="h-8 w-full rounded-lg border border-transparent bg-muted/60 pl-9 pr-3 text-[13px] focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          {/* view tabs: Inbox | Sampah */}
          <div className="flex items-center gap-1 text-xs">
            <ViewTab active={view === "inbox"} onClick={() => setView("inbox")}>
              <InboxIcon className="h-3.5 w-3.5" /> Inbox
            </ViewTab>
            <ViewTab active={view === "sampah"} onClick={() => setView("sampah")}>
              <Trash2 className="h-3.5 w-3.5" /> Sampah
              {trashed.length > 0 && (
                <span className="rounded-full bg-destructive/[0.12] px-1.5 text-[10px] font-semibold tabular-nums text-destructive">
                  {trashed.length}
                </span>
              )}
            </ViewTab>
          </div>

          {/* filter chips (Inbox view only) */}
          {view === "inbox" && (
            <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-0.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                Semua
              </FilterChip>
              <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
                Belum dibaca
                {unreadThreads > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {unreadThreads}
                  </span>
                )}
              </FilterChip>
              <FilterChip active={filter === "wa"} onClick={() => setFilter("wa")}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#25D366" }} />
                WA
              </FilterChip>
              <FilterChip active={filter === "email"} onClick={() => setFilter("email")}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#6366F1" }} />
                Email
              </FilterChip>
            </div>
          )}
        </div>

        {/* list body */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {view === "inbox" ? (
            listLoading ? (
              <ListLoading />
            ) : listError ? (
              <ErrorState
                className="m-3 border-dashed"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat percakapan"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin."
                    : "Tidak bisa mengambil daftar percakapan. Pastikan kamu login & database tersedia."
                }
                onRetry={() => convosQ.refetch()}
              />
            ) : convos.length === 0 ? (
              <EmptyState
                className="m-3 border-dashed"
                icon={InboxIcon}
                title="Belum ada percakapan"
                description="Percakapan WhatsApp & email masuk ke sini begitu kontak membalas. Mulai dari Kontak / Cadence."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="m-3 border-dashed"
                icon={Search}
                title="Tidak ada percakapan"
                description="Coba ubah filter / kata kunci."
              />
            ) : (
              visible.map((c) => (
                <ConversationRowItem
                  key={c.id}
                  convo={c}
                  contact={contactById[c.contactId] ?? null}
                  active={c.id === activeId}
                  onOpen={() => selectConvo(c)}
                  onDelete={() => setDeleteTarget(c)}
                />
              ))
            )
          ) : /* ---- Sampah ---- */ trashedQ.isLoading ? (
            <ListLoading />
          ) : trashedQ.isError ? (
            <ErrorState
              className="m-3 border-dashed"
              title="Gagal memuat sampah"
              description="Tidak bisa mengambil percakapan yang diarsipkan."
              onRetry={() => trashedQ.refetch()}
            />
          ) : visibleTrashed.length === 0 ? (
            <EmptyState
              className="m-3 border-dashed"
              icon={Trash2}
              title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
              description={
                trashed.length === 0
                  ? "Percakapan yang kamu arsipkan akan muncul di sini dan bisa dipulihkan."
                  : "Coba ubah kata kunci pencarian."
              }
            />
          ) : (
            visibleTrashed.map((c) => (
              <TrashedRowItem
                key={c.id}
                convo={c}
                contact={contactById[c.contactId] ?? null}
                onRestore={() => setRestoreTarget(c)}
                onPurge={() => {
                  setPurgeTarget(c);
                  setPurgeConfirm("");
                }}
              />
            ))
          )}
        </div>
      </section>

      {/* ============ COLUMN 2 — THREAD ============ */}
      {/* On lg+ always present (flex-1). Below lg it only shows once a thread is
          open in inbox view — otherwise the list (col 1) owns the single pane. */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col min-h-0",
          view === "inbox" && active ? "flex" : "hidden lg:flex",
        )}
      >
        {view === "sampah" || !active ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              className="border-0 bg-transparent"
              icon={MessageSquare}
              title="Pilih percakapan"
              description="Pilih percakapan dari daftar untuk melihat pesan WhatsApp & email dalam satu tampilan."
            />
          </div>
        ) : (
          <>
            {/* (a) thread header — identity + channel/segment + closing-readiness */}
            <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
              {/* back to list — single-pane mobile only (desktop keeps the list visible) */}
              <button
                type="button"
                onClick={() => setActiveId(null)}
                title="Kembali ke daftar"
                className="-ml-1 flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </button>
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  active.channel === "wa"
                    ? "bg-[#25D366]/15 text-[#1a8d4c]"
                    : "bg-[#6366F1]/15 text-[#5358d6]",
                )}
              >
                {initialsOf(nameOf(active))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{nameOf(active)}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ChannelChip channel={active.channel} />
                  {CHANNEL_META[active.channel]?.label ?? active.channel} ·
                  <SegmentInline segment={segOf(active)} />
                  {active.status === "open" && (
                    <span className="font-medium text-success">• aktif</span>
                  )}
                </p>
                {/* closing-readiness: score + band + NBA, plus current-stage chip */}
                <div className="mt-1.5">
                  <ClosingReadinessBadge conversationId={active.id} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(active)}
                title="Arsipkan percakapan (ke Sampah)"
                className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* (b) AI draft handoff banner (semi mode) */}
            {waMode === "semi" && (
              <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="flex-1 text-amber-800">
                  <b>Mode semi-auto:</b> AI menyusun draf, butuh persetujuan kamu sebelum dikirim.
                </span>
              </div>
            )}

            {/* (c) messages — bubbles, date separators, WA wallpaper */}
            <div ref={threadRef} className="wa-bg min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-2">
                {messagesQ.isLoading ? (
                  <ThreadLoading />
                ) : messagesQ.isError ? (
                  <ErrorState
                    className="border-dashed bg-card/80"
                    title="Gagal memuat pesan"
                    description="Tidak bisa mengambil isi percakapan ini."
                    onRetry={() => messagesQ.refetch()}
                  />
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-[12px] text-muted-foreground">
                    Belum ada pesan. Ketik balasan pertama di bawah.
                  </div>
                ) : (
                  grouped.map((g) => (
                    <div key={g.key} className="flex flex-col gap-2">
                      <div className="my-1.5 text-center">
                        <span className="rounded-full border border-border bg-card/80 px-2.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                          {g.key}
                        </span>
                      </div>
                      {g.items.map((m) => (
                        <MessageBubble key={m.id} msg={m} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* (d) composer: quick replies + input */}
            <div className="shrink-0 border-t border-border bg-card p-3">
              <div className="mx-auto max-w-2xl space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <Zap className="h-3 w-3 text-warning" /> Balasan cepat
                  </span>
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setDraft(q);
                        composerRef.current?.focus();
                      }}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground/70 transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    title="Lampiran"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <Paperclip className="h-[18px] w-[18px]" />
                  </button>
                  <div className="relative flex-1">
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          doSend();
                        }
                      }}
                      placeholder={
                        active.channel === "wa" ? "Ketik pesan WhatsApp…" : "Ketik balasan…"
                      }
                      className="max-h-28 w-full resize-none rounded-lg border border-transparent bg-muted/60 py-2 pl-3.5 pr-10 text-[13px] leading-relaxed focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                    <span className="absolute bottom-2 right-2.5 text-muted-foreground">
                      <Smile className="h-[18px] w-[18px]" />
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={doSend}
                    disabled={!draft.trim() || sendMsg.isPending}
                    title="Kirim"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ============ COLUMN 3 — CONTEXT PANEL ============ */}
      {view === "inbox" && active && (
        <aside className="thin-scroll hidden w-[340px] min-h-0 shrink-0 overflow-y-auto border-l border-border bg-card xl:block">
          {/* contact card */}
          <div className="flex flex-col items-center gap-2 border-b border-border p-5 text-center">
            <span
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold",
                active.channel === "wa"
                  ? "bg-[#25D366]/15 text-[#1a8d4c]"
                  : "bg-[#6366F1]/15 text-[#5358d6]",
              )}
            >
              {initialsOf(nameOf(active))}
            </span>
            <div>
              <p className="font-semibold text-foreground">{nameOf(active)}</p>
              <p className="text-xs text-muted-foreground">
                {activeContact?.title ||
                  (segOf(active) === "b2b" ? "Kontak perusahaan" : "Pelanggan perorangan")}
                {activeContact?.location || activeContact?.city
                  ? ` · ${activeContact.location || activeContact.city}`
                  : ""}
              </p>
            </div>
            {activeContact?.consentStatus === "opted_in" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/[0.12] px-2 py-0.5 text-[10px] font-medium text-success">
                <Check className="h-3 w-3" /> consent: opt-in
              </span>
            )}
          </div>

          {/* segment override */}
          <div className="space-y-3 border-b border-border p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Segmen
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                <Sparkles className="h-2.5 w-2.5 text-tertiary" /> klasifikasi AI · bisa override
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { v: "b2c", label: "B2C" },
                  { v: "b2b", label: "B2B" },
                ] as const
              ).map((s) => {
                const on = segOf(active) === s.v;
                return (
                  <button
                    key={s.v}
                    type="button"
                    disabled={reclassify.isPending || !activeContact}
                    onClick={() =>
                      activeContact && !on && reclassify.mutate({ id: activeContact.id, segment: s.v })
                    }
                    className={cn(
                      "h-7 rounded-full px-3 text-[11px] transition-colors disabled:opacity-60",
                      on
                        ? "font-semibold"
                        : "border border-border bg-card font-medium text-muted-foreground hover:border-primary/40",
                    )}
                    style={on && SEG_BADGE[s.v] ? SEG_BADGE[s.v]!.style : undefined}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* contact info + source */}
          <div className="space-y-2.5 border-b border-border p-5 text-[13px]">
            <InfoRow label="Channel utama">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CHANNEL_META[active.channel]?.dot ?? "#6B7280" }}
                />
                {CHANNEL_META[active.channel]?.label ?? active.channel}
              </span>
            </InfoRow>
            <InfoRow label={active.channel === "email" ? "Email" : "No. HP"}>
              <span className="select-all font-medium">
                {activeContact?.whatsapp ||
                  activeContact?.phone ||
                  activeContact?.email ||
                  "—"}
              </span>
            </InfoRow>
            <InfoRow label="Sumber">
              {(() => {
                const bucket = sourceBucket(activeContact?.source ?? null);
                if (bucket === "—") return <span className="text-muted-foreground">—</span>;
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: SOURCE_DOT[bucket] ?? "#6B7280" }}
                    />
                    {activeContact?.source}
                  </span>
                );
              })()}
            </InfoRow>
            <InfoRow label="Masuk">
              <span className="text-muted-foreground">{fmtRelID(active.createdAt)}</span>
            </InfoRow>
            <Link
              href="/contacts"
              className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-primary hover:underline"
            >
              Lihat profil &amp; data enrichment <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* deal terkait */}
          <div className="space-y-2 border-b border-border p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Deal terkait
            </p>
            {dealsQ.isLoading ? (
              <Skeleton className="h-14 w-full rounded-lg" />
            ) : dealsQ.isError ? (
              <ErrorState
                className="border-dashed py-5"
                title="Gagal memuat deal"
                description="Tidak bisa mengambil deal terkait."
                onRetry={() => dealsQ.refetch()}
              />
            ) : (dealsQ.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
                Belum ada deal terkait. Buat dari Pipeline untuk menautkannya ke kontak ini.
              </p>
            ) : (
              (dealsQ.data ?? []).map((d) => (
                <Link
                  key={d.id}
                  href="/pipeline"
                  className="block rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-foreground">{d.name}</p>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {fmtIDR(d.value, d.currency)} · {d.status}
                  </p>
                </Link>
              ))
            )}
          </div>

          {/* contact actions */}
          <div className="grid grid-cols-2 gap-2 p-5">
            <Link
              href="/pipeline"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
            >
              Pipeline
            </Link>
            <Link
              href="/contacts"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-medium transition-colors hover:border-primary/40"
            >
              Kontak
            </Link>
          </div>
        </aside>
      )}

      {/* ===================== SOFT-DELETE (ARCHIVE) CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Arsipkan percakapan?"
        body={
          <>
            Percakapan dengan{" "}
            <span className="font-medium text-foreground">
              {deleteTarget ? nameOf(deleteTarget) : ""}
            </span>{" "}
            akan dipindah ke <b>Sampah</b> (pesannya ikut terarsip). Kamu masih bisa memulihkannya.
          </>
        }
        confirmLabel="Ya, arsipkan"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan percakapan?"
        body={
          <>
            Percakapan dengan{" "}
            <span className="font-medium text-foreground">
              {restoreTarget ? nameOf(restoreTarget) : ""}
            </span>{" "}
            akan dikembalikan ke <b>Inbox</b> beserta pesannya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM ===================== */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setPurgeTarget(null);
            setPurgeConfirm("");
          }
        }}
        className={cn(
          "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
          purgeTarget ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className={cn(
            "w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-5 shadow-soft transition-all duration-200",
            purgeTarget ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-destructive">Hapus permanen?</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Tindakan ini <b>tidak bisa dibatalkan</b>. Percakapan dengan{" "}
                <span className="font-medium text-foreground">
                  {purgeTarget ? nameOf(purgeTarget) : ""}
                </span>{" "}
                akan dihapus selamanya beserta pesannya.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-[12px] text-muted-foreground">
              Ketik{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground">
                HAPUS
              </code>{" "}
              untuk konfirmasi.
            </label>
            <input
              type="text"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="HAPUS"
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPurgeTarget(null);
                setPurgeConfirm("");
              }}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => purgeTarget && purge.mutate(purgeTarget)}
              disabled={purge.isPending || purgeConfirm.trim().toUpperCase() !== "HAPUS"}
              className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {purge.isPending ? "Menghapus…" : "Hapus permanen"}
            </button>
          </div>
        </div>
      </div>

      {/* nav unread mirror (kept off-DOM; the sidebar owns its own badge) */}
      <span className="hidden" aria-hidden data-unread-total={unreadTotal} />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
        active
          ? "bg-foreground font-semibold text-background"
          : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  if (channel === "wa") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 font-medium"
        style={{ background: "#25D36618", color: "#1a8d4c" }}
      >
        <MessageSquare className="h-2.5 w-2.5" /> WA
      </span>
    );
  }
  if (channel === "email") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 font-medium"
        style={{ background: "#6366F118", color: "#5358d6" }}
      >
        <Mail className="h-2.5 w-2.5" /> Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 font-medium text-foreground/70">
      {channel}
    </span>
  );
}

function SegmentInline({ segment }: { segment: string }) {
  const meta = SEG_BADGE[segment];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
        belum
      </span>
    );
  }
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function ConversationRowItem({
  convo,
  contact,
  active,
  onOpen,
  onDelete,
}: {
  convo: ConversationRow;
  contact: ContactRow | null;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const name = contact?.fullName ?? "Kontak";
  const seg = contact?.segment ?? "unknown";
  const unread = convo.unreadCount > 0;
  return (
    <div
      className={cn(
        "group relative flex w-full gap-3 border-b border-border p-3 text-left transition-colors hover:bg-muted/40",
        active && "bg-primary/[0.08]",
      )}
    >
      {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-primary" />}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
        <span className="relative shrink-0">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
              convo.channel === "wa"
                ? "bg-[#25D366]/15 text-[#1a8d4c]"
                : "bg-[#6366F1]/15 text-[#5358d6]",
            )}
          >
            {initialsOf(name)}
          </span>
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card"
            style={{ color: convo.channel === "wa" ? "#1a8d4c" : "#6366F1" }}
          >
            {convo.channel === "wa" ? (
              <MessageSquare className="h-2.5 w-2.5" />
            ) : (
              <Mail className="h-2.5 w-2.5" />
            )}
          </span>
        </span>
        <span className="block min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-sm",
                unread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
              )}
            >
              {name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {fmtRelID(convo.lastMessageAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                "line-clamp-1 text-[11px]",
                unread ? "text-foreground/70" : "text-muted-foreground",
              )}
            >
              {convo.lastMessage || "Belum ada pesan"}
            </span>
            {unread && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {convo.unreadCount}
              </span>
            )}
          </span>
          <span className="mt-1 inline-block">
            <SegmentInline segment={seg} />
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Arsipkan (ke Sampah)"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-muted-foreground opacity-0 transition-all hover:border-destructive/40 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function TrashedRowItem({
  convo,
  contact,
  onRestore,
  onPurge,
}: {
  convo: ConversationRow;
  contact: ContactRow | null;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const name = contact?.fullName ?? "Kontak";
  return (
    <div className="flex gap-3 border-b border-border p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground/80">{name}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {fmtRelID(convo.deletedAt ?? null)}
          </span>
        </div>
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {convo.lastMessage || "Belum ada pesan"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[10px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
          >
            <RotateCcw className="h-3 w-3" /> Pulihkan
          </button>
          <button
            type="button"
            onClick={onPurge}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Hapus permanen
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const time = fmtClock(msg.sentAt ?? msg.createdAt);
  if (msg.direction === "in") {
    return (
      <div className="flex justify-start">
        <div className="bubble-in max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2 shadow-sm">
          {msg.attachmentLabel && (
            <p className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Paperclip className="h-2.5 w-2.5" /> {msg.attachmentLabel}
            </p>
          )}
          <p className="text-[13px] leading-relaxed text-foreground/90">{msg.body}</p>
          <span className="mt-0.5 block text-right text-[9px] text-muted-foreground">{time}</span>
        </div>
      </div>
    );
  }
  const tick = msg.status === "read" ? "✓✓" : msg.status === "queued" ? "🕓" : "✓";
  return (
    <div className="flex justify-end">
      <div className="bubble-out max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2 shadow-sm">
        {msg.attachmentLabel && (
          <p className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-[#3b7a55]">
            <Paperclip className="h-2.5 w-2.5" /> {msg.attachmentLabel}
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-[#0c2b1c]">{msg.body}</p>
        <span className="mt-0.5 block text-right text-[9px] text-[#3b7a55]">
          {msg.isAiGenerated && (
            <span className="mr-1 inline-flex items-center gap-0.5 text-[#0f766e]">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          )}
          {time} {tick}
        </span>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadLoading() {
  return (
    <div className="space-y-3">
      <div className="flex justify-start">
        <Skeleton className="h-12 w-56 rounded-2xl rounded-bl-sm" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-16 w-64 rounded-2xl rounded-br-sm" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-10 w-40 rounded-2xl rounded-bl-sm" />
      </div>
    </div>
  );
}
