// Document numbers: one gapless series per document type per Indian financial year (April–March).
const { sql } = require('drizzle-orm');

const SERIES_PREFIX = { INV: 'CB', CN: 'CN', RCPT: 'RC' };

function istParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** '2026-27' for any date from 1 Apr 2026 to 31 Mar 2027 (local time). */
function financialYearOf(date, timeZone = process.env.BILLING_TIMEZONE || 'Asia/Kolkata') {
  const { year, month } = istParts(date, timeZone);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** CB2627-000123: at most 16 characters, as GST rules require. */
function formatNumber(series, financialYear, value) {
  const prefix = SERIES_PREFIX[series];
  if (!prefix) throw new Error(`Unknown number series ${series}`);
  const fy = financialYear.slice(2, 4) + financialYear.slice(5, 7);
  return `${prefix}${fy}-${String(value).padStart(6, '0')}`;
}

/**
 * Take the next number inside the caller's transaction. The sequence row stays
 * locked until that transaction ends, so numbers are unique and gapless.
 */
async function allocateNumber(tx, series, date = new Date()) {
  const financialYear = financialYearOf(date);
  const result = await tx.execute(sql`
    INSERT INTO billing.number_sequences (series, financial_year, next_value)
    VALUES (${series}, ${financialYear}, 2)
    ON CONFLICT (series, financial_year)
    DO UPDATE SET next_value = billing.number_sequences.next_value + 1
    RETURNING next_value - 1 AS value
  `);
  const value = Number(result.rows[0].value);
  return { number: formatNumber(series, financialYear, value), financialYear, value };
}

module.exports = { financialYearOf, formatNumber, allocateNumber, istParts };
