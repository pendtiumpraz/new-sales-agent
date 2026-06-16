CREATE TABLE "auto_reply_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text,
	"message_id" text,
	"decision" text NOT NULL,
	"confidence" real,
	"channel" text,
	"reply" text,
	"reason" text,
	"category" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auto_reply_event_tenant_idx" ON "auto_reply_event" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "auto_reply_event_msg_idx" ON "auto_reply_event" USING btree ("tenant_id","message_id");