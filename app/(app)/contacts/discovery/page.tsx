"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radar } from "lucide-react";

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

interface Job {
  id: string;
  kind: string;
  status: string;
  posture: string;
  result: { created?: number } | null;
  createdAt: string;
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

  const run = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, posture }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "failed");
      return j as { status: string; created: number };
    },
    onSuccess: (j) => {
      toast.success(j.status === "done" ? `Selesai — ${j.created} perusahaan dibuat` : "Job antri (menunggu crawler)");
      qc.invalidateQueries({ queryKey: ["crawl-jobs"] });
    },
    onError: (e) => toast.error(`Gagal (${e instanceof Error ? e.message : e})`),
  });

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
            <Tabs defaultValue="bulk">
              <TabsList>
                <TabsTrigger value="bulk">Daftar nama</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="industry">Bidang</TabsTrigger>
                <TabsTrigger value="auto">Auto</TabsTrigger>
              </TabsList>

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
                <Button disabled={!url.trim() || run.isPending} onClick={() => run.mutate({ kind: "url", url })}>Antri crawl</Button>
                <p className="text-[11px] text-muted-foreground">Crawl nyata dipenuhi MCP server / extension (Fase 6).</p>
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
    </div>
  );
}
