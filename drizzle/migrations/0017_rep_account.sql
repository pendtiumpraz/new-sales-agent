CREATE TABLE "rep_account" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"linkedin_url" text,
	"instagram" text,
	"ext_version" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rep_account_tenant_user_uq" ON "rep_account" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rep_account_token_uq" ON "rep_account" USING btree ("token");