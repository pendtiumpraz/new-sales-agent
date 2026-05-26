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
  steps: number;
  replyRate: number;
  channelMix: CadenceStepChannel[];
  createdAt: string;
  owner: string;
}

export interface FieldRep {
  id: string;
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
  date: string; // ISO
  version: string;
  status: ConsentStatus;
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
