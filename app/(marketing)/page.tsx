import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CreditCard,
  Mail,
  MapPin,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Radar, title: "Crawling prospek B2B", desc: "Ambil email, telepon, & sosmed perusahaan target langsung dari websitenya — plus orang per jabatan via Hunter." },
  { icon: Building2, title: "Profiling terpisah", desc: "Kontak perusahaan vs kontak orang dipilah rapi, lengkap dengan sumber & status consent." },
  { icon: Target, title: "Positioning AI", desc: "AI menilai kecocokan produkmu dengan tiap prospek — sudut pendekatan & antisipasi keberatan." },
  { icon: Mail, title: "Blast multi-channel", desc: "Kirim dari mailbox sendiri (SMTP/Gmail/Outlook OAuth/ESP) + WhatsApp. Cadence otomatis." },
  { icon: Bot, title: "Agen otonom 24 jam", desc: "Upsell + closing pakai link Stripe, auto-reply yang escalate ke manusia kalau ragu." },
  { icon: MapPin, title: "Peta & intelijen", desc: "Posisi perusahaan, client, & partner di peta. Cari customer maupun partner dengan playbook." },
];

const STEPS = [
  { n: 1, title: "Crawl & profil", desc: "Masukkan URL/bidang target → kontak asli terisi otomatis, dipilah company vs orang." },
  { n: 2, title: "AI menyusun", desc: "Model aktif tenant-mu menulis pesan grounded ke Basis Pengetahuan & positioning." },
  { n: 3, title: "Jangkau & tutup", desc: "Cadence multi-channel jalan 24 jam; upsell & closing otomatis, escalate saat perlu." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
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
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(11_96%_61%/0.18),transparent_70%)] blur-2xl" />
        <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(173_80%_40%/0.16),transparent_70%)] blur-2xl" />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> AI sales agent untuk pasar Indonesia
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Cari, profil, & jangkau prospek —{" "}
            <span className="bg-gradient-to-r from-primary to-[#F6845C] bg-clip-text text-transparent">otomatis 24 jam</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Crawl kontak B2B asli, biarkan AI menyusun pendekatan yang pas dengan produkmu, lalu jangkau lewat email &
            WhatsApp — sampai closing. Satu platform, multi-tenant, terisolasi.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="shadow-[0_6px_18px_-6px_rgba(251,94,59,0.6)]">
              <Link href="/register">
                Daftar sekarang <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Masuk</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Akun baru diaktifkan oleh admin (skema aktivasi berjangka).</p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">Cara kerja</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border bg-card p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {s.n}
              </span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust row */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Multi-tenant + RBAC</span>
          <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Registry AI multi-provider</span>
          <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Metering token & biaya</span>
          <span className="inline-flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5" /> Cadence + Inngest 24 jam</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Kepatuhan UU PDP</span>
        </div>
      </section>

      {/* CTA band */}
      <section className="border-t bg-gradient-to-br from-primary/5 via-card to-tertiary/5">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Siap mengisi pipeline dengan data asli?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Daftar, aktivasi oleh admin, lalu mulai crawl prospek pertamamu.</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/register">
              Mulai sekarang <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © 2026 Maira Sales — prototype. Semua data engagement bersifat real (Postgres + AI).
      </footer>
    </div>
  );
}
