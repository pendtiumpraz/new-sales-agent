"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/stores/auth-store";

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
  const authenticated = useAuthStore((s) => s.authenticated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        setError("Email atau kata sandi salah.");
        setLoading(false);
        return;
      }
      toast.success(`Selamat datang, ${account.name}`);
      router.push(nextHref);
    }, 400);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8">
        <BrandLogo />
      </Link>
      <Card className="w-full max-w-sm shadow-sm">
        <CardContent className="p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Masuk ke akun Anda
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gunakan email dan kata sandi terdaftar.
          </p>

          <form onSubmit={submit} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.co.id"
                autoComplete="email"
                required
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
                required
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
        </CardContent>
      </Card>
      <p className="mt-6 text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link
          href="/"
          className="font-medium text-primary hover:underline"
        >
          Hubungi tim sales
        </Link>
      </p>
    </div>
  );
}
