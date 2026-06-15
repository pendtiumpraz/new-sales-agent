"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ShieldCheck, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { can, type Role } from "@/lib/rbac/permissions";

interface AuditRow {
  id: string;
  action: string;
  target: string | null;
  actorUserId: string | null;
  at: string;
}

export default function DsarPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "member") as Role;
  const canExport = can(role, "data.export");
  const canPurge = can(role, "tenant.settings.manage");
  const qc = useQueryClient();

  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/compliance");
      if (!r.ok) throw new Error();
      return ((await r.json()).audit ?? []) as AuditRow[];
    },
    enabled: canExport,
  });

  const [email, setEmail] = useState("");
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);

  async function call(op: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/tenant/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...payload }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "failed");
      return j;
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["audit"] });
    }
  }

  async function exportSubject() {
    try {
      const j = await call("dsar-export", { email });
      const blob = new Blob([JSON.stringify(j.bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsar-${email}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const b = j.bundle;
      toast.success(`Export: ${b.persons.length} orang, ${b.contactPoints.length} kontak, ${b.contacts.length} legacy`);
    } catch (e) {
      toast.error(`Gagal export (${e instanceof Error ? e.message : e})`);
    }
  }

  async function deleteSubject() {
    if (!confirm(`Hapus semua data untuk ${email}? Tidak bisa dibatalkan (opt-out tetap disimpan).`)) return;
    try {
      const j = await call("dsar-delete", { email });
      toast.success(`Dihapus: ${j.deleted.persons} orang, ${j.deleted.contactPoints} kontak, ${j.deleted.contacts} legacy`);
    } catch (e) {
      toast.error(`Gagal hapus (${e instanceof Error ? e.message : e})`);
    }
  }

  async function purge() {
    try {
      const j = await call("retention-purge", { days });
      toast.success(`Purge >${days}h: usage ${j.purged.aiUsage}, sends ${j.purged.sendJobs}, crawls ${j.purged.crawlJobs}`);
    } catch (e) {
      toast.error(`Gagal purge (${e instanceof Error ? e.message : e})`);
    }
  }

  if (!canExport) {
    return (
      <div>
        <PageHeader title="DSAR & Audit" description="Kepatuhan UU PDP / GDPR." />
        <div className="p-6">
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5" /> Hanya Owner/Admin yang bisa akses DSAR & audit.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="DSAR & Audit" description="Akses/hapus data subjek + retensi + jejak audit (UU PDP/GDPR, doc 25)." />
      <div className="max-w-3xl space-y-4 p-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">DSAR — Data Subject Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1">
              <Label className="text-xs">Email subjek</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="orang@perusahaan.co.id" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!email || busy} onClick={exportSubject} className="gap-1.5">
                <Download className="h-4 w-4" /> Export (JSON)
              </Button>
              <Button variant="ghost" disabled={!email || busy} onClick={deleteSubject} className="gap-1.5 text-destructive">
                <Trash2 className="h-4 w-4" /> Hapus permanen
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hapus = erase lintas tabel (orang/kontak/legacy), opt-out tetap disimpan agar tak dihubungi lagi.
            </p>
          </CardContent>
        </Card>

        {canPurge && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Retensi</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-2 p-4">
              <div className="space-y-1">
                <Label className="text-xs">Hapus data operasional lebih tua dari (hari)</Label>
                <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40" />
              </div>
              <Button variant="outline" disabled={busy} onClick={purge}>Purge</Button>
              <span className="pb-2 text-[11px] text-muted-foreground">ai_usage · send_job · crawl_job</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Jejak audit</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(audit.data ?? []).slice(0, 20).map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
                  <Badge variant="muted" className="font-mono">{a.action}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.target ?? "—"}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(a.at).toLocaleString("id-ID")}</span>
                </li>
              ))}
              {(audit.data?.length ?? 0) === 0 && !audit.isLoading && (
                <li className="p-3 text-xs text-muted-foreground">Belum ada aktivitas audit.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
