"use client";

// Sales Lapangan — Module 9 (secondary) FRONTEND (Sainskerta Loop Phase 04,
// FINAL frontend tick). Wired to the NEW M9 field backend (no mock data):
//   GET    /api/field/visits                       → list kunjungan lapangan (VisitRow[])
//   GET    /api/field/visits/trashed               → the Sampah view
//   POST   /api/field/visits                       → create a visit
//   PATCH  /api/field/visits/[id]                  → edit a visit (status / outcome / …)
//   DELETE /api/field/visits/[id]                  → SOFT delete (cascade → check-ins)
//   PATCH  /api/field/visits/[id]/restore          → un-trash (cascade restore)
//   DELETE /api/field/visits/[id]?purge=1          → HARD delete (cascade purge)
//   GET    /api/field/visits/[id]/check-ins        → geo-stamped check-ins of a visit
//   POST   /api/field/check-ins                    → record a check-in / check-out
//   GET    /api/contacts  ·  GET /api/companies    → resolve contactId / companyId soft refs
// Matches the established Coral Sunset design system (contacts / admin / workspace /
// retention): stat strip, Aktif | Sampah tabs, a status/purpose toolbar + search, a
// visits table (Judul · Rep · Lokasi · Jadwal · Status · Aksi), and a right drawer
// for visit detail (map PLACEHOLDER — Leaflet skipped for now — visit info, check-ins
// timeline, and a check-in/out form). Every band has loading + empty + error states.
// Lives in the (app) shell.

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Target,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { withFieldId } from "@/components/shared/field-id";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MapPoint } from "@/components/shared/visit-map";

// Leaflet map is client-only (touches window) → load with ssr:false so it never
// runs on the server / during prerender.
const VisitMap = dynamic(() => import("@/components/shared/visit-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-[11px] text-muted-foreground">
      Memuat peta…
    </div>
  ),
});

// ── API envelope + row shapes (NEW M9 field backend — { ok, data }) ──────────

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

/** Row from GET /api/field/visits (modules/field · field_visit). */
interface VisitRow {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  repUserId: string | null;
  title: string;
  purpose: string | null; // demo | negotiation | delivery | survey | relationship | other
  address: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: string; // planned | en_route | in_progress | completed | cancelled | no_show
  outcome: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /trashed
}

/** Row from GET /api/field/visits/[id]/check-ins (modules/field · field_check_in). */
interface CheckInRow {
  id: string;
  tenantId: string;
  visitId: string;
  repUserId: string | null;
  kind: string; // check_in | check_out
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  address: string | null;
  photoUrl: string | null;
  note: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Slim row from GET /api/contacts (modules/crm · contact) — resolve contactId. */
interface ContactRow {
  id: string;
  fullName: string;
  title: string | null;
  companyId: string | null;
}

/** Slim row from GET /api/companies (modules/crm · company_v2) — resolve companyId. */
interface CompanyRow {
  id: string;
  name: string;
}

/** Slim row from GET /api/deals (modules/crm · deal) — link a visit to a deal. */
interface DealRow {
  id: string;
  name: string;
  value: number;
  currency: string;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainTab = "aktif" | "sampah";
type StatusFilter =
  | "all"
  | "planned"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";
type PurposeFilter = "all" | "demo" | "negotiation" | "delivery" | "survey" | "relationship" | "other";

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  planned: { label: "Direncanakan", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  en_route: { label: "Dalam perjalanan", cls: "bg-info/12 text-info", dot: "bg-info" },
  in_progress: { label: "Berlangsung", cls: "bg-warning/12 text-warning", dot: "bg-warning" },
  completed: { label: "Selesai", cls: "bg-success/12 text-success", dot: "bg-success" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  no_show: { label: "Tidak datang", cls: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

const PURPOSE_META: Record<string, { label: string; style: React.CSSProperties }> = {
  demo: { label: "Demo produk", style: { background: "hsl(217 91% 60% / .12)", color: "#2563eb" } },
  negotiation: { label: "Negosiasi", style: { background: "hsl(14 90% 96%)", color: "#c2410c" } },
  delivery: { label: "Pengiriman", style: { background: "hsl(173 80% 40% / .14)", color: "#0d9488" } },
  survey: { label: "Survei", style: { background: "#E1306C18", color: "#c01f5b" } },
  relationship: { label: "Jaga relasi", style: { background: "hsl(38 92% 50% / .15)", color: "#b45309" } },
  other: { label: "Lainnya", style: { background: "hsl(0 0% 90%)", color: "#525252" } },
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "planned", label: "Direncanakan" },
  { value: "en_route", label: "Dalam perjalanan" },
  { value: "in_progress", label: "Berlangsung" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "no_show", label: "Tidak datang" },
];

const PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: "demo", label: "Demo produk" },
  { value: "negotiation", label: "Negosiasi" },
  { value: "delivery", label: "Pengiriman" },
  { value: "survey", label: "Survei" },
  { value: "relationship", label: "Jaga relasi" },
  { value: "other", label: "Lainnya" },
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

function statusMeta(status: string): { label: string; cls: string; dot: string } {
  return STATUS_META[status] ?? STATUS_META.planned;
}

function purposeMeta(purpose: string | null): { label: string; style: React.CSSProperties } | null {
  if (!purpose) return null;
  return PURPOSE_META[purpose] ?? PURPOSE_META.other;
}

function fmtRelID(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (Math.abs(h) < 1) return "Baru saja";
  if (h >= 0 && h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (h >= 0 && days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtScheduled(iso: string | null | undefined): string {
  if (!iso) return "Tanpa jadwal";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Tanpa jadwal";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTimeID(iso: string | null | undefined): string {
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

function fmtCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
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

// ── drawer form state (create visit) ──────────────────────────────────────────

interface VisitForm {
  title: string;
  purpose: string;
  address: string;
  scheduledAt: string; // datetime-local value
  contactId: string;
  companyId: string;
  dealId: string;
  status: string;
  outcome: string;
  notes: string;
}

const EMPTY_VISIT_FORM: VisitForm = {
  title: "",
  purpose: "demo",
  address: "",
  scheduledAt: "",
  contactId: "",
  companyId: "",
  dealId: "",
  status: "planned",
  outcome: "",
  notes: "",
};

/** Convert a stored ISO timestamp → the `YYYY-MM-DDTHH:mm` value a
 *  `datetime-local` input expects (in the browser's local timezone). */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ask the browser for the current position, resolving to `null` on
 *  denial / unavailability / timeout (never rejects — the caller degrades). */
function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function FieldPage() {
  const qc = useQueryClient();

  // live visits
  const visitsQ = useQuery({
    queryKey: ["field", "visits", "list"],
    queryFn: async () => readJson<VisitRow[]>(await fetch("/api/field/visits")),
    retry: false,
  });
  const visits = useMemo(() => visitsQ.data ?? [], [visitsQ.data]);

  // CRM joins — resolve contactId / companyId soft refs to display names. Degrade
  // gracefully (no torn page) when CRM is empty / unavailable.
  const contactsQ = useQuery({
    queryKey: ["field", "contacts", "resolve"],
    queryFn: async () =>
      (await readJson<Page<ContactRow>>(await fetch("/api/contacts?limit=200"))).items,
    retry: false,
  });
  const companiesQ = useQuery({
    queryKey: ["field", "companies", "resolve"],
    queryFn: async () => readJson<CompanyRow[]>(await fetch("/api/companies")),
    retry: false,
  });
  // Deals — resolve a visit's dealId + feed the Edit-form deal picker. Keyset
  // page envelope ({ items, nextCursor }); degrade to [] on failure.
  const dealsQ = useQuery({
    queryKey: ["field", "deals", "resolve"],
    queryFn: async () =>
      (await readJson<Page<DealRow>>(await fetch("/api/deals?limit=200"))).items,
    retry: false,
  });
  const dealById = useMemo(() => {
    const m: Record<string, DealRow> = {};
    for (const d of dealsQ.data ?? []) m[d.id] = d;
    return m;
  }, [dealsQ.data]);
  const contactById = useMemo(() => {
    const m: Record<string, ContactRow> = {};
    for (const c of contactsQ.data ?? []) m[c.id] = c;
    return m;
  }, [contactsQ.data]);
  const companyById = useMemo(() => {
    const m: Record<string, CompanyRow> = {};
    for (const c of companiesQ.data ?? []) m[c.id] = c;
    return m;
  }, [companiesQ.data]);

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  const trashedQ = useQuery({
    queryKey: ["field", "visits", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<VisitRow[]>(await fetch("/api/field/visits/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [purposeF, setPurposeF] = useState<PurposeFilter>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    let planned = 0;
    let inProgress = 0;
    let completed = 0;
    for (const v of visits) {
      if (v.status === "planned" || v.status === "en_route") planned++;
      else if (v.status === "in_progress") inProgress++;
      else if (v.status === "completed") completed++;
    }
    return { total: visits.length, planned, inProgress, completed };
  }, [visits]);

  function locationText(v: VisitRow): string {
    if (v.address) return v.address;
    const company = v.companyId ? companyById[v.companyId]?.name : null;
    if (company) return company;
    return "—";
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      const okStatus = statusF === "all" || v.status === statusF;
      const okPurpose = purposeF === "all" || v.purpose === purposeF;
      const contactName = v.contactId ? contactById[v.contactId]?.fullName ?? "" : "";
      const companyName = v.companyId ? companyById[v.companyId]?.name ?? "" : "";
      const hay = `${v.title} ${v.address ?? ""} ${contactName} ${companyName}`.toLowerCase();
      const okSearch = !q || hay.includes(q);
      return okStatus && okPurpose && okSearch;
    });
  }, [visits, statusF, purposeF, search, contactById, companyById]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((v) =>
      `${v.title} ${v.address ?? ""}`.toLowerCase().includes(q),
    );
  }, [trashed, search]);

  // ── drawer (detail | create | edit) ──────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VisitForm>(EMPTY_VISIT_FORM);
  const [checkInNote, setCheckInNote] = useState("");
  // Which check-in kind is mid-flight (geolocation prompt + POST) — keeps the
  // button disabled while the browser resolves the position.
  const [geoKind, setGeoKind] = useState<"check_in" | "check_out" | null>(null);

  const active = useMemo(() => visits.find((v) => v.id === openId) ?? null, [visits, openId]);

  const drawerOpen = !!openId || creating;
  function closeDrawer() {
    setOpenId(null);
    setCreating(false);
    setEditing(false);
  }

  /** Populate the shared form from a visit + switch the drawer into edit mode. */
  function openEdit(v: VisitRow) {
    setForm({
      title: v.title,
      purpose: v.purpose ?? "other",
      address: v.address ?? "",
      scheduledAt: isoToLocalInput(v.scheduledAt),
      contactId: v.contactId ?? "",
      companyId: v.companyId ?? "",
      dealId: v.dealId ?? "",
      status: v.status,
      outcome: v.outcome ?? "",
      notes: v.notes ?? "",
    });
    setCreating(false);
    setEditing(true);
  }

  // Check-ins of the open visit.
  const checkInsQ = useQuery({
    queryKey: ["field", "check-ins", openId],
    enabled: !!openId,
    queryFn: async () =>
      readJson<CheckInRow[]>(await fetch(`/api/field/visits/${openId}/check-ins`)),
    retry: false,
  });

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<VisitRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VisitRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<VisitRow | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["field"] });
  }

  const createVisit = useMutation({
    mutationFn: async (f: VisitForm) =>
      readJson<VisitRow>(
        await fetch("/api/field/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: f.title.trim(),
            purpose: f.purpose || null,
            address: f.address.trim() || null,
            scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
            contactId: f.contactId || null,
            companyId: f.companyId || null,
            dealId: f.dealId || null,
            status: f.status,
            notes: f.notes.trim() || null,
          }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Kunjungan "${row.title}" dibuat`);
      refreshAll();
      setCreating(false);
      setForm(EMPTY_VISIT_FORM);
      setOpenId(row.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat kunjungan"),
  });

  // Edit an existing visit — PATCHes the full editable field-set (title, purpose,
  // address, schedule, CRM refs, dealId, outcome, notes). Returns to the detail view.
  const updateVisit = useMutation({
    mutationFn: async (vars: { id: string; f: VisitForm }) =>
      readJson<VisitRow>(
        await fetch(`/api/field/visits/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: vars.f.title.trim(),
            purpose: vars.f.purpose || null,
            address: vars.f.address.trim() || null,
            scheduledAt: vars.f.scheduledAt ? new Date(vars.f.scheduledAt).toISOString() : null,
            contactId: vars.f.contactId || null,
            companyId: vars.f.companyId || null,
            dealId: vars.f.dealId || null,
            status: vars.f.status,
            outcome: vars.f.outcome.trim() || null,
            notes: vars.f.notes.trim() || null,
          }),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Kunjungan "${row.title}" diperbarui`);
      refreshAll();
      setEditing(false);
      setOpenId(row.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui kunjungan"),
  });

  // Advance status (planned → en_route → in_progress → completed) inline.
  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: string }) =>
      readJson<VisitRow>(
        await fetch(`/api/field/visits/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: vars.status }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(`Status → ${statusMeta(vars.status).label}`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah status"),
  });

  // Record a check-in / check-out. The backend advances the visit's lifecycle.
  // Geo coords (lat/lng/accuracy) come from the browser when the user allows it —
  // see `handleCheckIn` below, which acquires the position before mutating.
  const recordCheckIn = useMutation({
    mutationFn: async (vars: {
      visitId: string;
      kind: "check_in" | "check_out";
      note: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
    }) =>
      readJson<CheckInRow>(
        await fetch("/api/field/check-ins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId: vars.visitId,
            kind: vars.kind,
            note: vars.note.trim() || null,
            lat: vars.lat ?? null,
            lng: vars.lng ?? null,
            accuracy: vars.accuracy ?? null,
          }),
        }),
      ),
    onSuccess: (_res, vars) => {
      toast.success(vars.kind === "check_in" ? "Check-in tercatat" : "Check-out tercatat");
      setCheckInNote("");
      qc.invalidateQueries({ queryKey: ["field", "check-ins", vars.visitId] });
      qc.invalidateQueries({ queryKey: ["field", "visits"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mencatat check-in"),
  });

  /**
   * Record a check-in/out, stamping the browser's geolocation so the VisitMap
   * populates. If the user denies / the device can't fix a location, we still
   * record the event (never an error) — just without coords, and we tag the note
   * so the timeline is honest about it.
   */
  async function handleCheckIn(kind: "check_in" | "check_out") {
    if (!active) return;
    setGeoKind(kind);
    const pos = await getPosition();
    setGeoKind(null);
    if (pos) {
      recordCheckIn.mutate({
        visitId: active.id,
        kind,
        note: checkInNote,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    } else {
      const base = checkInNote.trim();
      recordCheckIn.mutate({
        visitId: active.id,
        kind,
        note: base ? `${base} (lokasi tidak tersedia)` : "lokasi tidak tersedia",
        lat: null,
        lng: null,
        accuracy: null,
      });
    }
  }

  const softDelete = useMutation({
    mutationFn: async (v: VisitRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/field/visits/${v.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, v) => {
      toast.success(`"${v.title}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
      if (openId === v.id) setOpenId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus kunjungan");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (v: VisitRow) =>
      readJson<VisitRow>(await fetch(`/api/field/visits/${v.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, v) => {
      toast.success(`"${v.title}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan kunjungan");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (v: VisitRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/field/visits/${v.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, v) => {
      toast.success(`"${v.title}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = visitsQ.isError;
  const forbidden = visitsQ.error instanceof Error && visitsQ.error.message === "forbidden";

  function openCreate() {
    setForm(EMPTY_VISIT_FORM);
    setCreating(true);
    setOpenId(null);
  }

  return (
    <div>
      <PageHeader
        title="Sales Lapangan"
        description="Kunjungan lapangan & check-in tim sales — siapa, di mana, dan statusnya. Klik baris untuk detail kunjungan + riwayat check-in."
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Kunjungan baru
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total kunjungan"
            value={visitsQ.isLoading ? null : stats.total}
            hint="di tenant ini"
          />
          <StatCard
            label="Terjadwal"
            value={visitsQ.isLoading ? null : stats.planned}
            hint="direncanakan / dalam perjalanan"
          />
          <StatCard
            label="Berlangsung"
            value={visitsQ.isLoading ? null : stats.inProgress}
            hint="rep sedang di lokasi"
            valueClass="text-warning"
          />
          <StatCard
            label="Selesai"
            value={visitsQ.isLoading ? null : stats.completed}
            hint="kunjungan tuntas"
            valueClass="text-success"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <MapPin className="h-4 w-4" />
            Aktif
            <CountPill>{visits.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")}>
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashed.length > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashed.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "aktif" ? (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR: status select + purpose pills + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {/* status select */}
              <div className="relative">
                <select
                  value={statusF}
                  onChange={(e) => setStatusF(e.target.value as StatusFilter)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Status: Semua</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              {/* purpose pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Tujuan:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "demo", label: "Demo" },
                    { v: "negotiation", label: "Negosiasi" },
                    { v: "delivery", label: "Pengiriman" },
                    { v: "survey", label: "Survei" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => setPurposeF(p.v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      purposeF === p.v
                        ? "bg-foreground font-semibold text-background"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* inline search */}
              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter judul / lokasi…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {visitsQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat kunjungan"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar kunjungan lapangan. Pastikan kamu login & database tersedia."
                }
                onRetry={() => visitsQ.refetch()}
              />
            ) : visits.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={MapPin}
                title="Belum ada kunjungan lapangan"
                description="Catat kunjungan ke pelanggan / prospek di lapangan — lengkap dengan rep, lokasi, jadwal, dan check-in geo-stamped saat tiba."
                action={
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Kunjungan baru
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada kunjungan yang cocok"
                description="Coba ubah filter status / tujuan, atau kata kunci pencarian."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Kunjungan</th>
                      <th className="px-3 py-3 font-semibold">Rep</th>
                      <th className="px-3 py-3 font-semibold">Lokasi</th>
                      <th className="px-3 py-3 font-semibold">Jadwal</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((v) => (
                      <VisitTableRow
                        key={v.id}
                        visit={v}
                        contact={v.contactId ? contactById[v.contactId] ?? null : null}
                        location={locationText(v)}
                        onOpen={() => {
                          setCreating(false);
                          setOpenId(v.id);
                        }}
                        onDelete={() => setDeleteTarget(v)}
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
                Kunjungan yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif, <b>Hapus permanen</b> menghapus selamanya (cascade ke check-in-nya).
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} kunjungan
              </span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil kunjungan yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Kunjungan yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Kunjungan</th>
                      <th className="px-3 py-3 font-semibold">Lokasi</th>
                      <th className="px-3 py-3 font-semibold">Status terakhir</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((v) => (
                      <TrashedTableRow
                        key={v.id}
                        visit={v}
                        location={locationText(v)}
                        onRestore={() => setRestoreTarget(v)}
                        onPurge={() => setPurgeTarget(v)}
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
          Status kunjungan:{" "}
          {(["planned", "in_progress", "completed", "no_show"] as const).map((s, i) => (
            <span key={s}>
              {i > 0 && " · "}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  statusMeta(s).cls,
                )}
              >
                {statusMeta(s).label}
              </span>
            </span>
          ))}
          . Klik baris → panel kanan (detail + check-in geo-stamped). Peta terisi dari check-in berlokasi.
        </p>
      </div>

      {/* ===================== RIGHT DRAWER ===================== */}
      <AppDrawerRaw
        open={drawerOpen}
        onClose={closeDrawer}
        title={creating ? "Jadwalkan kunjungan" : editing ? "Edit kunjungan" : active?.title ?? "Detail kunjungan"}
        widthClassName="w-[420px] max-w-full"
      >
        {creating ? (
          <VisitFormDrawer
            mode="create"
            form={form}
            setForm={setForm}
            contacts={contactsQ.data ?? []}
            companies={companiesQ.data ?? []}
            deals={dealsQ.data ?? []}
            pending={createVisit.isPending}
            onClose={() => setCreating(false)}
            onSubmit={() => {
              if (!form.title.trim()) {
                toast.error("Judul kunjungan wajib diisi");
                return;
              }
              createVisit.mutate(form);
            }}
          />
        ) : editing && active ? (
          <VisitFormDrawer
            mode="edit"
            form={form}
            setForm={setForm}
            contacts={contactsQ.data ?? []}
            companies={companiesQ.data ?? []}
            deals={dealsQ.data ?? []}
            pending={updateVisit.isPending}
            onClose={() => setEditing(false)}
            onSubmit={() => {
              if (!form.title.trim()) {
                toast.error("Judul kunjungan wajib diisi");
                return;
              }
              updateVisit.mutate({ id: active.id, f: form });
            }}
          />
        ) : active ? (
          <VisitDetailDrawer
            visit={active}
            contact={active.contactId ? contactById[active.contactId] ?? null : null}
            company={active.companyId ? companyById[active.companyId] ?? null : null}
            deal={active.dealId ? dealById[active.dealId] ?? null : null}
            checkIns={checkInsQ.data ?? []}
            checkInsLoading={checkInsQ.isLoading}
            checkInsError={checkInsQ.isError}
            onRetryCheckIns={() => checkInsQ.refetch()}
            checkInNote={checkInNote}
            setCheckInNote={setCheckInNote}
            recordingKind={
              geoKind ?? (recordCheckIn.isPending ? (recordCheckIn.variables?.kind ?? null) : null)
            }
            locating={geoKind}
            onCheckIn={handleCheckIn}
            onSetStatus={(status) => setStatus.mutate({ id: active.id, status })}
            statusPending={setStatus.isPending}
            onEdit={() => openEdit(active)}
            onDelete={() => setDeleteTarget(active)}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </AppDrawerRaw>

      {/* ===================== SOFT-DELETE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        icon={<Trash2 className="h-5 w-5" />}
        tone="destructive"
        title="Pindahkan ke Sampah?"
        body={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.title}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b> (cascade ke check-in-nya). Kamu masih bisa
            memulihkannya nanti.
          </>
        }
        confirmLabel="Ya, hapus"
        confirmPending={softDelete.isPending}
        onConfirm={() => deleteTarget && softDelete.mutate(deleteTarget)}
      />

      {/* ===================== RESTORE CONFIRM ===================== */}
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        icon={<RotateCcw className="h-5 w-5" />}
        tone="tertiary"
        title="Pulihkan kunjungan?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.title}</span> akan
            dikembalikan ke tab <b>Aktif</b> beserta check-in-nya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.title ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.title}</span> akan dihapus
            selamanya beserta check-in-nya.
          </>
        }
      />
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

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
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

function PurposeBadge({ purpose }: { purpose: string | null }) {
  const meta = purposeMeta(purpose);
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        tanpa tujuan
      </span>
    );
  }
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function VisitTableRow({
  visit,
  contact,
  location,
  onOpen,
  onDelete,
}: {
  visit: VisitRow;
  contact: ContactRow | null;
  location: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{visit.title}</p>
            <PurposeBadge purpose={visit.purpose} />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {contact ? contact.fullName : "Tanpa kontak terkait"}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 text-sm">
        {visit.repUserId ? (
          <span className="inline-flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
              {initialsOf(contact?.fullName ?? "Rep")}
            </span>
            <span className="text-foreground/80">Ditugaskan</span>
          </span>
        ) : (
          <span className="text-muted-foreground">— belum ditugaskan</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-foreground/80">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="line-clamp-1 max-w-[200px]">{location}</span>
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {fmtScheduled(visit.scheduledAt)}
        </span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={visit.status} />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
          >
            Buka <ChevronRight className="h-3 w-3" />
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
      </td>
    </tr>
  );
}

function TrashedTableRow({
  visit,
  location,
  onRestore,
  onPurge,
}: {
  visit: VisitRow;
  location: string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <p className="truncate font-medium text-foreground/80">{visit.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {purposeMeta(visit.purpose)?.label ?? "Tanpa tujuan"}
        </p>
      </td>
      <td className="px-3 py-3 text-sm text-muted-foreground">
        <span className="line-clamp-1 max-w-[220px]">{location}</span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={visit.status} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(visit.deletedAt ?? null)}</td>
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

// ── visit detail drawer ───────────────────────────────────────────────────────

function VisitDetailDrawer({
  visit,
  contact,
  company,
  deal,
  checkIns,
  checkInsLoading,
  checkInsError,
  onRetryCheckIns,
  checkInNote,
  setCheckInNote,
  recordingKind,
  locating,
  onCheckIn,
  onSetStatus,
  statusPending,
  onEdit,
  onDelete,
  onClose,
}: {
  visit: VisitRow;
  contact: ContactRow | null;
  company: CompanyRow | null;
  deal: DealRow | null;
  checkIns: CheckInRow[];
  checkInsLoading: boolean;
  checkInsError: boolean;
  onRetryCheckIns: () => void;
  checkInNote: string;
  setCheckInNote: (v: string) => void;
  recordingKind: string | null;
  locating: "check_in" | "check_out" | null;
  onCheckIn: (kind: "check_in" | "check_out") => void;
  onSetStatus: (status: string) => void;
  statusPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const location =
    visit.address || company?.name || (contact ? `Lokasi ${contact.fullName}` : "Lokasi belum diisi");

  // Real map points come from geo-stamped check-ins (the visit row carries no
  // lat/lng yet). Empty → we show the placeholder below.
  const mapPoints: MapPoint[] = checkIns
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({
      lat: c.lat as number,
      lng: c.lng as number,
      kind: c.kind === "check_out" ? "check_out" : "check_in",
      label: `${c.kind === "check_in" ? "Check-in" : "Check-out"}${c.address ? ` · ${c.address}` : ""} · ${fmtTimeID(c.recordedAt)}`,
    }));

  return (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <MapPin className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{visit.title}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {purposeMeta(visit.purpose)?.label ?? "Tanpa tujuan"}
              {company ? ` · ${company.name}` : contact ? ` · ${contact.fullName}` : ""}
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
        {/* (A) MAP — real Leaflet map once there are geo-stamped check-ins; else a
             placeholder (the visit row carries no lat/lng of its own yet). */}
        {mapPoints.length > 0 ? (
          <VisitMap points={mapPoints} className="h-36 overflow-hidden rounded-lg border border-border" />
        ) : (
          <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-[linear-gradient(135deg,hsl(14_90%_97%),hsl(173_60%_95%))]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage:
                  "linear-gradient(hsl(14 40% 80% / .35) 1px, transparent 1px), linear-gradient(90deg, hsl(14 40% 80% / .35) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div className="relative flex flex-col items-center gap-1 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
                <MapPin className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-medium text-foreground/80">{location}</p>
              <p className="text-[10px] text-muted-foreground">Peta muncul setelah check-in dengan lokasi.</p>
            </div>
          </div>
        )}

        {/* (B) STATUS + advance */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">Status kunjungan</span>
            <StatusBadge status={visit.status} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((s) => {
              const on = visit.status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={statusPending || on}
                  onClick={() => onSetStatus(s.value)}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-[11px] transition-colors disabled:cursor-default disabled:opacity-60",
                    on
                      ? cn("font-semibold", statusMeta(s.value).cls)
                      : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* (C) DETAIL */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Detail kunjungan
          </h3>
          <div className="space-y-2 text-[13px]">
            <DetailRow icon={Building2} label="Akun" value={company?.name ?? null} />
            <DetailRow icon={User} label="Kontak" value={contact?.fullName ?? null} />
            <DetailRow
              icon={Target}
              label="Deal"
              value={deal ? `${deal.name} · ${deal.currency} ${deal.value.toLocaleString("id-ID")}` : null}
            />
            <DetailRow icon={MapPin} label="Alamat" value={visit.address} />
            <DetailRow icon={CalendarClock} label="Jadwal" value={fmtTimeID(visit.scheduledAt)} />
            <DetailRow icon={LogIn} label="Tiba (check-in)" value={fmtTimeID(visit.startedAt)} />
            <DetailRow icon={LogOut} label="Selesai (check-out)" value={fmtTimeID(visit.endedAt)} />
          </div>
          {visit.notes && (
            <p className="mt-2 rounded-lg border border-border bg-accent/60 p-2.5 text-[11px] leading-relaxed text-foreground/80">
              <span className="font-semibold text-foreground">Catatan:</span> {visit.notes}
            </p>
          )}
          {visit.outcome && (
            <p className="mt-2 rounded-lg border border-border bg-success/[0.06] p-2.5 text-[11px] leading-relaxed text-foreground/80">
              <span className="font-semibold text-foreground">Hasil:</span> {visit.outcome}
            </p>
          )}
        </div>

        {/* (D) RECORD CHECK-IN / OUT */}
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">Catat check-in</span>
          </div>
          <textarea
            rows={2}
            value={checkInNote}
            onChange={(e) => setCheckInNote(e.target.value)}
            placeholder="Catatan (opsional) — mis. ketemu owner, stok menipis…"
            className="mb-2 w-full resize-none rounded-lg border border-input bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!!recordingKind}
              onClick={() => onCheckIn("check_in")}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <LogIn className="h-3.5 w-3.5" />
              {recordingKind === "check_in"
                ? locating === "check_in"
                  ? "Mengambil lokasi…"
                  : "Mencatat…"
                : "Check-in"}
            </button>
            <button
              type="button"
              disabled={!!recordingKind}
              onClick={() => onCheckIn("check_out")}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" />
              {recordingKind === "check_out"
                ? locating === "check_out"
                  ? "Mengambil lokasi…"
                  : "Mencatat…"
                : "Check-out"}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Saat check-in, browser meminta izin lokasi untuk menstempel titik geo di peta. Jika izin
            ditolak, check-in tetap tercatat—tanpa koordinat.
          </p>
        </div>

        {/* (E) CHECK-IN TIMELINE */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Riwayat check-in
          </h3>
          {checkInsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : checkInsError ? (
            <ErrorState
              className="border-0 py-6"
              title="Gagal memuat check-in"
              description="Tidak bisa mengambil riwayat check-in kunjungan ini."
              onRetry={onRetryCheckIns}
            />
          ) : checkIns.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              Belum ada check-in. Catat check-in saat rep tiba di lokasi.
            </p>
          ) : (
            <div className="space-y-2.5">
              {checkIns.map((c) => (
                <CheckInItem key={c.id} checkIn={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </Button>
      </div>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="text-right font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

function CheckInItem({ checkIn }: { checkIn: CheckInRow }) {
  const isIn = checkIn.kind === "check_in";
  const coords = fmtCoords(checkIn.lat, checkIn.lng);
  return (
    <div className="flex gap-2.5 rounded-lg border border-border p-2.5 text-[12px]">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isIn ? "bg-primary/[0.12] text-primary" : "bg-success/12 text-success",
        )}
      >
        {isIn ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-foreground">{isIn ? "Check-in" : "Check-out"}</p>
          <span className="text-[10px] text-muted-foreground">{fmtTimeID(checkIn.recordedAt)}</span>
        </div>
        {(checkIn.address || coords) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {checkIn.address || coords}
            {checkIn.accuracy != null ? ` · ±${Math.round(checkIn.accuracy)}m` : ""}
          </p>
        )}
        {checkIn.note && <p className="mt-0.5 text-[11px] text-foreground/70">{checkIn.note}</p>}
      </div>
    </div>
  );
}

// ── create-visit drawer ───────────────────────────────────────────────────────

function VisitFormDrawer({
  mode,
  form,
  setForm,
  contacts,
  companies,
  deals,
  pending,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: VisitForm;
  setForm: React.Dispatch<React.SetStateAction<VisitForm>>;
  contacts: ContactRow[];
  companies: CompanyRow[];
  deals: DealRow[];
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isEdit = mode === "edit";
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isEdit ? <Pencil className="h-[18px] w-[18px]" /> : <Plus className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{isEdit ? "Edit kunjungan" : "Kunjungan baru"}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {isEdit ? "Ubah detail & hasil kunjungan" : "Catat rencana kunjungan lapangan"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <Field label="Judul kunjungan">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="mis. Demo produk ke Toko Sinar Jaya"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field label="Tujuan">
          <SelectInput
            value={form.purpose}
            onChange={(v) => setForm((f) => ({ ...f, purpose: v }))}
            options={PURPOSE_OPTIONS}
          />
        </Field>

        <Field label="Status awal">
          <SelectInput
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            options={STATUS_OPTIONS}
          />
        </Field>

        <Field label="Alamat / lokasi">
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="mis. Jl. Sudirman No. 10, Jakarta"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field label="Jadwal" hint="Waktu rencana kunjungan (opsional).">
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field label="Akun (perusahaan)" hint={companies.length === 0 ? "Belum ada perusahaan di CRM." : undefined}>
          <SelectInput
            value={form.companyId}
            onChange={(v) => setForm((f) => ({ ...f, companyId: v }))}
            options={[
              { value: "", label: "— tidak terkait —" },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>

        <Field label="Kontak terkait" hint={contacts.length === 0 ? "Belum ada kontak di CRM." : undefined}>
          <SelectInput
            value={form.contactId}
            onChange={(v) => setForm((f) => ({ ...f, contactId: v }))}
            options={[
              { value: "", label: "— tidak terkait —" },
              ...contacts.map((c) => ({ value: c.id, label: c.fullName })),
            ]}
          />
        </Field>

        <Field label="Deal terkait" hint={deals.length === 0 ? "Belum ada deal di pipeline." : "Kaitkan kunjungan ke satu deal (opsional)."}>
          <SelectInput
            value={form.dealId}
            onChange={(v) => setForm((f) => ({ ...f, dealId: v }))}
            options={[
              { value: "", label: "— tidak terkait —" },
              ...deals.map((d) => ({
                value: d.id,
                label: `${d.name} · ${d.currency} ${d.value.toLocaleString("id-ID")}`,
              })),
            ]}
          />
        </Field>

        {isEdit && (
          <Field label="Hasil kunjungan" hint="Ringkasan hasil / outcome (opsional).">
            <textarea
              rows={2}
              value={form.outcome}
              onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
              placeholder="mis. Owner tertarik, minta penawaran resmi minggu depan…"
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>
        )}

        <Field label="Catatan" hint="Opsional.">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Konteks kunjungan, hal yang perlu dibawa, dll…"
            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Batal
        </button>
        <button
          onClick={onSubmit}
          disabled={pending}
          className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {pending ? "Menyimpan…" : isEdit ? "Simpan perubahan" : "Buat kunjungan"}
        </button>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground/80">
        {label}
      </label>
      {withFieldId(children, id)}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SelectInput({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        id={id}
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

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
