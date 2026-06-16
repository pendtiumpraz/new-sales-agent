"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, Radar, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrawlProgressDialog, type CrawlStatus } from "@/components/contacts/crawl-progress-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Job {
  id: string;
  kind: string;
  status: string;
  posture: string;
  input?: Record<string, unknown> | null;
  result:
    | (Record<string, unknown> & {
        created?: number;
        contactsCreated?: number;
        peopleCreated?: number;
        name?: string;
        note?: string;
        crawled?: { name: string; domain: string | null; contacts: number }[];
        linkedinQueries?: string[];
      })
    | null;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

interface DiscoveryCompany {
  name: string;
  why: string;
  domainGuess?: string;
}
interface DiscoveryPlan {
  field: string;
  location: string;
  roles: string[];
  industries: string[];
  companies: DiscoveryCompany[];
  linkedinQueries: string[];
  googleDorks: string[];
  keywords: string[];
  note: string;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hr lalu`;
}

const STATUS_CLS: Record<string, string> = {
  done: "bg-success/10 text-success",
  pending: "bg-info/10 text-info",
  error: "bg-destructive/10 text-destructive",
};

export default function DiscoveryPage() {
  const qc = useQueryClient();
  const jobs = useQuery({
    queryKey: ["crawl-jobs"],
    queryFn: async () => {
      const r = await fetch("/api/discovery");
      if (!r.ok) throw new Error();
      return ((await r.json()).data ?? []) as Job[];
    },
  });
  // Extension is the PRIMARY discovery engine (RPA in the rep's own session).
  const ext = useQuery({
    queryKey: ["rep-account"],
    queryFn: async () => {
      const r = await fetch("/api/rep/account");
      if (!r.ok) return null;
      return (await r.json()) as { connected: boolean; lastSeenAt: string | null };
    },
  });

  const workspaceId = useSearchParams().get("workspace"); // tag crawled leads to this workspace (doc 44)
  const [posture, setPosture] = useState("compliant");
  const [names, setNames] = useState("");
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");

  // AI discovery (find people by field, target Indonesia)
  const [field, setField] = useState("");
  const [location, setLocation] = useState("Indonesia");
  const [seniority, setSeniority] = useState("");
  const plan = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/discovery/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, location, seniority }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "failed");
      return j.plan as DiscoveryPlan;
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Disalin");
  };
  const linkedinSearchUrl = (q: string) =>
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}&origin=GLOBAL_SEARCH_HEADER`;

  const run = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, posture, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "failed");
      return j as {
        status: string;
        created: number;
        contactsCreated?: number;
        peopleCreated?: number;
        result?: { emails?: number; phones?: number; socials?: number; name?: string; hunter?: boolean } | null;
      };
    },
    onSuccess: (j) => {
      if (j.status !== "done") {
        toast.success("Job antri (menunggu crawler)");
      } else if ((j.contactsCreated ?? 0) > 0 || (j.peopleCreated ?? 0) > 0) {
        const ppl = (j.peopleCreated ?? 0) > 0 ? `, ${j.peopleCreated} orang (Hunter)` : "";
        toast.success(
          `Crawl selesai — ${j.result?.name ?? "perusahaan"}: ${j.contactsCreated ?? 0} kontak (${j.result?.emails ?? 0} email, ${j.result?.phones ?? 0} telp)${ppl}`,
        );
      } else {
        toast.success(`Selesai — ${j.created} perusahaan dibuat`);
      }
      qc.invalidateQueries({ queryKey: ["crawl-jobs"] });
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });

  const [detailJob, setDetailJob] = useState<Job | null>(null);

  // Crawl progress modal (URL tab + AI candidate-company crawl)
  const [crawlModalOpen, setCrawlModalOpen] = useState(false);
  const [crawlTarget, setCrawlTarget] = useState("");
  const startCrawl = (rawUrl: string) => {
    const u = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    setCrawlTarget(u);
    setCrawlModalOpen(true);
    run.mutate({ kind: "url", url: u });
  };
  const crawlStatus: CrawlStatus = run.isPending ? "pending" : run.isError ? "error" : run.isSuccess ? "success" : "idle";
  const crawlResult = run.data
    ? {
        name: run.data.result?.name,
        emails: run.data.result?.emails,
        phones: run.data.result?.phones,
        socials: run.data.result?.socials,
        contacts: run.data.contactsCreated,
        people: run.data.peopleCreated,
      }
    : null;

  const PostureSelect = (
    <div className="space-y-1">
      <Label className="text-xs">Posture</Label>
      <Select value={posture} onValueChange={setPosture}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="compliant">compliant</SelectItem>
          <SelectItem value="balanced">balanced</SelectItem>
          <SelectItem value="aggressive">aggressive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div>
      <PageHeader title="Discovery" description="Crawl lead lewat extension (RPA + AI websearch) — datanya diambil di browser kamu, dikirim ke platform.">
        <Link href="/contacts/profiles" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
          Lihat Profil
        </Link>
      </PageHeader>
      <div className="space-y-4 p-6">
        {workspaceId && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <Radar className="h-4 w-4 text-primary" />
            <span>Crawl untuk <b>workspace ini</b> — lead hasil crawl otomatis ditandai ke workspace.</span>
            <Link href="/contacts/discovery" className="ml-auto text-xs text-primary hover:underline">Lepas workspace</Link>
          </div>
        )}
        {/* Extension = the PRIMARY discovery engine (data plane in the browser). */}
        <Card className="border-primary/30">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" /> Crawl via Extension (utama)
              {ext.data?.connected ? (
                <Badge className="ml-auto bg-success/10 text-success">Terhubung</Badge>
              ) : (
                <Badge variant="muted" className="ml-auto">Belum terhubung</Badge>
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Extension di browser kamu yang ngambil data (RPA scrape + AI websearch) → buffer di localStorage → kirim ke platform.
              Platform cuma simpan + CRM. (Vercel serverless gak bisa crawl sendiri.)
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {[
                ["LinkedIn", true],
                ["Google", false],
                ["Instagram", false],
                ["Shopee", false],
                ["Tokopedia", false],
                ["TikTok", false],
                ["AI Websearch (DeepSeek)", false],
              ].map(([label, on]) => (
                <span
                  key={label as string}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (on ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")
                  }
                >
                  {label as string}
                  {on ? "" : " · segera"}
                </span>
              ))}
            </div>
            <Link
              href="/settings/extension"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="h-4 w-4" /> {ext.data?.connected ? "Buka pengaturan extension" : "Pasang & hubungkan extension"}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base"><Radar className="h-4 w-4 text-primary" /> Crawl server-side (web &amp; Hunter)</CardTitle>
            <p className="text-[11px] text-muted-foreground">Pelengkap: crawl website PT (URL) + Hunter + rencana AI. Terbatas timeout serverless — untuk orang/sosmed pakai extension.</p>
          </CardHeader>
          <CardContent className="p-4">
            <Tabs defaultValue="ai">
              <TabsList>
                <TabsTrigger value="ai" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> AI Orang</TabsTrigger>
                <TabsTrigger value="bulk">Daftar nama</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="industry">Bidang</TabsTrigger>
                <TabsTrigger value="auto">Auto</TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cari <b>orang per-bidang</b> target Indonesia. AI menyusun rencana (titel jabatan, industri, kandidat PT,
                  query LinkedIn) — <b>orang aslinya</b> diambil lewat extension LinkedIn / crawl, bukan dikarang AI.
                </p>
                <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
                  <div className="space-y-1">
                    <Label className="text-xs">Bidang / pekerjaan</Label>
                    <Input value={field} onChange={(e) => setField(e.target.value)} placeholder="mis. logistik, dokter gigi, HRD manufaktur" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lokasi target</Label>
                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Indonesia / Jakarta / Surabaya" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Seniority</Label>
                    <Select value={seniority || "all"} onValueChange={(v) => setSeniority(v === "all" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua</SelectItem>
                        <SelectItem value="junior">Junior</SelectItem>
                        <SelectItem value="mid">Mid</SelectItem>
                        <SelectItem value="senior">Senior</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button disabled={!field.trim() || plan.isPending} onClick={() => plan.mutate()}>
                  <Sparkles className="h-4 w-4" /> {plan.isPending ? "Menyusun rencana…" : "Buat rencana discovery"}
                </Button>

                {plan.data && (
                  <div className="space-y-4 rounded-lg border bg-card p-4">
                    {/* LinkedIn queries — the money action: feed extension Stage 1 */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Query LinkedIn (Tahap 1 extension)</p>
                      <div className="space-y-1.5">
                        {plan.data.linkedinQueries.map((q) => (
                          <div key={q} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate">{q}</span>
                            <a href={linkedinSearchUrl(q)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                              Buka LinkedIn <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(q)}><Copy className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">Buka query → jalankan <b>Tahap 1</b> di popup extension untuk crawl semua orangnya.</p>
                    </div>

                    {/* Candidate companies — crawl to get real contacts */}
                    {plan.data.companies.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kandidat perusahaan (verifikasi dengan crawl)</p>
                        <div className="space-y-1.5">
                          {plan.data.companies.map((c) => (
                            <div key={c.name} className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{c.name}{c.domainGuess ? <span className="ml-1 font-normal text-muted-foreground">· {c.domainGuess}</span> : null}</p>
                                {c.why && <p className="text-[11px] text-muted-foreground">{c.why}</p>}
                              </div>
                              {c.domainGuess && (
                                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={run.isPending}
                                  onClick={() => startCrawl(c.domainGuess!)}>
                                  <Radar className="h-3.5 w-3.5" /> Crawl
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Roles + keywords + dorks as copyable chips */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plan.data.roles.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Titel jabatan</p>
                          <div className="flex flex-wrap gap-1.5">
                            {plan.data.roles.map((r) => <Badge key={r} variant="muted" className="cursor-pointer" onClick={() => copy(r)}>{r}</Badge>)}
                          </div>
                        </div>
                      )}
                      {plan.data.industries.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Industri</p>
                          <div className="flex flex-wrap gap-1.5">
                            {plan.data.industries.map((i) => <Badge key={i} variant="muted">{i}</Badge>)}
                          </div>
                        </div>
                      )}
                    </div>
                    {plan.data.googleDorks.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Google dork</p>
                        <div className="space-y-1">
                          {plan.data.googleDorks.map((d) => (
                            <div key={d} className="flex items-center gap-2 rounded bg-muted px-2 py-1 font-mono text-[11px]">
                              <span className="min-w-0 flex-1 truncate">{d}</span>
                              <a href={`https://www.google.com/search?q=${encodeURIComponent(d)}`} target="_blank" rel="noreferrer" className="text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /></a>
                              <button onClick={() => copy(d)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] italic text-muted-foreground">{plan.data.note}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bulk" className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nama perusahaan (satu per baris)</Label>
                  <Textarea rows={5} value={names} onChange={(e) => setNames(e.target.value)} placeholder={"PT Astra International\nTokopedia\nBank Mandiri"} />
                </div>
                {PostureSelect}
                <Button disabled={!names.trim() || run.isPending} onClick={() => run.mutate({ kind: "bulk", names: names.split("\n") })}>
                  {run.isPending ? "Memproses…" : "Cari (buat perusahaan)"}
                </Button>
              </TabsContent>

              <TabsContent value="url" className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">URL website company</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.perusahaan.co.id" />
                </div>
                {PostureSelect}
                <Button disabled={!url.trim() || run.isPending} onClick={() => startCrawl(url)}>
                  {run.isPending ? "Crawling…" : "Crawl sekarang"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Crawl website <span className="font-medium">nyata</span> (server-side): ekstrak email, telepon, & sosmed dari halaman publik (homepage, /contact, /about). Situs full-JS mungkin perlu extension.
                </p>
              </TabsContent>

              <TabsContent value="industry" className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bidang / industri (disaring ICP product)</Label>
                  <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Logistik" />
                </div>
                {PostureSelect}
                <Button disabled={!industry.trim() || run.isPending} onClick={() => run.mutate({ kind: "industry", industry })}>Antri crawl</Button>
              </TabsContent>

              <TabsContent value="auto" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">AI nyari kandidat dari target market & ICP product.</p>
                {PostureSelect}
                <Button disabled={run.isPending} onClick={() => run.mutate({ kind: "auto" })}>Antri auto-discovery</Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Riwayat crawl</CardTitle>
            <p className="text-[11px] text-muted-foreground">Tiap job jalan langsung di server (tanpa antrian/cron). Klik baris untuk detail.</p>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(jobs.data ?? []).map((j) => {
                const target =
                  (j.input?.url as string) ||
                  (Array.isArray(j.input?.names) ? `${(j.input!.names as string[]).length} nama` : "") ||
                  (j.input?.industry as string) ||
                  j.kind;
                return (
                  <li key={j.id}>
                    <button onClick={() => setDetailJob(j)} className="flex w-full items-center gap-3 p-3 text-left text-sm transition-colors hover:bg-accent">
                      <Badge variant="muted">{j.kind}</Badge>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-foreground">{target}</span>
                        <span className="text-muted-foreground">
                          {typeof j.result?.contactsCreated === "number" ? ` · ${j.result.contactsCreated} kontak` : typeof j.result?.created === "number" ? ` · ${j.result.created} dibuat` : ""}
                          {j.createdAt ? ` · ${relTime(j.createdAt)}` : ""}
                        </span>
                      </span>
                      <Badge className={STATUS_CLS[j.status] ?? "bg-muted text-muted-foreground"}>{j.status}</Badge>
                    </button>
                  </li>
                );
              })}
              {jobs.isError && <li className="p-3 text-xs text-destructive">Gagal memuat riwayat crawl.</li>}
              {(jobs.data?.length ?? 0) === 0 && !jobs.isLoading && !jobs.isError && (
                <li className="p-3 text-xs text-muted-foreground">Belum ada crawl. Mulai dari tab di atas.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Job detail */}
      <Dialog open={!!detailJob} onOpenChange={(v) => !v && setDetailJob(null)}>
        <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="muted">{detailJob?.kind}</Badge>
              <Badge className={STATUS_CLS[detailJob?.status ?? ""] ?? ""}>{detailJob?.status}</Badge>
            </DialogTitle>
            <DialogDescription>
              Mulai {detailJob ? new Date(detailJob.createdAt).toLocaleString("id-ID") : ""}
              {detailJob?.finishedAt ? ` · selesai ${new Date(detailJob.finishedAt).toLocaleString("id-ID")}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-3 text-sm">
              {detailJob.input && Object.keys(detailJob.input).length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input</p>
                  <pre className="overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(detailJob.input, null, 2)}</pre>
                </div>
              )}
              {detailJob.result?.note && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs">{detailJob.result.note}</p>
              )}
              {(typeof detailJob.result?.contactsCreated === "number" || typeof detailJob.result?.created === "number") && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Perusahaan", detailJob.result?.created],
                    ["Kontak", detailJob.result?.contactsCreated],
                    ["Orang", detailJob.result?.peopleCreated],
                  ].map(([label, val]) =>
                    typeof val === "number" ? (
                      <div key={label as string} className="rounded-md border p-2 text-center">
                        <p className="text-lg font-semibold">{val as number}</p>
                        <p className="text-[10px] text-muted-foreground">{label as string}</p>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              {detailJob.result?.crawled && detailJob.result.crawled.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perusahaan di-crawl</p>
                  <ul className="space-y-1">
                    {detailJob.result.crawled.map((c, i) => (
                      <li key={i} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                        <span className="truncate">{c.name}{c.domain ? ` · ${c.domain}` : ""}</span>
                        <b>{c.contacts} kontak</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detailJob.result?.linkedinQueries && detailJob.result.linkedinQueries.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Query LinkedIn (pakai extension)</p>
                  <div className="space-y-1">
                    {detailJob.result.linkedinQueries.map((q) => (
                      <div key={q} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                        <span className="min-w-0 flex-1 truncate">{q}</span>
                        <a href={linkedinSearchUrl(q)} target="_blank" rel="noreferrer" className="text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailJob.error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{detailJob.error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CrawlProgressDialog
        open={crawlModalOpen}
        onOpenChange={setCrawlModalOpen}
        status={crawlStatus}
        target={crawlTarget}
        result={crawlResult}
        error={run.error instanceof Error ? run.error.message : null}
      />
    </div>
  );
}
