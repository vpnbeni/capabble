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
  get autoDebitEnabled() { return String(process.env.BILLING_AUTODEBIT_ENABLED || 'false') === 'true'; },
  get supplier() {
    return {
      legalName: process.env.BILLING_SUPPLIER_LEGAL_NAME || 'Capabble',
      gstin: (process.env.BILLING_SUPPLIER_GSTIN || '').trim().toUpperCase() || null,
      address: process.env.BILLING_SUPPLIER_ADDRESS || '',
      stateCode: process.env.BILLING_SUPPLIER_STATE_CODE
        || (process.env.BILLING_SUPPLIER_GSTIN || '').slice(0, 2)
        || null,
      email: process.env.BILLING_SUPPLIER_EMAIL || '',
      phone: process.env.BILLING_SUPPLIER_PHONE || '',
    };
  },
};

module.exports = config;
