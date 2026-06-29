CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"active_tenant_id" text,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_theme" (
	"user_id" text PRIMARY KEY NOT NULL,
	"brand_name" text,
	"logo_url" text,
	"logo_dark_url" text,
	"favicon_url" text,
	"login_bg_url" text,
	"primary_color" text DEFAULT '#FD7A5C' NOT NULL,
	"primary_dark" text,
	"primary_foreground" text,
	"accent_color" text,
	"secondary_color" text,
	"background_color" text,
	"foreground_color" text,
	"muted_color" text,
	"border_color" text,
	"sidebar_bg" text DEFAULT '#1E293B',
	"sidebar_active" text,
	"success_color" text,
	"warning_color" text,
	"danger_color" text,
	"theme_tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_css" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"module_key" text NOT NULL,
	"label" text NOT NULL,
	"domain" text,
	"is_core" boolean DEFAULT false NOT NULL,
	"sidebar_color" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "module_catalog_module_key_unique" UNIQUE("module_key")
);
--> statement-breakpoint
CREATE TABLE "onboarding_state" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"step" text DEFAULT 'vertical' NOT NULL,
	"vertical_key" text,
	"selected_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlement_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quota_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vertical" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icon" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vertical_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_log_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_setting_v2" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_color" text,
	"is_superadmin" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"vertical_key" text,
	"plan_key" text,
	"active_until" timestamp with time zone,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"metric" text NOT NULL,
	"period" text DEFAULT 'lifetime' NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"quota_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_token_idx" ON "password_reset" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "module_catalog_key_idx" ON "module_catalog" USING btree ("module_key");--> statement-breakpoint
CREATE INDEX "tenant_entitlement_v2_tenant_idx" ON "tenant_entitlement_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlement_v2_uq" ON "tenant_entitlement_v2" USING btree ("tenant_id","module_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vertical_key_idx" ON "vertical" USING btree ("key");--> statement-breakpoint
CREATE INDEX "audit_log_v2_tenant_idx" ON "audit_log_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_log_v2_action_idx" ON "audit_log_v2" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_tenant_user_uq" ON "membership" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_tenant_idx" ON "membership" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_slug_idx" ON "tenant" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenant_status_idx" ON "tenant" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_counter_tenant_idx" ON "usage_counter" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counter_uq" ON "usage_counter" USING btree ("tenant_id","metric","period");