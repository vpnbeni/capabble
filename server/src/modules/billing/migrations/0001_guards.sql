-- Guards that Drizzle's schema DSL can't express.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Two prices for the same module and interval may never overlap in time.
ALTER TABLE "billing"."module_prices"
  ADD CONSTRAINT "module_prices_no_overlap"
  EXCLUDE USING gist (
    "module_code" WITH =,
    "interval" WITH =,
    tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
  );
--> statement-breakpoint

-- The audit log is append-only.
CREATE OR REPLACE FUNCTION "billing"."audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing.audit_log is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "billing"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "billing"."audit_log_append_only"();
--> statement-breakpoint

-- Issued invoices are immutable apart from their settlement fields.
CREATE OR REPLACE FUNCTION "billing"."invoice_lock_amounts"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.number IS DISTINCT FROM OLD.number OR
    NEW.subtotal_paise <> OLD.subtotal_paise OR
    NEW.discount_paise <> OLD.discount_paise OR
    NEW.taxable_paise <> OLD.taxable_paise OR
    NEW.cgst_paise <> OLD.cgst_paise OR
    NEW.sgst_paise <> OLD.sgst_paise OR
    NEW.igst_paise <> OLD.igst_paise OR
    NEW.total_paise <> OLD.total_paise OR
    NEW.buyer IS DISTINCT FROM OLD.buyer OR
    NEW.supplier IS DISTINCT FROM OLD.supplier
  ) THEN
    RAISE EXCEPTION 'issued invoice % cannot change its amounts or parties', OLD.number;
  END IF;
  IF OLD.status IN ('void', 'paid') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'invoice % is % and cannot move to %', OLD.number, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "invoices_lock_amounts"
  BEFORE UPDATE ON "billing"."invoices"
  FOR EACH ROW EXECUTE FUNCTION "billing"."invoice_lock_amounts"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "billing"."invoice_lines_lock"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inv_status text;
BEGIN
  SELECT status INTO inv_status FROM "billing"."invoices"
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv_status IS NOT NULL AND inv_status <> 'draft' THEN
    RAISE EXCEPTION 'lines of an issued invoice cannot change';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "invoice_lines_lock_issued"
  BEFORE UPDATE OR DELETE ON "billing"."invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION "billing"."invoice_lines_lock"();
--> statement-breakpoint

-- Keep updated_at honest without relying on every caller.
CREATE OR REPLACE FUNCTION "billing"."touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "touch_modules" BEFORE UPDATE ON "billing"."modules" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_bundles" BEFORE UPDATE ON "billing"."bundles" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_addons" BEFORE UPDATE ON "billing"."addons" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_coupons" BEFORE UPDATE ON "billing"."coupons" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_accounts" BEFORE UPDATE ON "billing"."accounts" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_subscriptions" BEFORE UPDATE ON "billing"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_invoices" BEFORE UPDATE ON "billing"."invoices" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "touch_payments" BEFORE UPDATE ON "billing"."payments" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();
