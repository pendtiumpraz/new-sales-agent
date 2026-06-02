"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/shared/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_DEMO_ACCOUNT,
  DEMO_ACCOUNTS,
  type DemoAccount,
} from "@/lib/auth/demo-accounts";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, "destructive" | "warning" | "success" | "secondary"> = {
  Superadmin: "destructive",
  Admin: "warning",
  "Sales Manager": "success",
  "Sales Rep": "secondary",
};

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary at the page level (Next 14
  // static-prerender constraint). The inner component reads ?next=.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);
  const authenticated = useAuthStore((s) => s.authenticated);
  const [email, setEmail] = useState(DEFAULT_DEMO_ACCOUNT.email);
  const [password, setPassword] = useState(DEFAULT_DEMO_ACCOUNT.password);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the post-login destination — defaults to /dashboard, but honors
  // ?next=<encoded-path> so middleware-style redirects survive.
  const nextHref = (() => {
    const raw = searchParams.get("next");
    if (!raw) return "/dashboard";
    try {
      const decoded = decodeURIComponent(raw);
      // Only allow same-origin internal paths.
      return decoded.startsWith("/") ? decoded : "/dashboard";
    } catch {
      return "/dashboard";
    }
  })();

  // If already authenticated, bounce straight to the destination — prevents
  // showing the login screen to a logged-in user who navigates here.
  useEffect(() => {
    if (authenticated) {
      router.replace(nextHref);
    }
  }, [authenticated, nextHref, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const account = login(email, password);
      if (!account) {
        setError("Email atau kata sandi salah. Pilih salah satu akun demo di bawah.");
        setLoading(false);
        return;
      }
      toast.success(`Selamat datang, ${account.name}`);
      router.push(nextHref);
    }, 400);
  }

  function useAccount(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  function quickLogin(account: DemoAccount) {
    setUser(account);
    toast.success(`Masuk sebagai ${account.name} (${account.role})`);
    router.push(nextHref);
  }

  function copyCreds(account: DemoAccount) {
    navigator.clipboard?.writeText(
      `Email: ${account.email}\nKata sandi: ${account.password}`,
    );
    toast.success("Kredensial disalin.");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Link href="/" className="mb-8">
        <BrandLogo />
      </Link>

      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── Login form ────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold tracking-tight">
              Masuk ke akun Anda
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Default: akun{" "}
              <span className="font-medium text-foreground">Superadmin</span>{" "}
              dengan akses penuh ke semua modul.
            </p>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Kata sandi</Label>
                  <a href="#" className="text-xs text-primary hover:underline">
                    Lupa sandi?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="mt-2 w-full" disabled={loading}>
                {loading ? "Memuat..." : "Masuk"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-4 text-xs text-muted-foreground">
              Belum punya akun?{" "}
              <Link href="/dashboard" className="font-medium text-primary hover:underline">
                Coba demo gratis
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* ── Demo accounts list ────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Akun demo siap pakai</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Pilih salah satu untuk masuk langsung, atau klik &ldquo;Isi&rdquo;
              untuk menampilkan kredensial di form di samping.
            </p>

            <ul className="grid gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <li
                  key={acc.id}
                  className={cn(
                    "rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40",
                    acc.role === "Superadmin" &&
                      "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: acc.avatarColor }}
                    >
                      {acc.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{acc.name}</p>
                        <Badge variant={ROLE_TONE[acc.role] ?? "secondary"} className="text-[10px]">
                          {acc.role}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {acc.scope}
                      </p>
                      <div className="tnum mt-1.5 font-mono text-[11px] text-muted-foreground">
                        {acc.email} · {acc.password}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => copyCreds(acc)}
                    >
                      <Copy className="h-3 w-3" />
                      Salin
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => useAccount(acc)}
                    >
                      Isi
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => quickLogin(acc)}
                    >
                      Masuk sebagai {acc.role}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
