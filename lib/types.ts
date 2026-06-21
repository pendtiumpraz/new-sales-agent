// Shared domain types for the Agentic AI Sales prototype.
// All data is mock; these shapes mirror the JSON files in lib/mock-data.

export type MessagingChannel =
  | "whatsapp"
  | "email"
  | "instagram"
  | "linkedin"
  | "sms";

export type CadenceStepChannel = MessagingChannel | "call";

export type Marketplace = "tokopedia" | "shopee" | "tiktok";

export type ConsentStatus = "consented" | "pending" | "none";

export type DealStage =
  | "prospek"
  | "kualifikasi"
  | "penawaran"
  | "negosiasi"
  | "tutup";

export interface Company {
  id: string;
  name: string;
  industry: string;
  city: string;
  size: string;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  companyId: string;
  company: string;
  industry: string;
  city: string;
  email: string;
  phone: string;
  channelPreference: MessagingChannel;
  consent: ConsentStatus;
  consentSource: string;
  consentDate: string; // ISO
  lastActivity: string; // ISO
  avatarColor: string;
  tags: string[];
  source: string;
  /** Email validation result (doc 21): valid | invalid_syntax | invalid_domain | risky | null. */
  emailStatus?: string | null;
}

export interface Deal {
  id: string;
  name: string;
  contactId: string;
  contactName: string;
  company: string;
  value: number; // IDR
  stage: DealStage;
  expectedClose: string; // ISO
  sourceChannel: MessagingChannel | Marketplace;
  owner: string;
  avatarColor: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  body: string;
  timestamp: string; // ISO
  status?: "sent" | "delivered" | "read";
  subject?: string; // email
  attachmentLabel?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  company: string;
  channel: MessagingChannel;
  lastMessage: string;
  lastTimestamp: string; // ISO
  unread: number;
  avatarColor: string;
  assignedTo: string;
}

export interface CadenceStep {
  id: string;
  channel: CadenceStepChannel;
  delayDays: number;
  subject?: string;
  content: string;
}

export interface Cadence {
  id: string;
  name: string;
  status: "active" | "draft" | "paused";
  enrolled: number;
  /**
   * Full sequence of steps. Storage in Postgres is jsonb; the UI count badge
   * uses `steps.length`. Older mock JSON used a numeric `steps` field — the
   * `lib/api-mock/data.ts` adapter hydrates that into the array form here.
   */
  steps: CadenceStep[];
  replyRate: number;
  channelMix: CadenceStepChannel[];
  createdAt: string;
  owner: string;
}

export interface CadenceEnrollment {
  id: string;
  cadenceId: string;
  contactId: string;
  currentStepIdx: number; // 0-based
  status: "aktif" | "selesai" | "berhenti";
  enrolledAt: string; // ISO
  lastStepAt?: string | null; // ISO
  nextStepDueAt?: string | null; // ISO
}

export interface FieldRep {
  id: string;
  /** App user this field rep belongs to — drives role scoping (rep sees own,
   *  manager/admin/superadmin see the whole team). Matches DemoAccount.id. */
  ownerUserId: string;
  name: string;
  status: "kunjungan" | "istirahat" | "selesai";
  city: string;
  lat: number;
  lng: number;
  visitsToday: number;
  visitsPlanned: number;
  lastCheckIn: string; // ISO
  avatarColor: string;
  route: { lat: number; lng: number; label: string }[];
}

export interface Visit {
  id: string;
  repName: string;
  customer: string;
  company: string;
  type: string;
  city: string;
  notes: string;
  followUp: boolean;
  timestamp: string; // ISO
  outcome: "berhasil" | "tindak-lanjut" | "tidak-ada";
}

export interface Order {
  id: string;
  marketplace: Marketplace;
  customer: string;
  product: string;
  qty: number;
  total: number; // IDR
  status: "diproses" | "dikirim" | "diterima" | "dibatalkan";
  date: string; // ISO
  abandoned?: boolean;
}

export interface AiResponse {
  id: string;
  triggers: string[];
  title: string;
  body: string;
  kind: "cadence" | "analysis" | "scoring" | "default";
}

export interface ConsentEntry {
  id: string;
  contactName: string;
  source: "event" | "form" | "wa-optin";
  channel: MessagingChannel; // capture channel
  ip: string; // capture IP (immutable audit trail)
  date: string; // ISO — exact capture timestamp
  version: string;
  status: ConsentStatus;
}

// ---- GRC: DPIA + vendor risk (UU PDP / DPO tooling) --------------------------

export type RiskLevel = "rendah" | "sedang" | "tinggi";

export interface DpiaEntry {
  id: string;
  process: string; // business process being assessed
  dataCategory: string;
  riskLevel: RiskLevel;
  status: "selesai" | "berjalan" | "perlu-tinjauan";
  owner: string; // DPO / reviewer
  date: string; // ISO
  mitigations: number;
}

export interface VendorRisk {
  id: string;
  vendor: string;
  category: string; // Messaging / Hosting / Analytics / ...
  riskScore: number; // 0–100
  riskLevel: RiskLevel;
  dpaSigned: boolean; // Data Processing Agreement on file
  residency: string; // data residency region
  lastReview: string; // ISO
}

// ---- Prospecting / Lead intelligence (Apollo-like) --------------------------

export type AiTemp = "panas" | "hangat" | "dingin";

export interface ProspectLead {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  city: string;
  companySize: string; // employee band
  revenue: string; // IDR revenue band
  email: string;
  emailVerified: boolean;
  phone: string;
  channelPreference: MessagingChannel;
  techStack: string[];
  aiScore: number; // 0–100 fit/intent score
  aiTemp: AiTemp;
  intentSignals: string[];
  source: string; // where it was discovered
  enriched: boolean;
  inCrm: boolean;
  avatarColor: string;
}

export interface InboundLead {
  id: string;
  name: string;
  company: string;
  source: "website" | "form" | "whatsapp" | "instagram" | "marketplace";
  channel: MessagingChannel | Marketplace;
  message: string;
  aiScore: number;
  aiTemp: AiTemp;
  suggestedAction: string;
  receivedAt: string; // ISO
  status: "baru" | "dibalas" | "dialihkan";
  avatarColor: string;
}

export interface Task {
  id: string;
  title: string;
  channel: CadenceStepChannel;
  contactName: string;
  due: string;
  priority: "tinggi" | "sedang" | "rendah";
  done: boolean;
}

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  channel?: MessagingChannel | Marketplace;
  timestamp: string; // ISO
}

// ---- Content creation & planning (Konten) -----------------------------------

export type ContentType =
  | "wa-broadcast"
  | "email-campaign"
  | "instagram-post"
  | "tokopedia-post"
  | "blog";

export type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published";

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  body: string;
  subject?: string; // email only
  hashtags?: string[]; // social posts
  audience?: string; // "Pelanggan VIP", "Lead BUMN", ...
  scheduledFor?: string; // ISO — required when status is scheduled/published
  author: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  reach?: number; // mocked engagement
  cta?: string;
}
