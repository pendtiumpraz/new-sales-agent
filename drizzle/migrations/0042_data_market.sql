CREATE TABLE "data_listing" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"industry_key" text,
	"segment" text DEFAULT 'all' NOT NULL,
	"company_count" integer DEFAULT 0 NOT NULL,
	"price" real DEFAULT 0 NOT NULL,
	"sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"companies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_tenant_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"seller_tenant_id" text NOT NULL,
	"company_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "data_listing_seller_idx" ON "data_listing" USING btree ("seller_tenant_id");--> statement-breakpoint
CREATE INDEX "data_listing_shelf_idx" ON "data_listing" USING btree ("status","created_at" DESC) WHERE "data_listing"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "data_purchase_buyer_idx" ON "data_purchase" USING btree ("buyer_tenant_id");--> statement-breakpoint
CREATE INDEX "data_purchase_seller_idx" ON "data_purchase" USING btree ("seller_tenant_id");--> statement-breakpoint
CREATE INDEX "data_purchase_listing_idx" ON "data_purchase" USING btree ("listing_id");
