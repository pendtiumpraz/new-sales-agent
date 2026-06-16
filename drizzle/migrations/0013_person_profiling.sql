ALTER TABLE "person" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "experience" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "honorific" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "age_band" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "interests" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "ford" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "lead_type" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "profile_summary" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "profile_confidence" real;