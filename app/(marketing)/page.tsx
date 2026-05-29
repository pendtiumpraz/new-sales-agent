"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  Database,
  KanbanSquare,
  MapPin,
  MessageCircle,
  Minus,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { ChannelDot } from "@/components/shared/channel-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatIDR } from "@/lib/utils/format-idr";
import { useUiStore } from "@/lib/stores/ui-store";
import { toast } from "sonner";

const FEATURES = [
  { icon: MessageCircle, t: "multichannel" },
  { icon: Database, t: "prospecting" },
  { icon: Workflow, t: "cadence" },
  { icon: KanbanSquare, t: "pipeline" },
  { icon: MapPin, t: "field" },
  { icon: ShieldCheck, t: "compliance" },
] as const;

const LOGOS = [
  "Tokopedia",
  "Bank Mandiri",
  "Halodoc",
  "Astra",
  "Telkom",
  "Sinar Mas",
];

export default function LandingPage() {
  const tl = useTranslations("landing");
  const tc = useTranslations("common");
  const tf = useTranslations("features");
  const tp = useTranslations("pricing");
  const locale = useUiStore((s) => s.locale);

  const compare =
    locale === "id"
      ? {
          headers: ["Kemampuan", "Apollo", "Mekari Qontak", "Agentic Sales"],
          rows: [
            ["Prospecting & data lead", true, false, true],
            ["WhatsApp Business API", false, true, true],
            ["Inbox terpadu multi-channel", false, true, true],
            ["Cadence lintas channel", true, false, true],
            ["Sales lapangan + GPS", false, false, true],
            ["Integrasi marketplace lokal", false, false, true],
            ["Kepatuhan UU PDP bawaan", false, true, true],
          ],
        }
      : {
          headers: ["Capability", "Apollo", "Mekari Qontak", "Agentic Sales"],
          rows: [
            ["Prospecting & lead data", true, false, true],
            ["WhatsApp Business API", false, true, true],
            ["Unified multi-channel inbox", false, true, true],
            ["Cross-channel cadences", true, false, true],
            ["Field sales + GPS", false, false, true],
            ["Local marketplace integrations", false, false, true],
            ["Built-in PDP compliance", false, true, true],
          ],
        };

  const tiers = [
    {
      name: tp("starterName"),
      desc: tp("starterDesc"),
      price: formatIDR(199000),
      popular: false,
      bullets:
        locale === "id"
          ? ["3 pengguna", "Inbox WhatsApp + email", "1.000 kontak", "Pipeline dasar"]
          : ["3 users", "WhatsApp + email inbox", "1,000 contacts", "Basic pipeline"],
    },
    {
      name: tp("growthName"),
      desc: tp("growthDesc"),
      price: formatIDR(449000),
      popular: true,
      bullets:
        locale === "id"
          ? [
              "10 pengguna",
              "Semua channel + Instagram",
              "Kontak tanpa batas",
              "Cadence & AI assist",
              "Sales lapangan",
            ]
          : [
              "10 users",
              "All channels + Instagram",
              "Unlimited contacts",
              "Cadences & AI assist",
              "Field sales",
            ],
    },
    {
      name: tp("enterpriseName"),
      desc: tp("enterpriseDesc"),
      price: tp("enterprisePrice"),
      popular: false,
      bullets:
        locale === "id"
          ? ["Pengguna tanpa batas", "SSO & audit lanjutan", "SLA khusus", "Onboarding terkelola"]
          : ["Unlimited users", "SSO & advanced audit", "Dedicated SLA", "Managed onboarding"],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="glass sticky top-0 z-40 border-b">
        <div className="container flex h-16 items-center justify-between">
          <BrandLogo />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#product" className="transition-colors hover:text-foreground">
              {tl("navProduct")}
            </a>
            <a href="#compare" className="transition-colors hover:text-foreground">
              {tl("navCompare")}
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              {tl("navPricing")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{tc("login")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/dashboard">{tc("tryDemo")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container grid gap-12 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col justify-center">
          <Badge variant="secondary" className="mb-5 w-fit gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            B2B + B2C · WhatsApp-first
          </Badge>
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl">
            {tl("heroTitle")}
          </h1>
          <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground">
            {tl("heroSubtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                {tc("tryDemo")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <ContactSalesDialog label={tc("contactSales")} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{tl("heroNote")}</p>
        </div>
        <HeroPreview />
      </section>

      {/* Logo cloud */}
      <section className="border-y bg-card py-10">
        <div className="container">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tl("trustedBy")}
          </p>
          <div className="mt-6 grid grid-cols-3 items-center gap-6 md:grid-cols-6">
            {LOGOS.map((l) => (
              <div
                key={l}
                className="flex h-10 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground/60"
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="product" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            {tl("featuresTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground">{tl("featuresSubtitle")}</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, t }) => (
            <Card key={t} className="transition-shadow hover:shadow-sm">
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{tf(`${t}Title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {tf(`${t}Desc`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="border-y bg-card py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              {tl("compareTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground">{tl("compareSubtitle")}</p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {compare.headers.map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-left font-medium ${
                        i === 3 ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compare.rows.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row[0] as string}
                    </td>
                    {row.slice(1).map((cell, ci) => (
                      <td key={ci} className="px-4 py-3">
                        {cell ? (
                          <Check
                            className={`h-4 w-4 ${ci === 2 ? "text-primary" : "text-success"}`}
                          />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            {tl("pricingTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground">{tl("pricingSubtitle")}</p>
        </div>
        <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={
                tier.popular ? "relative border-primary shadow-sm" : "relative"
              }
            >
              {tier.popular && (
                <Badge className="absolute -top-2.5 left-6">
                  {tl("pricingPopular")}
                </Badge>
              )}
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="tnum text-3xl font-semibold tracking-tight">
                    {tier.price}
                  </span>
                  {tier.price !== tp("enterprisePrice") && (
                    <span className="text-sm text-muted-foreground">
                      {tp("perMonth")}
                    </span>
                  )}
                </div>
                <Button
                  className="mt-5 w-full"
                  variant={tier.popular ? "default" : "outline"}
                  asChild
                >
                  <Link href="/dashboard">
                    {tier.price === tp("enterprisePrice")
                      ? tp("contactUs")
                      : tl("pricingCta")}
                  </Link>
                </Button>
                <Separator className="my-5" />
                <ul className="space-y-2.5">
                  {tier.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container py-12">
          <div className="flex flex-col justify-between gap-8 md:flex-row">
            <div className="max-w-xs">
              <BrandLogo />
              <p className="mt-3 text-sm text-muted-foreground">
                {tl("footerTagline")}
              </p>
              <LanguageToggle className="mt-4" />
            </div>
            <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
              <FooterCol
                title={tl("footerProduct")}
                links={["Inbox", "Pipeline", "Cadence", "Field Sales"]}
              />
              <FooterCol
                title={tl("footerCompany")}
                links={["Tentang", "Karier", "Blog", "Kontak"]}
              />
              <FooterCol
                title={tl("footerLegal")}
                links={["Kebijakan Privasi", "Syarat Layanan", "UU PDP", "Keamanan"]}
              />
            </div>
          </div>
          <Separator className="my-8" />
          <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {tl("footerPdp")}
            </p>
            <p>© 2026 Agentic Sales. {tl("footerRights")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="text-muted-foreground transition-colors hover:text-foreground">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeroPreview() {
  const rows = [
    { name: "Budi Santoso", ch: "whatsapp", msg: "Bisa info harga paket Growth?", unread: 2 },
    { name: "Siti Nurhaliza", ch: "email", msg: "Mohon dikirim penawaran resmi", unread: 0 },
    { name: "Andi (Retail Maju)", ch: "instagram", msg: "Min, ini ready stock? 😍", unread: 1 },
    { name: "PT Astra — Reza", ch: "linkedin", msg: "Connect & jadwalkan demo", unread: 0 },
  ];
  return (
    <div className="relative hidden md:block">
      <Card className="overflow-hidden shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold">Inbox Terpadu</span>
          <Badge className="gap-1.5 border-transparent bg-tertiary/15 text-tertiary">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            Live
          </Badge>
        </div>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 px-4 py-3">
              <ChannelDot channel={r.ch} size={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.msg}</p>
              </div>
              {r.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                  {r.unread}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="absolute -bottom-6 -left-6 w-44 shadow-md">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Nilai Pipeline</p>
          <p className="tnum mt-1 text-xl font-semibold">Rp 8,4 M</p>
          <p className="mt-1 text-xs text-success">+12,4% bln ini</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ContactSalesDialog({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hubungi Tim Sales</DialogTitle>
          <DialogDescription>
            Isi formulir dan tim kami akan menghubungi Anda dalam 1×24 jam kerja.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cs-name">Nama lengkap</Label>
            <Input id="cs-name" placeholder="Nama Anda" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cs-email">Email kerja</Label>
            <Input id="cs-email" type="email" placeholder="anda@perusahaan.co.id" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cs-msg">Kebutuhan Anda</Label>
            <Textarea id="cs-msg" placeholder="Ceritakan sedikit tentang tim sales Anda..." />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false);
              toast.success("Terima kasih! Tim sales akan menghubungi Anda segera.");
            }}
          >
            Kirim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
