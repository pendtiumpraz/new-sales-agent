"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, Globe, Puzzle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExtStatus {
  connected: boolean;
  ever: boolean;
  lastSeenAt?: string;
  ageSeconds?: number;
  version?: string;
  tokenConfigured?: boolean;
}

function lastSeenLabel(st?: ExtStatus): string {
  if (!st?.lastSeenAt) return "";
  const s = st.ageSeconds ?? 0;
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

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

interface RepAccount {
  token: string;
  linkedinUrl: string | null;
  instagram: string | null;
  lastSeenAt: string | null;
  connected: boolean;
  version?: string | null;
}

export default function ExtensionPage() {
  const qc = useQueryClient();
  const [appUrl] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  // The rep's OWN account: per-rep ingest token + LinkedIn/IG + heartbeat (doc 41).
  const repQ = useQuery({
    queryKey: ["rep-account"],
    queryFn: async () => {
      const r = await fetch("/api/rep/account");
      if (!r.ok) return null;
      return (await r.json()) as RepAccount;
    },
    refetchInterval: 15_000,
  });
  const rep = repQ.data;
  const [li, setLi] = useState("");
  const [ig, setIg] = useState("");
  useEffect(() => {
    if (rep) {
      setLi(rep.linkedinUrl ?? "");
      setIg(rep.instagram ?? "");
    }
  }, [rep?.linkedinUrl, rep?.instagram]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAccounts = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/rep/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: li, instagram: ig }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("Akun sales disimpan");
      qc.invalidateQueries({ queryKey: ["rep-account"] });
    },
    onError: () => toast.error("Gagal menyimpan akun"),
  });
  const regen = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/rep/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      toast.success("Token baru dibuat — tempel ulang ke extension");
      qc.invalidateQueries({ queryKey: ["rep-account"] });
    },
    onError: () => toast.error("Gagal regenerate token"),
  });

  // Banner state derived from the rep's heartbeat.
  const st: ExtStatus | undefined = rep
    ? {
        connected: rep.connected,
        ever: !!rep.lastSeenAt,
        lastSeenAt: rep.lastSeenAt ?? undefined,
        ageSeconds: rep.lastSeenAt ? Math.floor((Date.now() - new Date(rep.lastSeenAt).getTime()) / 1000) : undefined,
        version: rep.version ?? undefined,
        tokenConfigured: !!rep.token,
      }
    : undefined;

  // Layer 2 — is the extension installed in THIS browser? Handshake with the
  // extension's detect.js content script (doc 40). Independent of the token /
  // server heartbeat: tells us "terpasang" even before "terhubung".
  const [browserExt, setBrowserExt] = useState<{ installed: boolean; version?: string }>({ installed: false });
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data as { source?: string; type?: string; version?: string } | null;
      if (d && d.source === "maira-ext" && (d.type === "PONG" || d.type === "HELLO")) {
        setBrowserExt({ installed: true, version: d.version });
      }
    }
    window.addEventListener("message", onMsg);
    // ping a few times — the content script may load just after the page
    const pings = [0, 400, 1200].map((ms) =>
      setTimeout(() => window.postMessage({ source: "maira-app", type: "PING" }, "*"), ms),
    );
    return () => {
      window.removeEventListener("message", onMsg);
      pings.forEach(clearTimeout);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Extension LinkedIn"
        description="Pasang collector di browser Anda untuk crawl lead LinkedIn (RPA) langsung ke workspace ini."
      />
      <div className="max-w-2xl space-y-4 p-6">
        {/* Connection status */}
        <div
          className={
            "flex items-center gap-3 rounded-lg border px-4 py-3 " +
            (st?.connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : st?.ever
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600")
          }
        >
          <span
            className={
              "h-2.5 w-2.5 shrink-0 rounded-full " +
              (st?.connected ? "bg-emerald-500" : st?.ever ? "bg-amber-500" : "bg-slate-400")
            }
          />
          <div className="min-w-0 flex-1 text-sm">
            {st?.connected ? (
              <>
                <b>Terhubung.</b> Extension aktif & mengirim hasil crawl{st?.version ? ` (v${st.version})` : ""}. Terakhir aktif {lastSeenLabel(st)}.
              </>
            ) : st?.ever ? (
              <>
                <b>Pernah terhubung</b>, tapi tidak aktif belakangan ini (terakhir {lastSeenLabel(st)}). Buka extension & klik “Hubungkan”.
              </>
            ) : (
              <>
                <b>Belum terhubung.</b> Setelah dipasang, buka extension → tempel URL + token → klik <b>“Hubungkan &amp; tes koneksi”</b>.
              </>
            )}
          </div>
        </div>

        {/* Layer 2 — installed in this browser (client handshake) */}
        <div className="-mt-2 flex items-center gap-2 px-1 text-xs">
          <Puzzle className={"h-3.5 w-3.5 " + (browserExt.installed ? "text-emerald-600" : "text-slate-400")} />
          {browserExt.installed ? (
            <span className="text-emerald-700">
              Extension terpasang di browser ini{browserExt.version ? ` (v${browserExt.version})` : ""}.
              {!st?.connected && " Tinggal isi token & klik Hubungkan di popup."}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Tidak terdeteksi di browser ini — pasang dari tombol di bawah, atau Anda sedang di browser/komputer lain.
            </span>
          )}
        </div>

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

        {/* Sales account — register LinkedIn/IG + your per-rep token (doc 41) */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Akun sales kamu</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Daftarkan akun LinkedIn/Instagram-mu. Lead hasil crawl pakai token ini otomatis jadi <b>milikmu</b>.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                URL profil LinkedIn
                <input
                  value={li}
                  onChange={(e) => setLi(e.target.value)}
                  placeholder="https://www.linkedin.com/in/namamu"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Username Instagram
                <input
                  value={ig}
                  onChange={(e) => setIg(e.target.value)}
                  placeholder="@namamu"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                />
              </label>
            </div>
            <Button size="sm" onClick={() => saveAccounts.mutate()} disabled={saveAccounts.isPending}>
              {saveAccounts.isPending ? "Menyimpan…" : "Simpan akun"}
            </Button>
          </CardContent>
        </Card>

        {/* Config to paste */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Konfigurasi (tempel ke extension)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <CopyField label="URL aplikasi" value={appUrl} />
            <CopyField label="Ingest token (khusus kamu)" value={rep?.token ?? ""} />
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>Token ini menandai lead crawl sebagai milikmu. Jangan dibagikan.</span>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => regen.mutate()} disabled={regen.isPending}>
                Regenerate
              </Button>
            </div>
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
