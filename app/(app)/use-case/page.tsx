"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Building,
  Building2,
  Camera,
  Car,
  Code2,
  Construction,
  Cpu,
  Droplets,
  Dumbbell,
  Factory,
  Fish,
  Gamepad2,
  GraduationCap,
  HandHeart,
  HardHat,
  HeartHandshake,
  HeartPulse,
  Hotel,
  Landmark,
  Lock,
  Megaphone,
  MoonStar,
  Network,
  Newspaper,
  PartyPopper,
  PawPrint,
  Pickaxe,
  Plane,
  Printer,
  Radar,
  RadioTower,
  Recycle,
  Rocket,
  Scale,
  Scissors,
  Search,
  Shield,
  Shirt,
  Ship,
  ShoppingBag,
  Snowflake,
  Sofa,
  Sparkles,
  Sprout,
  Stethoscope,
  Truck,
  Umbrella,
  UtensilsCrossed,
  Users,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tag = "B2B" | "B2C" | "Partner" | "Retensi" | "Rekrutmen";

interface UseCase {
  title: string;
  target: string; // siapa yang dicari
  how: string; // cara di Maira (fitur)
  outcome: string; // hasil
  tag: Tag;
}
interface Industry {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: string; // hex accent
  cases: UseCase[];
}

const TAG_CLS: Record<Tag, string> = {
  B2B: "bg-blue-100 text-blue-700",
  B2C: "bg-emerald-100 text-emerald-700",
  Partner: "bg-violet-100 text-violet-700",
  Retensi: "bg-amber-100 text-amber-700",
  Rekrutmen: "bg-rose-100 text-rose-700",
};

// The 4-step pattern that every use case below follows.
const PATTERN: { icon: LucideIcon; label: string; desc: string }[] = [
  { icon: Radar, label: "1. Temukan", desc: "Discovery (URL/industri) atau extension crawl LinkedIn / IG / TikTok / Google" },
  { icon: Sparkles, label: "2. Profil & Enrich AI", desc: "AI baca profil, cari email/HP/website/sosmed di web, ringkas otomatis" },
  { icon: Users, label: "3. Klasifikasi fit", desc: "AI tandai B2B/B2C + skor kecocokan produk, lalu masuk ke workspace" },
  { icon: Workflow, label: "4. Jangkau", desc: "Cadence multi-channel (WA/email) + Penawaran AI — lacak sampai closing" },
];

const INDUSTRIES: Industry[] = [
  {
    id: "perhotelan",
    label: "Perhotelan & Pariwisata",
    icon: Hotel,
    tone: "#FB5E3B",
    cases: [
      { title: "Cari klien korporat untuk MICE & gathering", target: "HR / GA / Event Manager perusahaan menengah-besar di kota target", how: "Discovery industri + query LinkedIn 'Event Manager / GA' → enrich email & WA → workspace 'MICE'", outcome: "Cadence penawaran paket meeting room + voucher, tutup lewat Penawaran", tag: "B2B" },
      { title: "Rekrut travel agent & OTA partner", target: "Travel agent, tour operator, korporat travel", how: "Discovery URL situs agen travel → enrich domain + kontak booking", outcome: "Penawaran contract rate + komisi, kelola di Cadence", tag: "Partner" },
      { title: "Upsell tamu korporat lama", target: "Perusahaan yang pernah booking event/rombongan", how: "Retensi flow + segmen 'pernah closing' → upsell otomatis", outcome: "Tawaran gathering tahunan / kontrak room blok", tag: "Retensi" },
      { title: "Gaet wedding & event organizer", target: "EO, wedding planner (banyak aktif di Instagram)", how: "Extension crawl Instagram + Google → profil + DM/WA", outcome: "Kerjasama venue, cadence follow-up", tag: "Partner" },
    ],
  },
  {
    id: "hr-rekrutmen",
    label: "HR, Rekrutmen & Headhunting",
    icon: Users,
    tone: "#14B8A6",
    cases: [
      { title: "Cari kandidat IT (AI / Backend / Data Engineer)", target: "Engineer dengan skill spesifik di LinkedIn + GitHub", how: "Extension crawl LinkedIn 'AI Engineer Jakarta' → profil + enrich GitHub/portfolio → skor", outcome: "Cadence approach kandidat (LinkedIn + email), pipeline rekrutmen", tag: "Rekrutmen" },
      { title: "Cari klien perusahaan yang butuh jasa rekrutmen", target: "HR Director / Head of Talent Acquisition", how: "Discovery industri + query 'Head of Talent' → enrich kontak", outcome: "Penawaran jasa headhunting / RPO, lacak di pipeline", tag: "B2B" },
      { title: "Headhunt eksekutif (C-level / VP)", target: "VP, Director, C-level di industri target", how: "Query LinkedIn senior + enrich → workspace 'Exec Search'", outcome: "Pendekatan personal 1:1 lewat cadence halus", tag: "Rekrutmen" },
      { title: "Bangun talent pool sales & marketing", target: "Sales/marketing profesional aktif", how: "Crawl LinkedIn + klasifikasi pengalaman", outcome: "Database kandidat siap kontak per kebutuhan klien", tag: "Rekrutmen" },
    ],
  },
  {
    id: "it-saas",
    label: "IT, SaaS & Software House",
    icon: Cpu,
    tone: "#6366F1",
    cases: [
      { title: "Cari startup yang butuh tools/SaaS", target: "Founder / CTO startup tahap growth", how: "Discovery industri 'teknologi' + enrich → skor fit produk", outcome: "Cadence demo + free trial, Penawaran lisensi", tag: "B2B" },
      { title: "Tembus decision maker teknis", target: "CTO, Engineering Manager, Head of Product", how: "Query LinkedIn jabatan teknis → enrich GitHub + website", outcome: "Cadence value-led (studi kasus teknis)", tag: "B2B" },
      { title: "Rekrut reseller / system integrator", target: "SI, konsultan IT, agency", how: "Discovery + enrich domain", outcome: "Penawaran kemitraan + margin reseller", tag: "Partner" },
      { title: "Cross-sell modul ke klien existing", target: "Pelanggan aktif yang baru pakai 1 modul", how: "Retensi flow + KB upsell", outcome: "Upsell add-on otomatis lewat email/WA", tag: "Retensi" },
    ],
  },
  {
    id: "manufaktur",
    label: "Manufaktur & Industri",
    icon: Factory,
    tone: "#0EA5E9",
    cases: [
      { title: "Cari distributor / agen regional", target: "Distributor & agen per wilayah", how: "Discovery industri + lokasi → enrich kontak procurement", outcome: "Cadence + Penawaran skema distribusi", tag: "Partner" },
      { title: "Tembus procurement / purchasing", target: "Procurement / Purchasing Manager pabrik", how: "Query LinkedIn 'Procurement' + enrich perusahaan", outcome: "Penawaran supplier, masuk vendor list", tag: "B2B" },
      { title: "Cari supplier bahan baku B2B", target: "Produsen / supplier bahan", how: "Discovery URL situs supplier → enrich domain + email", outcome: "Kontak sourcing + negosiasi via cadence", tag: "B2B" },
    ],
  },
  {
    id: "properti",
    label: "Properti & Real Estate",
    icon: Building2,
    tone: "#F59E0B",
    cases: [
      { title: "Cari investor properti", target: "Individu HNW / perusahaan investasi", how: "Enrich + klasifikasi lead → workspace 'Investor'", outcome: "Cadence listing eksklusif + Penawaran unit", tag: "B2C" },
      { title: "Cari corporate tenant (sewa kantor)", target: "Perusahaan yang sedang ekspansi", how: "Discovery industri + berita ekspansi → enrich GA/facility", outcome: "Penawaran ruang kantor + tour jadwal", tag: "B2B" },
      { title: "Rekrut agen properti partner", target: "Agen & broker independen", how: "Crawl Instagram/Google + enrich", outcome: "Kerjasama co-broking via cadence", tag: "Partner" },
    ],
  },
  {
    id: "fnb",
    label: "F&B & Restoran",
    icon: UtensilsCrossed,
    tone: "#EF4444",
    cases: [
      { title: "Cari klien katering korporat", target: "GA / HR perusahaan (makan siang, event)", how: "Discovery industri + enrich kontak", outcome: "Penawaran paket katering bulanan", tag: "B2B" },
      { title: "Cari franchise partner", target: "Calon franchisee / investor F&B", how: "Leads form + enrich → klasifikasi serius/tidak", outcome: "Cadence nurturing + presentasi waralaba", tag: "Partner" },
      { title: "Cari supplier bahan & kemasan", target: "Supplier bahan baku, kemasan", how: "Discovery URL → enrich email/HP", outcome: "Sourcing + nego harga via cadence", tag: "B2B" },
    ],
  },
  {
    id: "pendidikan",
    label: "Pendidikan & Edutech",
    icon: GraduationCap,
    tone: "#8B5CF6",
    cases: [
      { title: "Cari sekolah / kampus partner", target: "Kepala sekolah, rektorat, kabag kerjasama", how: "Discovery industri pendidikan + enrich kontak", outcome: "Penawaran program / lisensi platform", tag: "B2B" },
      { title: "Cari klien corporate training", target: "L&D / HR Development Manager", how: "Query LinkedIn 'Learning & Development' → enrich", outcome: "Penawaran pelatihan in-house", tag: "B2B" },
      { title: "Jangkau calon siswa / orang tua", target: "Orang tua / calon peserta (B2C)", how: "Leads form + cadence WA + reminder", outcome: "Konversi pendaftaran, nurturing WA", tag: "B2C" },
    ],
  },
  {
    id: "kesehatan",
    label: "Kesehatan & Alkes",
    icon: Stethoscope,
    tone: "#06B6D4",
    cases: [
      { title: "Cari klinik / RS untuk alkes & obat", target: "Procurement RS / klinik, kepala instalasi", how: "Discovery industri kesehatan + enrich kontak procurement", outcome: "Penawaran alkes/farmasi, masuk e-katalog", tag: "B2B" },
      { title: "Cari distributor farmasi", target: "Distributor & sub-distributor", how: "Discovery URL + enrich domain", outcome: "Cadence kemitraan distribusi", tag: "Partner" },
      { title: "Edukasi & jangkau nakes (produk medis)", target: "Dokter, apoteker, nakes", how: "Crawl LinkedIn/komunitas + klasifikasi", outcome: "Cadence edukasi produk + sampling", tag: "B2C" },
    ],
  },
  {
    id: "logistik",
    label: "Logistik & Supply Chain",
    icon: Truck,
    tone: "#22C55E",
    cases: [
      { title: "Cari shipper (e-commerce & manufaktur)", target: "Ops / Logistics / Supply Chain Manager", how: "Discovery industri + query LinkedIn 'Logistics' → enrich", outcome: "Penawaran fulfillment / ekspedisi, SLA", tag: "B2B" },
      { title: "Rekrut mitra last-mile / kurir lokal", target: "Kurir & armada lokal per kota", how: "Discovery + enrich kontak", outcome: "Onboarding mitra via cadence", tag: "Partner" },
    ],
  },
  {
    id: "keuangan",
    label: "Keuangan & Fintech",
    icon: Banknote,
    tone: "#10B981",
    cases: [
      { title: "Cari UMKM untuk pinjaman / modal kerja", target: "Pemilik UMKM dengan omzet target", how: "Discovery industri + lokasi → enrich + klasifikasi B2C", outcome: "Cadence WA penawaran limit + onboarding", tag: "B2C" },
      { title: "Akuisisi merchant (payment / QRIS)", target: "Toko, resto, retailer", how: "Discovery + crawl Google Maps-style → enrich HP", outcome: "Cadence aktivasi merchant", tag: "B2B" },
      { title: "Cari nasabah korporat (treasury)", target: "CFO / Finance Director", how: "Query LinkedIn finance senior + enrich", outcome: "Pendekatan RM via cadence + Penawaran", tag: "B2B" },
    ],
  },
  {
    id: "agensi",
    label: "Agensi & Marketing",
    icon: Megaphone,
    tone: "#EC4899",
    cases: [
      { title: "Cari brand clients", target: "Marketing / Brand Manager perusahaan", how: "Discovery industri + query LinkedIn 'Marketing Manager' → enrich", outcome: "Pitch deck via cadence + Penawaran retainer", tag: "B2B" },
      { title: "Rekrut influencer / KOL partner", target: "Creator Instagram & TikTok per niche", how: "Extension crawl IG/TikTok → profil + engagement + kontak", outcome: "Kerjasama endorse, kelola di cadence", tag: "Partner" },
    ],
  },
  {
    id: "otomotif",
    label: "Otomotif",
    icon: Car,
    tone: "#3B82F6",
    cases: [
      { title: "Cari fleet buyer korporat", target: "GA / Fleet Manager perusahaan", how: "Discovery industri + enrich kontak armada", outcome: "Penawaran pembelian/sewa armada", tag: "B2B" },
      { title: "Rekrut dealer & bengkel partner", target: "Dealer, bengkel, variasi", how: "Discovery + crawl Google → enrich", outcome: "Cadence kemitraan suku cadang", tag: "Partner" },
    ],
  },
  {
    id: "retail",
    label: "Retail & E-Commerce",
    icon: ShoppingBag,
    tone: "#F97316",
    cases: [
      { title: "Cari supplier / produsen", target: "Produsen & importir produk", how: "Discovery URL (Tokopedia/Shopee/website) → enrich", outcome: "Sourcing + nego via cadence", tag: "B2B" },
      { title: "Rekrut reseller / dropshipper", target: "Reseller & dropshipper aktif", how: "Leads + crawl IG → klasifikasi", outcome: "Onboarding reseller, cadence aktivasi", tag: "Partner" },
      { title: "Cari pembeli grosir B2B", target: "Toko & grosir per wilayah", how: "Discovery + enrich HP/WA", outcome: "Penawaran harga grosir via WA", tag: "B2B" },
    ],
  },
  {
    id: "konstruksi",
    label: "Konstruksi & Proyek",
    icon: HardHat,
    tone: "#EAB308",
    cases: [
      { title: "Cari kontraktor / subkontraktor", target: "Kontraktor & subkon per spesialisasi", how: "Discovery industri + enrich domain & PIC", outcome: "Cadence + Penawaran material/jasa", tag: "B2B" },
      { title: "Tembus procurement proyek", target: "Procurement / Project Manager", how: "Query LinkedIn 'Project Procurement' → enrich", outcome: "Masuk vendor proyek, lacak di pipeline", tag: "B2B" },
    ],
  },
  {
    id: "energi",
    label: "Energi & Keberlanjutan",
    icon: Zap,
    tone: "#84CC16",
    cases: [
      { title: "Cari pabrik untuk panel surya / efisiensi energi", target: "Facility / Plant Manager pabrik", how: "Discovery industri manufaktur + enrich kontak", outcome: "Penawaran instalasi + ROI hitungan", tag: "B2B" },
      { title: "Rekrut EPC / vendor partner", target: "Kontraktor EPC, instalatir", how: "Discovery + enrich", outcome: "Kemitraan proyek via cadence", tag: "Partner" },
    ],
  },
  {
    id: "asuransi",
    label: "Asuransi & Proteksi",
    icon: Shield,
    tone: "#0891B2",
    cases: [
      { title: "Cari klien korporat (asuransi grup)", target: "HR / GA perusahaan (karyawan banyak)", how: "Discovery industri + ukuran perusahaan → enrich HR", outcome: "Penawaran asuransi grup karyawan", tag: "B2B" },
      { title: "Rekrut agen partner", target: "Calon agen / financial advisor", how: "Leads + crawl → klasifikasi", outcome: "Onboarding & cadence pelatihan agen", tag: "Partner" },
    ],
  },
  {
    id: "konsultan",
    label: "Konsultan & Jasa Profesional",
    icon: Briefcase,
    tone: "#64748B",
    cases: [
      { title: "Cari klien enterprise", target: "C-level / Director di industri target", how: "Query LinkedIn senior + enrich + skor fit", outcome: "Pendekatan thought-leadership via cadence", tag: "B2B" },
      { title: "Bangun jaringan rujukan", target: "Firma & profesional komplementer", how: "Discovery + enrich", outcome: "Kemitraan rujukan, kelola di pipeline", tag: "Partner" },
    ],
  },
  {
    id: "event-kreatif",
    label: "Event, Wedding & Kreatif",
    icon: PartyPopper,
    tone: "#D946EF",
    cases: [
      { title: "Cari klien corporate event", target: "HR / Marketing / GA perusahaan", how: "Discovery industri + enrich kontak", outcome: "Penawaran paket event + proposal", tag: "B2B" },
      { title: "Rekrut vendor (dekor, catering, MUA)", target: "Vendor kreatif aktif di Instagram", how: "Extension crawl IG + Google → profil + kontak", outcome: "Kerjasama vendor, cadence koordinasi", tag: "Partner" },
    ],
  },
  {
    id: "hukum",
    label: "Hukum & Notaris",
    icon: Scale,
    tone: "#475569",
    cases: [
      { title: "Cari klien korporat butuh legal counsel", target: "Direksi / Corporate Secretary / Legal Manager", how: "Discovery industri + query LinkedIn 'Legal' → enrich kontak", outcome: "Cadence retainer hukum + Penawaran jasa", tag: "B2B" },
      { title: "Tangkap perusahaan yang lagi M&A / ekspansi", target: "Perusahaan dengan berita akuisisi/pendanaan", how: "Discovery + enrich → workspace 'Corporate'", outcome: "Penawaran due diligence / legal advisory", tag: "B2B" },
      { title: "Bangun jaringan notaris / PPAT rujukan", target: "Notaris, PPAT, firma lain", how: "Discovery + enrich", outcome: "Kemitraan rujukan via cadence", tag: "Partner" },
    ],
  },
  {
    id: "agribisnis",
    label: "Pertanian & Agribisnis",
    icon: Sprout,
    tone: "#65A30D",
    cases: [
      { title: "Cari distributor pupuk/bibit/pestisida", target: "Toko tani, distributor sarana produksi", how: "Discovery + lokasi → enrich HP/WA", outcome: "Cadence + Penawaran skema agen", tag: "Partner" },
      { title: "Cari offtaker / buyer hasil panen", target: "Pabrik pengolahan, eksportir, retail", how: "Discovery industri + enrich procurement", outcome: "Kontrak suplai, lacak di pipeline", tag: "B2B" },
      { title: "Gandeng koperasi & kelompok tani", target: "Ketua koperasi / gapoktan", how: "Discovery + enrich kontak", outcome: "Cadence kemitraan + pendampingan", tag: "Partner" },
    ],
  },
  {
    id: "media",
    label: "Media & Penerbitan",
    icon: Newspaper,
    tone: "#0F766E",
    cases: [
      { title: "Cari pengiklan brand", target: "Marketing / Media Buyer brand", how: "Discovery industri + query LinkedIn 'Marketing' → enrich", outcome: "Penawaran paket iklan / native ads", tag: "B2B" },
      { title: "Cari klien branded content", target: "Brand butuh konten/PR", how: "Discovery + enrich", outcome: "Cadence proposal kolaborasi konten", tag: "B2B" },
    ],
  },
  {
    id: "telekomunikasi",
    label: "Telekomunikasi & Konektivitas",
    icon: RadioTower,
    tone: "#2563EB",
    cases: [
      { title: "Cari korporat butuh internet dedicated", target: "IT / Network Manager perusahaan & pabrik", how: "Discovery industri + query LinkedIn 'IT/Network' → enrich", outcome: "Penawaran konektivitas + SLA", tag: "B2B" },
      { title: "Rekrut reseller / agen", target: "Toko komputer, ISP lokal, agen", how: "Discovery + enrich", outcome: "Cadence onboarding mitra", tag: "Partner" },
      { title: "Cari pemilik lahan/gedung untuk tower", target: "Pemilik lahan strategis", how: "Discovery + enrich kontak", outcome: "Penawaran sewa lahan tower", tag: "Partner" },
    ],
  },
  {
    id: "b2g",
    label: "Pemerintahan & B2G",
    icon: Landmark,
    tone: "#9333EA",
    cases: [
      { title: "Cari instansi untuk tender / pengadaan", target: "Dinas / BUMN / lembaga, PPK", how: "Discovery instansi + enrich kontak pengadaan", outcome: "Cadence intro + ikut e-katalog/tender", tag: "B2B" },
      { title: "Bangun konsorsium tender", target: "Vendor/kontraktor komplementer", how: "Discovery + enrich", outcome: "Kemitraan tender bareng", tag: "Partner" },
    ],
  },
  {
    id: "ngo",
    label: "Nirlaba, NGO & CSR",
    icon: HeartHandshake,
    tone: "#DB2777",
    cases: [
      { title: "Cari donor korporat (CSR)", target: "CSR / Sustainability Manager perusahaan", how: "Discovery industri + query LinkedIn 'CSR/Sustainability' → enrich", outcome: "Cadence proposal program CSR", tag: "B2B" },
      { title: "Cari mitra program & relawan", target: "Komunitas, kampus, korporat", how: "Discovery + crawl IG → enrich", outcome: "Onboarding mitra/relawan via cadence", tag: "Partner" },
    ],
  },
  {
    id: "travel",
    label: "Tour, Travel & Tiket",
    icon: Plane,
    tone: "#0891B2",
    cases: [
      { title: "Cari klien corporate travel", target: "GA / HR / Travel Coordinator perusahaan", how: "Discovery industri + enrich kontak", outcome: "Penawaran kontrak corporate travel", tag: "B2B" },
      { title: "Gandeng hotel / maskapai / atraksi", target: "Sales hotel, GSA maskapai, pengelola atraksi", how: "Discovery + enrich", outcome: "Rate partner via cadence", tag: "Partner" },
      { title: "Jangkau traveler retail", target: "Calon wisatawan (B2C)", how: "Leads + cadence WA promo musiman", outcome: "Konversi paket tur", tag: "B2C" },
    ],
  },
  {
    id: "kecantikan",
    label: "Kecantikan & Wellness",
    icon: Scissors,
    tone: "#E11D48",
    cases: [
      { title: "Cari salon / klinik partner reseller", target: "Salon, klinik kecantikan, spa", how: "Discovery + crawl IG/Google → enrich HP", outcome: "Cadence + Penawaran produk grosir", tag: "Partner" },
      { title: "Cari klien korporat (grooming/spa)", target: "HR perusahaan (benefit karyawan)", how: "Discovery industri + enrich", outcome: "Penawaran paket korporat", tag: "B2B" },
      { title: "Rekrut reseller skincare", target: "Reseller & beauty influencer", how: "Crawl IG/TikTok → klasifikasi", outcome: "Onboarding reseller, cadence aktivasi", tag: "Partner" },
    ],
  },
  {
    id: "fitness",
    label: "Olahraga & Fitness",
    icon: Dumbbell,
    tone: "#16A34A",
    cases: [
      { title: "Cari korporat (corporate wellness)", target: "HR / Wellbeing Manager", how: "Discovery industri + enrich", outcome: "Penawaran membership korporat", tag: "B2B" },
      { title: "Gandeng gym / studio partner", target: "Gym, studio yoga, klub olahraga", how: "Discovery + crawl IG → enrich", outcome: "Kemitraan kelas/peralatan via cadence", tag: "Partner" },
    ],
  },
  {
    id: "fashion",
    label: "Fashion & Tekstil",
    icon: Shirt,
    tone: "#C026D3",
    cases: [
      { title: "Cari buyer grosir / butik", target: "Toko grosir, butik, marketplace seller", how: "Discovery + crawl Tokopedia/Shopee/IG → enrich", outcome: "Penawaran harga grosir via WA", tag: "B2B" },
      { title: "Cari supplier kain / konveksi", target: "Pabrik tekstil, konveksi, vendor maklon", how: "Discovery URL → enrich kontak", outcome: "Sourcing + nego via cadence", tag: "B2B" },
      { title: "Cari brand untuk jasa maklon", target: "Brand fashion lokal", how: "Crawl IG + enrich", outcome: "Cadence penawaran produksi", tag: "Partner" },
    ],
  },
  {
    id: "furnitur",
    label: "Furnitur & Interior",
    icon: Sofa,
    tone: "#B45309",
    cases: [
      { title: "Cari kontraktor interior / arsitek", target: "Kontraktor, arsitek, desainer interior", how: "Discovery + crawl IG → enrich", outcome: "Cadence + Penawaran material/produk", tag: "Partner" },
      { title: "Cari proyek korporat (kantor/hotel)", target: "GA / Project Manager fit-out", how: "Discovery industri + enrich", outcome: "Penawaran pengadaan furnitur proyek", tag: "B2B" },
      { title: "Rekrut toko / retailer partner", target: "Toko mebel & home decor", how: "Discovery + enrich", outcome: "Skema konsinyasi/reseller", tag: "Partner" },
    ],
  },
  {
    id: "percetakan",
    label: "Percetakan & Kemasan",
    icon: Printer,
    tone: "#7C3AED",
    cases: [
      { title: "Cari korporat butuh cetak & merchandise", target: "Marketing / GA / Procurement", how: "Discovery industri + enrich kontak", outcome: "Penawaran company profile/merchandise", tag: "B2B" },
      { title: "Cari brand butuh kemasan", target: "Brand F&B, kosmetik, UMKM", how: "Crawl IG/marketplace + enrich", outcome: "Cadence penawaran custom packaging", tag: "B2B" },
    ],
  },
  {
    id: "cybersecurity",
    label: "Keamanan Siber & IT Security",
    icon: Lock,
    tone: "#DC2626",
    cases: [
      { title: "Cari korporat butuh pentest / SOC", target: "CISO / IT Security / IT Manager", how: "Discovery industri (finance/health) + query LinkedIn 'CISO/Security' → enrich", outcome: "Penawaran pentest/SOC/audit", tag: "B2B" },
      { title: "Rekrut MSP / SI partner", target: "Managed service provider, system integrator", how: "Discovery + enrich domain", outcome: "Kemitraan reseller solusi keamanan", tag: "Partner" },
    ],
  },
  {
    id: "gaming",
    label: "Gaming & Esports",
    icon: Gamepad2,
    tone: "#7E22CE",
    cases: [
      { title: "Cari sponsor brand", target: "Brand yang sasar Gen-Z (F&B, gadget, telco)", how: "Discovery + query LinkedIn 'Brand/Marketing' → enrich", outcome: "Penawaran sponsorship turnamen/tim", tag: "B2B" },
      { title: "Rekrut talent / streamer", target: "Streamer & pro player (Twitch/YouTube/TikTok)", how: "Crawl YouTube/TikTok/IG → profil + kontak", outcome: "Cadence kerjasama talent", tag: "Partner" },
    ],
  },
  {
    id: "tambang-migas",
    label: "Pertambangan & Migas",
    icon: Pickaxe,
    tone: "#78716C",
    cases: [
      { title: "Cari kontraktor / EPC", target: "Kontraktor tambang, EPC, jasa pengeboran", how: "Discovery industri + enrich PIC", outcome: "Cadence + Penawaran jasa/alat", tag: "B2B" },
      { title: "Tembus procurement tambang", target: "Procurement / Logistics di site", how: "Query LinkedIn 'Procurement Mining' → enrich", outcome: "Masuk vendor list, pipeline", tag: "B2B" },
      { title: "Cari supplier alat berat & sparepart", target: "Distributor alat berat", how: "Discovery + enrich", outcome: "Kemitraan suplai", tag: "Partner" },
    ],
  },
  {
    id: "perikanan",
    label: "Perikanan & Kelautan",
    icon: Fish,
    tone: "#0E7490",
    cases: [
      { title: "Cari eksportir / buyer hasil laut", target: "Eksportir, pabrik pengolahan, retail", how: "Discovery industri + enrich procurement", outcome: "Kontrak suplai + cadence", tag: "B2B" },
      { title: "Cari distributor cold-chain", target: "Distributor & logistik rantai dingin", how: "Discovery + enrich", outcome: "Kemitraan distribusi", tag: "Partner" },
    ],
  },
  {
    id: "limbah",
    label: "Daur Ulang & Limbah",
    icon: Recycle,
    tone: "#15803D",
    cases: [
      { title: "Cari pabrik penghasil limbah", target: "Facility / EHS Manager pabrik", how: "Discovery industri manufaktur + query LinkedIn 'EHS/Sustainability' → enrich", outcome: "Penawaran pengelolaan/pengangkutan limbah", tag: "B2B" },
      { title: "Cari offtaker material daur ulang", target: "Pabrik pengguna bahan daur ulang", how: "Discovery + enrich", outcome: "Kontrak offtake via cadence", tag: "B2B" },
    ],
  },
  {
    id: "air-utilitas",
    label: "Air, Sanitasi & Utilitas",
    icon: Droplets,
    tone: "#0284C7",
    cases: [
      { title: "Cari industri butuh water treatment", target: "Plant / Facility Manager pabrik & gedung", how: "Discovery industri + enrich kontak teknik", outcome: "Penawaran instalasi + maintenance", tag: "B2B" },
      { title: "Rekrut distributor / instalatir", target: "Kontraktor MEP, distributor alat", how: "Discovery + enrich", outcome: "Kemitraan via cadence", tag: "Partner" },
    ],
  },
  {
    id: "petcare",
    label: "Veteriner & Pet Care",
    icon: PawPrint,
    tone: "#D97706",
    cases: [
      { title: "Cari klinik hewan / petshop partner", target: "Klinik hewan, petshop, grooming", how: "Discovery + crawl Google/IG → enrich HP", outcome: "Cadence + Penawaran produk grosir", tag: "Partner" },
      { title: "Cari distributor pakan & obat hewan", target: "Distributor petfood/farmasi hewan", how: "Discovery URL → enrich", outcome: "Kemitraan distribusi", tag: "B2B" },
      { title: "Jangkau pemilik hewan (produk B2C)", target: "Pet owner aktif komunitas/IG", how: "Crawl IG + leads → cadence WA", outcome: "Konversi produk/langganan", tag: "B2C" },
    ],
  },
  {
    id: "coworking",
    label: "Coworking & Ruang Kerja",
    icon: Building,
    tone: "#4F46E5",
    cases: [
      { title: "Cari startup & freelancer", target: "Founder startup, freelancer, tim kecil", how: "Discovery + crawl LinkedIn/IG → enrich", outcome: "Cadence promo membership + tur", tag: "B2C" },
      { title: "Cari korporat butuh satellite office", target: "HR / GA / Ops perusahaan", how: "Discovery industri + enrich", outcome: "Penawaran private office/tim", tag: "B2B" },
    ],
  },
  {
    id: "produksi-kreatif",
    label: "Produksi Kreatif & Fotografi",
    icon: Camera,
    tone: "#BE185D",
    cases: [
      { title: "Cari brand butuh produksi video/foto", target: "Marketing / Brand / Social Media Manager", how: "Discovery + query LinkedIn 'Marketing' → enrich", outcome: "Cadence portfolio + Penawaran produksi", tag: "B2B" },
      { title: "Cari klien event & wedding", target: "EO, calon pengantin, korporat", how: "Crawl IG + leads → enrich", outcome: "Cadence paket dokumentasi", tag: "B2C" },
    ],
  },
  {
    id: "facility",
    label: "Jasa Kebersihan & Facility",
    icon: Wrench,
    tone: "#0D9488",
    cases: [
      { title: "Cari gedung & perkantoran", target: "Building / Facility Manager", how: "Discovery industri properti + enrich kontak", outcome: "Penawaran cleaning service + kontrak", tag: "B2B" },
      { title: "Cari hotel & RS (kontrak besar)", target: "GA / Housekeeping / Procurement", how: "Discovery + enrich", outcome: "Cadence + Penawaran kontrak tahunan", tag: "B2B" },
    ],
  },
  {
    id: "bumn",
    label: "BUMN & Perusahaan Negara",
    icon: Network,
    tone: "#1D4ED8",
    cases: [
      { title: "Cari BUMN / anak usaha untuk pengadaan", target: "Procurement / PPK BUMN & anak-cucu usaha", how: "Discovery instansi + query LinkedIn 'Procurement' → enrich kontak", outcome: "Cadence intro + masuk e-katalog / tender", tag: "B2B" },
      { title: "Jadi mitra/vendor binaan (PKBL/TJSL)", target: "Divisi kemitraan / CSR BUMN", how: "Discovery + enrich PIC kemitraan", outcome: "Penawaran program mitra binaan", tag: "Partner" },
      { title: "Cross-sell ke ekosistem BUMN", target: "Anak & cucu usaha satu holding", how: "Discovery + enrich → workspace 'Holding'", outcome: "Ekspansi akun lewat cadence", tag: "B2B" },
    ],
  },
  {
    id: "koperasi",
    label: "Koperasi & Ekonomi Kerakyatan",
    icon: HandHeart,
    tone: "#0F766E",
    cases: [
      { title: "Cari koperasi untuk produk/jasa anggota", target: "Pengurus koperasi (simpan-pinjam, karyawan, tani)", how: "Discovery + enrich kontak pengurus", outcome: "Penawaran produk untuk anggota via koperasi", tag: "B2B" },
      { title: "Rekrut koperasi sebagai channel distribusi", target: "Koperasi serba usaha & unit desa", how: "Discovery + lokasi → enrich", outcome: "Kemitraan distribusi, cadence onboarding", tag: "Partner" },
      { title: "Layani anggota (B2C lewat koperasi)", target: "Anggota koperasi", how: "Leads + cadence WA via koperasi", outcome: "Konversi produk/pembiayaan anggota", tag: "B2C" },
    ],
  },
  {
    id: "startup",
    label: "Startup & Venture",
    icon: Rocket,
    tone: "#7C3AED",
    cases: [
      { title: "Cari startup early/growth untuk tools & jasa", target: "Founder / Ops / Growth lead startup", how: "Discovery industri teknologi + crawl LinkedIn → enrich", outcome: "Cadence demo + free trial, Penawaran", tag: "B2B" },
      { title: "Tangkap startup yang baru fundraising", target: "Startup dengan berita pendanaan (butuh scale)", how: "Discovery + enrich → workspace 'Funded'", outcome: "Penawaran hiring/tools/agency tepat waktu", tag: "B2B" },
      { title: "Gandeng VC & accelerator (akses portfolio)", target: "VC, akselerator, inkubator", how: "Discovery + enrich kontak partner", outcome: "Kemitraan ekosistem → akses banyak startup", tag: "Partner" },
    ],
  },
  {
    id: "syariah",
    label: "Keuangan & Ekonomi Syariah",
    icon: MoonStar,
    tone: "#047857",
    cases: [
      { title: "Cari nasabah pembiayaan syariah", target: "UMKM / korporat halal-conscious", how: "Discovery industri (F&B halal, fashion muslim, travel umrah) + enrich", outcome: "Cadence penawaran pembiayaan akad syariah", tag: "B2B" },
      { title: "Akuisisi merchant & UMKM halal", target: "Produsen produk halal, UMKM", how: "Discovery + crawl marketplace/IG → enrich HP", outcome: "Onboarding merchant, cadence aktivasi", tag: "B2C" },
      { title: "Gandeng lembaga (masjid/pesantren/komunitas)", target: "Pengurus DKM, pesantren, komunitas", how: "Discovery + enrich kontak", outcome: "Kemitraan zakat/wakaf/tabungan via cadence", tag: "Partner" },
    ],
  },
  {
    id: "ekspor-impor",
    label: "Ekspor-Impor & Perdagangan Internasional",
    icon: Ship,
    tone: "#0369A1",
    cases: [
      { title: "Cari buyer luar negeri", target: "Importir / distributor di negara tujuan", how: "Discovery + crawl LinkedIn / direktori B2B → enrich email & website", outcome: "Cadence + Penawaran FOB/CIF, lacak di pipeline", tag: "B2B" },
      { title: "Cari produsen lokal untuk diekspor", target: "Pabrik & UMKM produk ekspor", how: "Discovery industri + enrich kontak", outcome: "Sourcing + kontrak ekspor via cadence", tag: "B2B" },
      { title: "Gandeng freight forwarder & PPJK", target: "Forwarder, customs broker, ekspedisi", how: "Discovery + enrich", outcome: "Kemitraan logistik & kepabeanan", tag: "Partner" },
    ],
  },
  {
    id: "edutech-bootcamp",
    label: "Edutech & Bootcamp",
    icon: Code2,
    tone: "#4338CA",
    cases: [
      { title: "Cari calon peserta bootcamp", target: "Fresh grad & career switcher", how: "Crawl LinkedIn/IG + leads → klasifikasi minat", outcome: "Cadence WA + reminder enroll, konversi batch", tag: "B2C" },
      { title: "Cari perusahaan hiring partner", target: "HR / Talent yang butuh talenta digital", how: "Discovery industri tech + query LinkedIn 'Talent/Recruiter' → enrich", outcome: "Penawaran hiring partner / job placement lulusan", tag: "B2B" },
      { title: "Cari korporat untuk upskilling", target: "L&D / HR Development Manager", how: "Query LinkedIn 'Learning & Development' → enrich", outcome: "Penawaran corporate bootcamp in-house", tag: "B2B" },
    ],
  },
  {
    id: "asuransi-mikro",
    label: "Asuransi Mikro & Inklusi",
    icon: Umbrella,
    tone: "#0D9488",
    cases: [
      { title: "Gandeng agregator untuk distribusi mikro", target: "Koperasi, paguyuban, komunitas ojol, UMKM", how: "Discovery + enrich kontak pengurus", outcome: "Kemitraan distribusi polis mikro via cadence", tag: "Partner" },
      { title: "Jangkau pekerja informal (B2C)", target: "Pekerja informal, pedagang, UMKM", how: "Leads + cadence WA premi terjangkau", outcome: "Konversi polis mikro massal", tag: "B2C" },
      { title: "Embedded insurance lewat fintech/e-commerce", target: "Fintech, e-wallet, marketplace", how: "Discovery industri fintech + query LinkedIn 'Product/Partnership' → enrich", outcome: "Penawaran embedded insurance API", tag: "B2B" },
    ],
  },
  {
    id: "bumn-konstruksi",
    label: "BUMN Konstruksi (Karya)",
    icon: Construction,
    tone: "#B91C1C",
    cases: [
      { title: "Cari proyek infrastruktur pemerintah/BUMN", target: "PPK, project owner, Dinas PU, BUMN", how: "Discovery instansi + enrich kontak proyek", outcome: "Ikut tender + Penawaran sebagai kontraktor/subkon", tag: "B2B" },
      { title: "Cari subkontraktor & supplier proyek", target: "Subkon spesialis & supplier material", how: "Discovery + enrich PIC", outcome: "Kemitraan proyek, kelola di pipeline", tag: "Partner" },
      { title: "Bentuk JO / konsorsium proyek besar", target: "Kontraktor besar & investor", how: "Discovery + enrich", outcome: "Joint operation via cadence", tag: "Partner" },
    ],
  },
  {
    id: "healthtech",
    label: "Healthtech & Digital Health",
    icon: HeartPulse,
    tone: "#0EA5E9",
    cases: [
      { title: "Cari RS / klinik untuk adopsi platform", target: "Direktur RS / IT / medis", how: "Discovery industri kesehatan + query LinkedIn 'Hospital IT/Director' → enrich", outcome: "Penawaran SaaS klinis (EMR/antrian/telemed)", tag: "B2B" },
      { title: "Cari korporat untuk telemedicine benefit", target: "HR / Wellbeing Manager", how: "Discovery industri + enrich", outcome: "Penawaran layanan kesehatan karyawan", tag: "B2B" },
      { title: "Jangkau pasien / member (B2C)", target: "Pengguna app kesehatan, pasien kronis", how: "Leads + cadence WA reminder/langganan", outcome: "Konversi langganan & retensi", tag: "B2C" },
    ],
  },
  {
    id: "cold-chain",
    label: "Logistik Cold Chain (Rantai Dingin)",
    icon: Snowflake,
    tone: "#0891B2",
    cases: [
      { title: "Cari shipper produk dingin (F&B/farmasi)", target: "Supply Chain / QA F&B, farmasi, frozen food", how: "Discovery industri + query LinkedIn 'Supply Chain' → enrich", outcome: "Penawaran cold storage / armada reefer + SLA suhu", tag: "B2B" },
      { title: "Cari distributor frozen & fresh", target: "Distributor produk beku/segar", how: "Discovery + enrich kontak", outcome: "Kemitraan distribusi rantai dingin", tag: "Partner" },
      { title: "Cari RS / lab untuk vaksin & sampel", target: "Procurement RS, lab, klinik", how: "Discovery industri kesehatan + enrich", outcome: "Penawaran logistik vaksin/sampel terkontrol", tag: "B2B" },
    ],
  },
];

export default function UseCasePage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return INDUSTRIES;
    return INDUSTRIES.map((ind) => ({
      ...ind,
      cases: ind.cases.filter((c) =>
        `${c.title} ${c.target} ${c.how} ${c.outcome} ${c.tag} ${ind.label}`.toLowerCase().includes(query),
      ),
    })).filter((ind) => ind.cases.length > 0);
  }, [query]);

  const totalCases = INDUSTRIES.reduce((n, i) => n + i.cases.length, 0);
  const shownCases = filtered.reduce((n, i) => n + i.cases.length, 0);

  return (
    <div>
      <PageHeader
        title="Use Case — Maira untuk semua bidang"
        description={`${totalCases} skenario sales & marketing di ${INDUSTRIES.length} industri. Satu pola: temukan → profil AI → klasifikasi → jangkau.`}
      >
        <Link href="/documentation" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
          Panduan fitur <ArrowRight className="h-4 w-4" />
        </Link>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Universal pattern */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-tertiary/5 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Satu pola, semua industri</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mau cari engineer IT, klien hotel, distributor pabrik, atau influencer — alurnya sama. Maira yang menyesuaikan datanya.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PATTERN.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card/70 p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </span>
                <p className="mt-2 text-sm font-semibold">{s.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari use case… (mis. 'IT', 'hotel', 'distributor', 'influencer')" className="pl-8" />
        </div>

        {/* Jump-nav — sticky horizontal strip so any of the 50+ industries
            stays one click away while scrolling (sits just under the h-14
            TopBar). Must be a direct child of the tall scroll container, or
            it would unstick once a short wrapper scrolls past. Hidden while
            searching; replaced by a result count. */}
        {!query ? (
          <div className="sticky top-14 z-20 -mx-6 border-y bg-background/90 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {INDUSTRIES.map((ind) => (
                <a key={ind.id} href={`#${ind.id}`} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition hover:-translate-y-px hover:text-foreground hover:shadow-sm">
                  <ind.icon className="h-3.5 w-3.5" style={{ color: ind.tone }} />
                  {ind.label}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{shownCases} use case cocok dengan “{q}”.</p>
        )}

        {/* Industry sections */}
        {filtered.map((ind) => (
          <section key={ind.id} id={ind.id} className="scroll-mt-28">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${ind.tone}1A`, color: ind.tone }}>
                <ind.icon className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold">{ind.label}</h2>
              <Badge variant="muted">{ind.cases.length} use case</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {ind.cases.map((c) => (
                <Card key={c.title} className="h-full border-l-4 transition hover:shadow-md" style={{ borderLeftColor: ind.tone }}>
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">{c.title}</p>
                      <Badge variant="muted" className={cn("shrink-0", TAG_CLS[c.tag])}>{c.tag}</Badge>
                    </div>
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium text-foreground">Target: </span>
                      <span className="text-muted-foreground">{c.target}</span>
                    </p>
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium text-primary">Cara di Maira: </span>
                      <span className="text-muted-foreground">{c.how}</span>
                    </p>
                    <p className="mt-auto border-t pt-2 text-xs leading-relaxed">
                      <span className="font-medium text-tertiary">Hasil: </span>
                      <span className="text-muted-foreground">{c.outcome}</span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Tidak ada use case cocok “{q}”. Coba kata kunci lain — pola Maira bisa dipakai di industri apa pun.
          </div>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          Industrimu belum ada? Polanya tetap sama — mulai dari{" "}
          <Link href="/workspaces" className="text-primary underline">buat Workspace</Link> (produk → market-fit → discovery → chat).
        </p>
      </div>
    </div>
  );
}
