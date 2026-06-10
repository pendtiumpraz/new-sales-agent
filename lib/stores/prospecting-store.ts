import { create } from "zustand";

import {
  prospects as seedProspects,
  inbound as seedInbound,
  companies,
} from "@/lib/api-mock/data";
import type { InboundLead, MessagingChannel, ProspectLead } from "@/lib/types";

// ---- synthetic "crawl" discovery (client-side, for the live demo) -----------
const CRAWL_FIRST = ["Andi", "Sari", "Budi", "Maya", "Reza", "Dewi", "Putra", "Nina", "Yoga", "Tari", "Fajar", "Wulan", "Galih", "Ayu", "Rangga", "Sinta"];
const CRAWL_LAST = ["Pranata", "Wijaya", "Halim", "Santoso", "Pratama", "Lestari", "Nugroho", "Permata", "Saputra", "Kusuma", "Hartono", "Maharani"];
const CRAWL_TITLES = ["Direktur Utama", "Manajer Penjualan", "Kepala Cabang", "Account Executive", "General Manager", "Direktur Operasional", "Komisaris", "Staf Pemasaran"];
const CRAWL_SIGNALS = ["Mengunjungi halaman harga", "Aktif di LinkedIn", "Membuka email kampanye", "Menambah tim sales", "Membandingkan vendor CRM", "Hadir webinar produk"];
const CRAWL_SOURCES = ["LinkedIn (baru)", "Web crawl (baru)", "Direktori industri (baru)"];
const CRAWL_CHANNELS: MessagingChannel[] = ["whatsapp", "email", "instagram", "linkedin", "sms"];
const CRAWL_REVENUE = ["< Rp 5 M/thn", "Rp 5–25 M/thn", "Rp 25–100 M/thn", "Rp 100–500 M/thn", "> Rp 500 M/thn"];
const CRAWL_AVATAR = ["#FB5E3B", "#14B8A6", "#F59E0B", "#0EA5E9", "#8B5CF6", "#EC4899", "#10B981", "#6366F1"];
const rnd = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const rndInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
let crawlSeq = 0;

function makeProspect(): ProspectLead {
  const co = rnd(companies);
  const score = rndInt(42, 94);
  return {
    id: `pr_crawl_${Date.now()}_${crawlSeq++}`,
    name: `${rnd(CRAWL_FIRST)} ${rnd(CRAWL_LAST)}`,
    title: rnd(CRAWL_TITLES),
    company: co.name,
    industry: co.industry,
    city: co.city,
    companySize: co.size,
    revenue: rnd(CRAWL_REVENUE),
    email: "—",
    emailVerified: false,
    phone: "—",
    channelPreference: rnd(CRAWL_CHANNELS),
    techStack: [],
    aiScore: score,
    aiTemp: score >= 75 ? "panas" : score >= 50 ? "hangat" : "dingin",
    intentSignals: Array.from(new Set([rnd(CRAWL_SIGNALS), rnd(CRAWL_SIGNALS)])),
    source: rnd(CRAWL_SOURCES),
    enriched: false,
    inCrm: false,
    avatarColor: rnd(CRAWL_AVATAR),
  };
}

function enrichOne(p: ProspectLead): ProspectLead {
  if (p.enriched) return p;
  const dom =
    p.company
      .replace(/^(PT|CV|UD|Koperasi)\s+/i, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 12) || "mail";
  return {
    ...p,
    enriched: true,
    emailVerified: true,
    email: `${p.name.toLowerCase().replace(/\s+/g, ".")}@${dom}.co.id`,
    phone: `+62 81${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    techStack: p.techStack.length
      ? p.techStack
      : ["WhatsApp Business API", "Google Workspace"],
  };
}

interface ProspectingState {
  prospects: ProspectLead[];
  inbound: InboundLead[];
  crawl: (n: number) => void;
  enrich: (id: string) => void;
  enrichMany: (ids: string[]) => void;
  validateMany: (ids: string[]) => void;
  addToCrm: (id: string) => void;
  addManyToCrm: (ids: string[]) => void;
  replyInbound: (id: string) => void;
  routeInbound: (id: string) => void;
}

// In-memory only. Seeded from prospects.json / inbound.json.
export const useProspectingStore = create<ProspectingState>((set) => ({
  prospects: seedProspects.map((p) => ({ ...p })),
  inbound: seedInbound.map((i) => ({ ...i })),
  crawl: (n) =>
    set((s) => ({
      prospects: [
        ...Array.from({ length: n }, () => makeProspect()),
        ...s.prospects,
      ],
    })),
  enrich: (id) =>
    set((s) => ({
      prospects: s.prospects.map((p) => (p.id === id ? enrichOne(p) : p)),
    })),
  enrichMany: (ids) =>
    set((s) => ({
      prospects: s.prospects.map((p) => (ids.includes(p.id) ? enrichOne(p) : p)),
    })),
  // Lightweight validation pass — flips emailVerified to true and ensures
  // each selected prospect has a phone number. Mock impl of an MX-record /
  // phone-existence check (in production this'd hit a verification API like
  // Hunter / Snov / NeverBounce).
  validateMany: (ids) =>
    set((s) => ({
      prospects: s.prospects.map((p) =>
        ids.includes(p.id)
          ? {
              ...p,
              emailVerified: true,
              phone:
                p.phone && p.phone.length > 4
                  ? p.phone
                  : `+62 81${rndInt(20000000, 99999999)}`,
            }
          : p,
      ),
    })),
  addToCrm: (id) =>
    set((s) => ({
      prospects: s.prospects.map((p) =>
        p.id === id ? { ...enrichOne(p), inCrm: true } : p,
      ),
    })),
  addManyToCrm: (ids) =>
    set((s) => ({
      prospects: s.prospects.map((p) =>
        ids.includes(p.id) ? { ...enrichOne(p), inCrm: true } : p,
      ),
    })),
  replyInbound: (id) =>
    set((s) => ({
      inbound: s.inbound.map((i) =>
        i.id === id ? { ...i, status: "dibalas" } : i,
      ),
    })),
  routeInbound: (id) =>
    set((s) => ({
      inbound: s.inbound.map((i) =>
        i.id === id ? { ...i, status: "dialihkan" } : i,
      ),
    })),
}));
