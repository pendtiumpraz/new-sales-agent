import { pgTable, text, integer, jsonb, timestamp, real, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { KnowledgeBase } from "@/lib/types/kb";
import type { CadenceStep } from "@/lib/types";
import type {
  AutopilotRun,
  AutopilotStepEvent,
  AutopilotRunConfig,
} from "@/lib/types/autopilot";

// NOTE (Fase 1, doc 19): `tenant_id` is added to tenant-scoped tables as a
// NULLABLE column so existing seed/insert code keeps working. It gets backfilled
// to a default tenant and made NOT NULL + RLS-enforced in slice 2 (see
// drizzle/rls/). `users` stays GLOBAL (one user → many tenants via memberships).

export const kbTable = pgTable("kb", {
  id: text("id").primaryKey(),                                  // client id
  tenantId: text("tenant_id"),                                  // doc 19; nullable until backfill
  data: jsonb("data").$type<KnowledgeBase>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dealsTable = pgTable("deals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),                                  // doc 19; nullable until backfill
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
  tenantId: text("tenant_id"),                                  // doc 19; nullable until backfill
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
  tenantId: text("tenant_id"),                                  // doc 19; nullable until backfill
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
  tenantId: text("tenant_id"),                                  // doc 19; denormalized for RLS
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
  tenantId: text("tenant_id"),                                  // doc 19; nullable until backfill
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
  tenantId: text("tenant_id"),                            // doc 19; nullable until backfill
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
  tenantId: text("tenant_id"),                            // doc 19; nullable until backfill
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

// ── Multi-tenancy foundation (Fase 1, doc 19) ──────────────────────────────

export const tenantsTable = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),   // doc 27 tiers
  status: text("status").notNull().default("active"), // active | suspended
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One user can belong to many tenants; role lives HERE (per-tenant), not on users.
export const membershipsTable = pgTable("memberships", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),                        // superadmin | tenant_owner | tenant_admin | member (doc 19)
  status: text("status").notNull().default("active"),  // active | invited | disabled
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantUserUq: uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId),
  tenantIdx: index("memberships_tenant_idx").on(t.tenantId),
  userIdx: index("memberships_user_idx").on(t.userId),
}));

export const invitesTable = pgTable("invites", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked | expired
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("invites_tenant_idx").on(t.tenantId),
}));

export const auditLogTable = pgTable("audit_log", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),                         // nullable for platform-level events
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),                   // e.g. "member.invite", "mailbox.connect"
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("audit_log_tenant_idx").on(t.tenantId),
}));
