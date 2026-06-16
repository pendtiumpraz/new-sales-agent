"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Radar } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [form, setForm] = useState({ company: "", name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "Gagal mendaftar");
      setDone(true);
      toast.success("Akun dibuat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  }

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
          {done ? (
            <div className="space-y-3 py-4 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-emerald-600">
                <Check className="h-6 w-6" />
              </span>
              <h1 className="text-lg font-semibold">Akun dibuat 🎉</h1>
              <p className="text-sm text-muted-foreground">
                Akun Anda <span className="font-medium">menunggu aktivasi superadmin</span>. Setelah diaktifkan,
                Anda bisa masuk.
              </p>
              <Button asChild className="mt-2">
                <Link href="/login">Ke halaman masuk</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Daftar akun</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Buat workspace baru. Aktivasi oleh superadmin.
              </p>
              <form onSubmit={submit} className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="company">Nama perusahaan / workspace</Label>
                  <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="PT Contoh Jaya" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nama Anda</Label>
                  <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Budi Santoso" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="budi@contoh.co.id" autoComplete="email" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Kata sandi (min 6)</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required />
                </div>

                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="mt-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Daftar <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
