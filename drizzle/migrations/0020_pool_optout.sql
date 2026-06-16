CREATE TABLE "pool_optout" (
	"value" text PRIMARY KEY NOT NULL,
	"channel" text,
	"reason" text DEFAULT 'opt_out' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
