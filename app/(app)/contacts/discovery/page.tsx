"use client";

import { useState } from "react";
import Link from "next/link";
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

interface Job {
  id: string;
  kind: string;
  status: string;
  posture: string;
  result: { created?: number } | null;
  createdAt: string;
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

const STATUS_CLS: Record<string, string> = {
  done: "bg-success/10 text-emerald-700",
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
        body: JSON.stringify({ ...payload, posture }),
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
      <PageHeader title="Discovery" description="Mulai pencarian lead: URL manual, pilih bidang, daftar nama (bulk), atau auto (doc 21).">
        <Link href="/contacts/profiles" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
          Lihat Profil
        </Link>
      </PageHeader>
      <div className="max-w-3xl space-y-4 p-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base"><Radar className="h-4 w-4 text-primary" /> Mulai discovery</CardTitle>
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
          <CardHeader className="border-b"><CardTitle className="text-base">Antrian crawl</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(jobs.data ?? []).map((j) => (
                <li key={j.id} className="flex items-center gap-3 p-3 text-sm">
                  <Badge variant="muted">{j.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    posture {j.posture}{j.result?.created != null ? ` · ${j.result.created} dibuat` : ""}
                  </span>
                  <Badge className={STATUS_CLS[j.status] ?? ""}>{j.status}</Badge>
                </li>
              ))}
              {(jobs.data?.length ?? 0) === 0 && !jobs.isLoading && (
                <li className="p-3 text-xs text-muted-foreground">Belum ada job discovery.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

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
