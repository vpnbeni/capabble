// Runtime settings read from the environment, in one place.
const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
};

const config = {
  get trialDays() { return int('BILLING_TRIAL_DAYS', 14); },
  get graceDays() { return int('BILLING_GRACE_DAYS', 7); },
  get grandfatherDays() { return int('BILLING_GRANDFATHER_DAYS', 60); },
  get invoiceDueDays() { return int('BILLING_INVOICE_DUE_DAYS', 7); },
  get renewalLeadDays() { return int('BILLING_RENEWAL_LEAD_DAYS', 7); },
  get entitlementTtlSeconds() { return int('BILLING_ENTITLEMENT_TTL_SECONDS', 60); },
  get currency() { return process.env.BILLING_DEFAULT_CURRENCY || 'INR'; },
  get timezone() { return process.env.BILLING_TIMEZONE || 'Asia/Kolkata'; },
  get sacCode() { return process.env.BILLING_SAC_CODE || '998314'; },
  // Opt-in trials need an authorised autopay mandate before they start (Razorpay subscription
  // with start_at at the trial end). Off: the school opts in without one and is invoiced instead.
  get trialRequiresMandate() { return this.autoDebitEnabled && String(process.env.BILLING_TRIAL_REQUIRES_MANDATE || 'false') === 'true'; },
  get autoDebitEnabled() { return String(process.env.BILLING_AUTODEBIT_ENABLED || 'false') === 'true'; },
  // Printed on every invoice. Until Capabble is registered for GST these fall back to
  // placeholders that say so; set the BILLING_SUPPLIER_* variables once the GSTIN arrives.
  // The state code decides CGST+SGST (same state as the school) or IGST.
  get supplier() {
    const gstin = (process.env.BILLING_SUPPLIER_GSTIN || '').trim().toUpperCase() || null;
    return {
      legalName: process.env.BILLING_SUPPLIER_LEGAL_NAME || 'Capabble',
      gstin,
      address: process.env.BILLING_SUPPLIER_ADDRESS || 'Registered address to be added',
      stateCode: process.env.BILLING_SUPPLIER_STATE_CODE || (gstin ? gstin.slice(0, 2) : '06'),
      email: process.env.BILLING_SUPPLIER_EMAIL || 'billing@capabble.cloud',
      phone: process.env.BILLING_SUPPLIER_PHONE || ''
    };
  }
};

module.exports = config;
