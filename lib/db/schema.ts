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

// Unified multi-channel outbound log for cadence steps (Fase 5 slice 2, doc 22/23).
// The processor records one row per dispatched step. Email steps also create a
// send_job (the SMTP worker actually sends them); non-email channels
// (whatsapp/linkedin/instagram/sms/call) are queued here awaiting their live
// integration (MCP/extension/WA Business API — cred-blocked for now), so the
// pipeline is honest about what's sent vs merely scheduled. Tenant-scoped + RLS.
export const cadenceStepRunTable = pgTable("cadence_step_run", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  enrollmentId: text("enrollment_id").notNull(),
  cadenceId: text("cadence_id").notNull(),
  contactId: text("contact_id").notNull(),
  stepIdx: integer("step_idx").notNull(),
  channel: text("channel").notNull(),                     // email | whatsapp | linkedin | instagram | sms | call
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),     // queued | sent | skipped | failed
  sendJobId: text("send_job_id"),                         // link to send_job (email channel only)
  aiSource: text("ai_source"),                            // real | template
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("cadence_step_run_tenant_idx").on(t.tenantId),
  enrollmentIdx: index("cadence_step_run_enrollment_idx").on(t.tenantId, t.enrollmentId),
}));

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

// ── Profiling: Company vs Human + Product (Fase 2, doc 20) ─────────────────
// All tenant-scoped (tenant_id NOT NULL) + RLS from the start. Provenance &
// consent are first-class so crawled data is auditable (doc 25).

export const companyTable = pgTable("company", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  domain: text("domain"),                          // dedup key (normalized)
  industry: text("industry"),
  size: text("size"),
  hqCountry: text("hq_country"),
  summary: text("summary"),
  techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]),
  products: jsonb("products").$type<string[]>().notNull().default([]), // their products
  socials: jsonb("socials").$type<Record<string, string>>().notNull().default({}),
  status: text("status").notNull().default("active"),
  source: text("source"),                          // provenance (doc 21/25)
  sourceUrl: text("source_url"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  capturedMode: text("captured_mode"),             // compliant | balanced | aggressive
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("company_tenant_idx").on(t.tenantId),
  domainIdx: index("company_domain_idx").on(t.tenantId, t.domain),
}));

export const personTable = pgTable("person", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  companyId: text("company_id"),                   // soft ref → company.id
  fullName: text("full_name").notNull(),
  title: text("title"),
  department: text("department"),
  seniority: text("seniority"),
  location: text("location"),
  socials: jsonb("socials").$type<Record<string, string>>().notNull().default({}),
  status: text("status").notNull().default("active"),
  source: text("source"),
  sourceUrl: text("source_url"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  capturedMode: text("captured_mode"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("person_tenant_idx").on(t.tenantId),
  companyIdx: index("person_company_idx").on(t.companyId),
}));

// Polymorphic contact channel for a company OR a person, with provenance + consent.
export const contactPointTable = pgTable("contact_point", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  ownerType: text("owner_type").notNull(),         // 'company' | 'person'
  ownerId: text("owner_id").notNull(),
  channel: text("channel").notNull(),              // email|phone|whatsapp|linkedin|instagram|web|other
  value: text("value").notNull(),
  label: text("label"),
  source: text("source"),
  sourceUrl: text("source_url"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  capturedMode: text("captured_mode"),
  consentStatus: text("consent_status").notNull().default("unknown"), // unknown|legitimate_interest|opted_in|opted_out
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("contact_point_tenant_idx").on(t.tenantId),
  ownerIdx: index("contact_point_owner_idx").on(t.ownerType, t.ownerId),
  dedupUq: uniqueIndex("contact_point_dedup_uq").on(t.tenantId, t.ownerType, t.ownerId, t.channel, t.value),
}));

// Tenant's own product/offer used for positioning (doc 22). target_market + icp
// are AI-derived (doc 22 Tahap 0) and drive discovery (doc 21).
export const productTable = pgTable("product", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  valueProps: jsonb("value_props").$type<string[]>().notNull().default([]),
  pricingNotes: text("pricing_notes"),
  targetMarket: text("target_market"),             // B2B | B2C | both
  icp: jsonb("icp").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("product_tenant_idx").on(t.tenantId),
}));

// ── AI provider/model registry + metering (Fase 3, doc 24) ─────────────────
// ai_provider + ai_model are a GLOBAL catalog (superadmin-managed, no tenant_id,
// no RLS — like users/tenants). ai_credential / tenant_active_model / ai_usage
// are tenant-scoped (RLS).

export const aiProviderTable = pgTable("ai_provider", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),                 // deepseek | anthropic | openai | google
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiModelTable = pgTable("ai_model", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id").notNull(),                 // API string, e.g. claude-opus-4-8
  displayName: text("display_name").notNull(),
  contextWindow: integer("context_window"),
  priceInPer1m: real("price_in_per_1m"),               // USD / 1M input tokens
  priceOutPer1m: real("price_out_per_1m"),             // USD / 1M output tokens
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  isAvailable: boolean("is_available").notNull().default(true), // superadmin platform-wide toggle
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerModelUq: uniqueIndex("ai_model_provider_model_uq").on(t.providerId, t.modelId),
}));

// Tenant BYOK key (encrypted). Platform keys come from env, not here.
export const aiCredentialTable = pgTable("ai_credential", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  providerId: text("provider_id").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),            // AES-256-GCM, lib/ai/crypto
  label: text("label"),
  source: text("source").notNull().default("tenant"), // tenant | platform
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("ai_credential_tenant_idx").on(t.tenantId),
  tenantProviderUq: uniqueIndex("ai_credential_tenant_provider_uq").on(t.tenantId, t.providerId),
}));

// Exactly one active model per tenant — tenant_id is the PK.
export const tenantActiveModelTable = pgTable("tenant_active_model", {
  tenantId: text("tenant_id").primaryKey(),
  modelId: text("model_id").notNull(),                 // → ai_model.id
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsageTable = pgTable("ai_usage", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id"),
  modelId: text("model_id"),
  feature: text("feature"),                            // chat | draft | autopilot | …
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  cost: real("cost").notNull().default(0),             // USD, computed at call time
  latencyMs: integer("latency_ms"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("ai_usage_tenant_idx").on(t.tenantId),
  tenantAtIdx: index("ai_usage_tenant_at_idx").on(t.tenantId, t.at),
}));

// ── Acquisition + positioning (Fase 4, doc 21/22) ─────────────────────────
// All tenant-scoped + RLS. crawl_job is the discovery queue (MCP/extension fill
// it in Fase 6); ingest_batch records each sync; positioning_insight is the
// value-prop output (company × product → angle).

export const crawlJobTable = pgTable("crawl_job", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),                        // url | industry | bulk | auto | cascade
  input: jsonb("input").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("pending"), // pending | running | done | error
  posture: text("posture").notNull().default("compliant"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ tenantIdx: index("crawl_job_tenant_idx").on(t.tenantId) }));

export const ingestBatchTable = pgTable("ingest_batch", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  origin: text("origin").notNull(),                    // mcp | extension | manual
  count: integer("count").notNull().default(0),
  dedupHits: integer("dedup_hits").notNull().default(0),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("ingest_batch_tenant_idx").on(t.tenantId) }));

export const positioningInsightTable = pgTable("positioning_insight", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  companyId: text("company_id").notNull(),
  productId: text("product_id").notNull(),
  fitScore: integer("fit_score"),                      // 0..100
  angle: text("angle"),
  rationale: jsonb("rationale").$type<string[]>().notNull().default([]),
  objections: jsonb("objections").$type<string[]>().notNull().default([]),
  recommendedChannel: text("recommended_channel"),     // email | whatsapp | linkedin
  draftOpener: text("draft_opener"),
  source: text("source"),                              // ai | heuristic
  generatedBy: text("generated_by"),                   // model string
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index("positioning_insight_tenant_idx").on(t.tenantId),
  uq: uniqueIndex("positioning_insight_uq").on(t.tenantId, t.companyId, t.productId),
}));

// ── Engagement: mailboxes + send pipeline (Fase 5, doc 23) ────────────────
// Tenant-scoped + RLS. Per-user sending identity (not one env mailbox).

export const sendingAccountTable = pgTable("sending_account", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id"),
  type: text("type").notNull().default("smtp"),        // smtp | gmail_oauth | ms_oauth | platform_esp
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  status: text("status").notNull().default("active"),
  configEnc: text("config_enc"),                        // encrypted JSON: SMTP host/port/user/pass
  dailyLimit: integer("daily_limit").notNull().default(200),
  sentToday: integer("sent_today").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("sending_account_tenant_idx").on(t.tenantId) }));

export const emailTemplateTable = pgTable("email_template", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  channel: text("channel").notNull().default("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("email_template_tenant_idx").on(t.tenantId) }));

export const sendJobTable = pgTable("send_job", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sendingAccountId: text("sending_account_id"),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed | skipped
  error: text("error"),
  feature: text("feature"),                             // cadence | manual | …
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => ({
  tenantIdx: index("send_job_tenant_idx").on(t.tenantId),
  statusIdx: index("send_job_status_idx").on(t.tenantId, t.status),
}));

export const suppressionTable = pgTable("suppression", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  reason: text("reason").notNull().default("opt_out"), // opt_out | bounce | complaint | manual
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantEmailUq: uniqueIndex("suppression_tenant_email_uq").on(t.tenantId, t.email),
  tenantIdx: index("suppression_tenant_idx").on(t.tenantId),
}));

// ── Superadmin / billing (Fase 8, doc 26/27) ──────────────────────────────
// plan is a GLOBAL catalog (no RLS). subscription is tenant-scoped (RLS).

export const planTable = pgTable("plan", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),                 // starter | growth | enterprise
  name: text("name").notNull(),
  priceMonthIdr: integer("price_month_idr").notNull().default(0),
  quotas: jsonb("quotas").$type<Record<string, number>>().notNull().default({}), // ai_tokens, emails, seats
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptionTable = pgTable("subscription", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("active"),  // active | past_due | canceled
  seats: integer("seats").notNull().default(5),
  // Stripe linkage (doc 30) — set by the checkout/webhook flow; null until a
  // tenant actually subscribes through Stripe. Lets the webhook find the row and
  // the billing portal open for the right customer.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantUq: uniqueIndex("subscription_tenant_uq").on(t.tenantId),
}));
