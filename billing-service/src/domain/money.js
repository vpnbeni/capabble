// Integer-paise helpers. Nothing in billing ever stores or adds fractional rupees.

function assertPaise(value, label = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer number of paise (got ${value})`);
  }
  return value;
}

// amount × bps / 10000, rounded half up. Works for any realistic amount without floats.
function applyBps(amountPaise, bps) {
  assertPaise(amountPaise);
  return Math.floor((amountPaise * bps + 5000) / 10000);
}

// Split total across weights (largest remainder), so the parts always add up exactly.
function allocate(total, weights) {
  assertPaise(total, 'total');
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let remainder = total - parts.reduce((acc, p) => acc + p, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k += 1, remainder -= 1) parts[order[k % order.length].i] += 1;
  return parts;
}

function rupees(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100).toLocaleString('en-IN');
  return `${sign}₹${whole}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { assertPaise, applyBps, allocate, rupees };
