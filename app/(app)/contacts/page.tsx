"use client";

import { useMemo, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { ConsentBadge } from "@/components/shared/consent-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useContacts } from "@/lib/api-mock/hooks";
import { channelMeta } from "@/lib/utils/channel-config";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import type { Contact, ConsentStatus } from "@/lib/types";
import { toast } from "sonner";

const CONSENT_LABEL: Record<ConsentStatus, string> = {
  consented: "Disetujui",
  pending: "Menunggu",
  none: "Tanpa izin",
};

export default function ContactsPage() {
  const { data: contacts, isLoading } = useContacts();
  const [search, setSearch] = useState("");
  const [industries, setIndustries] = useState<Set<string>>(new Set());
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [consents, setConsents] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([]);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    return list;
  }, [contacts, industries, cities, consents, search]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nama",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <UserAvatar
              name={row.original.name}
              color={row.original.avatarColor}
              className="h-8 w-8 text-[11px]"
            />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
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
          return (
            <span className="flex items-center gap-1.5">
              <ChannelDot channel={ch} size={8} />
              <span className="text-muted-foreground">{channelMeta(ch).label}</span>
            </span>
          );
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
    ],
    [],
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

  function openContact(c: Contact) {
    setDetail(c);
    setSheetOpen(true);
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

  return (
    <div>
      <PageHeader title="Kontak" description={`${(contacts ?? []).length} kontak dalam database Anda.`}>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Tambah kontak
        </Button>
      </PageHeader>

      <div className="flex">
        {/* Filter sidebar */}
        <aside className="hidden w-60 shrink-0 space-y-5 border-r bg-card p-4 lg:block">
          <FilterGroup
            title="Status persetujuan"
            options={["consented", "pending", "none"].map((v) => ({
              value: v,
              label: CONSENT_LABEL[v as ConsentStatus],
            }))}
            selected={consents}
            onToggle={(v) => toggleInSet(setConsents, v)}
          />
          <FilterGroup
            title="Industri"
            options={allIndustries.map((v) => ({ value: v, label: v }))}
            selected={industries}
            onToggle={(v) => toggleInSet(setIndustries, v)}
          />
          <FilterGroup
            title="Kota"
            options={allCities.map((v) => ({ value: v, label: v }))}
            selected={cities}
            onToggle={(v) => toggleInSet(setCities, v)}
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

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border bg-secondary/60 px-4 py-2.5 text-sm">
              <span className="font-medium">{selected.size} dipilih</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success(`${selected.size} kontak ditambahkan ke cadence.`)}>
                  <Plus className="h-4 w-4" />
                  Ke cadence
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv}>
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
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Tidak ada kontak yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      data-state={selected.has(row.original.id) ? "selected" : undefined}
                      onClick={() => openContact(row.original)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(row.original.id)}
                          onCheckedChange={() => toggleSel(row.original.id)}
                        />
                      </TableCell>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
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
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="scrollbar-thin max-h-44 space-y-1.5 overflow-y-auto pr-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 text-sm"
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
