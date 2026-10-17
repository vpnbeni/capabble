// Indian GST on services: CGST + SGST inside the supplier's state, IGST across states.
const { applyBps } = require('./money');

const GST_RATE_BPS = 1800;

const STATE_NAMES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur',
  15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
  26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa',
  31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry',
  35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh',
  97: 'Other Territory',
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function isValidStateCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(STATE_NAMES, code);
}

function normalizeGstin(value) {
  const gstin = String(value || '').trim().toUpperCase();
  return gstin || null;
}

function isValidGstin(value) {
  const gstin = normalizeGstin(value);
  return Boolean(gstin && GSTIN_PATTERN.test(gstin) && isValidStateCode(gstin.slice(0, 2)));
}

/** The buyer's registered state wins; otherwise their billing address state; otherwise ours. */
function placeOfSupply({ buyerGstin, buyerStateCode, supplierStateCode }) {
  const gstin = normalizeGstin(buyerGstin);
  if (gstin && isValidGstin(gstin)) return gstin.slice(0, 2);
  if (isValidStateCode(buyerStateCode)) return buyerStateCode;
  return supplierStateCode;
}

/**
 * Tax each line on its own taxable value and total the invoice from the lines,
 * so the printed lines always add up to the printed totals.
 */
function applyGst(lines, { supplierStateCode, placeOfSupply: pos, rateBps = GST_RATE_BPS }) {
  const intraState = Boolean(supplierStateCode) && supplierStateCode === pos;
  const half = rateBps / 2;

  const taxed = lines.map((line) => {
    const taxable = line.taxablePaise;
    const cgst = intraState ? applyBps(taxable, half) : 0;
    const sgst = intraState ? applyBps(taxable, half) : 0;
    const igst = intraState ? 0 : applyBps(taxable, rateBps);
    return { ...line, taxRateBps: rateBps, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst };
  });

  const sum = (key) => taxed.reduce((acc, line) => acc + line[key], 0);
  const subtotalPaise = sum('amountPaise');
  const discountPaise = sum('discountPaise');
  const taxablePaise = sum('taxablePaise');
  const cgstPaise = sum('cgstPaise');
  const sgstPaise = sum('sgstPaise');
  const igstPaise = sum('igstPaise');

  return {
    lines: taxed,
    intraState,
    totals: {
      subtotalPaise,
      discountPaise,
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalPaise: taxablePaise + cgstPaise + sgstPaise + igstPaise,
    },
  };
}

module.exports = {
  GST_RATE_BPS,
  STATE_NAMES,
  isValidStateCode,
  normalizeGstin,
  isValidGstin,
  placeOfSupply,
  applyGst,
};
