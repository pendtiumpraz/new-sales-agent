"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Check, Loader2, Radar } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteInfo {
  email: string;
  role: string;
  tenantName: string;
  status: string;
  expired: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Owner",
  tenant_admin: "Admin",
  member: "Sales",
};

export default function AcceptInvitePage() {
  const token = useParams<{ token: string }>().token;
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/invites/${token}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setLoadErr(j?.error ?? "Undangan tidak valid");
        else setInfo(j as InviteInfo);
      } catch {
        if (alive) setLoadErr("Gagal memuat undangan");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "Gagal menerima undangan");
      setDone(true);
      toast.success("Undangan diterima");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menerima undangan");
    } finally {
      setLoading(false);
    }
  }

  const blocked =
    info && (info.status !== "pending" || info.expired);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 inline-flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Radar className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          Maira<span className="text-muted-foreground"> Sales</span>
        </span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          {loadErr ? (
            <div className="space-y-2 py-4 text-center">
              <h1 className="text-lg font-semibold">Undangan tidak valid</h1>
              <p className="text-sm text-muted-foreground">{loadErr}</p>
              <Button asChild variant="outline" className="mt-2">
                <Link href="/login">Ke halaman masuk</Link>
              </Button>
            </div>
          ) : !info ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : done ? (
            <div className="space-y-3 py-4 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-emerald-600">
                <Check className="h-6 w-6" />
              </span>
              <h1 className="text-lg font-semibold">Bergabung 🎉</h1>
              <p className="text-sm text-muted-foreground">
                Kamu sekarang anggota <span className="font-medium">{info.tenantName}</span>. Silakan masuk.
              </p>
              <Button asChild className="mt-2">
                <Link href="/login">Ke halaman masuk</Link>
              </Button>
            </div>
          ) : blocked ? (
            <div className="space-y-2 py-4 text-center">
              <h1 className="text-lg font-semibold">Undangan tidak aktif</h1>
              <p className="text-sm text-muted-foreground">
                {info.expired ? "Undangan ini sudah kedaluwarsa." : "Undangan ini sudah dipakai atau dibatalkan."}
              </p>
              <Button asChild variant="outline" className="mt-2">
                <Link href="/login">Ke halaman masuk</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Terima undangan</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Kamu diundang ke <span className="font-medium">{info.tenantName}</span> sebagai{" "}
                <span className="font-medium">{ROLE_LABEL[info.role] ?? info.role}</span>.
              </p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input value={info.email} readOnly className="cursor-not-allowed bg-muted/40" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nama Anda</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Buat kata sandi (min 6)</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                </div>

                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading || password.length < 6 || !name.trim()} className="mt-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Gabung <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
