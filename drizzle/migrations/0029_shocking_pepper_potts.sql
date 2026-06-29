CREATE TABLE "product_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"value_props" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_notes" text,
	"target_market" text,
	"icp" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_fit" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"market_type" text DEFAULT 'b2b' NOT NULL,
	"confidence" real,
	"icp" jsonb,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_play" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"tone" text DEFAULT 'consultative' NOT NULL,
	"techniques" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'lead_gen' NOT NULL,
	"product_id" text,
	"target_segment" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "product_v2_tenant_idx" ON "product_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "market_fit_tenant_idx" ON "market_fit" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_fit_workspace_uq" ON "market_fit" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "sales_play_tenant_idx" ON "sales_play" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_play_workspace_uq" ON "sales_play" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_v2_tenant_idx" ON "workspace_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workspace_v2_owner_idx" ON "workspace_v2" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "workspace_v2_product_idx" ON "workspace_v2" USING btree ("tenant_id","product_id");