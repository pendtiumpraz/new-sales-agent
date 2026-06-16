CREATE TABLE "tenant_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'lead_gen' NOT NULL,
	"product_id" text,
	"target_segment" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "workspace_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlement_uq" ON "tenant_entitlement" USING btree ("tenant_id","module_key");--> statement-breakpoint
CREATE INDEX "workspace_tenant_idx" ON "workspace" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workspace_owner_idx" ON "workspace" USING btree ("tenant_id","owner_user_id");