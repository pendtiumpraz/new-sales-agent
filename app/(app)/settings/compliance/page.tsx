"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  Lock,
  Plus,
  Server,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { ConsentBadge } from "@/components/shared/consent-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConsentLog, useDpia, useVendors } from "@/lib/api-mock/hooks";
import { channelMeta } from "@/lib/utils/channel-config";
import {
  formatDateID,
  formatDateTimeID,
  formatRelativeID,
} from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";
import { toast } from "sonner";

const SCORE = 94;

const SOURCE_LABEL: Record<string, string> = {
  event: "Event",
  form: "Form website",
  "wa-optin": "WA opt-in",
};

const RISK: Record<RiskLevel, { label: string; variant: "success" | "warning" | "destructive"; bar: string }> = {
  rendah: { label: "Rendah", variant: "success", bar: "bg-emerald-400" },
  sedang: { label: "Sedang", variant: "warning", bar: "bg-amber-400" },
  tinggi: { label: "Tinggi", variant: "destructive", bar: "bg-rose-400" },
};

const DPIA_STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  selesai: { label: "Selesai", variant: "success" },
  berjalan: { label: "Berjalan", variant: "secondary" },
  "perlu-tinjauan": { label: "Perlu tinjauan", variant: "warning" },
};

const DELETE_QUEUE = [
  { name: "Hendra Wijaya", company: "PT Sinar Mas", requested: 2 },
  { name: "Nurul Aini", company: "CV Mitra Sejahtera", requested: 4 },
  { name: "Bambang Sutrisno", company: "Koperasi Karyawan", requested: 6 },
];

const AUDIT = [
  { actor: "Andi Hidayat (DPO)", action: "membuat Laporan Audit PDPA Q2", when: 0.2 },
  { actor: "Sistem", action: "mencatat opt-in WhatsApp baru (immutable)", when: 0.6 },
  { actor: "Rina Permata", action: "menghapus data 1 kontak (hak hapus)", when: 1.5 },
  { actor: "Sistem", action: "menyelesaikan DPIA: Skoring lead AI", when: 2.4 },
  { actor: "Maya Kusuma (DPO)", action: "meninjau risiko vendor SendGrid", when: 3.1 },
  { actor: "Sistem", action: "memperbarui versi kebijakan ke v2.1", when: 4.0 },
];

const GENERATED_REPORTS = [
  { name: "Laporan Audit PDPA — Q1 2026", date: "31 Mar 2026", size: "1,8 MB" },
  { name: "Log DPIA — Maret 2026", date: "28 Mar 2026", size: "640 KB" },
  { name: "Penilaian Risiko Vendor — 2026", date: "15 Mar 2026", size: "920 KB" },
];

export default function CompliancePage() {
  const { data: consentLog, isLoading } = useConsentLog();
  const { data: dpia } = useDpia();
  const { data: vendors } = useVendors();

  return (
    <div>
      <PageHeader
        title="Kepatuhan UU PDP"
        description="GRC untuk DPO — persetujuan, DPIA, risiko vendor, dan laporan siap-regulator."
      >
        <Button onClick={() => toast.success("Laporan PDPA (PDF) sedang diunduh...")}>
          <Download className="h-4 w-4" />
          Export laporan PDPA
        </Button>
      </PageHeader>

      <div className="p-6">
        <Tabs defaultValue="ringkasan">
          <TabsList className="flex-wrap">
            <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
            <TabsTrigger value="persetujuan">Jejak Persetujuan</TabsTrigger>
            <TabsTrigger value="dpia">DPIA</TabsTrigger>
            <TabsTrigger value="vendor">Risiko Vendor</TabsTrigger>
            <TabsTrigger value="laporan">Laporan</TabsTrigger>
          </TabsList>

          {/* ── Ringkasan ─────────────────────────────────────────────── */}
          <TabsContent value="ringkasan" className="mt-5 space-y-6">
            <div className="grid gap-4 md:grid-cols-[280px_1fr]">
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <ScoreGauge score={SCORE} />
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
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
                <MiniStat label="DPIA aktif" value={`${dpia?.length ?? 0}`} tone="default" />
                <MiniStat label="Vendor dinilai" value={`${vendors?.length ?? 0}`} tone="default" />
              </div>
            </div>

            {/* Trust / Compliance-as-a-Service */}
            <div className="grid gap-4 md:grid-cols-3">
              <TrustCard
                icon={Lock}
                title="Enkripsi AES-256"
                desc="Consent database terenkripsi at-rest & in-transit. Setiap entri immutable."
              />
              <TrustCard
                icon={Server}
                title="Residensi data: AWS Jakarta"
                desc="Data pelanggan disimpan di region ap-southeast-3 (Indonesia)."
              />
              <TrustCard
                icon={UserCog}
                title="DPO terkelola"
                desc="Compliance-as-a-Service: konsultasi DPO & alur hak hapus terkelola."
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* Right-to-delete queue */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Antrean hak hapus data</CardTitle>
                  <Badge variant="warning">{DELETE_QUEUE.length} menunggu</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {DELETE_QUEUE.map((r) => (
                      <li key={r.name} className="flex items-center gap-3 px-6 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
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
                          Proses
                        </Button>
                      </li>
                    ))}
                  </ul>
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
          </TabsContent>

          {/* ── Jejak Persetujuan ─────────────────────────────────────── */}
          <TabsContent value="persetujuan" className="mt-5 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-tertiary/30 bg-tertiary/5 px-4 py-3 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-tertiary" />
              <span className="text-muted-foreground">
                Consent database terenkripsi <strong className="text-foreground">AES-256</strong>.
                Setiap opt-in mencatat timestamp, IP, versi kebijakan, dan sumber —
                membentuk audit log yang <strong className="text-foreground">immutable</strong> per kontak.
              </span>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="scrollbar-thin max-h-[560px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Kontak</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Waktu (WIB)</TableHead>
                        <TableHead>Versi</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading
                        ? Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={7}>
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
                              <TableCell>
                                <span className="flex items-center gap-1.5">
                                  <ChannelDot channel={c.channel} size={8} />
                                  <span className="text-xs text-muted-foreground">
                                    {channelMeta(c.channel).label}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {c.ip}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDateTimeID(c.date)}
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
          </TabsContent>

          {/* ── DPIA ──────────────────────────────────────────────────── */}
          <TabsContent value="dpia" className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Data Protection Impact Assessment per proses bisnis yang mengolah data pribadi.
              </p>
              <Button
                variant="outline"
                onClick={() => toast.success("DPIA baru dibuat — menunggu tinjauan DPO.")}
              >
                <Plus className="h-4 w-4" />
                Buat DPIA
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Proses bisnis</TableHead>
                      <TableHead>Kategori data</TableHead>
                      <TableHead>Risiko</TableHead>
                      <TableHead>Mitigasi</TableHead>
                      <TableHead>DPO</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dpia ?? []).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.process}</TableCell>
                        <TableCell className="text-muted-foreground">{d.dataCategory}</TableCell>
                        <TableCell>
                          <Badge variant={RISK[d.riskLevel].variant}>
                            {RISK[d.riskLevel].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{d.mitigations} kontrol</TableCell>
                        <TableCell className="text-muted-foreground">{d.owner}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateID(d.date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={DPIA_STATUS[d.status].variant}>
                            {DPIA_STATUS[d.status].label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Risiko Vendor ─────────────────────────────────────────── */}
          <TabsContent value="vendor" className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Penilaian risiko pihak ketiga yang memproses data, termasuk status DPA dan residensi data.
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Vendor</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="w-48">Skor risiko</TableHead>
                      <TableHead>DPA</TableHead>
                      <TableHead>Residensi</TableHead>
                      <TableHead>Tinjauan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(vendors ?? []).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.vendor}</TableCell>
                        <TableCell className="text-muted-foreground">{v.category}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", RISK[v.riskLevel].bar)}
                                style={{ width: `${v.riskScore}%` }}
                              />
                            </div>
                            <span className="tnum text-xs text-muted-foreground">{v.riskScore}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {v.dpaSigned ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ada
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Belum
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{v.residency}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeID(v.lastReview)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Laporan ───────────────────────────────────────────────── */}
          <TabsContent value="laporan" className="mt-5">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <ReportGenerator
                consentCount={consentLog?.length ?? 0}
                dpiaCount={dpia?.length ?? 0}
                vendorCount={vendors?.length ?? 0}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Laporan terbaru</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {GENERATED_REPORTS.map((r) => (
                      <li key={r.name} className="flex items-center gap-3 px-6 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                          <FileCheck2 className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.date} · {r.size}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toast.success(`Mengunduh "${r.name}"...`)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ReportGenerator({
  consentCount,
  dpiaCount,
  vendorCount,
}: {
  consentCount: number;
  dpiaCount: number;
  vendorCount: number;
}) {
  const [type, setType] = useState("pdpa-audit");
  const [period, setPeriod] = useState("q2-2026");
  const [state, setState] = useState<"idle" | "generating" | "ready">("idle");

  const TYPES: Record<string, { label: string; includes: string[] }> = {
    "pdpa-audit": {
      label: "Laporan Audit PDPA",
      includes: [
        `${consentCount} entri persetujuan (timestamp + IP + versi)`,
        "Ringkasan hak akses & hak hapus",
        "Jejak audit operasi data",
        "Pernyataan residensi data (AWS Jakarta)",
      ],
    },
    "dpia-log": {
      label: "Log DPIA",
      includes: [`${dpiaCount} DPIA per proses bisnis`, "Tingkat risiko + kontrol mitigasi"],
    },
    "vendor-risk": {
      label: "Penilaian Risiko Vendor",
      includes: [`${vendorCount} vendor pihak ketiga`, "Status DPA + residensi data"],
    },
    "consent-report": {
      label: "Laporan Persetujuan",
      includes: [`${consentCount} entri consent immutable`, "Rincian per sumber & channel"],
    },
  };

  function generate() {
    setState("generating");
    setTimeout(() => {
      setState("ready");
      toast.success("Laporan siap diunduh.");
    }, 900);
  }

  const t = TYPES[type];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat laporan audit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Jenis laporan</label>
            <Select value={type} onValueChange={(v) => { setType(v); setState("idle"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Periode</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="q2-2026">Q2 2026</SelectItem>
                <SelectItem value="q1-2026">Q1 2026</SelectItem>
                <SelectItem value="2025">Tahun 2025</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Termasuk dalam laporan
          </p>
          <ul className="mt-2 space-y-1.5">
            {t.includes.map((inc) => (
              <li key={inc} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
                <span className="text-muted-foreground">{inc}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
          Format siap-regulator — dapat diserahkan langsung ke KOMDIGI / Lembaga PDP.
        </div>

        {state === "ready" ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3">
            <span className="flex items-center gap-2 text-sm">
              <FileCheck2 className="h-4 w-4 text-emerald-700" />
              {t.label} ({period.toUpperCase()}) siap.
            </span>
            <Button size="sm" onClick={() => toast.success("Mengunduh PDF...")}>
              <Download className="h-4 w-4" />
              Unduh PDF
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={generate} disabled={state === "generating"}>
            {state === "generating" ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Menyusun laporan...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate laporan
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#FCE4DC" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#FB5E3B"
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

function TrustCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        </div>
      </CardContent>
    </Card>
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
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-rose-600"
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
