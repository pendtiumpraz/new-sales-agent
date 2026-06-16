CREATE TABLE "extension_connection" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"version" text,
	"user_agent" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
