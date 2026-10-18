CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TYPE "billing"."subscription_state" AS ENUM('trialing', 'active', 'past_due_grace', 'suspended_read_only', 'grandfathered', 'canceled');--> statement-breakpoint
CREATE TYPE "billing"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "billing"."collection_mode" AS ENUM('auto_debit', 'manual_link', 'hybrid_auto_manual');--> statement-breakpoint
CREATE TYPE "billing"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "billing"."payment_status" AS ENUM('initiated', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "billing"."webhook_status" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "billing"."addon_cycle" AS ENUM('month', 'year', 'one_time');--> statement-breakpoint
CREATE TYPE "billing"."coupon_duration" AS ENUM('once', 'forever', 'repeating');--> statement-breakpoint
CREATE TYPE "billing"."actor_type" AS ENUM('platform_admin', 'school_user', 'system', 'provider');--> statement-breakpoint
CREATE TABLE "billing"."modules" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_code_format" CHECK ("billing"."modules"."code" ~ '^[a-z][a-z0-9_]{1,31}$')
);
--> statement-breakpoint
CREATE TABLE "billing"."module_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_code" text NOT NULL,
	"interval" "billing"."billing_interval" NOT NULL,
	"base_paise" bigint NOT NULL,
	"included_students" integer DEFAULT 500 NOT NULL,
	"per_student_paise" bigint DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_prices_base_nonneg" CHECK ("billing"."module_prices"."base_paise" >= 0),
	CONSTRAINT "module_prices_per_student_nonneg" CHECK ("billing"."module_prices"."per_student_paise" >= 0),
	CONSTRAINT "module_prices_included_nonneg" CHECK ("billing"."module_prices"."included_students" >= 0),
	CONSTRAINT "module_prices_range" CHECK ("billing"."module_prices"."effective_to" IS NULL OR "billing"."module_prices"."effective_to" > "billing"."module_prices"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "billing"."bundles" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundles_discount_range" CHECK ("billing"."bundles"."discount_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "billing"."bundle_modules" (
	"bundle_code" text NOT NULL,
	"module_code" text NOT NULL,
	CONSTRAINT "bundle_modules_bundle_code_module_code_pk" PRIMARY KEY("bundle_code","module_code")
);
--> statement-breakpoint
CREATE TABLE "billing"."addons" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"cycle" "billing"."addon_cycle" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addons_amount_nonneg" CHECK ("billing"."addons"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."coupons" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"percent_bps" integer,
	"fixed_paise" bigint,
	"duration" "billing"."coupon_duration" DEFAULT 'once' NOT NULL,
	"duration_cycles" integer,
	"max_redemptions" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"module_codes" text[],
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_upper" CHECK ("billing"."coupons"."code" = upper("billing"."coupons"."code") AND "billing"."coupons"."code" ~ '^[A-Z0-9_-]{3,32}$'),
	CONSTRAINT "coupons_one_discount" CHECK (("billing"."coupons"."percent_bps" IS NULL) <> ("billing"."coupons"."fixed_paise" IS NULL)),
	CONSTRAINT "coupons_percent_range" CHECK ("billing"."coupons"."percent_bps" IS NULL OR "billing"."coupons"."percent_bps" BETWEEN 1 AND 10000),
	CONSTRAINT "coupons_fixed_positive" CHECK ("billing"."coupons"."fixed_paise" IS NULL OR "billing"."coupons"."fixed_paise" > 0),
	CONSTRAINT "coupons_repeating_cycles" CHECK ("billing"."coupons"."duration" <> 'repeating' OR "billing"."coupons"."duration_cycles" > 0),
	CONSTRAINT "coupons_redemptions" CHECK ("billing"."coupons"."max_redemptions" IS NULL OR "billing"."coupons"."redeemed_count" <= "billing"."coupons"."max_redemptions")
);
--> statement-breakpoint
CREATE TABLE "billing"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_slug" text NOT NULL,
	"tenant_name" text NOT NULL,
	"billing_email" text NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"gstin" text,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"state_code" char(2),
	"country" char(2) DEFAULT 'IN' NOT NULL,
	"provider_customer_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_slug_lower" CHECK ("billing"."accounts"."tenant_slug" = lower("billing"."accounts"."tenant_slug")),
	CONSTRAINT "accounts_gstin_format" CHECK ("billing"."accounts"."gstin" IS NULL OR "billing"."accounts"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
	CONSTRAINT "accounts_state_code" CHECK ("billing"."accounts"."state_code" IS NULL OR "billing"."accounts"."state_code" ~ '^[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"state" "billing"."subscription_state" NOT NULL,
	"interval" "billing"."billing_interval" DEFAULT 'year' NOT NULL,
	"bundle_code" text,
	"coupon_code" text,
	"coupon_cycles_used" integer DEFAULT 0 NOT NULL,
	"declared_students" integer DEFAULT 0 NOT NULL,
	"billed_students" integer DEFAULT 0 NOT NULL,
	"collection_mode" "billing"."collection_mode" DEFAULT 'manual_link' NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_subscription_id" text,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"grandfather_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_students_nonneg" CHECK ("billing"."subscriptions"."declared_students" >= 0 AND "billing"."subscriptions"."billed_students" >= 0),
	CONSTRAINT "subscriptions_period" CHECK ("billing"."subscriptions"."current_period_end" IS NULL OR "billing"."subscriptions"."current_period_start" IS NULL OR "billing"."subscriptions"."current_period_end" > "billing"."subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "billing"."subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"module_code" text NOT NULL,
	"price_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ends_at_period_end" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."subscription_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"addon_code" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"billed_at" timestamp with time zone,
	CONSTRAINT "subscription_addons_qty" CHECK ("billing"."subscription_addons"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_code" text NOT NULL,
	"account_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."number_sequences" (
	"series" text NOT NULL,
	"financial_year" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "number_sequences_series_financial_year_pk" PRIMARY KEY("series","financial_year"),
	CONSTRAINT "number_sequences_fy_format" CHECK ("billing"."number_sequences"."financial_year" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "billing"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"financial_year" text,
	"account_id" uuid NOT NULL,
	"subscription_id" uuid,
	"reason" text NOT NULL,
	"status" "billing"."invoice_status" DEFAULT 'open' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"students_billed" integer DEFAULT 0 NOT NULL,
	"supplier" jsonb NOT NULL,
	"buyer" jsonb NOT NULL,
	"place_of_supply" char(2),
	"subtotal_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"amount_paid_paise" bigint DEFAULT 0 NOT NULL,
	"amount_credited_paise" bigint DEFAULT 0 NOT NULL,
	"payment_link_id" text,
	"payment_link_url" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_when_issued" CHECK ("billing"."invoices"."status" = 'draft' OR "billing"."invoices"."number" IS NOT NULL),
	CONSTRAINT "invoices_amounts_nonneg" CHECK ("billing"."invoices"."subtotal_paise" >= 0 AND "billing"."invoices"."discount_paise" >= 0 AND "billing"."invoices"."taxable_paise" >= 0 AND "billing"."invoices"."cgst_paise" >= 0 AND "billing"."invoices"."sgst_paise" >= 0 AND "billing"."invoices"."igst_paise" >= 0 AND "billing"."invoices"."total_paise" >= 0),
	CONSTRAINT "invoices_taxable" CHECK ("billing"."invoices"."taxable_paise" = "billing"."invoices"."subtotal_paise" - "billing"."invoices"."discount_paise"),
	CONSTRAINT "invoices_total" CHECK ("billing"."invoices"."total_paise" = "billing"."invoices"."taxable_paise" + "billing"."invoices"."cgst_paise" + "billing"."invoices"."sgst_paise" + "billing"."invoices"."igst_paise"),
	CONSTRAINT "invoices_igst_xor_split" CHECK ("billing"."invoices"."igst_paise" = 0 OR ("billing"."invoices"."cgst_paise" = 0 AND "billing"."invoices"."sgst_paise" = 0)),
	CONSTRAINT "invoices_settled_within_total" CHECK ("billing"."invoices"."amount_paid_paise" >= 0 AND "billing"."invoices"."amount_credited_paise" >= 0 AND "billing"."invoices"."amount_credited_paise" <= "billing"."invoices"."total_paise")
);
--> statement-breakpoint
CREATE TABLE "billing"."invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"module_code" text,
	"addon_code" text,
	"description" text NOT NULL,
	"hsn_sac" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_paise" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_lines_taxable" CHECK ("billing"."invoice_lines"."taxable_paise" = "billing"."invoice_lines"."amount_paise" - "billing"."invoice_lines"."discount_paise" AND "billing"."invoice_lines"."taxable_paise" >= 0),
	CONSTRAINT "invoice_lines_nonneg" CHECK ("billing"."invoice_lines"."amount_paise" >= 0 AND "billing"."invoice_lines"."discount_paise" >= 0 AND "billing"."invoice_lines"."unit_paise" >= 0 AND "billing"."invoice_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" uuid,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"provider_order_id" text,
	"method" text DEFAULT 'unknown' NOT NULL,
	"status" "billing"."payment_status" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"refunded_paise" bigint DEFAULT 0 NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"failure_reason" text DEFAULT '' NOT NULL,
	"receipt_number" text,
	"captured_at" timestamp with time zone,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("billing"."payments"."amount_paise" > 0),
	CONSTRAINT "payments_refund_within" CHECK ("billing"."payments"."refunded_paise" >= 0 AND "billing"."payments"."refunded_paise" <= "billing"."payments"."amount_paise"),
	CONSTRAINT "payments_receipt_when_captured" CHECK ("billing"."payments"."status" NOT IN ('captured','refunded') OR "billing"."payments"."receipt_number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"payment_id" uuid,
	"reason" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"refund_paise" bigint DEFAULT 0 NOT NULL,
	"provider_refund_id" text,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_total" CHECK ("billing"."credit_notes"."total_paise" = "billing"."credit_notes"."taxable_paise" + "billing"."credit_notes"."cgst_paise" + "billing"."credit_notes"."sgst_paise" + "billing"."credit_notes"."igst_paise" AND "billing"."credit_notes"."total_paise" > 0),
	CONSTRAINT "credit_notes_refund_within" CHECK ("billing"."credit_notes"."refund_paise" >= 0 AND "billing"."credit_notes"."refund_paise" <= "billing"."credit_notes"."total_paise")
);
--> statement-breakpoint
CREATE TABLE "billing"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "billing"."webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "billing"."actor_type" NOT NULL,
	"actor_id" text DEFAULT '' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" uuid,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."module_prices" ADD CONSTRAINT "module_prices_module_code_modules_code_fk" FOREIGN KEY ("module_code") REFERENCES "billing"."modules"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."bundle_modules" ADD CONSTRAINT "bundle_modules_bundle_code_bundles_code_fk" FOREIGN KEY ("bundle_code") REFERENCES "billing"."bundles"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."bundle_modules" ADD CONSTRAINT "bundle_modules_module_code_modules_code_fk" FOREIGN KEY ("module_code") REFERENCES "billing"."modules"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_bundle_code_bundles_code_fk" FOREIGN KEY ("bundle_code") REFERENCES "billing"."bundles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_coupon_code_coupons_code_fk" FOREIGN KEY ("coupon_code") REFERENCES "billing"."coupons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscription_items" ADD CONSTRAINT "subscription_items_module_code_modules_code_fk" FOREIGN KEY ("module_code") REFERENCES "billing"."modules"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscription_items" ADD CONSTRAINT "subscription_items_price_id_module_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "billing"."module_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscription_addons" ADD CONSTRAINT "subscription_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscription_addons" ADD CONSTRAINT "subscription_addons_addon_code_addons_code_fk" FOREIGN KEY ("addon_code") REFERENCES "billing"."addons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_code_coupons_code_fk" FOREIGN KEY ("coupon_code") REFERENCES "billing"."coupons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_notes" ADD CONSTRAINT "credit_notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_notes" ADD CONSTRAINT "credit_notes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "billing"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_prices_module_interval_from_uq" ON "billing"."module_prices" USING btree ("module_code","interval","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_tenant_id_uq" ON "billing"."accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_tenant_slug_uq" ON "billing"."accounts" USING btree ("tenant_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_account_uq" ON "billing"."subscriptions" USING btree ("account_id") WHERE "billing"."subscriptions"."state" <> 'canceled';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_sub_uq" ON "billing"."subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_state_idx" ON "billing"."subscriptions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_items_live_uq" ON "billing"."subscription_items" USING btree ("subscription_id","module_code") WHERE "billing"."subscription_items"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_addons_live_uq" ON "billing"."subscription_addons" USING btree ("subscription_id","addon_code") WHERE "billing"."subscription_addons"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_once_per_account_uq" ON "billing"."coupon_redemptions" USING btree ("coupon_code","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "billing"."invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_payment_link_uq" ON "billing"."invoices" USING btree ("payment_link_id");--> statement-breakpoint
CREATE INDEX "invoices_account_idx" ON "billing"."invoices" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "billing"."invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_renewal_per_period_uq" ON "billing"."invoices" USING btree ("subscription_id","period_start") WHERE "billing"."invoices"."reason" = 'renewal' AND "billing"."invoices"."status" <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_position_uq" ON "billing"."invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_uq" ON "billing"."payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_uq" ON "billing"."payments" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "billing"."payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "billing"."payments" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_uq" ON "billing"."credit_notes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_refund_uq" ON "billing"."credit_notes" USING btree ("provider_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uq" ON "billing"."webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "billing"."audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_account_idx" ON "billing"."audit_log" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once_uq" ON "billing"."notifications" USING btree ("account_id","kind","subject_id","due_on");