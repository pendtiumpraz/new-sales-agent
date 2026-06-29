"use client";

// Eskalasi & Handoff (Outreach) — Module 7 FRONTEND (Sainskerta Loop Phase 04).
// Wired to the NEW M7 / outreach backend (no mock data). This is the HUMAN-TAKEOVER
// queue: conversations the AI handed off to a person — either as an `escalation`
// (raised with a reason + priority, lifecycle open→acknowledged→resolved/dismissed)
// or as a `handoff` work-queue item (pending→claimed→done). Reads/mutations:
//   GET    /api/escalations                  — list escalations (reason, status, priority)
//   GET    /api/escalations/trashed          — the Sampah view (soft-deleted)
//   PATCH  /api/escalations/[id]             — status / priority / assignee / resolution note
//   DELETE /api/escalations/[id]             — SOFT delete
//   PATCH  /api/escalations/[id]/restore     — un-trash
//   DELETE /api/escalations/[id]?purge=1     — HARD delete (irreversible)
//   POST   /api/handoff                      — queue a handoff (take-over) for a conversation
//   GET    /api/handoff                      — list handoff queue items
//   GET    /api/handoff/trashed              — the Sampah view (soft-deleted)
//   POST   /api/handoff/[id]/claim           — claim a pending handoff (take it over)
//   POST   /api/handoff/[id]/complete        — mark a claimed handoff done
//   PATCH  /api/handoff/[id]                  — status / priority / assignee / note
//   DELETE /api/handoff/[id] (+?purge=1)     — SOFT / HARD delete
//   PATCH  /api/handoff/[id]/restore         — un-trash
//   GET    /api/conversations                — resolve conversation context (contact, channel)
//   GET    /api/contacts                     — resolve contact names
//   GET    /api/messages?conversationId=     — drawer transcript snippet
//   GET    /api/team/members                 — assignee picker + name resolution
// Faithful to the established Coral Sunset design system — mirrors app/(app)/contacts/
// page.tsx + app/admin/page.tsx: stat strip, source tabs, Aktif | Sampah, list +
// right-drawer + trash/restore/purge. Every band has loading + empty + error states.
// Lives in the (app) shell.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  HandHelping,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M7 / outreach backend — { ok, data }) ─────

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

/** Row from GET /api/escalations (modules/outreach · escalation). */
interface EscalationRow {
  id: string;
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  workspaceId: string | null;
  autopilotRunId: string | null;
  reason: string; // objection | pricing | complaint | low_confidence | manual | policy
  detail: string | null;
  priority: string; // low | normal | high | urgent
  status: string; // open | acknowledged | resolved | dismissed
  raisedBy: string | null;
  assignedUserId: string | null;
  resolutionNote: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/escalations/trashed
}

/** Row from GET /api/handoff (modules/outreach · handoff). */
interface HandoffRow {
  id: string;
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  workspaceId: string | null;
  escalationId: string | null;
  reason: string | null;
  note: string | null;
  status: string; // pending | claimed | done | cancelled
  priority: string; // low | normal | high | urgent
  assignedUserId: string | null;
  claimedBy: string | null;
  dueAt: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/handoff/trashed
}

/** Row from GET /api/conversations (modules/inbox · conversation_v2). */
interface ConversationRow {
  id: string;
  contactId: string;
  channel: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  status: string;
  assignedUserId: string | null;
}

/** Row from GET /api/contacts (modules/crm · contact) — only the fields we need. */
interface ContactRow {
  id: string;
  fullName: string;
  title: string | null;
  segment: string;
}

/** Row from GET /api/messages?conversationId= (modules/inbox · message_v2). */
interface MessageRow {
  id: string;
  direction: string; // in | out
  body: string;
  isAiGenerated: boolean;
  createdAt: string;
  sentAt: string | null;
}

/** Row from GET /api/team/members. */
interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string | null;
}

// A discriminated union so the list + drawer can treat either source uniformly.
type QueueKind = "escalation" | "handoff";
interface QueueItem {
  kind: QueueKind;
  id: string;
  conversationId: string;
  contactId: string | null;
  reason: string | null;
  detail: string | null; // detail (escalation) / note (handoff)
  priority: string;
  status: string;
  assignedUserId: string | null;
  createdAt: string;
  deletedAt?: string | null;
  escalation?: EscalationRow;
  handoff?: HandoffRow;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type SourceTab = "escalation" | "handoff";
type MainTab = "aktif" | "sampah";

const REASON_META: Record<string, { label: string; cls: string }> = {
  objection: { label: "Keberatan", cls: "bg-warning/15 text-warning" },
  pricing: { label: "Harga", cls: "bg-info/12 text-info" },
  complaint: { label: "Komplain", cls: "bg-destructive/10 text-destructive" },
  low_confidence: { label: "AI ragu", cls: "bg-tertiary/[0.14] text-tertiary" },
  manual: { label: "Manual", cls: "bg-muted text-muted-foreground" },
  policy: { label: "Kebijakan", cls: "bg-primary/[0.12] text-primary" },
};

const ESCALATION_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open: { label: "Terbuka", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  acknowledged: { label: "Ditangani", cls: "bg-info/12 text-info", dot: "bg-info" },
  resolved: { label: "Selesai", cls: "bg-success/15 text-success", dot: "bg-success" },
  dismissed: { label: "Diabaikan", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const HANDOFF_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: "Menunggu", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  claimed: { label: "Diambil", cls: "bg-info/12 text-info", dot: "bg-info" },
  done: { label: "Selesai", cls: "bg-success/15 text-success", dot: "bg-success" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const PRIORITY_META: Record<string, { label: string; cls: string; color: string }> = {
  urgent: { label: "Urgent", cls: "bg-destructive/10 text-destructive", color: "#EF4444" },
  high: { label: "Tinggi", cls: "bg-warning/15 text-warning", color: "#F59E0B" },
  normal: { label: "Normal", cls: "bg-muted text-muted-foreground", color: "#6B7280" },
  low: { label: "Rendah", cls: "bg-muted/60 text-muted-foreground", color: "#94A3B8" },
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const CHANNEL_DOT: Record<string, string> = {
  wa: "#25D366",
  email: "#6366F1",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

/** /api/team/members returns a bare { data } envelope (not the {ok,data} shape). */
async function readMembers(r: Response): Promise<TeamMember[]> {
  if (!r.ok) return [];
  const j = (await r.json().catch(() => null)) as { data?: TeamMember[] } | null;
  return j?.data ?? [];
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

function fmtRelID(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) {
    const m = Math.floor(diff / 60_000);
    return m <= 1 ? "Baru saja" : `${m} menit lalu`;
  }
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** "x jam lagi" / "telat x jam" for SLA due dates. */
function fmtDue(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  const overdue = diff < 0;
  const h = Math.round(Math.abs(diff) / 3_600_000);
  if (h < 1) return { label: overdue ? "Lewat tenggat" : "< 1 jam lagi", overdue };
  if (h < 24) return { label: overdue ? `Telat ${h} jam` : `${h} jam lagi`, overdue };
  const days = Math.round(h / 24);
  return { label: overdue ? `Telat ${days} hari` : `${days} hari lagi`, overdue };
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

// ── escalation → queue item ──────────────────────────────────────────────────
function escToItem(e: EscalationRow): QueueItem {
  return {
    kind: "escalation",
    id: e.id,
    conversationId: e.conversationId,
    contactId: e.contactId,
    reason: e.reason,
    detail: e.detail,
    priority: e.priority,
    status: e.status,
    assignedUserId: e.assignedUserId,
    createdAt: e.createdAt,
    deletedAt: e.deletedAt ?? null,
    escalation: e,
  };
}
function handoffToItem(h: HandoffRow): QueueItem {
  return {
    kind: "handoff",
    id: h.id,
    conversationId: h.conversationId,
    contactId: h.contactId,
    reason: h.reason,
    detail: h.note,
    priority: h.priority,
    status: h.status,
    assignedUserId: h.assignedUserId,
    createdAt: h.createdAt,
    deletedAt: h.deletedAt ?? null,
    handoff: h,
  };
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function EscalationsHandoffPage() {
  const qc = useQueryClient();

  // ── source tab (which queue we look at) + Aktif|Sampah tab ──────────────────
  const [source, setSource] = useState<SourceTab>("escalation");
  const [tab, setTab] = useState<MainTab>("aktif");

  // live escalations + handoffs (both always loaded so the stat strip is whole)
  const escalationsQ = useQuery({
    queryKey: ["outreach", "escalations", "list"],
    queryFn: async () => readJson<EscalationRow[]>(await fetch("/api/escalations")),
    retry: false,
  });
  const handoffsQ = useQuery({
    queryKey: ["outreach", "handoffs", "list"],
    queryFn: async () => readJson<HandoffRow[]>(await fetch("/api/handoff")),
    retry: false,
  });
  // contacts + members resolve the soft-ref names; degrade quietly on failure.
  const contactsQ = useQuery({
    queryKey: ["outreach", "contacts", "min"],
    queryFn: async () => readJson<ContactRow[]>(await fetch("/api/contacts")),
    retry: false,
  });
  const membersQ = useQuery({
    queryKey: ["outreach", "members"],
    queryFn: async () => readMembers(await fetch("/api/team/members")),
    retry: false,
  });
  // conversations resolve channel + last-message preview per item.
  const conversationsQ = useQuery({
    queryKey: ["outreach", "conversations", "min"],
    queryFn: async () => readJson<ConversationRow[]>(await fetch("/api/conversations")),
    retry: false,
  });

  const escalations = useMemo(() => escalationsQ.data ?? [], [escalationsQ.data]);
  const handoffs = useMemo(() => handoffsQ.data ?? [], [handoffsQ.data]);

  const contactById = useMemo(() => {
    const m: Record<string, ContactRow> = {};
    for (const c of contactsQ.data ?? []) m[c.id] = c;
    return m;
  }, [contactsQ.data]);
  const memberById = useMemo(() => {
    const m: Record<string, TeamMember> = {};
    for (const u of membersQ.data ?? []) m[u.userId] = u;
    return m;
  }, [membersQ.data]);
  const conversationById = useMemo(() => {
    const m: Record<string, ConversationRow> = {};
    for (const c of conversationsQ.data ?? []) m[c.id] = c;
    return m;
  }, [conversationsQ.data]);

  // ── trash (lazy per source) ─────────────────────────────────────────────────
  const trashedEscQ = useQuery({
    queryKey: ["outreach", "escalations", "trashed"],
    enabled: source === "escalation" && tab === "sampah",
    queryFn: async () => readJson<EscalationRow[]>(await fetch("/api/escalations/trashed")),
    retry: false,
  });
  const trashedHandoffQ = useQuery({
    queryKey: ["outreach", "handoffs", "trashed"],
    enabled: source === "handoff" && tab === "sampah",
    queryFn: async () => readJson<HandoffRow[]>(await fetch("/api/handoff/trashed")),
    retry: false,
  });

  // ── filters ──────────────────────────────────────────────────────────────────
  const [statusF, setStatusF] = useState<string>("all");
  const [search, setSearch] = useState("");

  // reset the status filter when switching source (different status enums)
  useEffect(() => {
    setStatusF("all");
  }, [source]);

  // ── stats (always cross-source) ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const openEsc = escalations.filter((e) => e.status === "open").length;
    const urgent = [...escalations, ...handoffs].filter(
      (x) => x.priority === "urgent" && (x.status === "open" || x.status === "pending"),
    ).length;
    const pendingHandoff = handoffs.filter((h) => h.status === "pending").length;
    const claimed = handoffs.filter((h) => h.status === "claimed").length;
    return { openEsc, urgent, pendingHandoff, claimed };
  }, [escalations, handoffs]);

  // ── active list for the selected source ──────────────────────────────────────
  const items: QueueItem[] = useMemo(() => {
    const raw =
      source === "escalation" ? escalations.map(escToItem) : handoffs.map(handoffToItem);
    return raw;
  }, [source, escalations, handoffs]);

  const statusOptions = useMemo(() => {
    return source === "escalation"
      ? (["open", "acknowledged", "resolved", "dismissed"] as const)
      : (["pending", "claimed", "done", "cancelled"] as const);
  }, [source]);

  const statusMeta = source === "escalation" ? ESCALATION_STATUS_META : HANDOFF_STATUS_META;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => {
        const contact = it.contactId ? contactById[it.contactId]?.fullName ?? "" : "";
        const okStatus = statusF === "all" || it.status === statusF;
        const hay = `${contact} ${it.conversationId} ${it.reason ?? ""} ${it.detail ?? ""}`.toLowerCase();
        const okSearch = !q || hay.includes(q);
        return okStatus && okSearch;
      })
      .sort((a, b) => {
        // urgency first, then newest.
        const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
        if (p !== 0) return p;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [items, contactById, statusF, search]);

  // ── trashed list for the selected source ─────────────────────────────────────
  const trashedItems: QueueItem[] = useMemo(() => {
    if (source === "escalation") return (trashedEscQ.data ?? []).map(escToItem);
    return (trashedHandoffQ.data ?? []).map(handoffToItem);
  }, [source, trashedEscQ.data, trashedHandoffQ.data]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashedItems;
    return trashedItems.filter((it) => {
      const contact = it.contactId ? contactById[it.contactId]?.fullName ?? "" : "";
      return `${contact} ${it.conversationId} ${it.reason ?? ""}`.toLowerCase().includes(q);
    });
  }, [trashedItems, contactById, search]);

  // ── drawer ───────────────────────────────────────────────────────────────────
  const [openItem, setOpenItem] = useState<QueueItem | null>(null);
  // keep the open drawer item fresh as the underlying list refetches
  const active = useMemo(() => {
    if (!openItem) return null;
    if (openItem.kind === "escalation") {
      const fresh = escalations.find((e) => e.id === openItem.id);
      return fresh ? escToItem(fresh) : openItem;
    }
    const fresh = handoffs.find((h) => h.id === openItem.id);
    return fresh ? handoffToItem(fresh) : openItem;
  }, [openItem, escalations, handoffs]);

  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenItem(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openItem]);

  // transcript snippet for the open item's conversation
  const messagesQ = useQuery({
    queryKey: ["outreach", "messages", active?.conversationId],
    enabled: !!active?.conversationId,
    queryFn: async () =>
      readJson<MessageRow[]>(
        await fetch(`/api/messages?conversationId=${active!.conversationId}`),
      ),
    retry: false,
  });

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<QueueItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<QueueItem | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<QueueItem | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["outreach", "escalations"] });
    qc.invalidateQueries({ queryKey: ["outreach", "handoffs"] });
  }

  // escalation status transition (acknowledge / resolve / dismiss + optional note)
  const setEscStatus = useMutation({
    mutationFn: async (vars: { id: string; status: string; resolutionNote?: string }) =>
      readJson<EscalationRow>(
        await fetch(`/api/escalations/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: vars.status,
            ...(vars.resolutionNote !== undefined ? { resolutionNote: vars.resolutionNote } : {}),
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.status === "acknowledged"
          ? "Eskalasi diambil alih"
          : vars.status === "resolved"
            ? "Eskalasi ditandai selesai"
            : "Eskalasi diabaikan",
      );
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui eskalasi"),
  });

  // escalation: reassign / repriority from the drawer
  const patchEsc = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) =>
      readJson<EscalationRow>(
        await fetch(`/api/escalations/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars.patch),
        }),
      ),
    onSuccess: () => {
      toast.success("Eskalasi diperbarui");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui eskalasi"),
  });

  // create a handoff FROM an escalation (queue it for human takeover)
  const createHandoff = useMutation({
    mutationFn: async (e: EscalationRow) =>
      readJson<HandoffRow>(
        await fetch("/api/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: e.conversationId,
            contactId: e.contactId,
            workspaceId: e.workspaceId,
            escalationId: e.id,
            reason: e.reason,
            note: e.detail,
            priority: e.priority,
            assignedUserId: e.assignedUserId,
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Handoff dibuat — masuk antrean take-over");
      refreshAll();
      setSource("handoff");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat handoff"),
  });

  // handoff: claim (take it over)
  const claimHandoff = useMutation({
    mutationFn: async (id: string) =>
      readJson<HandoffRow>(await fetch(`/api/handoff/${id}/claim`, { method: "POST" })),
    onSuccess: () => {
      toast.success("Handoff diambil — kamu yang menangani");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengambil handoff"),
  });

  // handoff: complete (finished the takeover)
  const completeHandoff = useMutation({
    mutationFn: async (id: string) =>
      readJson<HandoffRow>(await fetch(`/api/handoff/${id}/complete`, { method: "POST" })),
    onSuccess: () => {
      toast.success("Handoff ditandai selesai");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyelesaikan handoff"),
  });

  // handoff: reassign / repriority / cancel from the drawer
  const patchHandoff = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) =>
      readJson<HandoffRow>(
        await fetch(`/api/handoff/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars.patch),
        }),
      ),
    onSuccess: () => {
      toast.success("Handoff diperbarui");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui handoff"),
  });

  // SOFT delete — either source
  const softDelete = useMutation({
    mutationFn: async (it: QueueItem) => {
      const base = it.kind === "escalation" ? "/api/escalations" : "/api/handoff";
      return readJson<{ id: string; deleted: boolean }>(
        await fetch(`${base}/${it.id}`, { method: "DELETE" }),
      );
    },
    onSuccess: (_res, it) => {
      toast.success("Dipindah ke Sampah");
      refreshAll();
      setDeleteTarget(null);
      if (openItem?.id === it.id) setOpenItem(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleteTarget(null);
    },
  });

  // RESTORE — either source
  const restore = useMutation({
    mutationFn: async (it: QueueItem) => {
      const base = it.kind === "escalation" ? "/api/escalations" : "/api/handoff";
      return readJson<unknown>(await fetch(`${base}/${it.id}/restore`, { method: "PATCH" }));
    },
    onSuccess: () => {
      toast.success("Dipulihkan ke Aktif");
      refreshAll();
      qc.invalidateQueries({ queryKey: ["outreach", source === "escalation" ? "escalations" : "handoffs", "trashed"] });
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — either source. Irreversible.
  const purge = useMutation({
    mutationFn: async (it: QueueItem) => {
      const base = it.kind === "escalation" ? "/api/escalations" : "/api/handoff";
      return readJson<{ id: string; purged: boolean }>(
        await fetch(`${base}/${it.id}?purge=1`, { method: "DELETE" }),
      );
    },
    onSuccess: () => {
      toast.success("Dihapus permanen");
      refreshAll();
      qc.invalidateQueries({ queryKey: ["outreach", source === "escalation" ? "escalations" : "handoffs", "trashed"] });
      setPurgeTarget(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error per source ─────────────────────────────────────
  const listQ = source === "escalation" ? escalationsQ : handoffsQ;
  const listError = listQ.isError;
  const forbidden = listQ.error instanceof Error && listQ.error.message === "forbidden";
  const trashQ = source === "escalation" ? trashedEscQ : trashedHandoffQ;

  const activeCount = source === "escalation" ? escalations.length : handoffs.length;
  const trashCount = trashedItems.length;

  // resolve a name for an assigned/claimed user id
  function nameOf(userId: string | null): string {
    if (!userId) return "Belum ditugaskan";
    return memberById[userId]?.name ?? shortId(userId);
  }

  return (
    <div>
      <PageHeader
        title="Eskalasi & Handoff"
        description="Antrean take-over manusia — percakapan yang dieskalasi AI ke seorang sales. Ambil alih, tugaskan, & tandai selesai. Klik baris untuk konteks percakapan."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/inbox">
            <Inbox className="h-4 w-4" /> Buka Inbox
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/autopilot">
            <Bot className="h-4 w-4" /> Autopilot
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Eskalasi terbuka"
            value={escalationsQ.isLoading ? null : stats.openEsc}
            hint="butuh tindakan sales"
            valueClass="text-warning"
          />
          <StatCard
            label="Prioritas urgent"
            value={escalationsQ.isLoading || handoffsQ.isLoading ? null : stats.urgent}
            hint="terbuka / menunggu"
            valueClass="text-destructive"
          />
          <StatCard
            label="Handoff menunggu"
            value={handoffsQ.isLoading ? null : stats.pendingHandoff}
            hint="belum diambil siapa pun"
          />
          <StatCard
            label="Sedang ditangani"
            value={handoffsQ.isLoading ? null : stats.claimed}
            hint="handoff sudah diambil"
            valueClass="text-info"
          />
        </section>

        {/* ============ SOURCE TABS: Eskalasi | Handoff ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={source === "escalation"} onClick={() => setSource("escalation")}>
            <AlertTriangle className="h-4 w-4" />
            Eskalasi
            <CountPill>{escalations.length}</CountPill>
          </TabButton>
          <TabButton active={source === "handoff"} onClick={() => setSource("handoff")}>
            <HandHelping className="h-4 w-4" />
            Handoff
            <CountPill>{handoffs.length}</CountPill>
          </TabButton>
        </div>

        {/* ============ Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <SubTabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Users className="h-4 w-4" />
            Aktif
            <CountPill>{activeCount}</CountPill>
          </SubTabButton>
          <SubTabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashCount > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashCount}
              </span>
            )}
          </SubTabButton>
        </div>

        {tab === "aktif" ? (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR: status segmented + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setStatusF("all")}
                  className={cn(
                    "h-7 rounded-md px-3.5 text-xs transition-colors",
                    statusF === "all"
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  Semua
                </button>
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusF(s)}
                    className={cn(
                      "h-7 rounded-md px-3.5 text-xs transition-colors",
                      statusF === s
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {statusMeta[s]?.label ?? s}
                  </button>
                ))}
              </div>

              <div className="relative ml-auto w-52">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter kontak / alasan…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {listQ.isLoading || contactsQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat antrean"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar eskalasi / handoff. Pastikan kamu login & database tersedia."
                }
                onRetry={() => listQ.refetch()}
              />
            ) : activeCount === 0 ? (
              <EmptyState
                className="border-0"
                icon={source === "escalation" ? AlertTriangle : HandHelping}
                title={
                  source === "escalation" ? "Belum ada eskalasi" : "Antrean handoff kosong"
                }
                description={
                  source === "escalation"
                    ? "Eskalasi muncul di sini saat AI menemui keberatan, komplain, atau ragu — dan menyerahkannya ke manusia."
                    : "Handoff muncul saat sebuah percakapan diserahkan untuk ditangani manusia. Buat dari sebuah eskalasi."
                }
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/inbox">
                      <Inbox className="h-4 w-4" /> Buka Inbox
                    </Link>
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada yang cocok"
                description="Coba ubah filter status atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Kontak / Percakapan</th>
                      <th className="px-3 py-3 font-semibold">Alasan</th>
                      <th className="px-3 py-3 font-semibold">Prioritas</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Ditugaskan</th>
                      <th className="px-3 py-3 font-semibold">Masuk</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((it) => (
                      <QueueTableRow
                        key={it.id}
                        item={it}
                        contact={it.contactId ? contactById[it.contactId] ?? null : null}
                        conversation={conversationById[it.conversationId] ?? null}
                        assigneeName={nameOf(it.assignedUserId)}
                        onOpen={() => setOpenItem(it)}
                        onAck={() => setEscStatus.mutate({ id: it.id, status: "acknowledged" })}
                        onResolve={() => setEscStatus.mutate({ id: it.id, status: "resolved" })}
                        onClaim={() => claimHandoff.mutate(it.id)}
                        onComplete={() => completeHandoff.mutate(it.id)}
                        onDelete={() => setDeleteTarget(it)}
                        pending={
                          (setEscStatus.isPending && setEscStatus.variables?.id === it.id) ||
                          (claimHandoff.isPending && claimHandoff.variables === it.id) ||
                          (completeHandoff.isPending && completeHandoff.variables === it.id)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          /* ============ SAMPAH (trash) view ============ */
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                {source === "escalation" ? "Eskalasi" : "Handoff"} yang dihapus disimpan di sini.{" "}
                <b>Pulihkan</b> mengembalikannya ke Aktif, <b>Hapus permanen</b> menghapus
                selamanya.
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashCount}
              </span>
            </div>

            {trashQ.isLoading ? (
              <TableLoading />
            ) : trashQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil item yang dihapus."
                onRetry={() => trashQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashCount === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashCount === 0
                    ? "Item yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Kontak / Percakapan</th>
                      <th className="px-3 py-3 font-semibold">Alasan</th>
                      <th className="px-3 py-3 font-semibold">Status terakhir</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((it) => (
                      <TrashedTableRow
                        key={it.id}
                        item={it}
                        contact={it.contactId ? contactById[it.contactId] ?? null : null}
                        onRestore={() => setRestoreTarget(it)}
                        onPurge={() => {
                          setPurgeTarget(it);
                          setPurgeConfirm("");
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Legend */}
        <p className="max-w-3xl text-[11px] text-muted-foreground">
          <b>Eskalasi</b> = AI menyerahkan percakapan dengan alasan (keberatan / komplain / ragu).
          Alur: <i>Terbuka → Ditangani → Selesai</i> · bisa <i>Diabaikan</i>. <b>Handoff</b> =
          item antrean take-over: <i>Menunggu → Diambil → Selesai</i>. Klik baris untuk konteks
          percakapan + aksi lengkap.
        </p>
      </div>

      {/* ===================== RIGHT DRAWER ===================== */}
      <div
        onClick={() => setOpenItem(null)}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300",
          openItem ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          openItem ? "translate-x-0" : "translate-x-full",
        )}
      >
        {active && (
          <DrawerBody
            item={active}
            contact={active.contactId ? contactById[active.contactId] ?? null : null}
            conversation={conversationById[active.conversationId] ?? null}
            members={membersQ.data ?? []}
            assigneeName={nameOf(active.assignedUserId)}
            messagesLoading={messagesQ.isLoading}
            messagesError={messagesQ.isError}
            messages={messagesQ.data ?? []}
            onRetryMessages={() => messagesQ.refetch()}
            onClose={() => setOpenItem(null)}
            onAck={() => setEscStatus.mutate({ id: active.id, status: "acknowledged" })}
            onResolve={(note) =>
              setEscStatus.mutate({ id: active.id, status: "resolved", resolutionNote: note })
            }
            onDismiss={(note) =>
              setEscStatus.mutate({ id: active.id, status: "dismissed", resolutionNote: note })
            }
            onMakeHandoff={() => active.escalation && createHandoff.mutate(active.escalation)}
            onClaim={() => claimHandoff.mutate(active.id)}
            onComplete={() => completeHandoff.mutate(active.id)}
            onCancelHandoff={() => patchHandoff.mutate({ id: active.id, patch: { status: "cancelled" } })}
            onReassign={(userId) =>
              active.kind === "escalation"
                ? patchEsc.mutate({ id: active.id, patch: { assignedUserId: userId || null } })
                : patchHandoff.mutate({ id: active.id, patch: { assignedUserId: userId || null } })
            }
            onRepriority={(priority) =>
              active.kind === "escalation"
                ? patchEsc.mutate({ id: active.id, patch: { priority } })
                : patchHandoff.mutate({ id: active.id, patch: { priority } })
            }
            onDelete={() => setDeleteTarget(active)}
            actionPending={
              setEscStatus.isPending ||
              patchEsc.isPending ||
              patchHandoff.isPending ||
              claimHandoff.isPending ||
              completeHandoff.isPending ||
              createHandoff.isPending
            }
          />
        )}
      </aside>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            Item {deleteTarget?.kind === "escalation" ? "eskalasi" : "handoff"} ini akan dipindah ke
            tab <b>Sampah</b>. Kamu masih bisa memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmModal
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan item?"
        body={
          <>
            Item {restoreTarget?.kind === "escalation" ? "eskalasi" : "handoff"} ini akan
            dikembalikan ke tab <b>Aktif</b> dengan status terakhirnya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
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
                Tindakan ini <b>tidak bisa dibatalkan</b>. Item{" "}
                {purgeTarget?.kind === "escalation" ? "eskalasi" : "handoff"} ini akan dihapus
                selamanya.
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
              onClick={() => {
                setPurgeTarget(null);
                setPurgeConfirm("");
              }}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Batal
            </button>
            <button
              onClick={() => purgeTarget && purge.mutate(purgeTarget)}
              disabled={purge.isPending || purgeConfirm.trim().toUpperCase() !== "HAPUS"}
              className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {purge.isPending ? "Menghapus…" : "Hapus permanen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: number | null;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <span className={cn("text-2xl font-bold tabular-nums", valueClass)}>
            {value.toLocaleString("id-ID")}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function TabButton({
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
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SubTabButton({
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
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function ReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-xs text-muted-foreground">—</span>;
  const meta = REASON_META[reason] ?? { label: reason, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function StatusChip({ item }: { item: QueueItem }) {
  const meta =
    item.kind === "escalation"
      ? ESCALATION_STATUS_META[item.status]
      : HANDOFF_STATUS_META[item.status];
  if (!meta) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {item.status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function QueueTableRow({
  item,
  contact,
  conversation,
  assigneeName,
  onOpen,
  onAck,
  onResolve,
  onClaim,
  onComplete,
  onDelete,
  pending,
}: {
  item: QueueItem;
  contact: ContactRow | null;
  conversation: ConversationRow | null;
  assigneeName: string;
  onOpen: () => void;
  onAck: () => void;
  onResolve: () => void;
  onClaim: () => void;
  onComplete: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const name = contact?.fullName ?? "Kontak tidak dikenal";
  const channel = conversation?.channel ?? null;
  const due = item.kind === "handoff" ? fmtDue(item.handoff?.dueAt ?? null) : null;
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{name}</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              {channel && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: CHANNEL_DOT[channel] ?? "#94A3B8" }}
                />
              )}
              {conversation?.lastMessage
                ? conversation.lastMessage.slice(0, 38)
                : shortId(item.conversationId)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <ReasonBadge reason={item.reason} />
      </td>
      <td className="px-3 py-3">
        <PriorityBadge priority={item.priority} />
        {due && (
          <p className={cn("mt-0.5 text-[10px]", due.overdue ? "text-destructive" : "text-muted-foreground")}>
            {due.label}
          </p>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusChip item={item} />
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
          {item.assignedUserId ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-[9px] font-semibold text-primary">
                {initialsOf(assigneeName)}
              </span>
              <span className="truncate">{assigneeName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Belum ditugaskan</span>
          )}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(item.createdAt)}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {item.kind === "escalation" ? (
            item.status === "open" ? (
              <button
                type="button"
                onClick={onAck}
                disabled={pending}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <UserCheck className="h-3 w-3" /> Ambil alih
              </button>
            ) : item.status === "acknowledged" ? (
              <button
                type="button"
                onClick={onResolve}
                disabled={pending}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-success/50 hover:text-success disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> Selesai
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
              >
                Buka <ChevronRight className="h-3 w-3" />
              </button>
            )
          ) : item.status === "pending" ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <UserCheck className="h-3 w-3" /> Ambil
            </button>
          ) : item.status === "claimed" ? (
            <button
              type="button"
              onClick={onComplete}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-success/50 hover:text-success disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Selesai
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
            >
              Buka <ChevronRight className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Hapus (ke Sampah)"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TrashedTableRow({
  item,
  contact,
  onRestore,
  onPurge,
}: {
  item: QueueItem;
  contact: ContactRow | null;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const name = contact?.fullName ?? "Kontak tidak dikenal";
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground/80">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{shortId(item.conversationId)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <ReasonBadge reason={item.reason} />
      </td>
      <td className="px-3 py-3">
        <StatusChip item={item} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(item.deletedAt ?? null)}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
          >
            <RotateCcw className="h-3 w-3" /> Pulihkan
          </button>
          <button
            type="button"
            onClick={onPurge}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Hapus permanen
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── drawer body ──────────────────────────────────────────────────────────────
function DrawerBody({
  item,
  contact,
  conversation,
  members,
  assigneeName,
  messagesLoading,
  messagesError,
  messages,
  onRetryMessages,
  onClose,
  onAck,
  onResolve,
  onDismiss,
  onMakeHandoff,
  onClaim,
  onComplete,
  onCancelHandoff,
  onReassign,
  onRepriority,
  onDelete,
  actionPending,
}: {
  item: QueueItem;
  contact: ContactRow | null;
  conversation: ConversationRow | null;
  members: TeamMember[];
  assigneeName: string;
  messagesLoading: boolean;
  messagesError: boolean;
  messages: MessageRow[];
  onRetryMessages: () => void;
  onClose: () => void;
  onAck: () => void;
  onResolve: (note: string | undefined) => void;
  onDismiss: (note: string | undefined) => void;
  onMakeHandoff: () => void;
  onClaim: () => void;
  onComplete: () => void;
  onCancelHandoff: () => void;
  onReassign: (userId: string) => void;
  onRepriority: (priority: string) => void;
  onDelete: () => void;
  actionPending: boolean;
}) {
  const [note, setNote] = useState("");
  const name = contact?.fullName ?? "Kontak tidak dikenal";
  const isEsc = item.kind === "escalation";

  // reset the resolution note when switching items
  useEffect(() => {
    setNote(isEsc ? item.escalation?.resolutionNote ?? "" : item.handoff?.note ?? "");
  }, [item.id, isEsc, item.escalation?.resolutionNote, item.handoff?.note]);

  const due = !isEsc ? fmtDue(item.handoff?.dueAt ?? null) : null;

  return (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-xs font-semibold text-primary">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {isEsc ? "Eskalasi" : "Handoff"} · {conversation?.channel?.toUpperCase() ?? "—"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* (A) STATUS + reason + priority */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusChip item={item} />
            <ReasonBadge reason={item.reason} />
            {item.escalation?.raisedBy === "ai" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/[0.12] px-2 py-0.5 text-[10px] font-medium text-tertiary">
                <Bot className="h-3 w-3" /> oleh AI
              </span>
            )}
          </div>
          {item.detail ? (
            <p className="rounded-lg border border-border bg-card p-2.5 text-[12px] leading-relaxed text-foreground/80">
              {item.detail}
            </p>
          ) : (
            <p className="text-[11px] italic text-muted-foreground">Tanpa catatan detail.</p>
          )}
          {due && (
            <p className={cn("mt-2 text-[11px] font-medium", due.overdue ? "text-destructive" : "text-muted-foreground")}>
              Tenggat: {due.label}
            </p>
          )}
        </div>

        {/* (B) PRIORITY selector */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prioritas
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(["urgent", "high", "normal", "low"] as const).map((p) => {
              const on = item.priority === p;
              const meta = PRIORITY_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  disabled={actionPending}
                  onClick={() => !on && onRepriority(p)}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs transition-colors disabled:opacity-60",
                    on
                      ? cn("font-semibold", meta.cls)
                      : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* (C) ASSIGNEE */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ditugaskan ke
          </h3>
          <div className="relative">
            <select
              value={item.assignedUserId ?? ""}
              disabled={actionPending}
              onChange={(e) => onReassign(e.target.value)}
              className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
            >
              <option value="">Belum ditugaskan</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
          </div>
          {item.assignedUserId && (
            <p className="mt-1 text-[11px] text-muted-foreground">Saat ini: {assigneeName}</p>
          )}
        </div>

        {/* (D) CONVERSATION CONTEXT — transcript snippet */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Konteks percakapan
            </h3>
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Buka di Inbox <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {messagesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : messagesError ? (
            <ErrorState
              className="border-0 py-6"
              title="Gagal memuat percakapan"
              description="Tidak bisa mengambil transkrip percakapan ini."
              onRetry={onRetryMessages}
            />
          ) : messages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
              Belum ada pesan pada percakapan ini.
            </p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2.5">
              {messages.slice(-8).map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-0.5",
                    m.direction === "out" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed",
                      m.direction === "out"
                        ? "bg-primary/[0.12] text-foreground"
                        : "bg-card text-foreground/90",
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {m.direction === "out" ? (m.isAiGenerated ? "AI" : "Tim") : "Kontak"} ·{" "}
                    {fmtRelID(m.sentAt || m.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* (E) NOTE — resolution (escalation) / context (handoff) */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isEsc ? "Catatan penyelesaian" : "Catatan untuk penangan"}
          </h3>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isEsc
                ? "Ringkas bagaimana eskalasi ini ditangani…"
                : "Konteks untuk yang akan mengambil alih…"
            }
            className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      {/* footer — lifecycle actions per source */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-5 py-3">
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Hapus
        </Button>

        {isEsc ? (
          <>
            {item.status === "open" && (
              <Button variant="outline" size="sm" disabled={actionPending} onClick={onAck}>
                <UserCheck className="h-4 w-4" /> Ambil alih
              </Button>
            )}
            {(item.status === "open" || item.status === "acknowledged") && (
              <Button
                variant="outline"
                size="sm"
                disabled={actionPending}
                onClick={onMakeHandoff}
                title="Buat item handoff dari eskalasi ini"
              >
                <HandHelping className="h-4 w-4" /> Buat handoff
              </Button>
            )}
            {item.status !== "resolved" && item.status !== "dismissed" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={actionPending}
                  onClick={() => onDismiss(note.trim() || undefined)}
                >
                  Abaikan
                </Button>
                <Button size="sm" disabled={actionPending} onClick={() => onResolve(note.trim() || undefined)}>
                  <Check className="h-4 w-4" /> Selesai
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            {item.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={actionPending}
                  onClick={onCancelHandoff}
                >
                  Batalkan
                </Button>
                <Button size="sm" disabled={actionPending} onClick={onClaim}>
                  <UserCheck className="h-4 w-4" /> Ambil handoff
                </Button>
              </>
            )}
            {item.status === "claimed" && (
              <Button size="sm" className="ml-auto" disabled={actionPending} onClick={onComplete}>
                <Check className="h-4 w-4" /> Tandai selesai
              </Button>
            )}
            {(item.status === "done" || item.status === "cancelled") && (
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link href="/inbox">
                  <MessageSquare className="h-4 w-4" style={{ color: "#25D366" }} /> Buka chat
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ConfirmModal({
  open,
  onClose,
  icon,
  tone,
  title,
  body,
  confirmLabel,
  confirmPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  tone: "destructive" | "tertiary";
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              tone === "destructive"
                ? "bg-destructive/[0.12] text-destructive"
                : "bg-tertiary/[0.12] text-tertiary",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmPending}
            className={cn(
              "h-9 rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60",
              tone === "destructive"
                ? "bg-destructive text-white"
                : "bg-tertiary text-tertiary-foreground",
            )}
          >
            {confirmPending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
