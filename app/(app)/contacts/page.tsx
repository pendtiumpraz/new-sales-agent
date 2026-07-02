"use client";

// Kontak & Lead (CRM) — Module 3 FRONTEND (Sainskerta Loop Phase 04). Wired to the
// NEW M3 / CRM backend (no mock data): GET /api/contacts (list, ContactRow[]),
// GET /api/companies (resolve company names + industry_id — contacts only carry
// companyId), GET /api/taxonomy/industries + /api/taxonomy/occupations (resolve a
// contact's company.industry_id → INDUSTRI label and the contact's occupation_id →
// PEKERJAAN label; both also power the Industri / Pekerjaan filter dropdowns),
// GET /api/contacts/trashed (the Sampah view), GET /api/activities?subjectType=
// contact&subjectId= (drawer timeline) + GET /api/deals?contactId= (related deals).
// Mutations: PATCH /api/contacts/[id] (enrich → set enrichment_status / fit /
// segment override), DELETE /api/contacts/[id] (SOFT delete), PATCH
// /api/contacts/[id]/restore (un-trash), DELETE /api/contacts/[id]?purge=1 (HARD
// delete). Faithful to mockups/contacts.html (Coral Sunset): stat strip, segmented
// segment filter (Semua / B2C / B2B / Belum) + enrichment pills + source select +
// search, table (Nama · Perusahaan · Segment badge · Skor Fit · Status Enrichment ·
// Sumber · Aksi), and a right drawer (klasifikasi segmen + skor fit + profil + data
// enrichment + tabs Aktivitas/Deal/Catatan + Enrich). Every band has loading +
// empty + error states. Lives in the (app) shell (inside the Kontak cluster subnav).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureGuide } from "@/components/shared/feature-guide";
import { FEATURE_GUIDES } from "@/lib/feature-guides";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EnrichmentChip,
  FitCell,
  SEG_BADGE,
  SegmentBadge,
  SourceBadge,
  fitColor,
  fitPct,
  initialsOf,
  sourceBucket,
} from "@/components/contacts/contact-cells";
import { cn } from "@/lib/utils";

// ── API envelope + row shapes (NEW M3 / CRM backend — { ok, data }) ──────────

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

/** Row from GET /api/contacts (modules/crm · contact). fit_score is 0..1. */
interface ContactRow {
  id: string;
  companyId: string | null;
  workspaceId: string | null;
  fullName: string;
  title: string | null;
  occupationId: string | null; // soft ref → occupation.id (taxonomy · resolved to a PEKERJAAN label)
  department: string | null;
  seniority: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  location: string | null;
  channelPreference: string | null;
  socials: Record<string, string> | null;
  tags: string[];
  segment: string; // b2c | b2b | unknown
  enrichmentStatus: string; // none | pending | enriched | failed
  fitScore: number | null; // 0..1
  fitReason: string | null;
  lifecycleStage: string;
  ownerUserId: string | null;
  consentStatus: string; // unknown | legitimate_interest | opted_in | opted_out
  source: string | null;
  lastActivityAt: string | null;
  avatarColor: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/contacts/trashed
}

/** Row from GET /api/companies (modules/crm · company_v2). */
interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null; // free-text label as captured (fallback)
  industryId: string | null; // soft ref → industry.id (taxonomy · resolved to an INDUSTRI label)
  website: string | null;
  socials: Record<string, string> | null;
}

/** Row from GET /api/taxonomy/{industries|occupations} (modules/taxonomy). */
interface TaxoRow {
  id: string;
  name: string;
  nameEn: string | null;
}

/** Row from GET /api/activities?subjectType=contact&subjectId= (modules/crm · activity). */
interface ActivityRow {
  id: string;
  subjectType: string;
  subjectId: string;
  type: string;
  title: string | null;
  body: string | null;
  createdAt: string;
}

/** Row from GET /api/deals?contactId= (modules/crm · deal). */
interface DealRow {
  id: string;
  name: string;
  value: number;
  currency: string;
  status: string;
  stageId: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type SegFilter = "all" | "b2c" | "b2b" | "unknown";
type EnrFilter = "all" | "enriched" | "pending";
type MainTab = "aktif" | "sampah";
type DrawerTab = "act" | "deal" | "note";

const CONSENT_META: Record<string, { label: string; cls: string }> = {
  opted_in: { label: "consent: opt-in", cls: "bg-success/12 text-success" },
  legitimate_interest: { label: "consent: legitimate interest", cls: "bg-info/12 text-info" },
  opted_out: { label: "consent: opt-out", cls: "bg-destructive/10 text-destructive" },
  unknown: { label: "consent: unknown", cls: "bg-muted text-muted-foreground" },
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

function fmtRelID(iso: string | null): string {
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

function fmtIDR(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1e9) return `Rp ${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (value >= 1e6) return `Rp ${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  return `${currency} ${value.toLocaleString("id-ID")}`;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ContactsCrmPage() {
  const qc = useQueryClient();

  // live contacts + companies (companies resolve the companyId → name join)
  const contactsQ = useQuery({
    queryKey: ["crm", "contacts", "list"],
    queryFn: async () =>
      (await readJson<Page<ContactRow>>(await fetch("/api/contacts?limit=200"))).items,
    retry: false,
  });
  const companiesQ = useQuery({
    queryKey: ["crm", "companies", "list"],
    queryFn: async () => readJson<CompanyRow[]>(await fetch("/api/companies")),
    retry: false,
  });

  // Taxonomy catalogs — INDUSTRI (on a contact's company) + PEKERJAAN (on the
  // contact). The list endpoints return the global base ∪ tenant rows; we build
  // id → name maps to RESOLVE a contact's occupation_id / its company's
  // industry_id into a human label (the row stores ids, never labels).
  const industriesQ = useQuery({
    queryKey: ["taxonomy", "industry", "list"],
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/industries")),
    retry: false,
  });
  const occupationsQ = useQuery({
    queryKey: ["taxonomy", "occupation", "list"],
    queryFn: async () => readJson<TaxoRow[]>(await fetch("/api/taxonomy/occupations")),
    retry: false,
  });

  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const companyById = useMemo(() => {
    const m: Record<string, CompanyRow> = {};
    for (const c of companiesQ.data ?? []) m[c.id] = c;
    return m;
  }, [companiesQ.data]);

  // id → label lookups for the taxonomy soft refs.
  const industryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of industriesQ.data ?? []) m.set(r.id, r.name);
    return m;
  }, [industriesQ.data]);
  const occupationNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of occupationsQ.data ?? []) m.set(r.id, r.name);
    return m;
  }, [occupationsQ.data]);

  /** A contact's PEKERJAAN label (occupation_id → name; falls back to its title). */
  const occupationLabel = (c: ContactRow): string | null =>
    (c.occupationId ? occupationNameById.get(c.occupationId) : null) ?? null;
  /** A contact's INDUSTRI label (resolved via its company's industry_id, then the
   *  company's free-text industry as a fallback). */
  const industryLabel = (c: ContactRow): string | null => {
    const co = c.companyId ? companyById[c.companyId] : undefined;
    if (!co) return null;
    return (co.industryId ? industryNameById.get(co.industryId) : null) ?? co.industry ?? null;
  };

  // ── tabs ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MainTab>("aktif");

  // Trashed contacts — lazy (only fetched when the Sampah tab opens), kept warm.
  const trashedQ = useQuery({
    queryKey: ["crm", "contacts", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<ContactRow[]>(await fetch("/api/contacts/trashed")),
    retry: false,
  });
  const trashed = useMemo(() => trashedQ.data ?? [], [trashedQ.data]);

  // ── filters ──────────────────────────────────────────────────────────────────
  const [segF, setSegF] = useState<SegFilter>("all");
  const [enrF, setEnrF] = useState<EnrFilter>("all");
  const [srcF, setSrcF] = useState<string>("all");
  const [indF, setIndF] = useState<string>("all"); // industry_id | "all"
  const [occF, setOccF] = useState<string>("all"); // occupation_id | "all"
  const [search, setSearch] = useState("");

  // Filter dropdown options — only the taxonomy rows ACTUALLY in use by a visible
  // contact (id + label), so the menu stays scoped to this workspace's data
  // instead of the full global catalog. Each option is an id; the label is
  // resolved from the same maps used to render the cells.
  const industryFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of contacts) {
      const co = c.companyId ? companyById[c.companyId] : undefined;
      if (co?.industryId && industryNameById.has(co.industryId)) {
        seen.set(co.industryId, industryNameById.get(co.industryId)!);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "id"),
    );
  }, [contacts, companyById, industryNameById]);
  const occupationFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of contacts) {
      if (c.occupationId && occupationNameById.has(c.occupationId)) {
        seen.set(c.occupationId, occupationNameById.get(c.occupationId)!);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "id"),
    );
  }, [contacts, occupationNameById]);

  const stats = useMemo(() => {
    let b2c = 0;
    let b2b = 0;
    let notEnriched = 0;
    for (const c of contacts) {
      if (c.segment === "b2c") b2c++;
      else if (c.segment === "b2b") b2b++;
      if (c.enrichmentStatus !== "enriched") notEnriched++;
    }
    return { total: contacts.length, b2c, b2b, notEnriched };
  }, [contacts]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      const b = sourceBucket(c.source);
      if (b !== "—") set.add(b);
    }
    return Array.from(set).sort();
  }, [contacts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      const company = c.companyId ? companyById[c.companyId]?.name ?? "" : "";
      const occ = occupationLabel(c);
      const ind = industryLabel(c);
      const enrMatch =
        enrF === "all" ||
        (enrF === "enriched" && c.enrichmentStatus === "enriched") ||
        (enrF === "pending" && c.enrichmentStatus !== "enriched");
      const okSeg = segF === "all" || c.segment === segF;
      const okSrc = srcF === "all" || sourceBucket(c.source) === srcF;
      const okInd =
        indF === "all" || (!!c.companyId && companyById[c.companyId]?.industryId === indF);
      const okOcc = occF === "all" || c.occupationId === occF;
      const okSearch =
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        company.toLowerCase().includes(q) ||
        (occ?.toLowerCase().includes(q) ?? false) ||
        (ind?.toLowerCase().includes(q) ?? false);
      return okSeg && enrMatch && okSrc && okInd && okOcc && okSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, companyById, segF, enrF, srcF, indF, occF, search, industryNameById, occupationNameById]);

  const visibleTrashed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter((c) => {
      const company = c.companyId ? companyById[c.companyId]?.name ?? "" : "";
      return c.fullName.toLowerCase().includes(q) || company.toLowerCase().includes(q);
    });
  }, [trashed, companyById, search]);

  // ── drawer ───────────────────────────────────────────────────────────────────
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("act");
  const active = useMemo(
    () => contacts.find((c) => c.id === openId) ?? null,
    [contacts, openId],
  );

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // Drawer satellites — the related activities + deals for the open contact.
  const activitiesQ = useQuery({
    queryKey: ["crm", "activities", openId],
    enabled: !!openId && drawerTab === "act",
    queryFn: async () =>
      readJson<ActivityRow[]>(
        await fetch(`/api/activities?subjectType=contact&subjectId=${openId}`),
      ),
    retry: false,
  });
  const dealsQ = useQuery({
    queryKey: ["crm", "deals", openId],
    enabled: !!openId && drawerTab === "deal",
    queryFn: async () =>
      (await readJson<Page<DealRow>>(await fetch(`/api/deals?contactId=${openId}`))).items,
    retry: false,
  });

  // ── confirm targets ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ContactRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ContactRow | null>(null);

  // ── create surface ───────────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);

  // ── CSV import surface ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseContactsCsv(text);
      setImportFileName(file.name);
      setImportRows(rows);
      setImportResult(null);
      setImportOpen(true);
    } catch {
      toast.error("Gagal membaca file CSV.");
    }
  }

  // ── mutations ──────────────────────────────────────────────────────────────
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["crm", "contacts"] });
  }

  // Bulk CSV import → POST /api/contacts/import (same sink agents use). Sends every
  // parsed row (empty-name rows are skipped + counted server-side, so the toast is
  // accurate); dedup by whatsapp/email happens in the backend.
  const importContacts = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const contacts = rows.map((r) => ({
        fullName: r.fullName?.trim() ?? "",
        segment: r.segment?.trim().toLowerCase() || undefined,
        title: r.title?.trim() || undefined,
        companyName: r.companyName?.trim() || undefined,
        whatsapp: r.whatsapp?.trim() || undefined,
        email: r.email?.trim() || undefined,
        notes: r.notes?.trim() || undefined,
      }));
      return readJson<ImportResult>(
        await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts }),
        }),
      );
    },
    onSuccess: (res) => {
      toast.success(`${res.created} dibuat, ${res.skipped} dilewati`);
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} baris gagal — lihat detail di dialog.`);
      }
      refreshAll();
      setImportResult(res);
      // Clean import (nothing to review) → close; else keep open to show errors.
      if (res.errors.length === 0) setImportOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengimpor kontak"),
  });

  // Manual create — fills the gap where contacts only arrived via Discovery.
  const createContact = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      readJson<ContactRow>(
        await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    onSuccess: (row) => {
      toast.success(`Kontak "${row.fullName}" dibuat`);
      refreshAll();
      setNewOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat kontak"),
  });

  // Enrich = PATCH the contact's enrichment_status → enriched (+ a segment override
  // when still unknown). No fabricated values; this flips the lifecycle field the
  // backend owns. fit_score is left to the real enrichment job, not invented here.
  const enrich = useMutation({
    mutationFn: async (vars: { id: string; segment?: string }) =>
      readJson<ContactRow>(
        await fetch(`/api/contacts/${vars.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrichmentStatus: "enriched",
            ...(vars.segment ? { segment: vars.segment } : {}),
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Ditandai ter-enrich — status diperbarui");
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui status"),
  });

  // Re-classify segment from the drawer (AI klasifikasi · bisa override).
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
      toast.success(`Segmen diubah ke ${vars.segment.toUpperCase()}`);
      refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah segmen"),
  });

  // SOFT delete — moves an active contact into "Sampah" (deleted_at stamped).
  const softDelete = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/contacts/${c.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dipindah ke Sampah`);
      refreshAll();
      setDeleteTarget(null);
      if (openId === c.id) setOpenId(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus kontak");
      setDeleteTarget(null);
    },
  });

  // RESTORE — clears deleted_at, returning the contact to the active tab.
  const restore = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<ContactRow>(await fetch(`/api/contacts/${c.id}/restore`, { method: "PATCH" })),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dipulihkan`);
      refreshAll();
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan kontak");
      setRestoreTarget(null);
    },
  });

  // HARD delete (purge) — permanent removal from trash. Irreversible.
  const purge = useMutation({
    mutationFn: async (c: ContactRow) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/contacts/${c.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, c) => {
      toast.success(`"${c.fullName}" dihapus permanen`);
      refreshAll();
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const listError = contactsQ.isError;
  const forbidden = contactsQ.error instanceof Error && contactsQ.error.message === "forbidden";

  return (
    <div>
      <PageHeader
        title="Kontak & Lead"
        description="Semua kontak/lead yang sudah diakuisisi — dengan segmentasi B2C vs B2B & status pengayaan data. Klik baris untuk lihat profil + data enrichment."
      >
        <FeatureGuide guide={FEATURE_GUIDES.contacts} />
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts/discovery">
            <Search className="h-4 w-4" /> Cari lead baru
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4" /> Unduh template
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Impor CSV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onFilePicked}
        />
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Kontak baru
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total kontak"
            value={contactsQ.isLoading ? null : stats.total}
            hint="di workspace ini"
          />
          <StatCard
            label="Segmen B2C"
            value={contactsQ.isLoading ? null : stats.b2c}
            hint="perorangan / customer"
            badge={SEG_BADGE.b2c ?? undefined}
          />
          <StatCard
            label="Segmen B2B"
            value={contactsQ.isLoading ? null : stats.b2b}
            hint="partner / perusahaan"
            badge={SEG_BADGE.b2b ?? undefined}
          />
          <StatCard
            label="Belum di-enrich"
            value={contactsQ.isLoading ? null : stats.notEnriched}
            hint="butuh pengayaan data"
            valueClass="text-warning"
          />
        </section>

        {/* ============ MAIN TABS: Aktif | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton active={tab === "aktif"} onClick={() => setTab("aktif")}>
            <Users className="h-4 w-4" />
            Aktif
            <CountPill>{contacts.length}</CountPill>
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
            {/* TOOLBAR: segmented control + enrichment pills + source + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {/* (1) SEGMENT segmented control */}
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "b2c", label: "B2C" },
                    { v: "b2b", label: "B2B" },
                    { v: "unknown", label: "Belum diklasifikasi" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSegF(s.v)}
                    className={cn(
                      "h-7 rounded-md px-3.5 text-xs transition-colors",
                      segF === s.v
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <span className="hidden h-5 w-px bg-border sm:block" />

              {/* (2) ENRICHMENT pills */}
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted-foreground">Enrichment:</span>
                {(
                  [
                    { v: "all", label: "Semua" },
                    { v: "enriched", label: "Enriched" },
                    { v: "pending", label: "Belum" },
                  ] as const
                ).map((e) => (
                  <button
                    key={e.v}
                    type="button"
                    onClick={() => setEnrF(e.v)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors",
                      enrF === e.v
                        ? "bg-foreground font-semibold text-background"
                        : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              {/* (3) SOURCE select */}
              <div className="relative">
                <select
                  value={srcF}
                  onChange={(e) => setSrcF(e.target.value)}
                  className="h-7 cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="all">Sumber: Semua</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              {/* (3b) INDUSTRI select — resolved from the contact's company.industry_id */}
              <div className="relative">
                <select
                  value={indF}
                  onChange={(e) => setIndF(e.target.value)}
                  disabled={industriesQ.isLoading || industryFilterOptions.length === 0}
                  className="h-7 max-w-[180px] cursor-pointer appearance-none truncate rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">Industri: Semua</option>
                  {industryFilterOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              {/* (3c) PEKERJAAN select — resolved from the contact's occupation_id */}
              <div className="relative">
                <select
                  value={occF}
                  onChange={(e) => setOccF(e.target.value)}
                  disabled={occupationsQ.isLoading || occupationFilterOptions.length === 0}
                  className="h-7 max-w-[180px] cursor-pointer appearance-none truncate rounded-lg border border-border bg-card pl-3 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">Pekerjaan: Semua</option>
                  {occupationFilterOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted-foreground" />
              </div>

              {/* (4) inline search */}
              <div className="relative ml-auto w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter nama / perusahaan…"
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{visible.length}</b> hasil
              </span>
            </div>

            {/* TABLE */}
            {contactsQ.isLoading || companiesQ.isLoading ? (
              <TableLoading />
            ) : listError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat kontak"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil daftar kontak. Pastikan kamu login & database tersedia."
                }
                onRetry={() => contactsQ.refetch()}
              />
            ) : contacts.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Users}
                title="Belum ada kontak"
                description="Kontak muncul di sini setelah kamu menjalankan Discovery / Enrichment. Saat itu kontak otomatis tersegmentasi B2C / B2B."
                action={
                  <Button asChild size="sm">
                    <Link href="/contacts/discovery">
                      <Plus className="h-4 w-4" /> Cari lead baru
                    </Link>
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada kontak yang cocok"
                description="Coba ubah filter segmen / enrichment / sumber / industri / pekerjaan, atau kata kunci."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Pekerjaan</th>
                      <th className="px-3 py-3 font-semibold">Perusahaan · Industri</th>
                      <th className="px-3 py-3 font-semibold">Segment</th>
                      <th className="w-40 px-3 py-3 font-semibold">Skor Fit</th>
                      <th className="px-3 py-3 font-semibold">Status Enrichment</th>
                      <th className="px-3 py-3 font-semibold">Sumber</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((c) => (
                      <ContactTableRow
                        key={c.id}
                        contact={c}
                        company={c.companyId ? companyById[c.companyId] ?? null : null}
                        occupation={occupationLabel(c)}
                        industry={industryLabel(c)}
                        onOpen={() => {
                          setOpenId(c.id);
                          setDrawerTab("act");
                        }}
                        onEnrich={() => enrich.mutate({ id: c.id })}
                        onDelete={() => setDeleteTarget(c)}
                        enriching={enrich.isPending && enrich.variables?.id === c.id}
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
                Kontak yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya ke tab
                Aktif, <b>Hapus permanen</b> menghapus selamanya (cascade ke deal & aktivitas).
              </span>
              <span className="ml-auto text-muted-foreground">
                {visibleTrashed.length} dari {trashed.length} kontak
              </span>
            </div>

            {trashedQ.isLoading ? (
              <TableLoading />
            ) : trashedQ.isError ? (
              <ErrorState
                className="border-0"
                title="Gagal memuat sampah"
                description="Tidak bisa mengambil kontak yang dihapus."
                onRetry={() => trashedQ.refetch()}
              />
            ) : visibleTrashed.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Trash2}
                title={trashed.length === 0 ? "Sampah kosong" : "Tidak ada yang cocok"}
                description={
                  trashed.length === 0
                    ? "Kontak yang kamu hapus akan muncul di sini dan bisa dipulihkan."
                    : "Coba ubah kata kunci pencarian."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Perusahaan</th>
                      <th className="px-3 py-3 font-semibold">Segment</th>
                      <th className="px-3 py-3 font-semibold">Dihapus</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleTrashed.map((c) => (
                      <TrashedTableRow
                        key={c.id}
                        contact={c}
                        company={c.companyId ? companyById[c.companyId] ?? null : null}
                        onRestore={() => setRestoreTarget(c)}
                        onPurge={() => {
                          setPurgeTarget(c);
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
          Badge segmen:{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={SEG_BADGE.b2c?.style}
          >
            B2C
          </span>{" "}
          (perorangan) ·{" "}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={SEG_BADGE.b2b?.style}
          >
            B2B
          </span>{" "}
          (perusahaan) ·{" "}
          <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            belum
          </span>{" "}
          diklasifikasi. Klik baris → panel kanan (profil + data enrichment + klasifikasi +
          Enrich).
        </p>
      </div>

      {/* ===================== RIGHT DRAWER ===================== */}
      <AppDrawerRaw
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={active?.fullName ?? "Detail kontak"}
        widthClassName="w-[400px] max-w-full"
      >
        {active && (
          <>
            {/* header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-xs font-semibold text-primary">
                  {initialsOf(active.fullName)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-foreground">{active.fullName}</h2>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {active.title || "Perorangan"}
                    {active.companyId && companyById[active.companyId]
                      ? ` · ${companyById[active.companyId].name}`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* (A) KLASIFIKASI SEGMEN — editable */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">Segmen</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-tertiary" /> klasifikasi AI · bisa override
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { v: "b2b", label: "B2B Partner" },
                      { v: "b2c", label: "B2C Customer" },
                      { v: "unknown", label: "Belum" },
                    ] as const
                  ).map((s) => {
                    const on = active.segment === s.v;
                    return (
                      <button
                        key={s.v}
                        type="button"
                        disabled={reclassify.isPending}
                        onClick={() =>
                          !on && reclassify.mutate({ id: active.id, segment: s.v })
                        }
                        className={cn(
                          "h-7 rounded-full px-3 text-xs transition-colors disabled:opacity-60",
                          on
                            ? "font-semibold"
                            : s.v === "unknown"
                              ? "border border-dashed border-border bg-card font-medium text-muted-foreground hover:border-primary/40"
                              : "border border-border bg-card font-medium text-foreground/70 hover:border-primary/40",
                        )}
                        style={on && SEG_BADGE[s.v] ? SEG_BADGE[s.v]!.style : undefined}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* (B) SKOR FIT */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">Skor Fit produk</span>
                  {(() => {
                    const pct = fitPct(active.fitScore);
                    return pct == null ? (
                      <span className="text-sm font-bold text-muted-foreground">—</span>
                    ) : (
                      <span className="text-sm font-bold" style={{ color: fitColor(pct) }}>
                        {pct}
                      </span>
                    );
                  })()}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  {(() => {
                    const pct = fitPct(active.fitScore);
                    return (
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${pct ?? 0}%`,
                          background: pct == null ? "transparent" : fitColor(pct),
                        }}
                      />
                    );
                  })()}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Kecocokan dengan produk workspace — dihitung AI dari profil &amp; sinyal niat.
                </p>
                {active.fitReason && (
                  <p className="mt-2 rounded-lg border border-border bg-accent/60 p-2.5 text-[11px] leading-relaxed text-foreground/80">
                    <span className="font-semibold text-foreground">Ringkasan AI:</span>{" "}
                    {active.fitReason}
                  </p>
                )}
              </div>

              {/* (C) PROFIL */}
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Profil
                </h3>
                <div className="space-y-2 text-[13px]">
                  <ProfileRow label="Jabatan" value={active.title} />
                  <ProfileRow
                    label="Pekerjaan (taksonomi)"
                    value={occupationLabel(active)}
                    hint={active.occupationId ? undefined : "belum diklasifikasi"}
                  />
                  <ProfileRow
                    label="Perusahaan"
                    value={
                      active.companyId ? companyById[active.companyId]?.name ?? "—" : "— (perorangan)"
                    }
                  />
                  <ProfileRow
                    label="Industri (taksonomi)"
                    value={industryLabel(active)}
                    hint={
                      !active.companyId
                        ? "kontak perorangan"
                        : companyById[active.companyId]?.industryId
                          ? undefined
                          : "belum diklasifikasi"
                    }
                  />
                  <ProfileRow label="Departemen" value={active.department} />
                  <ProfileRow label="Senioritas" value={active.seniority} />
                  <ProfileRow label="Lokasi" value={active.location || active.city} />
                </div>
              </div>

              {/* (D) DATA ENRICHMENT */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Data Enrichment
                  </h3>
                  {active.enrichmentStatus === "enriched" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                      <Check className="h-3 w-3" /> Enriched
                    </span>
                  ) : active.enrichmentStatus === "failed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      Gagal
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 py-0.5 text-[10px] font-medium text-warning">
                      {active.enrichmentStatus === "pending" ? "Sedang diproses" : "Belum di-enrich"}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <EnrichField
                    color="#6366F1"
                    label="Email"
                    value={active.email}
                    source={sourceBucket(active.source)}
                    consent={active.consentStatus}
                  />
                  <EnrichField
                    color="#25D366"
                    label="Telepon / WhatsApp"
                    value={active.whatsapp || active.phone}
                    source={sourceBucket(active.source)}
                    consent={active.consentStatus}
                  />
                  {/* website / socials */}
                  {active.socials && Object.keys(active.socials).length > 0 ? (
                    <div className="rounded-lg border border-border p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          Website / Sosmed
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          sumber:{" "}
                          <span className="font-medium text-foreground/70">
                            {sourceBucket(active.source)}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(active.socials).map(([k, v]) => (
                          <a
                            key={k}
                            href={v}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-secondary"
                          >
                            {k}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        Website · Sosmed · Departemen · Senioritas
                      </span>{" "}
                      — <span className="italic">belum terisi, jalankan Enrich</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Tiap field menampilkan <b>sumber</b> (Crawl / Hunter / Impor / Web) + status
                  consent.
                </p>
              </div>

              {/* (E) TABS sekunder */}
              <div>
                <div className="flex gap-1 border-b border-border text-xs">
                  {(
                    [
                      { v: "act", label: "Aktivitas" },
                      { v: "deal", label: "Deal terkait" },
                      { v: "note", label: "Catatan" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.v}
                      onClick={() => setDrawerTab(t.v)}
                      className={cn(
                        "border-b-2 px-2.5 py-2 transition-colors",
                        drawerTab === t.v
                          ? "border-primary font-semibold text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="pt-3">
                  {drawerTab === "act" && (
                    <DrawerActivities
                      loading={activitiesQ.isLoading}
                      error={activitiesQ.isError}
                      rows={activitiesQ.data ?? []}
                      onRetry={() => activitiesQ.refetch()}
                    />
                  )}
                  {drawerTab === "deal" && (
                    <DrawerDeals
                      loading={dealsQ.isLoading}
                      error={dealsQ.isError}
                      rows={dealsQ.data ?? []}
                      onRetry={() => dealsQ.refetch()}
                    />
                  )}
                  {drawerTab === "note" && (
                    <textarea
                      rows={3}
                      placeholder="Tambah catatan internal… (tersimpan saat modul Catatan aktif)"
                      className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/inbox">
                  <MessageSquare className="h-4 w-4" style={{ color: "#25D366" }} /> Mulai chat
                </Link>
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={enrich.isPending}
                title="Tandai kontak sebagai ter-enrich (manual — belum menjalankan job enrichment nyata)"
                onClick={() => enrich.mutate({ id: active.id })}
              >
                <Check className="h-4 w-4" />
                {enrich.isPending
                  ? "Memproses…"
                  : active.enrichmentStatus === "enriched"
                    ? "Tandai ulang"
                    : "Tandai ter-enrich"}
              </Button>
            </div>
          </>
        )}
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
            <span className="font-medium text-foreground">{deleteTarget?.fullName}</span> akan
            dihapus dan dipindah ke tab <b>Sampah</b> (cascade ke deal &amp; aktivitasnya). Kamu
            masih bisa memulihkannya nanti.
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
        title="Pulihkan kontak?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.fullName}</span> akan
            dikembalikan ke tab <b>Aktif</b> beserta deal &amp; aktivitasnya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM — strong ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.fullName ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.fullName}</span> akan
            dihapus selamanya beserta deal &amp; aktivitasnya.
          </>
        }
      />

      {/* ===================== NEW CONTACT ===================== */}
      <NewContactModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        companies={companiesQ.data ?? []}
        pending={createContact.isPending}
        onSubmit={(payload) => createContact.mutate(payload)}
      />

      {/* ===================== IMPOR CSV ===================== */}
      <ImportCsvModal
        open={importOpen}
        fileName={importFileName}
        rows={importRows}
        result={importResult}
        pending={importContacts.isPending}
        onClose={() => setImportOpen(false)}
        onConfirm={() => importContacts.mutate(importRows)}
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function StatCard({
  label,
  value,
  hint,
  badge,
  valueClass,
}: {
  label: string;
  value: number | null;
  hint: string;
  badge?: { label: string; style: React.CSSProperties };
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
        {badge && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={badge.style}
          >
            {badge.label}
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

function ContactTableRow({
  contact,
  company,
  occupation,
  industry,
  onOpen,
  onEnrich,
  onDelete,
  enriching,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  /** Resolved PEKERJAAN label (occupation_id → name), or null. */
  occupation: string | null;
  /** Resolved INDUSTRI label (company.industry_id → name), or null. */
  industry: string | null;
  onOpen: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  enriching: boolean;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors hover:bg-muted/40"
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {initialsOf(contact.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{contact.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact.title || "Perorangan"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm">
        {occupation ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info/[0.1] px-2 py-0.5 text-[11px] font-medium text-info">
            {occupation}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">belum diklasifikasi</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm">
        {company ? (
          <div className="min-w-0">
            <p className="truncate text-foreground/80">{company.name}</p>
            {industry ? (
              <p className="truncate text-[11px] text-muted-foreground">{industry}</p>
            ) : (
              <p className="truncate text-[11px] text-muted-foreground/70">industri belum diklasifikasi</p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">
            — <span className="text-[11px]">(perorangan)</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <SegmentBadge segment={contact.segment} />
      </td>
      <td className="px-3 py-3">
        <FitCell score={contact.fitScore} />
      </td>
      <td className="px-3 py-3">
        <EnrichmentChip status={contact.enrichmentStatus} />
      </td>
      <td className="px-3 py-3">
        <SourceBadge source={contact.source} />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {contact.enrichmentStatus === "enriched" ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-primary/40"
            >
              Buka <ChevronRight className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnrich}
              disabled={enriching}
              title="Tandai kontak sebagai ter-enrich (manual, tanpa job)"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold transition-colors hover:border-primary/40 disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> {enriching ? "…" : "Tandai"}
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
  contact,
  company,
  onRestore,
  onPurge,
}: {
  contact: ContactRow;
  company: CompanyRow | null;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
            {initialsOf(contact.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground/80">{contact.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact.title || "Perorangan"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-muted-foreground">
        {company ? company.name : "— (perorangan)"}
      </td>
      <td className="px-3 py-3">
        <SegmentBadge segment={contact.segment} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(contact.deletedAt ?? null)}</td>
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

function ProfileRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  /** Shown (muted/italic) instead of "—" when value is empty — e.g. "belum diklasifikasi". */
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <span className="text-right font-medium text-foreground">{value}</span>
      ) : hint ? (
        <span className="text-right text-[12px] italic text-muted-foreground">{hint}</span>
      ) : (
        <span className="text-right font-medium text-foreground">—</span>
      )}
    </div>
  );
}

function EnrichField({
  color,
  label,
  value,
  source,
  consent,
}: {
  color: string;
  label: string;
  value: string | null;
  source: string;
  consent: string;
}) {
  const consentMeta = CONSENT_META[consent] ?? CONSENT_META.unknown;
  if (!value) {
    return (
      <div className="rounded-lg border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/70">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>{" "}
        — <span className="italic">belum terisi, jalankan Enrich</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          sumber: <span className="font-medium text-foreground/70">{source}</span>
        </span>
      </div>
      <p className="select-all text-[13px] font-medium text-foreground">{value}</p>
      <span
        className={cn(
          "mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          consentMeta.cls,
        )}
      >
        {consentMeta.label}
      </span>
    </div>
  );
}

function DrawerActivities({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: ActivityRow[];
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        className="border-0 py-6"
        title="Gagal memuat aktivitas"
        description="Tidak bisa mengambil timeline kontak ini."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-muted-foreground">
        Belum ada aktivitas. Riwayat email, chat, & perubahan tahap muncul di sini.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {rows.map((a) => (
        <div key={a.id} className="flex gap-2.5 text-[12px]">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary" />
          <div className="min-w-0">
            <p className="text-foreground">{a.title || a.body || a.type}</p>
            <p className="text-[10px] text-muted-foreground">
              {fmtRelID(a.createdAt)} · {a.type}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerDeals({
  loading,
  error,
  rows,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  rows: DealRow[];
  onRetry: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-14 w-full rounded-lg" />;
  }
  if (error) {
    return (
      <ErrorState
        className="border-0 py-6"
        title="Gagal memuat deal"
        description="Tidak bisa mengambil deal terkait kontak ini."
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-muted-foreground">
        Belum ada deal terkait. Buat deal dari Pipeline untuk menautkannya ke kontak ini.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((d) => (
        <Link
          key={d.id}
          href="/pipeline"
          className="flex items-center justify-between rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40"
        >
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-foreground">{d.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {d.status} · {fmtIDR(d.value, d.currency)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
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

// ───────────────────────── new-contact modal ─────────────────────────
// Manual create surface (POST /api/contacts) — centered modal mirroring
// cadence's EnrollModal chrome. companyId is an optional picker over the live
// company list; segment/enrichment default to "unknown"/"none" server-side.

const modalInputCls =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function NewContactModal({
  open,
  onClose,
  companies,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  companies: CompanyRow[];
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState<"unknown" | "b2c" | "b2b">("unknown");
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setWhatsapp("");
    setEmail("");
    setSegment("unknown");
    setTitle("");
    setCompanyId("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSubmit = !!fullName.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      fullName: fullName.trim(),
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      segment,
      title: title.trim() || null,
      companyId: companyId || null,
    });
  }

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name, "id")),
    [companies],
  );

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
          "flex max-h-[88vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <Plus className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Kontak baru</h3>
              <p className="text-[11px] text-muted-foreground">Tambah kontak / lead secara manual</p>
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

        {/* body */}
        <div className="space-y-3.5 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Nama lengkap *</span>
            <input
              autoFocus
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="cth. Budi Santoso"
              className={modalInputCls}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">WhatsApp</span>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="0812…"
                className={modalInputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className={modalInputCls}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Segmen</span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as "unknown" | "b2c" | "b2b")}
              className={cn(modalInputCls, "cursor-pointer")}
            >
              <option value="unknown">Belum diklasifikasi</option>
              <option value="b2c">B2C — perorangan / customer</option>
              <option value="b2b">B2B — partner / perusahaan</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Jabatan</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="cth. Purchasing Manager"
              className={modalInputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Perusahaan (opsional)
            </span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className={cn(modalInputCls, "cursor-pointer")}
            >
              <option value="">— Tanpa perusahaan (perorangan) —</option>
              {sortedCompanies.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {pending ? "Menyimpan…" : "Buat kontak"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── CSV import ─────────────────────────
// Bulk import (B2B & B2C) — client-side template download + a small robust CSV
// parser (quoted fields + embedded commas + CRLF + "" escapes), header-mapped
// (case-insensitive, tolerant of extra/missing columns). The parsed rows preview
// in a modal, then POST /api/contacts/import (dedup + company upsert server-side).

const MAX_IMPORT_ROWS = 1000;

interface ImportRow {
  fullName?: string;
  segment?: string;
  title?: string;
  companyName?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// Case-insensitive header → ImportRow field. Unknown headers are ignored (extra
// columns tolerated); missing columns just leave the field undefined.
const CSV_HEADER_MAP: Record<string, keyof ImportRow> = {
  full_name: "fullName",
  fullname: "fullName",
  name: "fullName",
  nama: "fullName",
  "nama lengkap": "fullName",
  segment: "segment",
  segmen: "segment",
  title: "title",
  jabatan: "title",
  company_name: "companyName",
  company: "companyName",
  perusahaan: "companyName",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  phone: "whatsapp",
  telepon: "whatsapp",
  telp: "whatsapp",
  hp: "whatsapp",
  email: "email",
  notes: "notes",
  note: "notes",
  catatan: "notes",
};

/** Parse CSV text into a matrix of string cells (RFC-4180-ish: quotes, "" escapes,
 *  embedded commas/newlines, CR/LF/CRLF). Fully-blank lines are dropped. */
function parseCsvMatrix(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(cur);
    cur = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || cur.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Matrix → ImportRow[] using the (case-insensitive) header row. */
function parseContactsCsv(text: string): ImportRow[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) return [];
  const keys = matrix[0].map((h) => CSV_HEADER_MAP[h.trim().toLowerCase()]);
  const out: ImportRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const rec: ImportRow = {};
    keys.forEach((key, c) => {
      if (key) rec[key] = (cells[c] ?? "").trim();
    });
    out.push(rec);
  }
  return out;
}

/** Download a ready-to-fill CSV template (blob, client-side) with 2 example rows. */
function downloadTemplate() {
  const lines = [
    "full_name,segment,title,company_name,whatsapp,email,notes",
    "Budi Santoso,b2b,Procurement Manager,PT Maju Jaya,08123456789,budi@majujaya.co.id,ketemu di pameran",
    "Sari,b2c,,,08987654321,sari@gmail.com,minat paket UMKM",
  ];
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-kontak.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ImportCsvModal({
  open,
  fileName,
  rows,
  result,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  rows: ImportRow[];
  result: ImportResult | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const total = rows.length;
  const emptyName = useMemo(() => rows.filter((r) => !r.fullName?.trim()).length, [rows]);
  const willImport = total - emptyName;
  const tooMany = total > MAX_IMPORT_ROWS;
  const preview = rows.slice(0, 5);

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
          "flex max-h-[88vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-soft transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
              <Upload className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Impor kontak dari CSV</h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {fileName || "Pilih file .csv"}
              </p>
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

        {/* body */}
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {result ? (
            /* ── result view ── */
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <ImportStat label="Dibuat" value={result.created} tone="success" />
                <ImportStat label="Dilewati" value={result.skipped} tone="muted" />
                <ImportStat label="Gagal" value={result.errors.length} tone="destructive" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                &quot;Dilewati&quot; = nama kosong atau duplikat (WhatsApp/email sudah ada).
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                  {result.errors.map((er) => (
                    <p key={er.row} className="text-[11px] text-destructive">
                      <b>Baris {er.row + 1}</b>: {er.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── preview view ── */
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[12px]">
                <span>
                  <b className="text-foreground">{total}</b> baris terbaca
                </span>
                <span className="text-success">
                  <b>{willImport}</b> akan diimpor
                </span>
                {emptyName > 0 && (
                  <span className="text-muted-foreground">
                    {emptyName} dilewati (nama kosong)
                  </span>
                )}
              </div>

              {tooMany && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning">
                  Maksimal {MAX_IMPORT_ROWS} baris per impor — pecah file jadi beberapa bagian.
                </p>
              )}

              {total === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
                  Tidak ada baris data. Pastikan file punya header{" "}
                  <code className="rounded bg-muted px-1">full_name,…</code> + minimal 1 baris.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2.5 py-2 font-semibold">Nama</th>
                        <th className="px-2.5 py-2 font-semibold">Seg</th>
                        <th className="px-2.5 py-2 font-semibold">Perusahaan</th>
                        <th className="px-2.5 py-2 font-semibold">WA / Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.map((r, idx) => (
                        <tr key={idx} className={cn(!r.fullName?.trim() && "opacity-50")}>
                          <td className="px-2.5 py-1.5">
                            {r.fullName?.trim() || (
                              <span className="italic text-muted-foreground">(kosong — dilewati)</span>
                            )}
                          </td>
                          <td className="px-2.5 py-1.5 uppercase text-muted-foreground">
                            {r.segment?.trim() || "—"}
                          </td>
                          <td className="truncate px-2.5 py-1.5 text-muted-foreground">
                            {r.companyName?.trim() || "—"}
                          </td>
                          <td className="truncate px-2.5 py-1.5 text-muted-foreground">
                            {r.whatsapp?.trim() || r.email?.trim() || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {total > preview.length && (
                    <p className="border-t border-border bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                      +{total - preview.length} baris lainnya…
                    </p>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Duplikat (WhatsApp/email yang sudah ada) otomatis dilewati. Butuh format?{" "}
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Unduh template
                </button>
                .
              </p>
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {result ? (
            <Button size="sm" onClick={onClose}>
              Tutup
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
                Batal
              </Button>
              <Button size="sm" onClick={onConfirm} disabled={pending || willImport === 0 || tooMany}>
                {pending ? "Mengimpor…" : `Impor ${willImport} kontak`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "muted" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className={cn("text-2xl font-bold tabular-nums", cls)}>{value.toLocaleString("id-ID")}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
