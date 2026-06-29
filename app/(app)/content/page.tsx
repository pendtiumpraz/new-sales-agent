"use client";

// Konten — Module 9 (secondary) FRONTEND (Sainskerta Loop Phase 04, FINAL frontend
// tick). Wired to the NEW M9 content backend (no mock data):
//   - GET    /api/content/templates                 → message/content template list
//   - POST   /api/content/templates                 → create template
//   - PATCH  /api/content/templates/[id]            → edit template
//   - DELETE /api/content/templates/[id]            → SOFT delete (→ Sampah)
//   - PATCH  /api/content/templates/[id]/restore    → restore
//   - DELETE /api/content/templates/[id]?purge=1    → HARD delete (purge)
//   - GET    /api/content/templates/trashed         → the Sampah view (templates)
//   - GET    /api/content/plans                     → content-planning items
//   - POST   /api/content/plans                     → create plan item
//   - PATCH  /api/content/plans/[id]                → edit plan item
//   - DELETE /api/content/plans/[id]                → SOFT delete (→ Sampah)
//   - PATCH  /api/content/plans/[id]/restore        → restore
//   - DELETE /api/content/plans/[id]?purge=1        → HARD delete (purge)
//   - GET    /api/content/plans/trashed             → the Sampah view (plans)
//
// Matches the established design system (Coral Sunset, the (app) shell, the
// list/cards/drawer pattern from contacts/admin/workspace): a stat strip, primary
// tabs (Template · Rencana · Sampah), a template list with a create/edit drawer,
// a month calendar-ish planning view (plus a list fallback) with create/edit in
// the same drawer, and trash/restore/purge with a strong type-to-confirm purge.
// Every band has loading + empty + error states. NO DB mutations beyond the wired
// API; everything reads/writes the real content backend.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutList,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { AppDrawer } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M9 content backend — { ok, data }) ─────────

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

/** Row from GET /api/content/templates (modules/content · content_template). */
interface TemplateRow {
  id: string;
  workspaceId: string | null;
  name: string;
  channel: string; // wa | email | instagram | linkedin | sms | other
  category: string; // outreach | nurture | retention | promo | other
  subject: string | null;
  body: string;
  variables: string[];
  tags: string[];
  status: string; // draft | active | archived
  usageCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /trashed
}

/** Row from GET /api/content/plans (modules/content · content_plan). */
interface PlanRow {
  id: string;
  workspaceId: string | null;
  templateId: string | null;
  title: string;
  channel: string;
  body: string | null;
  status: string; // idea | planned | scheduled | published | archived
  scheduledAt: string | null;
  publishedAt: string | null;
  assignedUserId: string | null;
  meta: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /trashed
}

// ── enums / display metadata (must mirror the service enums exactly) ──────────

const CHANNELS = ["wa", "email", "instagram", "linkedin", "sms", "other"] as const;
const CATEGORIES = ["outreach", "nurture", "retention", "promo", "other"] as const;
const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
const PLAN_STATUSES = ["idea", "planned", "scheduled", "published", "archived"] as const;

type Channel = (typeof CHANNELS)[number];

const CHANNEL_META: Record<string, { label: string; dot: string }> = {
  wa: { label: "WhatsApp", dot: "#25D366" },
  email: { label: "Email", dot: "#6366F1" },
  instagram: { label: "Instagram", dot: "#E1306C" },
  linkedin: { label: "LinkedIn", dot: "#0A66C2" },
  sms: { label: "SMS", dot: "#0D9488" },
  other: { label: "Lainnya", dot: "#6B7280" },
};

const CATEGORY_LABEL: Record<string, string> = {
  outreach: "Outreach",
  nurture: "Nurture",
  retention: "Retensi",
  promo: "Promo",
  other: "Lainnya",
};

const TEMPLATE_STATUS_META: Record<string, { label: string; style: React.CSSProperties }> = {
  draft: { label: "Draf", style: { background: "hsl(220 9% 46% / .12)", color: "#475569" } },
  active: { label: "Aktif", style: { background: "hsl(160 84% 39% / .14)", color: "#059669" } },
  archived: { label: "Arsip", style: { background: "hsl(220 9% 46% / .1)", color: "#64748b" } },
};

const PLAN_STATUS_META: Record<string, { label: string; style: React.CSSProperties; bar: string }> = {
  idea: { label: "Ide", style: { background: "hsl(220 9% 46% / .12)", color: "#475569" }, bar: "#94A3B8" },
  planned: { label: "Direncanakan", style: { background: "hsl(38 92% 50% / .15)", color: "#b45309" }, bar: "#F59E0B" },
  scheduled: { label: "Terjadwal", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" }, bar: "#0D9488" },
  published: { label: "Terbit", style: { background: "hsl(160 84% 39% / .14)", color: "#059669" }, bar: "#10B981" },
  archived: { label: "Arsip", style: { background: "hsl(220 9% 46% / .1)", color: "#64748b" }, bar: "#94A3B8" },
};

type MainTab = "template" | "rencana" | "sampah";
type PlanView = "kalender" | "daftar";
type TrashTab = "template" | "rencana";

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

function channelLabel(c: string): string {
  return CHANNEL_META[c]?.label ?? c;
}
function channelDot(c: string): string {
  return CHANNEL_META[c]?.dot ?? "#6B7280";
}

/** Detect `{{variables}}` declared inline in a body, for the drawer preview. */
function detectVars(body: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return Array.from(out);
}

function fmtRelID(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Baru saja";
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTimeID(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const WEEKDAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** `<input type="datetime-local">` value (local time) from an ISO string. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}
/** datetime-local value → ISO (or null). */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── drawer form state ─────────────────────────────────────────────────────────

interface TemplateForm {
  open: boolean;
  id: string | null; // null = create
  name: string;
  channel: Channel;
  category: string;
  subject: string;
  body: string;
  tags: string;
  status: string;
}
const EMPTY_TEMPLATE: TemplateForm = {
  open: false,
  id: null,
  name: "",
  channel: "wa",
  category: "outreach",
  subject: "",
  body: "",
  tags: "",
  status: "draft",
};

interface PlanForm {
  open: boolean;
  id: string | null; // null = create
  title: string;
  channel: Channel;
  body: string;
  status: string;
  scheduledLocal: string; // datetime-local
  templateId: string;
}
function emptyPlan(scheduledLocal = ""): PlanForm {
  return {
    open: false,
    id: null,
    title: "",
    channel: "wa",
    body: "",
    status: scheduledLocal ? "scheduled" : "idea",
    scheduledLocal,
    templateId: "",
  };
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const qc = useQueryClient();

  const [tab, setTab] = useState<MainTab>("template");

  // live lists
  const templatesQ = useQuery({
    queryKey: ["content", "templates", "list"],
    queryFn: async () => readJson<TemplateRow[]>(await fetch("/api/content/templates")),
    retry: false,
  });
  const plansQ = useQuery({
    queryKey: ["content", "plans", "list"],
    queryFn: async () => readJson<PlanRow[]>(await fetch("/api/content/plans")),
    retry: false,
  });

  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const templateById = useMemo(() => {
    const m: Record<string, TemplateRow> = {};
    for (const t of templates) m[t.id] = t;
    return m;
  }, [templates]);

  // trash lists — lazy (fetched once the Sampah tab opens), kept warm.
  const trashTplQ = useQuery({
    queryKey: ["content", "templates", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<TemplateRow[]>(await fetch("/api/content/templates/trashed")),
    retry: false,
  });
  const trashPlanQ = useQuery({
    queryKey: ["content", "plans", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<PlanRow[]>(await fetch("/api/content/plans/trashed")),
    retry: false,
  });
  const trashedTpl = useMemo(() => trashTplQ.data ?? [], [trashTplQ.data]);
  const trashedPlans = useMemo(() => trashPlanQ.data ?? [], [trashPlanQ.data]);
  const trashCount = trashedTpl.length + trashedPlans.length;

  // ── filters ──────────────────────────────────────────────────────────────
  const [chanF, setChanF] = useState<string>("all");
  const [search, setSearch] = useState("");

  // ── stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeTpl = templates.filter((t) => t.status === "active").length;
    let scheduled = 0;
    let published = 0;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    for (const p of plans) {
      if (p.status === "scheduled") scheduled++;
      if (p.status === "published") {
        const t = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
        if (t >= monthStart) published++;
      }
    }
    return { templates: templates.length, activeTpl, plans: plans.length, scheduled, published };
  }, [templates, plans]);

  const visibleTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      const okChan = chanF === "all" || t.channel === chanF;
      const okSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.tags.some((g) => g.toLowerCase().includes(q));
      return okChan && okSearch;
    });
  }, [templates, chanF, search]);

  const visiblePlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      const okChan = chanF === "all" || p.channel === chanF;
      const okSearch = !q || p.title.toLowerCase().includes(q) || (p.body ?? "").toLowerCase().includes(q);
      return okChan && okSearch;
    });
  }, [plans, chanF, search]);

  // ── drawers ──────────────────────────────────────────────────────────────
  const [tplForm, setTplForm] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlan());

  useEffect(() => {
    if (!tplForm.open && !planForm.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTplForm((f) => ({ ...f, open: false }));
        setPlanForm((f) => ({ ...f, open: false }));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tplForm.open, planForm.open]);

  function openCreateTemplate() {
    setTplForm({ ...EMPTY_TEMPLATE, open: true });
  }
  function openEditTemplate(t: TemplateRow) {
    setTplForm({
      open: true,
      id: t.id,
      name: t.name,
      channel: (CHANNELS as readonly string[]).includes(t.channel) ? (t.channel as Channel) : "other",
      category: t.category,
      subject: t.subject ?? "",
      body: t.body,
      tags: t.tags.join(", "),
      status: t.status,
    });
  }
  function openCreatePlan(scheduledLocal = "") {
    setPlanForm({ ...emptyPlan(scheduledLocal), open: true });
  }
  function openEditPlan(p: PlanRow) {
    setPlanForm({
      open: true,
      id: p.id,
      title: p.title,
      channel: (CHANNELS as readonly string[]).includes(p.channel) ? (p.channel as Channel) : "other",
      body: p.body ?? "",
      status: p.status,
      scheduledLocal: toLocalInput(p.scheduledAt),
      templateId: p.templateId ?? "",
    });
  }

  // ── confirm targets ──────────────────────────────────────────────────────
  const [deleteTpl, setDeleteTpl] = useState<TemplateRow | null>(null);
  const [deletePlan, setDeletePlan] = useState<PlanRow | null>(null);
  const [restoreTpl, setRestoreTpl] = useState<TemplateRow | null>(null);
  const [restorePlan, setRestorePlan] = useState<PlanRow | null>(null);
  const [purgeTpl, setPurgeTpl] = useState<TemplateRow | null>(null);
  const [purgePlan, setPurgePlan] = useState<PlanRow | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshTemplates() {
    qc.invalidateQueries({ queryKey: ["content", "templates"] });
  }
  function refreshPlans() {
    qc.invalidateQueries({ queryKey: ["content", "plans"] });
  }

  const saveTemplate = useMutation({
    mutationFn: async (f: TemplateForm) => {
      const body = {
        name: f.name.trim(),
        channel: f.channel,
        category: f.category,
        subject: f.channel === "email" ? f.subject.trim() || null : null,
        body: f.body,
        variables: detectVars(f.body),
        tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean),
        status: f.status,
      };
      const url = f.id ? `/api/content/templates/${f.id}` : "/api/content/templates";
      return readJson<TemplateRow>(
        await fetch(url, {
          method: f.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, f) => {
      toast.success(f.id ? "Template diperbarui" : "Template dibuat");
      refreshTemplates();
      setTplForm((s) => ({ ...s, open: false }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan template"),
  });

  const savePlan = useMutation({
    mutationFn: async (f: PlanForm) => {
      const body = {
        title: f.title.trim(),
        channel: f.channel,
        body: f.body || null,
        status: f.status,
        scheduledAt: fromLocalInput(f.scheduledLocal),
        templateId: f.templateId || null,
      };
      const url = f.id ? `/api/content/plans/${f.id}` : "/api/content/plans";
      return readJson<PlanRow>(
        await fetch(url, {
          method: f.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: (_res, f) => {
      toast.success(f.id ? "Rencana diperbarui" : "Rencana konten dibuat");
      refreshPlans();
      setPlanForm((s) => ({ ...s, open: false }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan rencana"),
  });

  // SOFT delete (template) — moves to Sampah; cascades to plans that sourced it.
  const softDeleteTpl = useMutation({
    mutationFn: async (t: TemplateRow) =>
      readJson<{ id: string }>(await fetch(`/api/content/templates/${t.id}`, { method: "DELETE" })),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dipindah ke Sampah`);
      refreshTemplates();
      refreshPlans();
      setDeleteTpl(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus template");
      setDeleteTpl(null);
    },
  });

  const softDeletePlan = useMutation({
    mutationFn: async (p: PlanRow) =>
      readJson<{ id: string }>(await fetch(`/api/content/plans/${p.id}`, { method: "DELETE" })),
    onSuccess: (_res, p) => {
      toast.success(`"${p.title}" dipindah ke Sampah`);
      refreshPlans();
      setDeletePlan(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus rencana");
      setDeletePlan(null);
    },
  });

  const restoreTplM = useMutation({
    mutationFn: async (t: TemplateRow) =>
      readJson<TemplateRow>(await fetch(`/api/content/templates/${t.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dipulihkan`);
      refreshTemplates();
      refreshPlans();
      qc.invalidateQueries({ queryKey: ["content", "templates", "trashed"] });
      qc.invalidateQueries({ queryKey: ["content", "plans", "trashed"] });
      setRestoreTpl(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan template");
      setRestoreTpl(null);
    },
  });

  const restorePlanM = useMutation({
    mutationFn: async (p: PlanRow) =>
      readJson<PlanRow>(await fetch(`/api/content/plans/${p.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, p) => {
      toast.success(`"${p.title}" dipulihkan`);
      refreshPlans();
      qc.invalidateQueries({ queryKey: ["content", "plans", "trashed"] });
      setRestorePlan(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan rencana");
      setRestorePlan(null);
    },
  });

  const purgeTplM = useMutation({
    mutationFn: async (t: TemplateRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/content/templates/${t.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${t.name}" dihapus permanen`);
      qc.invalidateQueries({ queryKey: ["content", "templates", "trashed"] });
      setPurgeTpl(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  const purgePlanM = useMutation({
    mutationFn: async (p: PlanRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/content/plans/${p.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, p) => {
      toast.success(`"${p.title}" dihapus permanen`);
      qc.invalidateQueries({ queryKey: ["content", "plans", "trashed"] });
      setPurgePlan(null);
      setPurgeConfirm("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── plan calendar ───────────────────────────────────────────────────────────
  const [planView, setPlanView] = useState<PlanView>("kalender");
  const [trashTab, setTrashTab] = useState<TrashTab>("template");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const calendar = useMemo(() => buildCalendar(cursor.y, cursor.m, visiblePlans), [cursor, visiblePlans]);

  // ── top-level state flags ─────────────────────────────────────────────────
  const tplForbidden =
    templatesQ.error instanceof Error && templatesQ.error.message === "forbidden";

  function submitTemplate() {
    if (!tplForm.name.trim()) {
      toast.error("Nama template wajib diisi");
      return;
    }
    saveTemplate.mutate(tplForm);
  }
  function submitPlan() {
    if (!planForm.title.trim()) {
      toast.error("Judul rencana wajib diisi");
      return;
    }
    savePlan.mutate(planForm);
  }

  return (
    <div>
      <PageHeader
        title="Konten"
        description="Pustaka template pesan/konten + perencanaan (kalender editorial). Buat & sunting di panel kanan; hapus ke Sampah, pulihkan, atau hapus permanen."
      >
        {tab === "rencana" ? (
          <Button size="sm" onClick={() => openCreatePlan()}>
            <Plus className="h-4 w-4" /> Rencana konten
          </Button>
        ) : (
          <Button size="sm" onClick={openCreateTemplate}>
            <Plus className="h-4 w-4" /> Buat template
          </Button>
        )}
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Template"
            value={templatesQ.isLoading ? null : stats.templates}
            hint={`${stats.activeTpl} aktif`}
          />
          <StatCard
            label="Rencana konten"
            value={plansQ.isLoading ? null : stats.plans}
            hint="di kalender editorial"
          />
          <StatCard
            label="Terjadwal"
            value={plansQ.isLoading ? null : stats.scheduled}
            hint="menunggu terbit"
            valueClass="text-tertiary"
          />
          <StatCard
            label="Terbit bulan ini"
            value={plansQ.isLoading ? null : stats.published}
            hint="sudah dipublikasikan"
            valueClass="text-success"
          />
        </section>

        {/* ============ PRIMARY TABS ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "template"} onClick={() => setTab("template")}>
            <FileText className="h-4 w-4" /> Template
            <CountPill>{templates.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "rencana"} onClick={() => setTab("rencana")}>
            <CalendarDays className="h-4 w-4" /> Rencana
            <CountPill>{plans.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" /> Sampah
            {trashCount > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashCount}
              </span>
            )}
          </TabButton>
        </div>

        {/* shared toolbar (template + rencana) */}
        {tab !== "sampah" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="relative">
              <select
                value={chanF}
                onChange={(e) => setChanF(e.target.value)}
                className="h-8 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-8 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">Channel: Semua</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {channelLabel(c)}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </div>

            {tab === "rencana" && (
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "kalender", label: "Kalender", icon: CalendarDays },
                    { v: "daftar", label: "Daftar", icon: LayoutList },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setPlanView(s.v)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs transition-colors",
                      planView === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <s.icon className="h-3.5 w-3.5" /> {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="relative ml-auto w-52">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "rencana" ? "Cari judul / isi…" : "Cari nama / isi / tag…"}
                className="h-8 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>
        )}

        {/* ============ TEMPLATE TAB ============ */}
        {tab === "template" && (
          <section>
            {templatesQ.isLoading ? (
              <CardGridLoading />
            ) : templatesQ.isError ? (
              <ErrorState
                title={tplForbidden ? "Tidak punya akses" : "Gagal memuat template"}
                description={
                  tplForbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar template. Pastikan kamu login & database tersedia."
                }
                onRetry={() => templatesQ.refetch()}
              />
            ) : templates.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada template"
                description="Buat template pesan/konten reusable (opener WhatsApp, follow-up email, caption sosmed) dengan {{variabel}} untuk personalisasi."
                action={
                  <Button size="sm" onClick={openCreateTemplate}>
                    <Plus className="h-4 w-4" /> Buat template
                  </Button>
                }
              />
            ) : visibleTemplates.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Tidak ada template yang cocok"
                description="Coba ubah filter channel atau kata kunci."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={() => openEditTemplate(t)}
                    onDelete={() => setDeleteTpl(t)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============ RENCANA TAB ============ */}
        {tab === "rencana" && (
          <section>
            {plansQ.isLoading ? (
              planView === "kalender" ? (
                <Skeleton className="h-[420px] w-full rounded-lg" />
              ) : (
                <CardGridLoading />
              )
            ) : plansQ.isError ? (
              <ErrorState
                title="Gagal memuat rencana konten"
                description="Tidak bisa mengambil item perencanaan. Pastikan kamu login & database tersedia."
                onRetry={() => plansQ.refetch()}
              />
            ) : planView === "kalender" ? (
              <PlanCalendar
                cursor={cursor}
                weeks={calendar}
                onPrev={() => setCursor(shiftMonth(cursor, -1))}
                onNext={() => setCursor(shiftMonth(cursor, 1))}
                onToday={() => {
                  const n = new Date();
                  setCursor({ y: n.getFullYear(), m: n.getMonth() });
                }}
                onCreate={(localISO) => openCreatePlan(localISO)}
                onOpen={openEditPlan}
                total={plans.length}
              />
            ) : plans.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Belum ada rencana konten"
                description="Rencanakan apa yang akan diterbitkan kapan — di channel mana, dengan status idea → planned → scheduled → published."
                action={
                  <Button size="sm" onClick={() => openCreatePlan()}>
                    <Plus className="h-4 w-4" /> Rencana konten
                  </Button>
                }
              />
            ) : visiblePlans.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Tidak ada rencana yang cocok"
                description="Coba ubah filter channel atau kata kunci."
              />
            ) : (
              <PlanList plans={visiblePlans} onOpen={openEditPlan} onDelete={setDeletePlan} />
            )}
          </section>
        )}

        {/* ============ SAMPAH TAB ============ */}
        {tab === "sampah" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "template", label: "Template", n: trashedTpl.length },
                    { v: "rencana", label: "Rencana", n: trashedPlans.length },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setTrashTab(s.v)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs transition-colors",
                      trashTab === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label} ({s.n})
                  </button>
                ))}
              </div>
              <span className="text-muted-foreground">
                Item yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya, <b>Hapus permanen</b>{" "}
                menghapus selamanya.
              </span>
            </div>

            {trashTab === "template" ? (
              <TrashTemplatePanel
                loading={trashTplQ.isLoading}
                error={trashTplQ.isError}
                rows={trashedTpl}
                onRetry={() => trashTplQ.refetch()}
                onRestore={setRestoreTpl}
                onPurge={(t) => {
                  setPurgeTpl(t);
                  setPurgeConfirm("");
                }}
              />
            ) : (
              <TrashPlanPanel
                loading={trashPlanQ.isLoading}
                error={trashPlanQ.isError}
                rows={trashedPlans}
                onRetry={() => trashPlanQ.refetch()}
                onRestore={setRestorePlan}
                onPurge={(p) => {
                  setPurgePlan(p);
                  setPurgeConfirm("");
                }}
              />
            )}
          </section>
        )}
      </div>

      {/* ===================== TEMPLATE DRAWER ===================== */}
      <DrawerShell
        open={tplForm.open}
        onClose={() => setTplForm((f) => ({ ...f, open: false }))}
        icon={<FileText className="h-[18px] w-[18px]" />}
        title={tplForm.id ? "Sunting template" : "Template baru"}
        subtitle="Pesan/konten reusable dengan {{variabel}}"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTplForm((f) => ({ ...f, open: false }))}
            >
              Batal
            </Button>
            <Button size="sm" className="ml-auto" disabled={saveTemplate.isPending} onClick={submitTemplate}>
              <Check className="h-4 w-4" />
              {saveTemplate.isPending ? "Menyimpan…" : tplForm.id ? "Simpan perubahan" : "Buat template"}
            </Button>
          </>
        }
      >
        <Field label="Nama template">
          <input
            type="text"
            value={tplForm.name}
            onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="mis. Opener WhatsApp — UMKM"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <SelectInput
              value={tplForm.channel}
              onChange={(v) => setTplForm((f) => ({ ...f, channel: v as Channel }))}
              options={CHANNELS.map((c) => ({ value: c, label: channelLabel(c) }))}
            />
          </Field>
          <Field label="Kategori">
            <SelectInput
              value={tplForm.category}
              onChange={(v) => setTplForm((f) => ({ ...f, category: v }))}
              options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] ?? c }))}
            />
          </Field>
        </div>

        {tplForm.channel === "email" && (
          <Field label="Subjek email">
            <input
              type="text"
              value={tplForm.subject}
              onChange={(e) => setTplForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Subjek — bisa pakai {{nama}}"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>
        )}

        <Field label="Isi pesan / konten">
          <textarea
            rows={7}
            value={tplForm.body}
            onChange={(e) => setTplForm((f) => ({ ...f, body: e.target.value }))}
            placeholder={"Halo {{nama}}, terima kasih sudah tertarik dengan {{produk}}…"}
            className="w-full resize-y rounded-lg border border-input bg-card p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <VarHint body={tplForm.body} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectInput
              value={tplForm.status}
              onChange={(v) => setTplForm((f) => ({ ...f, status: v }))}
              options={TEMPLATE_STATUSES.map((s) => ({
                value: s,
                label: TEMPLATE_STATUS_META[s]?.label ?? s,
              }))}
            />
          </Field>
          <Field label="Tag (pisahkan koma)">
            <input
              type="text"
              value={tplForm.tags}
              onChange={(e) => setTplForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="umkm, promo"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>
        </div>
      </DrawerShell>

      {/* ===================== PLAN DRAWER ===================== */}
      <DrawerShell
        open={planForm.open}
        onClose={() => setPlanForm((f) => ({ ...f, open: false }))}
        icon={<CalendarClock className="h-[18px] w-[18px]" />}
        title={planForm.id ? "Sunting rencana konten" : "Rencana konten baru"}
        subtitle="Item kalender editorial — kapan & di mana terbit"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlanForm((f) => ({ ...f, open: false }))}
            >
              Batal
            </Button>
            <Button size="sm" className="ml-auto" disabled={savePlan.isPending} onClick={submitPlan}>
              <Check className="h-4 w-4" />
              {savePlan.isPending ? "Menyimpan…" : planForm.id ? "Simpan perubahan" : "Buat rencana"}
            </Button>
          </>
        }
      >
        <Field label="Judul">
          <input
            type="text"
            value={planForm.title}
            onChange={(e) => setPlanForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="mis. Broadcast promo akhir bulan"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <SelectInput
              value={planForm.channel}
              onChange={(v) => setPlanForm((f) => ({ ...f, channel: v as Channel }))}
              options={CHANNELS.map((c) => ({ value: c, label: channelLabel(c) }))}
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={planForm.status}
              onChange={(v) => setPlanForm((f) => ({ ...f, status: v }))}
              options={PLAN_STATUSES.map((s) => ({ value: s, label: PLAN_STATUS_META[s]?.label ?? s }))}
            />
          </Field>
        </div>

        <Field label="Jadwal terbit">
          <input
            type="datetime-local"
            value={planForm.scheduledLocal}
            onChange={(e) => setPlanForm((f) => ({ ...f, scheduledLocal: e.target.value }))}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field label="Sumber template (opsional)">
          <SelectInput
            value={planForm.templateId}
            onChange={(v) => {
              const tpl = v ? templateById[v] : null;
              setPlanForm((f) => ({
                ...f,
                templateId: v,
                // draft from the template when the body is still empty
                body: f.body || (tpl ? tpl.body : ""),
                channel: tpl ? ((CHANNELS as readonly string[]).includes(tpl.channel) ? (tpl.channel as Channel) : f.channel) : f.channel,
              }));
            }}
            options={[
              { value: "", label: "— tanpa template —" },
              ...templates.map((t) => ({ value: t.id, label: `${t.name} · ${channelLabel(t.channel)}` })),
            ]}
          />
          {templates.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Belum ada template — buat di tab Template untuk menautkannya.
            </p>
          )}
        </Field>

        <Field label="Isi / draf konten">
          <textarea
            rows={6}
            value={planForm.body}
            onChange={(e) => setPlanForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Draf copy yang akan diterbitkan…"
            className="w-full resize-y rounded-lg border border-input bg-card p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>
      </DrawerShell>

      {/* ===================== CONFIRM MODALS ===================== */}
      <ConfirmModal
        open={!!deleteTpl}
        onClose={() => setDeleteTpl(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan template ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTpl?.name}</span> akan dipindah ke{" "}
            <b>Sampah</b> (rencana konten yang memakai template ini ikut ke Sampah). Bisa dipulihkan nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDeleteTpl.isPending}
        onConfirm={() => deleteTpl && softDeleteTpl.mutate(deleteTpl)}
      />
      <ConfirmModal
        open={!!deletePlan}
        onClose={() => setDeletePlan(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan rencana ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deletePlan?.title}</span> akan dipindah ke{" "}
            <b>Sampah</b>. Bisa dipulihkan nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDeletePlan.isPending}
        onConfirm={() => deletePlan && softDeletePlan.mutate(deletePlan)}
      />
      <ConfirmModal
        open={!!restoreTpl}
        onClose={() => setRestoreTpl(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan template?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTpl?.name}</span> akan dikembalikan ke tab{" "}
            <b>Template</b> (rencana yang ikut terhapus juga dipulihkan).
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restoreTplM.isPending}
        onConfirm={() => restoreTpl && restoreTplM.mutate(restoreTpl)}
      />
      <ConfirmModal
        open={!!restorePlan}
        onClose={() => setRestorePlan(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan rencana?"
        body={
          <>
            <span className="font-medium text-foreground">{restorePlan?.title}</span> akan dikembalikan ke tab{" "}
            <b>Rencana</b>.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restorePlanM.isPending}
        onConfirm={() => restorePlan && restorePlanM.mutate(restorePlan)}
      />

      {/* strong type-to-confirm purge (template + rencana share one modal) */}
      <PurgeModal
        open={!!purgeTpl || !!purgePlan}
        label={purgeTpl?.name ?? purgePlan?.title ?? ""}
        confirm={purgeConfirm}
        onConfirmChange={setPurgeConfirm}
        pending={purgeTplM.isPending || purgePlanM.isPending}
        onClose={() => {
          setPurgeTpl(null);
          setPurgePlan(null);
          setPurgeConfirm("");
        }}
        onPurge={() => {
          if (purgeTpl) purgeTplM.mutate(purgeTpl);
          else if (purgePlan) purgePlanM.mutate(purgePlan);
        }}
      />
    </div>
  );
}

// ───────────────────────── calendar building ─────────────────────────

interface CalDay {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  iso: string; // yyyy-mm-dd
  plans: PlanRow[];
}

function shiftMonth(c: { y: number; m: number }, by: number): { y: number; m: number } {
  const d = new Date(c.y, c.m + by, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function buildCalendar(year: number, month: number, plans: PlanRow[]): CalDay[][] {
  const byDay: Record<string, PlanRow[]> = {};
  for (const p of plans) {
    const ref = p.scheduledAt ?? p.publishedAt;
    if (!ref) continue;
    const d = new Date(ref);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    (byDay[key] ??= []).push(p);
  }
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back to Sunday
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const weeks: CalDay[][] = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row: CalDay[] = [];
    for (let d = 0; d < 7; d++) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
      row.push({
        date: new Date(cur),
        inMonth: cur.getMonth() === month,
        isToday: key === todayKey,
        iso: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
        plans: (byDay[key] ?? []).sort(
          (a, b) =>
            new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime(),
        ),
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
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
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5">
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

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: channelDot(channel) }} />
      {channelLabel(channel)}
    </span>
  );
}

function StatusBadge({
  meta,
}: {
  meta: { label: string; style: React.CSSProperties };
}) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  if (channel === "email") return <Mail className={className} />;
  return <MessageSquare className={className} />;
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusMeta = TEMPLATE_STATUS_META[template.status] ?? TEMPLATE_STATUS_META.draft;
  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4 shadow-soft transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${channelDot(template.channel)}1a`, color: channelDot(template.channel) }}
          >
            <ChannelIcon channel={template.channel} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
            <p className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[template.category] ?? template.category}</p>
          </div>
        </div>
        <StatusBadge meta={statusMeta} />
      </div>

      {template.subject && (
        <p className="mt-2.5 truncate text-[12px] font-medium text-foreground/80">{template.subject}</p>
      )}
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
        {template.body || <span className="italic">Belum ada isi.</span>}
      </p>

      {(template.variables.length > 0 || template.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {template.variables.slice(0, 4).map((v) => (
            <span
              key={`v-${v}`}
              className="rounded-md bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              {`{{${v}}}`}
            </span>
          ))}
          {template.tags.slice(0, 3).map((g) => (
            <span
              key={`t-${g}`}
              className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" /> {g}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Send className="h-3 w-3" /> {template.usageCount}× dipakai
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-medium text-foreground/80 transition-colors hover:border-primary/40"
          >
            <Pencil className="h-3 w-3" /> Sunting
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Hapus (ke Sampah)"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCalendar({
  cursor,
  weeks,
  onPrev,
  onNext,
  onToday,
  onCreate,
  onOpen,
  total,
}: {
  cursor: { y: number; m: number };
  weeks: CalDay[][];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: (localISO: string) => void;
  onOpen: (p: PlanRow) => void;
  total: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      {/* calendar toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          {MONTHS_ID[cursor.m]} {cursor.y}
        </h3>
        <div className="ml-2 inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="h-7 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">{total} rencana total</span>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS_ID.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      {/* weeks */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, i) => (
          <div
            key={i}
            className={cn(
              "group/cell min-h-[96px] border-b border-r border-border p-1.5 last:border-r-0",
              i % 7 === 6 && "border-r-0",
              !day.inMonth && "bg-muted/30",
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums",
                  day.isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : day.inMonth
                      ? "font-medium text-foreground/80"
                      : "text-muted-foreground/60",
                )}
              >
                {day.date.getDate()}
              </span>
              <button
                type="button"
                onClick={() => onCreate(`${day.iso}T09:00`)}
                title="Tambah rencana"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/cell:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {day.plans.slice(0, 3).map((p) => {
                const meta = PLAN_STATUS_META[p.status] ?? PLAN_STATUS_META.idea;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    className="flex w-full items-center gap-1 rounded border-l-2 bg-muted/50 px-1.5 py-0.5 text-left text-[10px] leading-tight transition-colors hover:bg-muted"
                    style={{ borderLeftColor: meta.bar }}
                    title={`${p.title} · ${meta.label}`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: channelDot(p.channel) }} />
                    <span className="truncate font-medium text-foreground/80">{p.title}</span>
                  </button>
                );
              })}
              {day.plans.length > 3 && (
                <p className="px-1 text-[10px] text-muted-foreground">+{day.plans.length - 3} lagi</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanList({
  plans,
  onOpen,
  onDelete,
}: {
  plans: PlanRow[];
  onOpen: (p: PlanRow) => void;
  onDelete: (p: PlanRow) => void;
}) {
  const sorted = [...plans].sort(
    (a, b) => new Date(b.scheduledAt ?? b.updatedAt).getTime() - new Date(a.scheduledAt ?? a.updatedAt).getTime(),
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-semibold">Judul</th>
            <th className="px-3 py-3 font-semibold">Channel</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Jadwal</th>
            <th className="px-3 py-3 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((p) => {
            const meta = PLAN_STATUS_META[p.status] ?? PLAN_STATUS_META.idea;
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-3">
                  <p className="font-medium text-foreground">{p.title}</p>
                  {p.body && (
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">{p.body}</p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ChannelBadge channel={p.channel} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge meta={meta} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {p.scheduledAt ? fmtDateTimeID(p.scheduledAt) : "—"}
                </td>
                <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(p)}
                      className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
                    >
                      <Pencil className="h-3 w-3" /> Sunting
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      title="Hapus (ke Sampah)"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrashTemplatePanel({
  loading,
  error,
  rows,
  onRetry,
  onRestore,
  onPurge,
}: {
  loading: boolean;
  error: boolean;
  rows: TemplateRow[];
  onRetry: () => void;
  onRestore: (t: TemplateRow) => void;
  onPurge: (t: TemplateRow) => void;
}) {
  if (loading) return <CardGridLoading />;
  if (error) {
    return (
      <ErrorState
        title="Gagal memuat sampah"
        description="Tidak bisa mengambil template yang dihapus."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Sampah template kosong"
        description="Template yang kamu hapus akan muncul di sini dan bisa dipulihkan."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-semibold">Nama</th>
            <th className="px-3 py-3 font-semibold">Channel</th>
            <th className="px-3 py-3 font-semibold">Dihapus</th>
            <th className="px-3 py-3 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-muted/30">
              <td className="px-3 py-3 font-medium text-foreground/80">{t.name}</td>
              <td className="px-3 py-3">
                <ChannelBadge channel={t.channel} />
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(t.deletedAt)}</td>
              <td className="px-3 py-3 text-right">
                <TrashActions onRestore={() => onRestore(t)} onPurge={() => onPurge(t)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrashPlanPanel({
  loading,
  error,
  rows,
  onRetry,
  onRestore,
  onPurge,
}: {
  loading: boolean;
  error: boolean;
  rows: PlanRow[];
  onRetry: () => void;
  onRestore: (p: PlanRow) => void;
  onPurge: (p: PlanRow) => void;
}) {
  if (loading) return <CardGridLoading />;
  if (error) {
    return (
      <ErrorState
        title="Gagal memuat sampah"
        description="Tidak bisa mengambil rencana yang dihapus."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Sampah rencana kosong"
        description="Rencana konten yang kamu hapus akan muncul di sini dan bisa dipulihkan."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-semibold">Judul</th>
            <th className="px-3 py-3 font-semibold">Channel</th>
            <th className="px-3 py-3 font-semibold">Dihapus</th>
            <th className="px-3 py-3 text-right font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-muted/30">
              <td className="px-3 py-3 font-medium text-foreground/80">{p.title}</td>
              <td className="px-3 py-3">
                <ChannelBadge channel={p.channel} />
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(p.deletedAt)}</td>
              <td className="px-3 py-3 text-right">
                <TrashActions onRestore={() => onRestore(p)} onPurge={() => onPurge(p)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrashActions({ onRestore, onPurge }: { onRestore: () => void; onPurge: () => void }) {
  return (
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground/80">{label}</label>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
    </div>
  );
}

function VarHint({ body }: { body: string }) {
  const vars = detectVars(body);
  if (vars.length === 0) {
    return (
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Pakai <code className="rounded bg-muted px-1 text-[10px]">{"{{nama}}"}</code> untuk variabel
        personalisasi — terdeteksi otomatis.
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Variabel terdeteksi:</span>
      {vars.map((v) => (
        <span key={v} className="rounded-md bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {`{{${v}}}`}
        </span>
      ))}
    </div>
  );
}

function DrawerShell({
  open,
  onClose,
  icon,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l border-border bg-card shadow-soft transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-foreground">{title}</h2>
              <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{open && children}</div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
          {footer}
        </div>
      </aside>
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
              tone === "destructive" ? "bg-destructive text-white" : "bg-tertiary text-tertiary-foreground",
            )}
          >
            {confirmPending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurgeModal({
  open,
  label,
  confirm,
  onConfirmChange,
  pending,
  onClose,
  onPurge,
}: {
  open: boolean;
  label: string;
  confirm: string;
  onConfirmChange: (v: string) => void;
  pending: boolean;
  onClose: () => void;
  onPurge: () => void;
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
          "w-full max-w-sm rounded-lg border border-destructive/30 bg-card p-5 shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-destructive">Hapus permanen?</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
              <span className="font-medium text-foreground">{label}</span> akan dihapus selamanya.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-muted-foreground">
            Ketik{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground">HAPUS</code>{" "}
            untuk konfirmasi.
          </label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            placeholder="HAPUS"
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Batal
          </button>
          <button
            onClick={onPurge}
            disabled={pending || confirm.trim().toUpperCase() !== "HAPUS"}
            className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Menghapus…" : "Hapus permanen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardGridLoading() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
