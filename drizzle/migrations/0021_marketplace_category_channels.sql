ALTER TABLE "marketplace_listing" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "marketplace_listing" ADD COLUMN "channels" jsonb DEFAULT '[]'::jsonb NOT NULL;