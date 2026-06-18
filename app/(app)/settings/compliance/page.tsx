"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Lock,
  Plus,
  Server,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { RequireRole } from "@/components/auth/require-role";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompliance } from "@/lib/api-mock/hooks";
import { channelMeta } from "@/lib/utils/channel-config";
import {
  formatDateID,
  formatDateTimeID,
  formatRelativeID,
} from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const SCORE = 94;

const SOURCE_LABEL: Record<string, string> = {
  event: "Event",
  form: "Form website",
  "wa-optin": "WA opt-in",
};

const RISK: Record<RiskLevel, { label: string; variant: "success" | "warning" | "destructive"; bar: string }> = {
  rendah: { label: "Rendah", variant: "success", bar: "bg-success" },
  sedang: { label: "Sedang", variant: "warning", bar: "bg-warning" },
  tinggi: { label: "Tinggi", variant: "destructive", bar: "bg-danger" },
};

const DPIA_STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  selesai: { label: "Selesai", variant: "success" },
  berjalan: { label: "Berjalan", variant: "secondary" },
  "perlu-tinjauan": { label: "Perlu tinjauan", variant: "warning" },
};

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
  return (
    // Compliance is a per-controller obligation → open to the DPO roles
    // (Owner/Admin/Manager), not just the platform Superadmin.
    <RequireRole
      allow={["Superadmin", "Admin", "Sales Manager"]}
      message="Halaman kepatuhan untuk DPO (Owner / Admin / Manajer)."
    >
      <CompliancePageInner />
    </RequireRole>
  );
}

function CompliancePageInner() {
  const comp = useCompliance();
  const isLoading = comp.isLoading;
  const dpiaLoading = comp.isLoading;
  const vendorsLoading = comp.isLoading;
  const consentLog = comp.data?.consentLog;
  const dpia = comp.data?.dpia;
  const vendors = comp.data?.vendors;
  const deletionQueue = comp.data?.deletionQueue ?? [];

  // Consent breakdown computed from the REAL log, not hardcoded (the headline
  // used to claim 78/18/4% while the audit log itself told a different story).
  const consentPct = useMemo(() => {
    const log = consentLog ?? [];
    const n = log.length;
    const pct = (s: string) => (n > 0 ? Math.round((log.filter((c) => c.status === s).length / n) * 100) : 0);
    return { consented: pct("consented"), pending: pct("pending"), none: pct("none") };
  }, [consentLog]);

  return (
    <div>
      <PageHeader
        title="Kepatuhan UU PDP"
        description="GRC untuk DPO — persetujuan, DPIA, risiko vendor, dan laporan siap-regulator."
      >
        <Button asChild>
          <Link href="/settings/compliance/dsar">
            <Download className="h-4 w-4" />
            Export data (DSAR)
          </Link>
        </Button>
      </PageHeader>

      {/* Hero strip — success-green gradient for a GRC page */}
      <div className="relative overflow-hidden border-b bg-gradient-to-r from-success/15 via-tertiary/10 to-primary/8 px-6 py-4">
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-success/25 blur-3xl" />
        <div className="absolute -left-6 -bottom-12 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-white shadow-[0_8px_20px_-8px_rgba(16,185,129,0.55)]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              UU PDP No. 27/2022 · skor kepatuhan {SCORE}/100
            </p>
            <p className="text-xs text-muted-foreground">
              Audit-ready. Compliance-as-a-Service untuk DPO modern.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              AES-256 at rest
            </Badge>
            <Badge variant="default" className="gap-1 bg-tertiary/15 text-tertiary">
              <Server className="h-3 w-3" />
              ap-southeast-3
            </Badge>
          </div>
        </div>
      </div>

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
                <MiniStat label="Kontak disetujui" value={`${consentPct.consented}%`} tone="success" />
                <MiniStat label="Menunggu persetujuan" value={`${consentPct.pending}%`} tone="warning" />
                <MiniStat label="Tanpa izin" value={`${consentPct.none}%`} tone="danger" />
                <MiniStat label="Permintaan hapus" value={`${deletionQueue.length}`} tone="default" />
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
                tone="primary"
              />
              <TrustCard
                icon={Server}
                title="Residensi data: AWS Jakarta"
                desc="Data pelanggan disimpan di region ap-southeast-3 (Indonesia)."
                tone="tertiary"
              />
              <TrustCard
                icon={UserCog}
                title="DPO terkelola"
                desc="Compliance-as-a-Service: konsultasi DPO & alur hak hapus terkelola."
                tone="info"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* Right-to-delete queue */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Antrean hak hapus data</CardTitle>
                  <Badge variant="warning">{deletionQueue.length} menunggu</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  {deletionQueue.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                      Tidak ada permintaan hapus tertunda.
                    </p>
                  ) : (
                  <ul className="divide-y">
                    {deletionQueue.map((r, i) => (
                      <li key={`${r.label}-${i}`} className="flex items-center gap-3 px-6 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.detail} · {formatRelativeID(r.at)}
                          </p>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="sm" variant="outline" disabled>
                                  Tolak
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Mode demo — alur penolakan belum terhubung backend
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button size="sm" asChild>
                          <Link href="/settings/compliance/dsar">Proses di DSAR</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                  )}
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
                            <TableRow key={c.id} className="even:bg-tertiary/[0.04] hover:bg-primary/[0.04]">
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button variant="outline" disabled>
                        <Plus className="h-4 w-4" />
                        Buat DPIA
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Mode demo — pembuatan DPIA belum terhubung backend
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
                    {dpiaLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={7}>
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : (dpia ?? []).map((d) => (
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
                    {vendorsLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={6}>
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : (vendors ?? []).map((v) => (
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
                            <span className="flex items-center gap-1 text-xs text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ada
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-warning">
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="icon" variant="ghost" disabled>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Mode demo — berkas contoh, unduhan belum tersedia
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
            <Select value={type} onValueChange={setType}>
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
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Format siap-regulator — dapat diserahkan langsung ke KOMDIGI / Lembaga PDP.
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          Mode demo — penyusun PDF templat belum terhubung. Export data subjek
          (JSON, live) tersedia di DSAR.
        </p>

        <Button className="w-full" asChild>
          <Link href="/settings/compliance/dsar">
            <Download className="h-4 w-4" />
            Export data di DSAR
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative h-40 w-40">
      {/* Soft halo behind the gauge for extra pop */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-success/20 via-tertiary/10 to-primary/15 blur-xl" />
      <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="score-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="55%" stopColor="#14B8A6" />
            <stop offset="100%" stopColor="#FB5E3B" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(20 80% 95%)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#score-stroke)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="bg-gradient-to-br from-emerald-600 via-tertiary to-primary bg-clip-text text-4xl font-bold tnum text-transparent">
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function TrustCard({
  icon: Icon,
  title,
  desc,
  tone = "tertiary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tone?: "primary" | "tertiary" | "info";
}) {
  const palette =
    tone === "primary"
      ? { iconBg: "bg-primary text-primary-foreground", border: "border-l-primary" }
      : tone === "info"
        ? { iconBg: "bg-info text-white", border: "border-l-info" }
        : { iconBg: "bg-tertiary text-tertiary-foreground", border: "border-l-tertiary" };
  return (
    <Card className={cn("overflow-hidden border-l-4 transition-shadow hover:shadow-md", palette.border)}>
      <CardContent className="flex gap-3 p-5">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm", palette.iconBg)}>
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
  const palette =
    tone === "success"
      ? {
          text: "text-success",
          bar: "bg-gradient-to-r from-success/70 to-tertiary/70",
          border: "border-success/25",
          tint: "from-success/10 to-transparent",
        }
      : tone === "warning"
        ? {
            text: "text-warning",
            bar: "bg-gradient-to-r from-amber-400 to-amber-500",
            border: "border-warning/25",
            tint: "from-warning/10 to-transparent",
          }
        : tone === "danger"
          ? {
              text: "text-danger",
              bar: "bg-gradient-to-r from-rose-400 to-rose-500",
              border: "border-destructive/25",
              tint: "from-destructive/10 to-transparent",
            }
          : {
              text: "text-foreground",
              bar: "bg-gradient-to-r from-tertiary/70 to-primary/70",
              border: "border-tertiary/20",
              tint: "from-tertiary/8 to-transparent",
            };
  return (
    <Card className={cn("relative overflow-hidden border", palette.border)}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", palette.tint)} />
      <CardContent className="relative p-4">
        <p className={`text-2xl font-semibold tnum ${palette.text}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        <div className={cn("mt-2 h-1 w-10 rounded-full", palette.bar)} />
      </CardContent>
    </Card>
  );
}
