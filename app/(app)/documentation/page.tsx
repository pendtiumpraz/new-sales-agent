"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Building2,
  CreditCard,
  Database,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArchitectureDiagram } from "@/components/docs/architecture-diagram";

interface DocEntry {
  title: string;
  icon: LucideIcon;
  href?: string;
  summary: string;
  steps: string[];
  tip?: string;
  keywords?: string;
  badge?: string;
}

interface DocCategory {
  id: string;
  label: string;
  blurb: string;
  entries: DocEntry[];
}

const CATEGORIES: DocCategory[] = [
  {
    id: "mulai",
    label: "Mulai",
    blurb: "Orientasi cepat — pusat kontrol dan asisten AI Anda.",
    entries: [
      {
        title: "Dashboard",
        icon: LayoutDashboard,
        href: "/dashboard",
        summary: "Ringkasan harian: KPI, tugas yang jatuh tempo, dan funnel pipeline dalam satu layar.",
        steps: [
          "Buka Dashboard dari sidebar.",
          "Lihat tugas hari ini dan klik untuk masuk ke percakapan/prospek terkait.",
          "Pantau funnel untuk tahu deal menumpuk di tahap mana.",
        ],
        keywords: "beranda kpi tugas funnel ringkasan",
      },
      {
        title: "Asisten Sales (AI)",
        icon: Sparkles,
        summary: "Chat AI yang sudah belajar dari Basis Pengetahuan Anda — tanya harga, produk, strategi, atau minta draft pesan.",
        steps: [
          "Klik tombol \"Asisten\" di sidebar atau topbar.",
          "Tanya bebas, mis. \"berapa harga paket UMKM?\" atau \"buatkan pesan pembuka untuk prospek logistik\".",
          "Jawaban mengutip sumber dari Basis Pengetahuan.",
        ],
        tip: "Isi Basis Pengetahuan (Pengaturan) lengkap supaya jawaban makin akurat.",
        keywords: "chat ai asisten tanya bantuan",
      },
    ],
  },
  {
    id: "akuisisi",
    label: "Akuisisi Lead",
    blurb: "Temukan, profil, dan posisikan prospek.",
    entries: [
      {
        title: "Penemuan Lead (Discovery)",
        icon: Radar,
        href: "/contacts/discovery",
        summary: "Mulai pencarian lead lewat URL website, pilih bidang/industri, daftar nama (bulk), atau auto dari ICP produk.",
        steps: [
          "Buka Kontak → Discovery.",
          "Pilih tab: Daftar nama, URL, Bidang, atau Auto.",
          "Pilih posture (compliant ↔ aggressive), lalu jalankan.",
          "Daftar nama langsung membuat perusahaan; URL/bidang/auto masuk antrian crawler.",
        ],
        tip: "Posture mengatur seberapa agresif crawling — pilih compliant untuk aman.",
        keywords: "discovery prospek crawl cari lead penemuan",
      },
      {
        title: "Profil (Perusahaan vs Orang)",
        icon: Building2,
        href: "/contacts/profiles",
        summary: "Profiling terpisah perusahaan dan orang, lengkap dengan provenance (sumber) dan status consent.",
        steps: [
          "Buka Kontak → Profil.",
          "Tab Perusahaan / Orang untuk lihat masing-masing.",
          "Cek badge consent (opt-in/opt-out) sebelum menghubungi.",
        ],
        keywords: "profil perusahaan orang kontak consent provenance",
      },
      {
        title: "Enrichment & Positioning",
        icon: Database,
        href: "/pipeline",
        summary: "AI menilai seberapa cocok produk Anda untuk prospek (fit score) + sudut pendekatan dan antisipasi keberatan.",
        steps: [
          "Buka Enrichment.",
          "Pilih prospek untuk melihat insight positioning.",
          "Pakai sudut & talking points yang disarankan saat outreach.",
        ],
        keywords: "enrichment positioning fit score insight produk cocok",
      },
    ],
  },
  {
    id: "engagement",
    label: "Engagement & Outreach",
    blurb: "Jangkau prospek lintas channel dari identitas Anda sendiri.",
    entries: [
      {
        title: "Cadence",
        icon: Workflow,
        href: "/cadences",
        summary: "Rangkaian otomatis lintas channel (WA/email/dll). Tiap langkah dipersonalisasi AI. Jalankan langkah yang jatuh tempo dengan satu klik.",
        steps: [
          "Buka Cadence, buat cadence baru (atur langkah + jeda hari).",
          "Enroll kontak ke cadence.",
          "Klik \"Jalankan sekarang\" untuk memproses langkah yang jatuh tempo (atau biarkan cron 24 jam).",
        ],
        tip: "Langkah email masuk antrian kirim; langkah WhatsApp terkirim via WAHA bila aktif.",
        keywords: "cadence sequence outreach langkah otomatis multi channel",
      },
      {
        title: "Inbox",
        icon: Inbox,
        href: "/contacts?view=inbox",
        summary: "Satu kotak masuk untuk WhatsApp & email. Balas manual atau pakai draft balasan AI.",
        steps: [
          "Buka Inbox dari menu profil atau Kontak.",
          "Pilih percakapan, baca konteks.",
          "Pakai draft AI lalu kirim, atau ketik manual.",
        ],
        keywords: "inbox pesan whatsapp email balas percakapan",
      },
      {
        title: "Email & Jangkauan",
        icon: Mail,
        href: "/settings/mailboxes",
        summary: "Hubungkan email pengirim Anda sendiri: SMTP app-password, OAuth Gmail/Outlook, atau email platform (ESP). Plus kirim WhatsApp via WAHA.",
        steps: [
          "Buka Pengaturan → Mailbox.",
          "Connect cepat: Gmail/Outlook (OAuth) atau email platform; atau isi SMTP manual.",
          "Kirim email uji, atau pakai kartu WhatsApp untuk test WA.",
        ],
        tip: "Suppression, batas harian, dan footer unsubscribe otomatis diterapkan.",
        keywords: "mailbox email smtp oauth gmail outlook esp resend whatsapp waha kirim",
      },
    ],
  },
  {
    id: "otomasi",
    label: "Otomasi & Agen AI",
    blurb: "Biarkan agen bekerja 24 jam: follow-up, upsell, closing, dan balas sendiri.",
    entries: [
      {
        title: "Autopilot",
        icon: Rocket,
        href: "/autopilot",
        badge: "Baru",
        summary: "Jalankan pipeline AI satu klik — agen menyusun konten dan menggerakkan prospek sesuai goal.",
        steps: [
          "Klik tombol Autopilot (coral) di topbar/sidebar.",
          "Atur goal dan jalankan.",
          "Tinjau hasil per prospek.",
        ],
        keywords: "autopilot agen pipeline otomatis satu klik",
      },
      {
        title: "Upsell otomatis + Closing (Stripe)",
        icon: Zap,
        href: "/cadences",
        summary: "Untuk customer yang sudah closing, agen menawarkan produk upsell dari Basis Pengetahuan + menempelkan link pembayaran Stripe. Idempotent (tidak spam).",
        steps: [
          "Di halaman Cadence, klik \"Jalankan upsell\".",
          "Agen pilih produk upsell, susun pesan, buat link checkout Stripe, kirim via email/WA.",
          "Atau biarkan cron harian menjalankannya otomatis.",
        ],
        tip: "Isi STRIPE_SECRET_KEY agar link pembayaran muncul; tanpa itu pesan tetap terkirim tanpa link.",
        keywords: "upsell closing stripe bayar checkout link otomatis cross-sell",
      },
      {
        title: "Auto-reply + Escalation",
        icon: Bot,
        href: "/cadences",
        summary: "Agen membalas percakapan masuk sendiri bila yakin & aman; eskalasi ke manusia untuk topik sensitif (komplain/refund/negosiasi/minta bicara orang).",
        steps: [
          "Di halaman Cadence, klik \"Auto-reply\".",
          "Agen menilai tiap percakapan: kirim otomatis atau eskalasi.",
          "Aktifkan auto-send lewat AUTO_REPLY_AUTOSEND (default mati = draft saja).",
        ],
        tip: "Default aman: tanpa opt-in semua dieskalasi sebagai draft, agen tidak mengirim sendiri.",
        keywords: "auto reply balas otomatis eskalasi escalation agen cs konfidence",
      },
      {
        title: "Penjadwalan 24 jam",
        icon: Zap,
        summary: "Cadence, upsell, dan auto-reply bisa jalan otomatis terjadwal (cron) tanpa ditekan manual.",
        steps: [
          "Aktifkan dengan mengisi kunci Inngest (lihat admin).",
          "Cron berjalan: cadence /15m, antrian email /5m, upsell harian, auto-reply /10m.",
        ],
        keywords: "cron jadwal 24 jam inngest otomatis background",
      },
    ],
  },
  {
    id: "pengaturan",
    label: "Pengaturan & Integrasi",
    blurb: "Model AI, tagihan, dan tim.",
    entries: [
      {
        title: "AI & Model",
        icon: Sparkles,
        href: "/settings/ai",
        summary: "Pilih model AI aktif untuk tenant Anda, masukkan kunci API sendiri (BYOK), dan pantau pemakaian token & biaya.",
        steps: [
          "Buka Pengaturan → AI.",
          "Pilih model aktif per provider; opsional masukkan BYOK key (terenkripsi).",
          "Pantau kartu pemakaian (panggilan/token/biaya).",
        ],
        keywords: "ai model registry byok token biaya metering deepseek anthropic",
      },
      {
        title: "Tagihan & Kuota",
        icon: CreditCard,
        href: "/settings/billing",
        summary: "Lihat paket aktif dan pemakaian vs kuota (token AI, email, kursi). Upgrade lewat Stripe Checkout + portal billing.",
        steps: [
          "Buka Pengaturan → Tagihan.",
          "Lihat meter pemakaian terhadap kuota.",
          "Klik paket untuk upgrade, atau buka portal untuk kelola langganan (bila Stripe aktif).",
        ],
        keywords: "billing tagihan kuota paket langganan stripe upgrade invoice",
      },
      {
        title: "Tim & Peran",
        icon: Users,
        href: "/settings/team",
        summary: "Kelola anggota dan peran (owner/admin/member). Setiap peran punya izin berbeda (RBAC).",
        steps: [
          "Buka Pengaturan → Tim.",
          "Undang anggota, atur peran.",
          "Member bisa kerja & connect mailbox; billing khusus owner.",
        ],
        keywords: "tim anggota peran role rbac undang member admin owner",
      },
    ],
  },
  {
    id: "kepatuhan",
    label: "Kepatuhan & Admin",
    blurb: "Privasi data dan kontrol platform.",
    entries: [
      {
        title: "Kepatuhan & DSAR",
        icon: ShieldCheck,
        href: "/settings/compliance/dsar",
        summary: "Penuhi permintaan subjek data (UU PDP/GDPR): ekspor atau hapus seluruh data seseorang lintas tabel, dengan jejak audit.",
        steps: [
          "Buka Pengaturan → Kepatuhan/DSAR.",
          "Masukkan email subjek → Ekspor (JSON) atau Hapus.",
          "Penghapusan tetap menyimpan suppression agar tidak dihubungi lagi.",
        ],
        keywords: "kepatuhan compliance dsar uu pdp gdpr privasi hapus ekspor audit",
      },
      {
        title: "Superadmin",
        icon: BarChart3,
        href: "/admin",
        badge: "Superadmin",
        summary: "Konsol lintas-tenant: rollup anggota/biaya AI/pengiriman/paket, jejak audit, dan kill-switch suspend/aktifkan tenant.",
        steps: [
          "Khusus peran Superadmin: buka /admin.",
          "Pantau ringkasan lintas tenant.",
          "Suspend tenant via kill-switch bila perlu (memblokir AI & pengiriman).",
        ],
        keywords: "superadmin admin lintas tenant kill switch observability rollup",
      },
    ],
  },
];

export default function DocumentationPage() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      entries: c.entries.filter((e) =>
        `${e.title} ${e.summary} ${e.keywords ?? ""} ${e.steps.join(" ")}`.toLowerCase().includes(needle),
      ),
    })).filter((c) => c.entries.length > 0);
  }, [q]);

  return (
    <div>
      <PageHeader
        title="Dokumentasi"
        description="Panduan fitur Maira Sales — cara pakai tiap modul, langkah demi langkah."
      />
      <div className="space-y-6 p-6">
        {/* Use-case showcase — many sales/marketing scenarios per industry */}
        <Link
          href="/use-case"
          className="group flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 via-card to-tertiary/8 p-4 transition hover:-translate-y-px hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(251,94,59,0.55)]">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Use Case per industri →</p>
            <p className="text-xs text-muted-foreground">
              50+ skenario sales &amp; marketing: perhotelan, HR/rekrutmen IT, manufaktur, F&amp;B, properti, fintech, agensi & influencer, dan banyak lagi.
            </p>
          </div>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-0.5" />
        </Link>

        {/* High-level architecture — roles, isolation, flow, marketplace (doc 41) */}
        <ArchitectureDiagram />

        {/* Search + section jump */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari fitur… (mis. upsell, cadence, oauth)"
              className="pl-9"
            />
          </div>
          {!q && (
            <div className="hidden flex-wrap gap-1.5 sm:flex">
              {CATEGORIES.map((c) => (
                <a
                  key={c.id}
                  href={`#${c.id}`}
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {c.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada fitur yang cocok dengan &quot;{q}&quot;.</p>
        )}

        {filtered.map((cat) => (
          <section key={cat.id} id={cat.id} className="scroll-mt-20 space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{cat.label}</h2>
              <p className="text-sm text-muted-foreground">{cat.blurb}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {cat.entries.map((e) => (
                <DocCard key={e.title} entry={e} />
              ))}
            </div>
          </section>
        ))}

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Butuh bantuan lebih? Buka <span className="font-medium">Asisten Sales</span> di sidebar dan tanya langsung.
        </p>
      </div>
    </div>
  );
}

function DocCard({ entry }: { entry: DocEntry }) {
  const { icon: Icon } = entry;
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          {entry.badge && (
            <Badge variant="muted" className="bg-primary/10 text-primary">
              {entry.badge}
            </Badge>
          )}
        </div>
        <h3 className="mt-3 font-semibold leading-snug">{entry.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>

        <ol className="mt-3 space-y-1.5">
          {entry.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs text-foreground/80">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {entry.tip && (
          <p className="mt-3 rounded-lg bg-tertiary/5 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-tertiary">Tip:</span> {entry.tip}
          </p>
        )}

        {entry.href && (
          <Link
            href={entry.href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
          >
            Buka fitur
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
