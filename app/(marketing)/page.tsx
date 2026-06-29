import Link from "next/link";
import {
  ArrowRight,
  MessagesSquare,
  Radar,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// Maira Sales — NEW landing (Coral Sunset). Deliberately lean: brand, one-line
// value prop, and the two entry CTAs (Masuk → /login, Daftar → /register). The
// product itself lives behind auth; this page only routes people in. No feature
// catalog, no mock testimonials — that "demo brochure" feel is gone.

const SPINE = [
  { icon: Radar, label: "Temukan" },
  { icon: Sparkles, label: "Perkaya" },
  { icon: MessagesSquare, label: "Jangkau" },
  { icon: Target, label: "Tutup" },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Coral Sunset ambience */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(11_96%_61%/0.18),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(173_80%_40%/0.14),transparent_70%)] blur-3xl" />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Maira<span className="text-muted-foreground"> Sales</span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Daftar</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 pb-24 pt-16 text-center sm:pt-24">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Agen sales AI untuk
          pasar Indonesia
        </span>

        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Satu alur jualan, dari prospek sampai{" "}
          <span className="bg-gradient-to-r from-primary to-[#F6845C] bg-clip-text text-transparent">
            closing
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Temukan kontak asli, biarkan AI memilah B2C/B2B dan menyusun
          pendekatannya, lalu jangkau lewat WhatsApp — semua di satu workspace per
          produk.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="shadow-[0_6px_18px_-6px_rgba(251,94,59,0.6)]"
          >
            <Link href="/register">
              Daftar <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Masuk</Link>
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Akun baru diaktifkan oleh admin (aktivasi berjangka + kuota).
        </p>

        {/* The spine, as a single quiet line — the product's mental model */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          {SPINE.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5">
                <s.icon className="h-3.5 w-3.5 text-primary" />
                {s.label}
              </span>
              {i < SPINE.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </span>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t py-6 text-center text-xs text-muted-foreground">
        © 2026 Maira Sales
      </footer>
    </div>
  );
}
