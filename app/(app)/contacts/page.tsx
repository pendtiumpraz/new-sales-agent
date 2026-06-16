"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Contact as ContactIcon,
  Download,
  Eye,
  Flame,
  Mail,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Radar,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ContactQualityBar } from "@/components/contacts/contact-quality-bar";
import { ChannelDot } from "@/components/shared/channel-dot";
import { ConsentBadge } from "@/components/shared/consent-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TempBadge } from "@/components/shared/temp-badge";
import { ContactDetailSheet } from "@/components/contacts/contact-detail-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ProspectingPanel } from "@/components/prospecting/prospecting-panel";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import { useCadences, useContacts, useConversations } from "@/lib/api-mock/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { leadScore } from "@/lib/utils/lead-score";
import { cn } from "@/lib/utils";
import type { Contact, ConsentStatus } from "@/lib/types";
import { toast } from "sonner";

const CONSENT_LABEL: Record<ConsentStatus, string> = {
  consented: "Disetujui",
  pending: "Menunggu",
  none: "Tanpa izin",
};

export default function ContactsPage() {
  // useSearchParams requires a Suspense boundary at the page level (Next 14
  // static-prerender constraint). The inner component reads the query string.
  return (
    <Suspense fallback={<div className="p-6">Memuat kontak...</div>}>
      <ContactsPageInner />
    </Suspense>
  );
}

function ContactsPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: contacts, isLoading } = useContacts();
  const { data: conversations } = useConversations();
  const { data: cadences } = useCadences();
  // Live counts from the prospecting store so the Penemuan Lead tab can
  // expose how many candidate leads + how many fresh inbound need attention.
  const prospectsCount = useProspectingStore((s) => s.prospects.length);
  const newInboundCount = useProspectingStore(
    (s) => s.inbound.filter((i) => i.status === "baru").length,
  );
  const [search, setSearch] = useState("");
  const [industries, setIndustries] = useState<Set<string>>(new Set());
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [consents, setConsents] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([]);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cadencePickerOpen, setCadencePickerOpen] = useState(false);
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>("");
  const [enrolling, setEnrolling] = useState(false);

  const activeCadences = useMemo(
    () => (cadences ?? []).filter((c) => c.status === "active"),
    [cadences],
  );

  async function enrollSelected() {
    if (!selectedCadenceId) {
      toast.error("Pilih cadence terlebih dahulu.");
      return;
    }
    const contactIds = Array.from(selected);
    if (contactIds.length === 0) return;
    setEnrolling(true);
    try {
      const res = await fetch("/api/db/cadence-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadenceId: selectedCadenceId,
          contactIds,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        count?: number;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const cad = activeCadences.find((c) => c.id === selectedCadenceId);
      toast.success(
        `${json.count ?? contactIds.length} kontak didaftarkan ke ${cad?.name ?? "cadence"}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["cadences"] });
      await queryClient.invalidateQueries({ queryKey: ["cadenceEnrollments"] });
      setSelected(new Set());
      setCadencePickerOpen(false);
      setSelectedCadenceId("");
    } catch (err) {
      console.error("[contacts enroll]", err);
      toast.error("Gagal mendaftarkan kontak ke cadence.");
    } finally {
      setEnrolling(false);
    }
  }

  // Wave 3 — side-nav profile dock links to `/contacts?view=inbox`. When that
  // is active, sort contacts with unread WA messages first and show a banner.
  const view = searchParams.get("view");
  const inboxView = view === "inbox";

  // Discovery tab folds the legacy /prospecting page into Contacts. Persisted
  // in the URL so deep links from /prospecting (which redirects) land correctly.
  const activeTab = searchParams.get("tab") === "discovery" ? "discovery" : "contacts";
  function setTab(next: "contacts" | "discovery") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "contacts") params.delete("tab");
    else params.set("tab", "discovery");
    const qs = params.toString();
    router.push(qs ? `/contacts?${qs}` : "/contacts");
  }

  // Unread map (contactId -> total unread across channels) drives the inbox sort.
  const unreadByContact = useMemo(() => {
    const m = new Map<string, number>();
    (conversations ?? []).forEach((c) => {
      m.set(c.contactId, (m.get(c.contactId) ?? 0) + c.unread);
    });
    return m;
  }, [conversations]);

  const allIndustries = useMemo(
    () => uniq((contacts ?? []).map((c) => c.industry)).sort(),
    [contacts],
  );
  const allCities = useMemo(
    () => uniq((contacts ?? []).map((c) => c.city)).sort(),
    [contacts],
  );

  const filtered = useMemo(() => {
    let list = contacts ?? [];
    if (industries.size) list = list.filter((c) => industries.has(c.industry));
    if (cities.size) list = list.filter((c) => cities.has(c.city));
    if (consents.size) list = list.filter((c) => consents.has(c.consent));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q),
      );
    }
    if (inboxView) {
      // Sort by unread desc, then last activity desc — surfaces the contacts
      // that need a reply right now.
      list = list.slice().sort((a, b) => {
        const ua = unreadByContact.get(a.id) ?? 0;
        const ub = unreadByContact.get(b.id) ?? 0;
        if (ua !== ub) return ub - ua;
        return (
          new Date(b.lastActivity).getTime() -
          new Date(a.lastActivity).getTime()
        );
      });
    }
    return list;
  }, [contacts, industries, cities, consents, search, inboxView, unreadByContact]);

  // Auto-focus a contact passed via ?focus=ct_XXXX (opens the sheet).
  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId || !contacts) return;
    const target = contacts.find((c) => c.id === focusId);
    if (target) {
      setDetail(target);
      setSheetOpen(true);
    }
  }, [searchParams, contacts]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nama",
        cell: ({ row }) => {
          const unread = unreadByContact.get(row.original.id) ?? 0;
          return (
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <UserAvatar
                  name={row.original.name}
                  color={row.original.avatarColor}
                  className="h-8 w-8 text-[11px]"
                />
                {unread > 0 && inboxView && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground ring-2 ring-card">
                    {unread}
                  </span>
                )}
              </div>
              <span className="font-medium">{row.original.name}</span>
            </div>
          );
        },
      },
      { accessorKey: "company", header: "Perusahaan" },
      {
        accessorKey: "title",
        header: "Jabatan",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "channelPreference",
        header: "Channel",
        cell: ({ getValue }) => {
          const ch = getValue<string>();
          const meta = channelMeta(ch);
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
              style={{
                borderColor: `${meta.color}40`,
                backgroundColor: `${meta.color}14`,
                color: meta.color,
              }}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              {meta.label}
            </span>
          );
        },
      },
      {
        id: "aiScore",
        accessorFn: (c) => leadScore(c).score,
        header: "Skor AI",
        cell: ({ row }) => {
          const { score, temp } = leadScore(row.original);
          return <TempBadge score={score} temp={temp} />;
        },
      },
      {
        accessorKey: "lastActivity",
        header: "Aktivitas",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {formatRelativeID(getValue<string>())}
          </span>
        ),
      },
      {
        accessorKey: "consent",
        header: "Persetujuan",
        cell: ({ getValue }) => (
          <ConsentBadge status={getValue<ConsentStatus>()} />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            contact={row.original}
            onPreview={(c) => {
              setDetail(c);
              setSheetOpen(true);
            }}
          />
        ),
      },
    ],
    [unreadByContact, inboxView],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const pageRows = table.getRowModel().rows;
  const pageIds = pageRows.map((r) => r.original.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  /**
   * Wave 3 default: clicking a row opens the unified workspace. The classic
   * detail sheet remains available via the row-level overflow menu and the
   * `?focus=ct_XXXX` URL param (preserves backward compatibility for any
   * existing deep links).
   */
  function openWorkspace(c: Contact) {
    router.push(`/workspace/${c.id}`);
  }

  function openHero() {
    // Header CTA — opens the workspace for whichever contact has the most
    // recent unread activity, falling back to the first contact in the list.
    const candidates = (contacts ?? []).slice().sort((a, b) => {
      const ua = unreadByContact.get(a.id) ?? 0;
      const ub = unreadByContact.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      return (
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    });
    const target = candidates[0];
    if (!target) {
      toast.error("Belum ada kontak untuk dibuka di workspace.");
      return;
    }
    router.push(`/workspace/${target.id}`);
  }

  function exportCsv() {
    const rows = filtered.filter((c) => selected.has(c.id));
    const header = "Nama,Perusahaan,Jabatan,Email,Channel,Persetujuan";
    const body = rows
      .map((c) =>
        [c.name, c.company, c.title, c.email, channelMeta(c.channelPreference).label, CONSENT_LABEL[c.consent]]
          .map((v) => `"${v}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kontak.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} kontak diekspor ke CSV.`);
  }

  const headerTitle =
    activeTab === "discovery"
      ? "Kontak · Penemuan Lead"
      : inboxView
        ? "Kontak — fokus inbox"
        : "Kontak";
  const headerDescription =
    activeTab === "discovery"
      ? "Temukan lead baru, perkaya datanya, lalu kirim ke CRM atau cadence outbound."
      : inboxView
        ? `${unreadByContact.size} kontak dengan aktivitas terbaru. Pesan belum dibaca diutamakan.`
        : `${(contacts ?? []).length} kontak dalam database Anda. Klik baris untuk membuka workspace terpadu.`;

  // KPI pills shown in the coral hero strip.
  const totalContacts = (contacts ?? []).length;
  const sevenDaysAgo = Date.now() - 7 * 864e5;
  const newThisWeek = (contacts ?? []).filter(
    (c) => +new Date(c.lastActivity) >= sevenDaysAgo,
  ).length;
  const inCadence = (cadences ?? []).reduce(
    (s, c) => s + (c.status === "active" ? c.enrolled : 0),
    0,
  );
  const hotCount = (contacts ?? []).filter(
    (c) => leadScore(c).temp === "panas",
  ).length;

  return (
    <div>
      <PageHeader title={headerTitle} description={headerDescription}>
        <Link
          href="/contacts/profiles"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Users className="h-4 w-4" />
          Profil
        </Link>
        {activeTab === "contacts" && (
          <>
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Tambah kontak
            </Button>
            <Button onClick={openHero}>
              <Sparkles className="h-4 w-4" />
              Buka workspace terpadu
            </Button>
          </>
        )}
      </PageHeader>

      {/* Email-quality bar (real validation stats + re-validate) — contacts tab */}
      {activeTab === "contacts" && (
        <div className="px-6 pt-4">
          <ContactQualityBar />
        </div>
      )}

      {/* Coral hero strip — KPI pills (contacts tab only) */}
      {activeTab === "contacts" && (
        <div className="relative overflow-hidden border-b bg-gradient-to-r from-primary/12 via-primary/6 to-tertiary/8 px-6 py-4">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -left-4 -bottom-12 h-32 w-32 rounded-full bg-tertiary/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-2">
            <KpiPill
              icon={Users}
              label="Total kontak"
              value={totalContacts}
              tone="coral"
            />
            <KpiPill
              icon={CalendarClock}
              label="Aktif 7 hari"
              value={newThisWeek}
              tone="teal"
            />
            <KpiPill
              icon={Sparkles}
              label="Dalam cadence"
              value={inCadence}
              tone="amber"
            />
            <KpiPill
              icon={Flame}
              label="Lead panas"
              value={hotCount}
              tone="rose"
            />
          </div>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setTab(v as "contacts" | "discovery")}
      >
        <div className="border-b bg-gradient-to-r from-primary/5 via-card to-tertiary/5 px-6 pt-3">
          <TabsList className="h-11 gap-2 bg-transparent p-0">
            <TabsTrigger
              value="contacts"
              className="group h-10 gap-2 rounded-lg border border-transparent bg-transparent px-4 text-sm font-medium text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <ContactIcon className="h-4 w-4" />
              <span>Kontak</span>
              <span className="tnum rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary">
                {(contacts ?? []).length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="discovery"
              className="group h-10 gap-2 rounded-lg border border-transparent bg-transparent px-4 text-sm font-medium text-muted-foreground transition-all hover:border-tertiary/30 hover:bg-tertiary/8 hover:text-tertiary data-[state=active]:border-tertiary/40 data-[state=active]:bg-gradient-to-r data-[state=active]:from-tertiary/15 data-[state=active]:to-primary/8 data-[state=active]:text-tertiary data-[state=active]:shadow-sm"
            >
              <Radar className="h-4 w-4" />
              <span>Penemuan Lead</span>
              <span className="tnum rounded-full bg-tertiary/15 px-1.5 py-0.5 text-[10px] font-semibold text-tertiary group-data-[state=active]:bg-tertiary group-data-[state=active]:text-white">
                {prospectsCount}
              </span>
              {newInboundCount > 0 && (
                <span className="ml-0.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
              )}
            </TabsTrigger>
          </TabsList>
          <p className="-mt-1 pb-2 pl-1 text-[11px] text-muted-foreground">
            {activeTab === "contacts" ? (
              <>
                <ContactIcon className="mr-1 inline h-3 w-3" />
                Database kontak Anda — sudah divalidasi dan masuk pipeline
              </>
            ) : (
              <>
                <Wand2 className="mr-1 inline h-3 w-3 text-tertiary" />
                <span className="font-medium text-tertiary">Crawl web · Validasi · Perkaya · Promosikan ke CRM</span>
                {newInboundCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    {newInboundCount} inbound baru
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        <TabsContent value="discovery" className="m-0">
          <ProspectingPanel embedded />
        </TabsContent>

        <TabsContent value="contacts" className="m-0">
          {/* Inbox view banner — explains the sort + offers a quick exit */}
          {inboxView && (
            <div className="relative flex items-center gap-2 overflow-hidden border-b bg-gradient-to-r from-tertiary/20 via-primary/8 to-transparent px-6 py-3 text-xs">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-tertiary/25 blur-2xl" />
              <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary text-tertiary-foreground shadow-sm">
                <MessagesSquare className="h-4 w-4" />
              </span>
              <span className="relative flex-1 font-medium">
                Daftar diurutkan berdasarkan pesan belum dibaca. Klik kontak untuk
                membuka workspace terpadu — chat + prospek + enrichment.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="relative h-7 text-xs hover:bg-primary/10 hover:text-primary"
                onClick={() => router.push("/contacts")}
              >
                Tampilkan semua
              </Button>
            </div>
          )}

          <div className="flex">
        {/* Filter sidebar — tinted sections per group */}
        <aside className="hidden w-60 shrink-0 space-y-4 border-r bg-card p-4 lg:block">
          <FilterGroup
            title="Status persetujuan"
            options={["consented", "pending", "none"].map((v) => ({
              value: v,
              label: CONSENT_LABEL[v as ConsentStatus],
            }))}
            selected={consents}
            onToggle={(v) => toggleInSet(setConsents, v)}
            tone="green"
          />
          <FilterGroup
            title="Industri"
            options={allIndustries.map((v) => ({ value: v, label: v }))}
            selected={industries}
            onToggle={(v) => toggleInSet(setIndustries, v)}
            tone="teal"
          />
          <FilterGroup
            title="Kota"
            options={allCities.map((v) => ({ value: v, label: v }))}
            selected={cities}
            onToggle={(v) => toggleInSet(setCities, v)}
            tone="amber"
          />
        </aside>

        {/* Table area */}
        <div className="min-w-0 flex-1 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, perusahaan, jabatan..."
                className="pl-8"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filtered.length} hasil
            </span>
          </div>

          {/* Bulk action bar — coral-tinted when active */}
          {selected.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-tertiary/5 px-4 py-2.5 text-sm shadow-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-xs font-semibold">
                <Sparkles className="h-3 w-3" />
                {selected.size} dipilih
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => {
                    setSelectedCadenceId(activeCadences[0]?.id ?? "");
                    setCadencePickerOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Ke cadence
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-tertiary/30 bg-tertiary/5 text-tertiary hover:bg-tertiary/10 hover:text-tertiary"
                  onClick={exportCsv}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={togglePage} />
                  </TableHead>
                  {table.getHeaderGroups()[0].headers.map((h) => (
                    <TableHead key={h.id}>
                      <button
                        className="flex items-center gap-1.5 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.id !== "actions" && (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Tidak ada kontak yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((row) => {
                    const unread = unreadByContact.get(row.original.id) ?? 0;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "cursor-pointer transition-colors even:bg-muted/30 hover:bg-primary/[0.06]",
                          inboxView && unread > 0 && "bg-tertiary/10 hover:bg-tertiary/15",
                        )}
                        data-state={
                          selected.has(row.original.id) ? "selected" : undefined
                        }
                        onClick={() => openWorkspace(row.original)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(row.original.id)}
                            onCheckedChange={() => toggleSel(row.original.id)}
                          />
                        </TableCell>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            onClick={
                              cell.column.id === "actions"
                                ? (e) => e.stopPropagation()
                                : undefined
                            }
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Halaman {table.getState().pagination.pageIndex + 1} dari{" "}
              {table.getPageCount()}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Berikutnya
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

        </TabsContent>
      </Tabs>

      <ContactDetailSheet contact={detail} open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* PDPA-aware delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-danger" />
              Hapus {selected.size} kontak?
            </DialogTitle>
            <DialogDescription>
              Sesuai UU PDP, data pribadi akan dihapus permanen beserta riwayat
              persetujuan dan jejak komunikasinya. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                toast.success(`${selected.size} kontak dihapus sesuai UU PDP.`);
                setSelected(new Set());
                setDeleteOpen(false);
              }}
            >
              Hapus permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cadence picker — bulk enroll selected contacts into an active cadence */}
      <Dialog open={cadencePickerOpen} onOpenChange={setCadencePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgba(251,94,59,0.6)]">
                <Mail className="h-4 w-4" />
              </span>
              Daftarkan {selected.size} kontak ke cadence
            </DialogTitle>
            <DialogDescription>
              Pilih salah satu cadence aktif. Kontak akan masuk ke langkah pertama
              dan terhitung di counter "{`{enrolled}`}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cadence aktif
            </label>
            {activeCadences.length === 0 ? (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                Belum ada cadence aktif. Buat dan aktifkan satu di halaman{" "}
                <button
                  className="underline"
                  onClick={() => router.push("/cadences/new")}
                >
                  Cadence
                </button>
                .
              </p>
            ) : (
              <>
                <Select
                  value={selectedCadenceId}
                  onValueChange={setSelectedCadenceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cadence" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCadences.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.steps.length} langkah · {c.enrolled} terdaftar
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Colorful preview list — selected cadence gets coral border */}
                <ul className="space-y-1.5">
                  {activeCadences.map((c) => {
                    const firstCh = c.channelMix[0] ?? "whatsapp";
                    const meta = channelMeta(firstCh);
                    const isActive = c.id === selectedCadenceId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedCadenceId(c.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border-l-4 border-y border-r bg-card px-3 py-2 text-left text-sm transition-all hover:shadow-sm",
                            isActive
                              ? "bg-primary/5 ring-1 ring-primary/30"
                              : "hover:bg-muted/40",
                          )}
                          style={{ borderLeftColor: meta.color }}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            <meta.icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.steps.length} langkah · {c.enrolled} terdaftar
                            </p>
                          </div>
                          <div className="flex gap-1">
                            {c.channelMix.slice(0, 3).map((ch) => (
                              <ChannelDot key={ch} channel={ch} size={8} />
                            ))}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCadencePickerOpen(false)}
              disabled={enrolling}
            >
              Batal
            </Button>
            <Button
              onClick={enrollSelected}
              disabled={
                enrolling || !selectedCadenceId || activeCadences.length === 0
              }
            >
              <Plus className="h-4 w-4" />
              Daftarkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowActions({
  contact,
  onPreview,
}: {
  contact: Contact;
  onPreview: (c: Contact) => void;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => router.push(`/workspace/${contact.id}`)}>
          <Sparkles className="h-4 w-4" />
          Buka workspace terpadu
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPreview(contact)}>
          <Eye className="h-4 w-4" />
          Pratinjau cepat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            toast.success(`${contact.name} ditambahkan ke cadence.`)
          }
        >
          <Mail className="h-4 w-4" />
          Tambah ke cadence
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  tone = "neutral",
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  tone?: "green" | "teal" | "amber" | "neutral";
}) {
  const palette = {
    green: {
      bg: "bg-success/8",
      border: "border-success/20",
      bar: "bg-success",
      title: "text-emerald-700",
      pill: "bg-success/15 text-emerald-700",
    },
    teal: {
      bg: "bg-tertiary/8",
      border: "border-tertiary/20",
      bar: "bg-tertiary",
      title: "text-tertiary",
      pill: "bg-tertiary/15 text-tertiary",
    },
    amber: {
      bg: "bg-warning/10",
      border: "border-warning/20",
      bar: "bg-warning",
      title: "text-amber-700",
      pill: "bg-warning/20 text-amber-700",
    },
    neutral: {
      bg: "bg-muted/30",
      border: "border-muted",
      bar: "bg-muted-foreground/40",
      title: "text-muted-foreground",
      pill: "bg-muted text-muted-foreground",
    },
  }[tone];

  return (
    <div className={cn("rounded-xl border p-3", palette.bg, palette.border)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-3 w-1 rounded-full", palette.bar)} />
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              palette.title,
            )}
          >
            {title}
          </p>
        </div>
        {selected.size > 0 && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold tnum",
              palette.pill,
            )}
          >
            {selected.size}
          </span>
        )}
      </div>
      <div className="scrollbar-thin max-h-44 space-y-1.5 overflow-y-auto pr-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-card/80"
          >
            <Checkbox
              checked={selected.has(o.value)}
              onCheckedChange={() => onToggle(o.value)}
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function KpiPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "coral" | "teal" | "amber" | "rose";
}) {
  const palette = {
    coral: {
      bg: "bg-primary text-primary-foreground",
      surround: "border-primary/25 bg-card",
      text: "text-primary",
    },
    teal: {
      bg: "bg-tertiary text-tertiary-foreground",
      surround: "border-tertiary/25 bg-card",
      text: "text-tertiary",
    },
    amber: {
      bg: "bg-warning text-white",
      surround: "border-warning/25 bg-card",
      text: "text-amber-700",
    },
    rose: {
      bg: "bg-rose-500 text-white",
      surround: "border-rose-300/40 bg-card",
      text: "text-rose-600",
    },
  }[tone];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 shadow-sm",
        palette.surround,
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full",
          palette.bg,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={cn("text-sm font-bold tnum", palette.text)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function toggleInSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  value: string,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}
