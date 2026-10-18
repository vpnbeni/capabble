CREATE TABLE "billing"."job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text DEFAULT '' NOT NULL,
	"locked_until" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" jsonb
);
