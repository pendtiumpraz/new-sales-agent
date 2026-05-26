"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@agentic.co.id");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Mock auth: any credentials work (build.md §10).
    setTimeout(() => router.push("/dashboard"), 500);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8">
        <BrandLogo />
      </Link>
      <Card className="w-full max-w-sm shadow-sm">
        <CardContent className="p-6">
          <h1 className="text-xl font-semibold tracking-tight">Masuk ke akun Anda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Demo: kredensial apa pun bisa digunakan.
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
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading ? "Memuat..." : "Masuk"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/dashboard" className="font-medium text-primary hover:underline">
          Coba demo gratis
        </Link>
      </p>
    </div>
  );
}
