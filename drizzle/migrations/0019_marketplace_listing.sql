CREATE TABLE "marketplace_listing" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"price_idr" real DEFAULT 0 NOT NULL,
	"consent_status" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketplace_seller_idx" ON "marketplace_listing" USING btree ("seller_tenant_id");--> statement-breakpoint
CREATE INDEX "marketplace_status_idx" ON "marketplace_listing" USING btree ("status");