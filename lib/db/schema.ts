import { pgTable, text, integer, jsonb, timestamp, real, boolean } from "drizzle-orm/pg-core";
import type { KnowledgeBase } from "@/lib/types/kb";
import type { CadenceStep } from "@/lib/types";
import type {
  AutopilotRun,
  AutopilotStepEvent,
  AutopilotRunConfig,
} from "@/lib/types/autopilot";

export const kbTable = pgTable("kb", {
  id: text("id").primaryKey(),                                  // client id
  data: jsonb("data").$type<KnowledgeBase>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dealsTable = pgTable("deals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  company: text("company"),
  value: real("value").notNull(),
  stage: text("stage").notNull(),                               // prospek/kualifikasi/penawaran/negosiasi/tutup
  expectedClose: text("expected_close"),                        // keep ISO string
  sourceChannel: text("source_channel"),
  owner: text("owner"),
  avatarColor: text("avatar_color"),
  createdAt: text("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactsTable = pgTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title"),
  companyId: text("company_id"),
  company: text("company"),
  industry: text("industry"),
  city: text("city"),
  email: text("email"),
  phone: text("phone"),
  channelPreference: text("channel_preference"),
  consent: text("consent"),
  consentSource: text("consent_source"),
  consentDate: text("consent_date"),
  lastActivity: text("last_activity"),
  avatarColor: text("avatar_color"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  contactName: text("contact_name"),
  company: text("company"),
  channel: text("channel").notNull(),
  lastMessage: text("last_message"),
  lastTimestamp: text("last_timestamp"),
  unread: integer("unread").notNull().default(0),
  avatarColor: text("avatar_color"),
  assignedTo: text("assigned_to"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  direction: text("direction").notNull(),                       // "in" | "out"
  body: text("body").notNull(),
  timestamp: text("timestamp").notNull(),
  status: text("status"),
  subject: text("subject"),
  attachmentLabel: text("attachment_label"),
});

export const autopilotRunsTable = pgTable("autopilot_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  config: jsonb("config").$type<AutopilotRunConfig>().notNull(),
  events: jsonb("events").$type<AutopilotStepEvent[]>().notNull().default([]),
  metrics: jsonb("metrics").$type<AutopilotRun["metrics"]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cadencesTable = pgTable("cadences", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),                       // active | draft | paused
  steps: jsonb("steps").$type<CadenceStep[]>().notNull(),
  channelMix: jsonb("channel_mix").$type<string[]>().notNull(),
  enrolled: integer("enrolled").notNull().default(0),
  replyRate: real("reply_rate").notNull().default(0),    // 0-100
  owner: text("owner"),
  createdAt: text("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cadenceEnrollmentsTable = pgTable("cadence_enrollments", {
  id: text("id").primaryKey(),                            // composite-like, e.g. cadenceId:contactId or uuid
  cadenceId: text("cadence_id").notNull(),
  contactId: text("contact_id").notNull(),
  currentStepIdx: integer("current_step_idx").notNull().default(0),  // 0-based
  status: text("status").notNull().default("aktif"),     // aktif | selesai | berhenti
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  lastStepAt: timestamp("last_step_at", { withTimezone: true }),
  nextStepDueAt: timestamp("next_step_due_at", { withTimezone: true }),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Plain-text password — this is a DEMO app, no PII risk. Real prod would
  // bcrypt-hash this. Storing plain so the existing /login form keeps working
  // without introducing a hash dependency.
  password: text("password").notNull(),
  role: text("role").notNull(),               // Superadmin | Admin | Sales Manager | Sales Rep
  avatarColor: text("avatar_color").notNull(),
  scope: text("scope"),                       // human-readable description
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
