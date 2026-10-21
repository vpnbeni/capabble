ALTER TABLE "billing"."subscription_addons" ADD COLUMN "ends_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "bundle_code" text;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "coupon_code" text;