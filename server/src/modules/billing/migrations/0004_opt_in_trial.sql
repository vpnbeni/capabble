ALTER TYPE "billing"."subscription_state" ADD VALUE 'incomplete' BEFORE 'trialing';--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "trial_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "trial_consent_text" text;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "autopay_amount_paise" bigint;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "autopay_method" text;