"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, Globe, Puzzle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">{value || "—"}</code>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} disalin`);
          }}
          disabled={!value}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function ExtensionPage() {
  const [appUrl] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const tokenQ = useQuery({
    queryKey: ["integration-token"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/integration-token");
      if (!r.ok) return { token: "", configured: false };
      return (await r.json()) as { token: string; configured: boolean };
    },
  });

  return (
    <div>
      <PageHeader
        title="Extension LinkedIn"
        description="Pasang collector di browser Anda untuk crawl lead LinkedIn (RPA) langsung ke workspace ini."
      />
      <div className="max-w-2xl space-y-4 p-6">
        {/* Download */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-primary" /> Unduh
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <a href="/maira-extension.zip" download className="block">
              <div className="flex h-full flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent">
                <Globe className="h-5 w-5 text-primary" />
                <p className="mt-1 text-sm font-semibold">Extension Chrome (.zip)</p>
                <p className="text-xs text-muted-foreground">RPA 3 tahap — paling lengkap.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">Unduh .zip <Download className="h-3.5 w-3.5" /></span>
              </div>
            </a>
            <a href="/maira-userscript.user.js" download className="block">
              <div className="flex h-full flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent">
                <Puzzle className="h-5 w-5 text-primary" />
                <p className="mt-1 text-sm font-semibold">Userscript Tampermonkey</p>
                <p className="text-xs text-muted-foreground">Install paling gampang (paste).</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">Unduh .user.js <Download className="h-3.5 w-3.5" /></span>
              </div>
            </a>
          </CardContent>
        </Card>

        {/* Config to paste */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Konfigurasi (tempel ke extension)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <CopyField label="URL aplikasi" value={appUrl} />
            <CopyField label="Ingest token" value={tokenQ.data?.token ?? ""} />
            {tokenQ.data && !tokenQ.data.configured && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Badge variant="muted" className="mr-1 bg-amber-100 text-amber-700">belum diset</Badge>
                Isi <code>LINKEDIN_INGEST_TOKEN</code> di <code>.env.local</code> / env Vercel, lalu reload.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Install — extension */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Pasang — Extension Chrome</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ol className="space-y-3">
              <Step n={1}>Unduh & ekstrak <code>maira-extension.zip</code> ke satu folder.</Step>
              <Step n={2}>Buka <code>chrome://extensions</code> → aktifkan <b>Developer mode</b> (kanan atas).</Step>
              <Step n={3}>Klik <b>Load unpacked</b> → pilih folder hasil ekstrak.</Step>
              <Step n={4}>Login ke <b>linkedin.com</b> di tab yang sama (extension pakai sesi Anda — tak menyimpan kredensial).</Step>
              <Step n={5}>Klik ikon extension → tempel <b>URL aplikasi</b> + <b>Ingest token</b> di atas → isi query jabatan.</Step>
              <Step n={6}><b>Tahap 1</b> "Mulai cari" (kumpulkan lead), lalu <b>Tahap 2</b> "Enrich profil" (track record). Lead masuk ke <b>Kontak → Profil</b>.</Step>
            </ol>
          </CardContent>
        </Card>

        {/* Install — userscript */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Pasang — Userscript Tampermonkey</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ol className="space-y-3">
              <Step n={1}>Install <a className="text-primary underline" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Tampermonkey</a> di browser.</Step>
              <Step n={2}>Unduh <code>maira-userscript.user.js</code> → Tampermonkey menawarkan <b>Install</b>.</Step>
              <Step n={3}>Menu Tampermonkey → <b>"Maira: set config"</b> → isi URL app + token.</Step>
              <Step n={4}>Buka halaman LinkedIn search/profil → klik tombol melayang <b>➕ Maira</b>.</Step>
            </ol>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Pakai akun LinkedIn sendiri, pelan & dijeda (anti-ban). Hormati ToS LinkedIn & UU PDP.
        </p>
      </div>
    </div>
  );
}
