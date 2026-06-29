/**
 * Module schema barrel (rebuild — Sainskerta Loop Phase 03).
 *
 * Re-exports every `modules/<domain>/schema.ts` so the Drizzle client
 * (lib/db/client.ts) and drizzle-kit (drizzle.config.ts) can pick up all
 * rebuild tables from one place. Add a line here when a new module's schema
 * lands. Only schema is re-exported — repos/services are imported per-domain.
 */

// Module 1 — identity / onboarding / branding / superadmin
export * from "./tenant/schema";
export * from "./auth/schema";
export * from "./onboarding/schema";
export * from "./branding/schema";
export * from "./superadmin/schema";

// Module 2 — workspace (+ market_fit / sales_play satellites) / product
export * from "./workspace/schema";
export * from "./product/schema";

// Module 3 — crm (company / contact / pipeline / pipeline_stage / deal / activity)
export * from "./crm/schema";

// Module 4 — inbox (conversation / message) + wa (wa_session / wa_outbox transport)
export * from "./inbox/schema";
export * from "./wa/schema";

// Module 5 — enrichment / discovery (discovery_job / discovery_result / enrichment_record)
export * from "./enrichment/schema";

// Module 6 — sales / closing-flow (conversation_stage / closing_readiness / kb_technique)
export * from "./sales/schema";

// Module 7 — outreach (cadence_v2 / cadence_step_v2 / cadence_enrollment_v2 /
// autopilot_run_v2 / escalation / handoff)
export * from "./outreach/schema";

// Module 8 — settings (knowledge_base / tenant_settings) + a facade over AI /
// mail / billing / team (those reuse existing infra, no new tables).
export * from "./settings/schema";

// Module 9 (secondary, FINAL) — content / retention / ecommerce / marketplace /
// field + a read-only reports/analytics service. Owns: content_template,
// content_plan, retention_flow, retention_step, marketplace_order, cart_recovery,
// marketplace_integration, marketplace_listing_v2, field_visit, field_check_in,
// saved_report. Reports AGGREGATES over existing rebuild tables (no new heavy
// tables — saved_report is the only owned config row).
export * from "./content/schema";
export * from "./retention/schema";
export * from "./ecommerce/schema";
export * from "./marketplace/schema";
export * from "./field/schema";
export * from "./reports/schema";
