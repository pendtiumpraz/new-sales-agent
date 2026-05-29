"use client";

import { Download, FileText, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConsentBadge } from "@/components/shared/consent-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConsentLog } from "@/lib/api-mock/hooks";
import { formatDateID, formatRelativeID } from "@/lib/utils/format-date-id";
import { toast } from "sonner";

const SCORE = 94;

const SOURCE_LABEL: Record<string, string> = {
  event: "Event",
  form: "Form website",
  "wa-optin": "WA opt-in",
};

const DELETE_QUEUE = [
  { name: "Hendra Wijaya", company: "PT Sinar Mas", requested: 2 },
  { name: "Nurul Aini", company: "CV Mitra Sejahtera", requested: 4 },
  { name: "Bambang Sutrisno", company: "Koperasi Karyawan", requested: 6 },
];

const AUDIT = [
  { actor: "Andi Hidayat", action: "mengekspor 24 kontak ke CSV", when: 0.2 },
  { actor: "Sistem", action: "memperbarui versi kebijakan ke v2.1", when: 0.8 },
  { actor: "Rina Permata", action: "menghapus data 1 kontak (UU PDP)", when: 1.5 },
  { actor: "Teguh Saputra", action: "menambahkan 50 kontak ke cadence", when: 2.1 },
  { actor: "Sistem", action: "mencatat opt-in WhatsApp baru", when: 3.0 },
  { actor: "Maya Kusuma", action: "mengubah preferensi channel kontak", when: 4.4 },
  { actor: "Andi Hidayat", action: "mengakses log persetujuan", when: 5.2 },
];

export default function CompliancePage() {
  const { data: consentLog, isLoading } = useConsentLog();

  return (
    <div>
      <PageHeader
        title="Kepatuhan UU PDP"
        description="Pantau persetujuan, hak hapus, dan jejak audit data pelanggan."
      >
        <Button onClick={() => toast.success("Laporan PDPA (PDF) sedang diunduh...")}>
          <Download className="h-4 w-4" />
          Export laporan PDPA
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Score + summary */}
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-6">
              <ScoreGauge score={SCORE} />
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
                <ShieldCheck className="h-4 w-4" />
                Sangat baik
              </p>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Skor kepatuhan UU PDP No. 27/2022
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MiniStat label="Kontak disetujui" value="78%" tone="success" />
            <MiniStat label="Menunggu persetujuan" value="18%" tone="warning" />
            <MiniStat label="Tanpa izin" value="4%" tone="danger" />
            <MiniStat label="Permintaan hapus" value="3" tone="default" />
            <MiniStat label="Versi kebijakan" value="v2.1" tone="default" />
            <MiniStat label="Audit 30 hari" value="248" tone="default" />
          </div>
        </div>

        {/* Right-to-delete queue */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Antrean permintaan hapus data</CardTitle>
            <Badge variant="warning">{DELETE_QUEUE.length} menunggu</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {DELETE_QUEUE.map((r) => (
                <li key={r.name} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.company} · diminta {r.requested} hari lalu
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toast.success(`Permintaan ${r.name} ditolak.`)}
                  >
                    Tolak
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => toast.success(`Data ${r.name} dihapus sesuai UU PDP.`)}
                  >
                    Proses hapus
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Consent log */}
          <Card>
            <CardHeader>
              <CardTitle>Log persetujuan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Kontak</TableHead>
                      <TableHead>Sumber</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Versi</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={5}>
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : (consentLog ?? []).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.contactName}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {SOURCE_LABEL[c.source]}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateID(c.date)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{c.version}</TableCell>
                            <TableCell>
                              <ConsentBadge status={c.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Audit trail */}
          <Card>
            <CardHeader>
              <CardTitle>Jejak audit</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {AUDIT.map((a, i) => (
                  <li key={i} className="flex items-start gap-3 px-6 py-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.actor}</span> {a.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeID(
                          new Date(Date.now() - a.when * 864e5).toISOString(),
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#442132" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#ffbcd9"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tnum">{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "default";
}) {
  const color =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-rose-300"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-2xl font-semibold tnum ${color}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
