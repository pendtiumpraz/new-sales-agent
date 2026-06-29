CREATE TABLE "closing_readiness" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"workspace_id" text,
	"score" integer DEFAULT 0 NOT NULL,
	"band" text DEFAULT 'cold' NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nba_action" text DEFAULT 'nurture' NOT NULL,
	"nba_suggestion" text,
	"stage" text,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"workspace_id" text,
	"stage" text DEFAULT 'rapport' NOT NULL,
	"previous_stage" text,
	"next_action" text DEFAULT 'nurture' NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"guidance" text,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kb_technique" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"inti" text NOT NULL,
	"contoh" text,
	"cocok_untuk" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sinyal" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "closing_readiness_tenant_idx" ON "closing_readiness" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "closing_readiness_conversation_uq" ON "closing_readiness" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "closing_readiness_band_idx" ON "closing_readiness" USING btree ("tenant_id","band");--> statement-breakpoint
CREATE INDEX "conversation_stage_tenant_idx" ON "conversation_stage" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_stage_conversation_uq" ON "conversation_stage" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_stage_workspace_idx" ON "conversation_stage" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "kb_technique_tenant_idx" ON "kb_technique" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_technique_key_uq" ON "kb_technique" USING btree ("tenant_id","key");