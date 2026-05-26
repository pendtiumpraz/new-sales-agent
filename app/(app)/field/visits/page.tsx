"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisits } from "@/lib/api-mock/hooks";
import { formatDateTimeID } from "@/lib/utils/format-date-id";

const OUTCOME: Record<
  string,
  { label: string; variant: "success" | "warning" | "muted"; icon: typeof CheckCircle2 }
> = {
  berhasil: { label: "Berhasil", variant: "success", icon: CheckCircle2 },
  "tindak-lanjut": { label: "Tindak lanjut", variant: "warning", icon: Clock },
  "tidak-ada": { label: "Tidak ada", variant: "muted", icon: XCircle },
};

export default function VisitsPage() {
  const { data: visits, isLoading } = useVisits();

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

      <div className="p-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sales</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Kota</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Hasil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : (visits ?? []).map((v) => {
                    const o = OUTCOME[v.outcome];
                    const Icon = o.icon;
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.repName}</TableCell>
                        <TableCell>
                          <div>
                            <p>{v.customer}</p>
                            <p className="text-xs text-muted-foreground">{v.company}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{v.type}</TableCell>
                        <TableCell className="text-muted-foreground">{v.city}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTimeID(v.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.variant} className="gap-1">
                            <Icon className="h-3 w-3" />
                            {o.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
