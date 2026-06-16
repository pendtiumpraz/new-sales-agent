CREATE TABLE "credit_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tokens" integer NOT NULL,
	"reason" text,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credit_grant_tenant_idx" ON "credit_grant" USING btree ("tenant_id");