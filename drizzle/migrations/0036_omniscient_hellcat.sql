CREATE TABLE "content_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"template_id" text,
	"title" text NOT NULL,
	"channel" text DEFAULT 'wa' NOT NULL,
	"body" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"assigned_user_id" text,
	"meta" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_template" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"channel" text DEFAULT 'wa' NOT NULL,
	"category" text DEFAULT 'outreach' NOT NULL,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cart_recovery" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"channel" text DEFAULT 'tokopedia' NOT NULL,
	"external_id" text NOT NULL,
	"contact_id" text,
	"buyer_name" text,
	"buyer_phone" text,
	"value" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"order_id" text,
	"abandoned_at" timestamp with time zone,
	"recovered_at" timestamp with time zone,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketplace_order" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"channel" text DEFAULT 'tokopedia' NOT NULL,
	"external_id" text NOT NULL,
	"contact_id" text,
	"buyer_name" text,
	"buyer_phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"ordered_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "field_check_in" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"visit_id" text NOT NULL,
	"rep_user_id" text,
	"kind" text DEFAULT 'check_in' NOT NULL,
	"lat" real,
	"lng" real,
	"accuracy" real,
	"address" text,
	"photo_url" text,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "field_visit" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"contact_id" text,
	"company_id" text,
	"deal_id" text,
	"rep_user_id" text,
	"title" text NOT NULL,
	"purpose" text,
	"address" text,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"outcome" text,
	"notes" text,
	"meta" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketplace_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"channel" text DEFAULT 'tokopedia' NOT NULL,
	"store_name" text NOT NULL,
	"store_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"config" jsonb,
	"last_sync_at" timestamp with time zone,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"connected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketplace_listing_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"workspace_id" text,
	"product_id" text,
	"channel" text DEFAULT 'tokopedia' NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"url" text,
	"price" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_report" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text,
	"workspace_id" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'overview' NOT NULL,
	"description" text,
	"config" jsonb,
	"scope" text DEFAULT 'private' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_flow" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'retention' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"segment" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_step" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'wa' NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text,
	"template" text DEFAULT '' NOT NULL,
	"offer" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "content_plan_tenant_idx" ON "content_plan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "content_plan_workspace_idx" ON "content_plan" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "content_plan_status_idx" ON "content_plan" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "content_plan_scheduled_idx" ON "content_plan" USING btree ("tenant_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "content_template_tenant_idx" ON "content_template" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "content_template_workspace_idx" ON "content_template" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "content_template_channel_idx" ON "content_template" USING btree ("tenant_id","channel");--> statement-breakpoint
CREATE INDEX "cart_recovery_tenant_idx" ON "cart_recovery" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cart_recovery_channel_idx" ON "cart_recovery" USING btree ("tenant_id","channel");--> statement-breakpoint
CREATE INDEX "cart_recovery_status_idx" ON "cart_recovery" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_recovery_external_uq" ON "cart_recovery" USING btree ("tenant_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "marketplace_order_tenant_idx" ON "marketplace_order" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "marketplace_order_channel_idx" ON "marketplace_order" USING btree ("tenant_id","channel");--> statement-breakpoint
CREATE INDEX "marketplace_order_status_idx" ON "marketplace_order" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "marketplace_order_contact_idx" ON "marketplace_order" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_order_external_uq" ON "marketplace_order" USING btree ("tenant_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "field_check_in_tenant_idx" ON "field_check_in" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "field_check_in_visit_idx" ON "field_check_in" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE INDEX "field_check_in_rep_idx" ON "field_check_in" USING btree ("tenant_id","rep_user_id");--> statement-breakpoint
CREATE INDEX "field_visit_tenant_idx" ON "field_visit" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "field_visit_rep_idx" ON "field_visit" USING btree ("tenant_id","rep_user_id");--> statement-breakpoint
CREATE INDEX "field_visit_contact_idx" ON "field_visit" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "field_visit_status_idx" ON "field_visit" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "field_visit_scheduled_idx" ON "field_visit" USING btree ("tenant_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "marketplace_integration_tenant_idx" ON "marketplace_integration" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "marketplace_integration_channel_idx" ON "marketplace_integration" USING btree ("tenant_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_integration_store_uq" ON "marketplace_integration" USING btree ("tenant_id","channel","store_id");--> statement-breakpoint
CREATE INDEX "marketplace_listing_v2_tenant_idx" ON "marketplace_listing_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "marketplace_listing_v2_integration_idx" ON "marketplace_listing_v2" USING btree ("tenant_id","integration_id");--> statement-breakpoint
CREATE INDEX "marketplace_listing_v2_product_idx" ON "marketplace_listing_v2" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "marketplace_listing_v2_status_idx" ON "marketplace_listing_v2" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "saved_report_tenant_idx" ON "saved_report" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "saved_report_owner_idx" ON "saved_report" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "saved_report_kind_idx" ON "saved_report" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "retention_flow_tenant_idx" ON "retention_flow" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "retention_flow_workspace_idx" ON "retention_flow" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "retention_flow_kind_idx" ON "retention_flow" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "retention_step_tenant_idx" ON "retention_step" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "retention_step_flow_idx" ON "retention_step" USING btree ("tenant_id","flow_id");