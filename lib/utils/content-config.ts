import {
  Camera,
  FileText,
  Mail,
  MessageCircle,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

import type { ContentStatus, ContentType } from "@/lib/types";

export const CONTENT_TYPE_META: Record<
  ContentType,
  { label: string; color: string; icon: LucideIcon; channelKey: string }
> = {
  "wa-broadcast": {
    label: "WhatsApp Broadcast",
    color: "#25D366",
    icon: MessageCircle,
    channelKey: "whatsapp",
  },
  "email-campaign": {
    label: "Email Campaign",
    color: "#6366F1",
    icon: Mail,
    channelKey: "email",
  },
  "instagram-post": {
    label: "Instagram Post",
    color: "#E1306C",
    icon: Camera,
    channelKey: "instagram",
  },
  "tokopedia-post": {
    label: "Tokopedia Post",
    color: "#03AC0E",
    icon: ShoppingBag,
    channelKey: "tokopedia",
  },
  blog: {
    label: "Blog Article",
    color: "#8B5CF6",
    icon: FileText,
    channelKey: "blog",
  },
};

export const CONTENT_TYPES: ContentType[] = [
  "wa-broadcast",
  "email-campaign",
  "instagram-post",
  "tokopedia-post",
  "blog",
];

export const CONTENT_STATUS_META: Record<
  ContentStatus,
  {
    label: string;
    variant: "muted" | "warning" | "secondary" | "default" | "success";
  }
> = {
  draft: { label: "Draf", variant: "muted" },
  review: { label: "Review", variant: "warning" },
  approved: { label: "Disetujui", variant: "secondary" },
  scheduled: { label: "Terjadwal", variant: "default" },
  published: { label: "Diterbitkan", variant: "success" },
};

export const CONTENT_STATUSES: ContentStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
];

/** Inline AI draft templates per content type (rotating for "Buat ulang"). */
export const CONTENT_AI_DRAFTS: Record<ContentType, string[]> = {
  "wa-broadcast": [
    "Halo {{nama}} 👋 Mau berbagi penawaran khusus untuk {{perusahaan}}: paket Growth diskon 20% bulan ini saja. Reply YA untuk info detail. Stok terbatas 🙏",
    "Selamat pagi {{nama}} ☀️ Mengingatkan demo {{produk}} besok pukul 14:00 WIB. Konfirmasi kehadiran dengan balas pesan ini ya. Sampai jumpa!",
    "Pak/Bu {{nama}}, terima kasih sudah berbelanja di toko kami 🙏 Kami siapkan diskon 15% untuk pembelian berikutnya, berlaku 7 hari. Kode: LANJUT15",
  ],
  "email-campaign": [
    "Subjek: 5 tren sales Indonesia bulan ini\n\nHalo Tim,\n\nBulan ini kami mengumpulkan 5 insight tentang tren sales B2B di Indonesia — dari pergeseran ke WhatsApp-first sampai dampak UU PDP pada outbound. Baca selengkapnya di link berikut.\n\nSalam,\nTim Agentic Sales",
    "Subjek: {{nama}}, lihat bagaimana tim sales sejenis mempercepat closing\n\nHalo {{nama}},\n\nKami baru saja terbitkan studi kasus tim sales yang menutup 3× lebih banyak deal setelah pakai cadence WhatsApp + email. Mau saya kirim ringkasannya untuk {{perusahaan}}?",
  ],
  "instagram-post": [
    "5 Cara Tutup Deal Lebih Cepat (Versi Tim Sales Indonesia 🇮🇩):\n\n1. Balas WA dalam 5 menit\n2. Pakai cadence multi-channel\n3. Catat keberatan setiap meeting\n4. Personalisasi pesan pakai nama\n5. Follow-up sampai 7×\n\nSimpan post-nya 👇",
    "Behind the scenes tim sales hari ini 💪 — sprint Q2 dimulai dengan target 120 lead baru. Saatnya nyalakan cadence \"Demo to Close\" 🚀",
  ],
  "tokopedia-post": [
    "🎉 Promo Terbatas! Bundling 3 produk best-seller cuma Rp 199.000 (hemat 35%). Gratis ongkir Jabodetabek. Klik beli sebelum kehabisan!",
    "✨ Produk Baru — Skincare Set Premium 5-step. BPOM terdaftar, cocok untuk kulit sensitif. Cek detail di halaman produk.",
  ],
  blog: [
    "## Memilih sales platform untuk UMKM Indonesia\n\nMemilih sales platform untuk UMKM tidak semudah memilih dari katalog tools global. Konteks lokal — WhatsApp sebagai channel utama, integrasi marketplace, dan kepatuhan UU PDP — sangat berpengaruh.\n\nDi artikel ini kami bahas 6 kriteria evaluasi yang sering luput...",
    "## UU PDP No. 27/2022 untuk tim sales\n\nUU PDP mengubah cara tim sales mengelola data pelanggan. Tiga implikasi penting:\n\n1. Persetujuan eksplisit sebelum outreach\n2. Hak akses & hapus data pelanggan\n3. Jejak audit komprehensif untuk regulator",
  ],
};
