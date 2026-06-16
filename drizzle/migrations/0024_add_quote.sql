CREATE TABLE "quote" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"number" text NOT NULL,
	"owner_user_id" text,
	"deal_id" text,
	"person_id" text,
	"contact_id" text,
	"workspace_id" text,
	"customer_name" text,
	"customer_email" text,
	"customer_company" text,
	"title" text NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"tax_rate" real DEFAULT 0 NOT NULL,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"valid_until" text,
	"notes" text,
	"cover_subject" text,
	"cover_body" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_token" text NOT NULL,
	"sending_account_id" text,
	"to_email" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "quote_tenant_idx" ON "quote" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_token_idx" ON "quote" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "quote_deal_idx" ON "quote" USING btree ("tenant_id","deal_id");