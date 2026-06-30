"use client";

// Profil — Perusahaan & Orang (CRM profiling) FRONTEND. REBUILT into the NEW
// rebuild design language (Coral Sunset, raw Tailwind + shared primitives) to
// match app/(app)/contacts/page.tsx — the old shadcn Card/Tabs/DataTable clutter
// (and the legacy /api/db/* endpoints) are gone. Wired to the NEW M3 / CRM
// backend (no mock data):
//   GET /api/companies                       → companies (company_v2 · industry_id)
//   GET /api/contacts?limit=…                → people (contact · occupation_id)
//   GET /api/taxonomy/industries             → INDUSTRI catalog (resolve industry_id)
//   GET /api/taxonomy/occupations            → PEKERJAAN catalog (resolve occupation_id)
//   GET /api/companies/trashed · /api/contacts/trashed   → the Sampah views
//   DELETE /api/{companies|contacts}/[id]          → SOFT delete (to Sampah)
//   PATCH  /api/{companies|contacts}/[id]/restore   → restore
//   DELETE /api/{companies|contacts}/[id]?purge=1   → HARD delete (permanent)
//
// The point of this page (per the task): SURFACE each company's INDUSTRI and each
// person's PEKERJAAN. Both are taxonomy SOFT REFS stored as ids on the row
// (company.industry_id / contact.occupation_id); we build id → name maps from the
// taxonomy lists to resolve them into human labels (with the company's free-text
// `industry` / the contact's `title` as honest fallbacks, and "belum
// diklasifikasi" when neither exists — never fabricated).
//
// View model: a segmented Perusahaan | Orang toggle (NOT a ContactsTabs bar —
// the Kontak cluster sub-nav is supplied by contacts/layout.tsx) + a Sampah tab.
// Each entity opens a right drawer (AppDrawerRaw) and supports soft-delete /
// restore / hard-delete. Every band has loading + empty + error states. Lives in
// the (app) shell, inside the Kontak cluster subnav.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  Factory,
  Globe,
  Radar,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AppDrawerRaw } from "@/components/shared/app-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PurgeDialog } from "@/components/shared/purge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Row from GET /api/companies (modules/crm · company_v2). */
interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null; // free-text label as captured (fallback)
  industryId: string | null; // soft ref → industry.id (taxonomy · resolved to INDUSTRI)
  size: string | null;
  website: string | null;
  summary: string | null;
  socials: Record<string, string> | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/companies/trashed
}

/** Row from GET /api/contacts (modules/crm · contact). */
interface ContactRow {
  id: string;
  companyId: string | null;
  fullName: string;
  title: string | null;
  occupationId: string | null; // soft ref → occupation.id (taxonomy · resolved to PEKERJAAN)
  department: string | null;
  seniority: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  location: string | null;
  segment: string; // b2c | b2b | unknown
  source: string | null;
  socials: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null; // set on rows from /api/contacts/trashed
}

/** Row from GET /api/taxonomy/{industries|occupations} (modules/taxonomy). */
interface TaxoRow {
  id: string;
  name: string;
  nameEn: string | null;
}

// ── enums / display metadata ─────────────────────────────────────────────────

type MainView = "perusahaan" | "orang";
type Tab = MainView | "sampah";

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

/** Normalise the free-text `source` into one of the known buckets for the dot. */
function sourceBucket(source: string | null): string {
  if (!source) return "—";
  const s = source.toLowerCase();
  if (s.includes("crawl")) return "Crawl";
  if (s.includes("hunter")) return "Hunter";
  if (s.includes("impor") || s.includes("import") || s.includes("csv")) return "Impor";
  if (s.includes("web")) return "Web";
  return source;
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

// ── page ─────────────────────────────────────────────────────────────────────

export default function ProfilesPage() {
  const qc = useQueryClient();

  // live companies + people + the taxonomy catalogs (id → label resolution)
  const companiesQ = useQuery({
    queryKey: ["crm", "companies", "list"],
    queryFn: async () => readJson<CompanyRow[]>(await fetch("/api/companies")),
    retry: false,
  });
  const peopleQ = useQuery({
    queryKey: ["crm", "contacts", "list"],
    queryFn: async () =>
      (await readJson<Page<ContactRow>>(await fetch("/api/contacts?limit=200"))).items,
    retry: false,
  });
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

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);

  const companyById = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);
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

  // ── label resolvers (id → human label, with honest fallbacks) ───────────────
  /** Company INDUSTRI: industry_id → catalog name; else the captured free-text. */
  const industryLabelOf = (c: CompanyRow): string | null =>
    (c.industryId ? industryNameById.get(c.industryId) : null) ?? c.industry ?? null;
  /** Person PEKERJAAN: occupation_id → catalog name; else the job title. */
  const occupationLabelOf = (p: ContactRow): string | null =>
    (p.occupationId ? occupationNameById.get(p.occupationId) : null) ?? p.title ?? null;
  /** A person's company INDUSTRI (via its company.industry_id). */
  const personIndustryLabel = (p: ContactRow): string | null => {
    const co = p.companyId ? companyById.get(p.companyId) : undefined;
    return co ? industryLabelOf(co) : null;
  };

  // ── tabs ─────────────────────────────────────────────────────────────────────
  const [view, setView] = useState<MainView>("perusahaan");
  const [tab, setTab] = useState<Tab>("perusahaan");

  // Trash is lazy (only fetched when the Sampah tab opens), kept warm.
  const trashCompaniesQ = useQuery({
    queryKey: ["crm", "companies", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<CompanyRow[]>(await fetch("/api/companies/trashed")),
    retry: false,
  });
  const trashPeopleQ = useQuery({
    queryKey: ["crm", "contacts", "trashed"],
    enabled: tab === "sampah",
    queryFn: async () => readJson<ContactRow[]>(await fetch("/api/contacts/trashed")),
    retry: false,
  });

  // ── filters (per-view search + a taxonomy filter) ──────────────────────────
  const [search, setSearch] = useState("");
  const [indF, setIndF] = useState<string>("all"); // industry_id | "all"
  const [occF, setOccF] = useState<string>("all"); // occupation_id | "all"

  // Filter options — scoped to the taxonomy ids ACTUALLY in use by the data, so
  // the menu reflects this workspace instead of the full global catalog.
  const industryFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of companies) {
      if (c.industryId && industryNameById.has(c.industryId)) {
        seen.set(c.industryId, industryNameById.get(c.industryId)!);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "id"),
    );
  }, [companies, industryNameById]);
  const occupationFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of people) {
      if (p.occupationId && occupationNameById.has(p.occupationId)) {
        seen.set(p.occupationId, occupationNameById.get(p.occupationId)!);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "id"),
    );
  }, [people, occupationNameById]);

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      const ind = industryLabelOf(c);
      const okInd = indF === "all" || c.industryId === indF;
      const okSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.domain?.toLowerCase().includes(q) ?? false) ||
        (ind?.toLowerCase().includes(q) ?? false);
      return okInd && okSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, indF, search, industryNameById]);

  const visiblePeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      const occ = occupationLabelOf(p);
      const company = p.companyId ? companyById.get(p.companyId)?.name ?? "" : "";
      const okOcc = occF === "all" || p.occupationId === occF;
      const okSearch =
        !q ||
        p.fullName.toLowerCase().includes(q) ||
        company.toLowerCase().includes(q) ||
        (occ?.toLowerCase().includes(q) ?? false);
      return okOcc && okSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, occF, search, companyById, occupationNameById]);

  // ── drawer (a company OR a person) ──────────────────────────────────────────
  const [openRef, setOpenRef] = useState<{ kind: MainView; id: string } | null>(null);
  const activeCompany = useMemo(
    () => (openRef?.kind === "perusahaan" ? companyById.get(openRef.id) ?? null : null),
    [openRef, companyById],
  );
  const activePerson = useMemo(
    () => (openRef?.kind === "orang" ? people.find((p) => p.id === openRef.id) ?? null : null),
    [openRef, people],
  );

  useEffect(() => {
    if (!openRef) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRef(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openRef]);

  // ── confirm targets (soft-delete / restore / hard-delete) ──────────────────
  const [deleteTarget, setDeleteTarget] =
    useState<{ kind: MainView; id: string; label: string } | null>(null);
  const [restoreTarget, setRestoreTarget] =
    useState<{ kind: MainView; id: string; label: string } | null>(null);
  const [purgeTarget, setPurgeTarget] =
    useState<{ kind: MainView; id: string; label: string } | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────
  const pathOf = (kind: MainView) => (kind === "perusahaan" ? "companies" : "contacts");
  function refresh(kind: MainView) {
    qc.invalidateQueries({ queryKey: ["crm", kind === "perusahaan" ? "companies" : "contacts"] });
  }

  const softDelete = useMutation({
    mutationFn: async (t: { kind: MainView; id: string }) =>
      readJson<{ id: string; deleted: boolean }>(
        await fetch(`/api/${pathOf(t.kind)}/${t.id}`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${deleteTarget?.label ?? "Data"}" dipindah ke Sampah`);
      refresh(t.kind);
      setDeleteTarget(null);
      if (openRef?.id === t.id) setOpenRef(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleteTarget(null);
    },
  });

  const restore = useMutation({
    mutationFn: async (t: { kind: MainView; id: string }) =>
      readJson<CompanyRow | ContactRow>(
        await fetch(`/api/${pathOf(t.kind)}/${t.id}/restore`, { method: "PATCH" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${restoreTarget?.label ?? "Data"}" dipulihkan`);
      refresh(t.kind);
      setRestoreTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Gagal memulihkan");
      setRestoreTarget(null);
    },
  });

  const purge = useMutation({
    mutationFn: async (t: { kind: MainView; id: string }) =>
      readJson<{ id: string; purged: boolean }>(
        await fetch(`/api/${pathOf(t.kind)}/${t.id}?purge=1`, { method: "DELETE" }),
      ),
    onSuccess: (_res, t) => {
      toast.success(`"${purgeTarget?.label ?? "Data"}" dihapus permanen`);
      refresh(t.kind);
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus permanen"),
  });

  // ── top-level loading / error ────────────────────────────────────────────────
  const activeQ = view === "perusahaan" ? companiesQ : peopleQ;
  const forbidden =
    (companiesQ.error instanceof Error && companiesQ.error.message === "forbidden") ||
    (peopleQ.error instanceof Error && peopleQ.error.message === "forbidden");

  const trashRows = useMemo(
    () => [
      ...(trashCompaniesQ.data ?? []).map((r) => ({ kind: "perusahaan" as const, row: r })),
      ...(trashPeopleQ.data ?? []).map((r) => ({ kind: "orang" as const, row: r })),
    ],
    [trashCompaniesQ.data, trashPeopleQ.data],
  );

  return (
    <div>
      <PageHeader
        title="Profil — Perusahaan & Orang"
        description="Profiling terpisah: Perusahaan (dengan INDUSTRI) vs Orang (dengan PEKERJAAN). Industri & pekerjaan diklasifikasi AI ke katalog Master Data; klik baris untuk detail."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/master-data">
            <Factory className="h-4 w-4" /> Master Data
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/contacts/discovery">
            <Radar className="h-4 w-4" /> Discovery
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ STAT STRIP ============ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Perusahaan"
            value={companiesQ.isLoading ? null : companies.length}
            hint="akun / organisasi"
          />
          <StatCard
            label="Orang"
            value={peopleQ.isLoading ? null : people.length}
            hint="kontak / lead"
          />
          <StatCard
            label="Industri terpakai"
            value={companiesQ.isLoading || industriesQ.isLoading ? null : industryFilterOptions.length}
            hint="kategori industri aktif"
          />
          <StatCard
            label="Pekerjaan terpakai"
            value={peopleQ.isLoading || occupationsQ.isLoading ? null : occupationFilterOptions.length}
            hint="kategori pekerjaan aktif"
          />
        </section>

        {/* ============ TABS: Perusahaan | Orang | Sampah ============ */}
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton
            active={tab === "perusahaan"}
            onClick={() => {
              setTab("perusahaan");
              setView("perusahaan");
            }}
          >
            <Building2 className="h-4 w-4" />
            Perusahaan
            <CountPill>{companiesQ.isLoading ? "…" : companies.length}</CountPill>
          </TabButton>
          <TabButton
            active={tab === "orang"}
            onClick={() => {
              setTab("orang");
              setView("orang");
            }}
          >
            <Users className="h-4 w-4" />
            Orang
            <CountPill>{peopleQ.isLoading ? "…" : people.length}</CountPill>
          </TabButton>
          <TabButton active={tab === "sampah"} onClick={() => setTab("sampah")} className="ml-auto">
            <Trash2 className="h-4 w-4" />
            Sampah
            {trashRows.length > 0 && (
              <span className="rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                {trashRows.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "sampah" ? (
          /* ============ SAMPAH (trash) view ============ */
          <TrashView
            loading={trashCompaniesQ.isLoading || trashPeopleQ.isLoading}
            error={trashCompaniesQ.isError || trashPeopleQ.isError}
            rows={trashRows}
            companyById={companyById}
            onRetry={() => {
              trashCompaniesQ.refetch();
              trashPeopleQ.refetch();
            }}
            onRestore={(kind, row, label) => setRestoreTarget({ kind, id: row.id, label })}
            onPurge={(kind, row, label) => setPurgeTarget({ kind, id: row.id, label })}
          />
        ) : (
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* TOOLBAR: per-view taxonomy filter + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
              {view === "perusahaan" ? (
                <FilterSelect
                  icon={Factory}
                  value={indF}
                  onChange={setIndF}
                  disabled={industriesQ.isLoading || industryFilterOptions.length === 0}
                  allLabel="Industri: Semua"
                  options={industryFilterOptions}
                />
              ) : (
                <FilterSelect
                  icon={Briefcase}
                  value={occF}
                  onChange={setOccF}
                  disabled={occupationsQ.isLoading || occupationFilterOptions.length === 0}
                  allLabel="Pekerjaan: Semua"
                  options={occupationFilterOptions}
                />
              )}

              <div className="relative ml-auto w-52">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    view === "perusahaan" ? "Cari nama / domain / industri…" : "Cari nama / perusahaan / pekerjaan…"
                  }
                  className="h-7 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-2.5 text-xs focus:border-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>

              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">
                  {view === "perusahaan" ? visibleCompanies.length : visiblePeople.length}
                </b>{" "}
                hasil
              </span>
            </div>

            {/* BODY: loading / error / empty / table */}
            {activeQ.isLoading || industriesQ.isLoading || occupationsQ.isLoading ? (
              <TableLoading />
            ) : activeQ.isError ? (
              <ErrorState
                className="border-0"
                title={forbidden ? "Tidak punya akses" : "Gagal memuat profil"}
                description={
                  forbidden
                    ? "Akun kamu tidak punya izin baca data (data.read). Hubungi admin workspace."
                    : "Tidak bisa mengambil data. Pastikan kamu login & database tersedia."
                }
                onRetry={() => activeQ.refetch()}
              />
            ) : view === "perusahaan" ? (
              companies.length === 0 ? (
                <EmptyState
                  className="border-0"
                  icon={Building2}
                  title="Belum ada perusahaan"
                  description="Perusahaan muncul setelah Discovery / crawl B2B. Saat enrichment jalan, AI mengklasifikasikan industrinya ke katalog Master Data."
                  action={
                    <Button asChild size="sm">
                      <Link href="/contacts/discovery">
                        <Radar className="h-4 w-4" /> Mulai Discovery
                      </Link>
                    </Button>
                  }
                />
              ) : visibleCompanies.length === 0 ? (
                <EmptyState
                  className="border-0"
                  icon={Search}
                  title="Tidak ada perusahaan yang cocok"
                  description="Coba ubah filter industri atau kata kunci."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Perusahaan</th>
                        <th className="px-3 py-3 font-semibold">Industri</th>
                        <th className="px-3 py-3 font-semibold">Domain</th>
                        <th className="px-3 py-3 font-semibold">Sumber</th>
                        <th className="px-3 py-3 font-semibold">Diperbarui</th>
                        <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleCompanies.map((c) => (
                        <CompanyTableRow
                          key={c.id}
                          company={c}
                          industry={industryLabelOf(c)}
                          resolved={!!c.industryId}
                          onOpen={() => setOpenRef({ kind: "perusahaan", id: c.id })}
                          onDelete={() =>
                            setDeleteTarget({ kind: "perusahaan", id: c.id, label: c.name })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : people.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Users}
                title="Belum ada orang"
                description="Kontak per-orang muncul setelah Discovery + enrichment. Saat itu AI mengklasifikasikan pekerjaannya ke katalog Master Data."
                action={
                  <Button asChild size="sm">
                    <Link href="/contacts/discovery">
                      <Radar className="h-4 w-4" /> Mulai Discovery
                    </Link>
                  </Button>
                }
              />
            ) : visiblePeople.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Search}
                title="Tidak ada orang yang cocok"
                description="Coba ubah filter pekerjaan atau kata kunci."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nama</th>
                      <th className="px-3 py-3 font-semibold">Pekerjaan</th>
                      <th className="px-3 py-3 font-semibold">Perusahaan · Industri</th>
                      <th className="px-3 py-3 font-semibold">Segment</th>
                      <th className="px-3 py-3 font-semibold">Sumber</th>
                      <th className="px-3 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visiblePeople.map((p) => (
                      <PersonTableRow
                        key={p.id}
                        person={p}
                        occupation={occupationLabelOf(p)}
                        resolved={!!p.occupationId}
                        company={p.companyId ? companyById.get(p.companyId) ?? null : null}
                        industry={personIndustryLabel(p)}
                        onOpen={() => setOpenRef({ kind: "orang", id: p.id })}
                        onDelete={() =>
                          setDeleteTarget({ kind: "orang", id: p.id, label: p.fullName })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* legend footer */}
            <div className="border-t border-border bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
              {view === "perusahaan" ? (
                <>
                  <b className="text-foreground">Industri</b> diambil dari{" "}
                  <code className="rounded bg-muted px-1">industry_id</code> (katalog Master Data);
                  bila belum diklasifikasi, dipakai label industri mentah hasil crawl, atau{" "}
                  <i>belum diklasifikasi</i>.
                </>
              ) : (
                <>
                  <b className="text-foreground">Pekerjaan</b> diambil dari{" "}
                  <code className="rounded bg-muted px-1">occupation_id</code> (katalog Master Data);
                  bila belum diklasifikasi, dipakai jabatan mentah, atau <i>belum diklasifikasi</i>.
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ===================== RIGHT DRAWER — COMPANY ===================== */}
      <AppDrawerRaw
        open={openRef?.kind === "perusahaan" && !!activeCompany}
        onClose={() => setOpenRef(null)}
        title={activeCompany?.name ?? "Detail perusahaan"}
        widthClassName="w-[400px] max-w-full"
      >
        {activeCompany && (
          <CompanyDrawer
            company={activeCompany}
            industry={industryLabelOf(activeCompany)}
            resolved={!!activeCompany.industryId}
            peopleCount={people.filter((p) => p.companyId === activeCompany.id).length}
            onClose={() => setOpenRef(null)}
            onDelete={() =>
              setDeleteTarget({ kind: "perusahaan", id: activeCompany.id, label: activeCompany.name })
            }
          />
        )}
      </AppDrawerRaw>

      {/* ===================== RIGHT DRAWER — PERSON ===================== */}
      <AppDrawerRaw
        open={openRef?.kind === "orang" && !!activePerson}
        onClose={() => setOpenRef(null)}
        title={activePerson?.fullName ?? "Detail orang"}
        widthClassName="w-[400px] max-w-full"
      >
        {activePerson && (
          <PersonDrawer
            person={activePerson}
            occupation={occupationLabelOf(activePerson)}
            resolvedOcc={!!activePerson.occupationId}
            company={activePerson.companyId ? companyById.get(activePerson.companyId) ?? null : null}
            industry={personIndustryLabel(activePerson)}
            onClose={() => setOpenRef(null)}
            onDelete={() =>
              setDeleteTarget({ kind: "orang", id: activePerson.id, label: activePerson.fullName })
            }
          />
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
            <span className="font-medium text-foreground">{deleteTarget?.label}</span> akan dihapus
            dan dipindah ke tab <b>Sampah</b>
            {deleteTarget?.kind === "perusahaan"
              ? " (cascade ke kontak & aktivitasnya)"
              : " (cascade ke deal & aktivitasnya)"}
            . Kamu masih bisa memulihkannya nanti.
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
        title="Pulihkan data?"
        body={
          <>
            <span className="font-medium text-foreground">{restoreTarget?.label}</span> akan
            dikembalikan ke tab aktif beserta data terkaitnya.
          </>
        }
        confirmLabel="Ya, pulihkan"
        confirmPending={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget)}
      />

      {/* ===================== HARD-DELETE (PURGE) CONFIRM ===================== */}
      <PurgeDialog
        open={!!purgeTarget}
        label={purgeTarget?.label ?? ""}
        pending={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purge.mutate(purgeTarget)}
        body={
          <>
            Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
            <span className="font-medium text-foreground">{purgeTarget?.label}</span> akan dihapus
            selamanya beserta data terkaitnya.
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
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        {value == null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <span className="text-2xl font-bold tabular-nums">{value.toLocaleString("id-ID")}</span>
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
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        className,
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

function FilterSelect({
  icon: Icon,
  value,
  onChange,
  options,
  allLabel,
  disabled,
}: {
  icon: typeof Factory;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
  allLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-7 max-w-[220px] cursor-pointer appearance-none truncate rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Resolved taxonomy label chip — info-tinted when resolved from a catalog id,
 *  muted when it's a raw fallback, dashed when nothing is set. */
function TaxoChip({ label, resolved }: { label: string | null; resolved: boolean }) {
  if (!label) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        belum diklasifikasi
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-[200px] items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
        resolved ? "bg-info/[0.1] text-info" : "bg-muted text-muted-foreground",
      )}
      title={resolved ? undefined : "label mentah (belum diklasifikasi ke katalog)"}
    >
      {label}
    </span>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const meta = SEG_BADGE[segment];
  if (!meta) {
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        belum
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={meta.style}>
      {meta.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const bucket = sourceBucket(source);
  if (bucket === "—") return <span className="text-xs text-muted-foreground">—</span>;
  const dot = SOURCE_DOT[bucket] ?? "#6B7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {bucket}
    </span>
  );
}

function DeleteIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Hapus (ke Sampah)"
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function CompanyTableRow({
  company,
  industry,
  resolved,
  onOpen,
  onDelete,
}: {
  company: CompanyRow;
  industry: string | null;
  resolved: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{company.name}</p>
            {company.size && (
              <p className="truncate text-[11px] text-muted-foreground">{company.size}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <TaxoChip label={industry} resolved={resolved} />
      </td>
      <td className="px-3 py-3 text-sm text-foreground/80">{company.domain || "—"}</td>
      <td className="px-3 py-3">
        <SourceBadge source={company.source} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtRelID(company.updatedAt)}</td>
      <td className="px-3 py-3 text-right">
        <DeleteIconButton onClick={onDelete} />
      </td>
    </tr>
  );
}

function PersonTableRow({
  person,
  occupation,
  resolved,
  company,
  industry,
  onOpen,
  onDelete,
}: {
  person: ContactRow;
  occupation: string | null;
  resolved: boolean;
  company: CompanyRow | null;
  industry: string | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition-colors hover:bg-muted/40">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {initialsOf(person.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{person.fullName}</p>
            {person.title && (
              <p className="truncate text-[11px] text-muted-foreground">{person.title}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <TaxoChip label={occupation} resolved={resolved} />
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
        <SegmentBadge segment={person.segment} />
      </td>
      <td className="px-3 py-3">
        <SourceBadge source={person.source} />
      </td>
      <td className="px-3 py-3 text-right">
        <DeleteIconButton onClick={onDelete} />
      </td>
    </tr>
  );
}

function DrawerHeader({
  avatar,
  title,
  subtitle,
  onClose,
}: {
  avatar: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
      <div className="flex min-w-0 items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-foreground">{title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  /** Shown (muted/italic) instead of "—" when value is empty. */
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

/** The drawer band that headlines a resolved taxonomy classification. */
function TaxoBand({
  title,
  label,
  resolved,
  rawHint,
}: {
  title: string;
  label: string | null;
  resolved: boolean;
  /** What the fallback represents when not resolved (e.g. "label industri mentah"). */
  rawHint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        {label ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              resolved ? "bg-info/[0.12] text-info" : "bg-muted text-muted-foreground",
            )}
          >
            {resolved ? "terklasifikasi" : "mentah"}
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            belum
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-foreground">
        {label ?? <span className="italic text-muted-foreground">belum diklasifikasi</span>}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {resolved
          ? "Dari katalog Master Data (klasifikasi AI · bisa di-override di sana)."
          : label
            ? `${rawHint} — belum dipetakan ke katalog Master Data.`
            : "Akan terisi saat enrichment mengklasifikasi entitas ini."}
      </p>
    </div>
  );
}

function CompanyDrawer({
  company,
  industry,
  resolved,
  peopleCount,
  onClose,
  onDelete,
}: {
  company: CompanyRow;
  industry: string | null;
  resolved: boolean;
  peopleCount: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <DrawerHeader
        avatar={
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
            <Building2 className="h-4 w-4" />
          </span>
        }
        title={company.name}
        subtitle={company.domain || "perusahaan"}
        onClose={onClose}
      />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <TaxoBand
          title="Industri"
          label={industry}
          resolved={resolved}
          rawHint="Label industri mentah (hasil crawl)"
        />

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Profil
          </h3>
          <div className="space-y-2 text-[13px]">
            <ProfileRow label="Domain" value={company.domain} />
            <ProfileRow label="Website" value={company.website} />
            <ProfileRow label="Ukuran" value={company.size} />
            <ProfileRow label="Orang terkait" value={peopleCount > 0 ? String(peopleCount) : null} hint="belum ada" />
            <ProfileRow label="Sumber" value={sourceBucket(company.source) === "—" ? null : sourceBucket(company.source)} />
          </div>
        </div>

        {company.summary && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ringkasan
            </h3>
            <p className="rounded-lg border border-border bg-accent/60 p-2.5 text-[12px] leading-relaxed text-foreground/80">
              {company.summary}
            </p>
          </div>
        )}

        {company.socials && Object.keys(company.socials).length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Website / Sosmed
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(company.socials).map(([k, v]) => (
                <a
                  key={k}
                  href={v}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-secondary"
                >
                  <Globe className="h-3 w-3" /> {k}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts">
            <Users className="h-4 w-4" /> Lihat kontak
          </Link>
        </Button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </button>
      </div>
    </>
  );
}

function PersonDrawer({
  person,
  occupation,
  resolvedOcc,
  company,
  industry,
  onClose,
  onDelete,
}: {
  person: ContactRow;
  occupation: string | null;
  resolvedOcc: boolean;
  company: CompanyRow | null;
  industry: string | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <DrawerHeader
        avatar={
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-xs font-semibold text-primary">
            {initialsOf(person.fullName)}
          </span>
        }
        title={person.fullName}
        subtitle={`${person.title || "Perorangan"}${company ? ` · ${company.name}` : ""}`}
        onClose={onClose}
      />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <TaxoBand
          title="Pekerjaan"
          label={occupation}
          resolved={resolvedOcc}
          rawHint="Jabatan mentah (hasil crawl)"
        />

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Profil
          </h3>
          <div className="space-y-2 text-[13px]">
            <ProfileRow label="Jabatan" value={person.title} />
            <ProfileRow label="Perusahaan" value={company ? company.name : "— (perorangan)"} />
            <ProfileRow
              label="Industri (perusahaan)"
              value={industry}
              hint={!company ? "kontak perorangan" : company.industryId ? undefined : "belum diklasifikasi"}
            />
            <ProfileRow label="Departemen" value={person.department} />
            <ProfileRow label="Senioritas" value={person.seniority} />
            <ProfileRow label="Lokasi" value={person.location || person.city} />
            <ProfileRow label="Email" value={person.email} />
            <ProfileRow label="Telepon / WhatsApp" value={person.whatsapp || person.phone} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-[13px] font-semibold text-foreground">Segmen</span>
          <SegmentBadge segment={person.segment} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts">
            <Users className="h-4 w-4" /> Buka di Kontak
          </Link>
        </Button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </button>
      </div>
    </>
  );
}

function TrashView({
  loading,
  error,
  rows,
  companyById,
  onRetry,
  onRestore,
  onPurge,
}: {
  loading: boolean;
  error: boolean;
  rows: Array<{ kind: MainView; row: CompanyRow | ContactRow }>;
  companyById: Map<string, CompanyRow>;
  onRetry: () => void;
  onRestore: (kind: MainView, row: CompanyRow | ContactRow, label: string) => void;
  onPurge: (kind: MainView, row: CompanyRow | ContactRow, label: string) => void;
}) {
  const labelOf = (kind: MainView, row: CompanyRow | ContactRow) =>
    kind === "perusahaan" ? (row as CompanyRow).name : (row as ContactRow).fullName;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
        <span className="text-muted-foreground">
          Perusahaan & orang yang dihapus disimpan di sini. <b>Pulihkan</b> mengembalikannya,{" "}
          <b>Hapus permanen</b> menghapus selamanya.
        </span>
        <span className="ml-auto text-muted-foreground">{rows.length} item</span>
      </div>

      {loading ? (
        <TableLoading />
      ) : error ? (
        <ErrorState
          className="border-0"
          title="Gagal memuat sampah"
          description="Tidak bisa mengambil perusahaan / orang yang dihapus."
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          className="border-0"
          icon={Trash2}
          title="Sampah kosong"
          description="Perusahaan / orang yang kamu hapus muncul di sini dan bisa dipulihkan."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Nama</th>
                <th className="px-3 py-3 font-semibold">Jenis</th>
                <th className="px-3 py-3 font-semibold">Dihapus</th>
                <th className="px-3 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ kind, row }) => {
                const label = labelOf(kind, row);
                const sub =
                  kind === "orang"
                    ? (() => {
                        const cid = (row as ContactRow).companyId;
                        return cid ? companyById.get(cid)?.name ?? null : null;
                      })()
                    : (row as CompanyRow).domain;
                return (
                  <tr key={`${kind}:${row.id}`} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          {kind === "perusahaan" ? (
                            <Building2 className="h-3.5 w-3.5" />
                          ) : (
                            <Users className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground/80">{label}</p>
                          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">
                      {kind === "perusahaan" ? "Perusahaan" : "Orang"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {fmtRelID(row.deletedAt ?? null)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRestore(kind, row, label)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:border-tertiary/50 hover:text-tertiary"
                        >
                          <RotateCcw className="h-3 w-3" /> Pulihkan
                        </button>
                        <button
                          type="button"
                          onClick={() => onPurge(kind, row, label)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-card px-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Hapus permanen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TableLoading() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
