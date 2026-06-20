"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, Clock, XCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Toolbar } from "@/components/shared/toolbar";
import { DataTable, type DataColumn } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVisits } from "@/lib/api-mock/hooks";
import { formatDateTimeID } from "@/lib/utils/format-date-id";
import type { Visit } from "@/lib/types";

const OUTCOME: Record<
  string,
  { label: string; variant: "success" | "warning" | "muted"; icon: typeof CheckCircle2 }
> = {
  berhasil: { label: "Berhasil", variant: "success", icon: CheckCircle2 },
  "tindak-lanjut": { label: "Tindak lanjut", variant: "warning", icon: Clock },
  "tidak-ada": { label: "Tidak ada", variant: "muted", icon: XCircle },
};

export default function VisitsPage() {
  const { data: visits, isLoading, isError, refetch } = useVisits();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = visits ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? list.filter((v) =>
          `${v.repName} ${v.customer} ${v.company} ${v.city} ${v.type}`
            .toLowerCase()
            .includes(s),
        )
      : list;
  }, [visits, search]);

  const columns: DataColumn<Visit>[] = [
    {
      key: "rep",
      header: "Sales",
      sortValue: (v) => v.repName.toLowerCase(),
      cell: (v) => <span className="font-medium">{v.repName}</span>,
    },
    {
      key: "customer",
      header: "Pelanggan",
      sortValue: (v) => v.customer.toLowerCase(),
      cell: (v) => (
        <div>
          <p>{v.customer}</p>
          <p className="text-xs text-muted-foreground">{v.company}</p>
        </div>
      ),
    },
    { key: "type", header: "Jenis", cell: (v) => <span className="text-muted-foreground">{v.type}</span> },
    { key: "city", header: "Kota", sortValue: (v) => v.city.toLowerCase(), cell: (v) => <span className="text-muted-foreground">{v.city}</span> },
    {
      key: "time",
      header: "Waktu",
      align: "right",
      sortValue: (v) => new Date(v.timestamp).getTime(),
      cell: (v) => <span className="text-xs text-muted-foreground">{formatDateTimeID(v.timestamp)}</span>,
    },
    {
      key: "outcome",
      header: "Hasil",
      cell: (v) => {
        // Fallback guard — an outcome value outside the map must not crash the row.
        const o = OUTCOME[v.outcome] ?? { label: v.outcome || "—", variant: "muted" as const, icon: XCircle };
        const Icon = o.icon;
        return (
          <Badge variant={o.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {o.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Log Kunjungan" description="Riwayat kunjungan tim lapangan.">
        <Button variant="outline" asChild>
          <Link href="/field">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke peta
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-3 p-6">
        {isError ? (
          <ErrorState
            title="Gagal memuat kunjungan"
            description="Terjadi kendala saat mengambil log kunjungan."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            <Toolbar
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Cari sales / pelanggan / kota…"
            />
            <DataTable
              columns={columns}
              data={filtered}
              rowKey={(v) => v.id}
              loading={isLoading}
              pageSize={12}
              emptyIcon={ClipboardList}
              emptyTitle={search ? "Tidak ada kunjungan yang cocok" : "Belum ada kunjungan"}
              emptyDescription={
                search ? undefined : "Kunjungan yang dicatat tim lapangan akan muncul di sini."
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
