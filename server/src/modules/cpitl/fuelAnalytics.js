/**
 * CPITL fuel & spend analytics — pure functions.
 */

const round = (value, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((Number(value) || 0) * f) / f;
};

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Mileage from fills sorted by date/odometer.
 * Preferred: full-tank to full-tank — km between two full fills ÷ litres added after the first of them.
 * Fallback: odometer span ÷ litres after the first fill.
 */
const mileage = (logs = []) => {
  const fills = logs
    .filter((l) => Number(l.odometer) > 0)
    .sort((a, b) => Number(a.odometer) - Number(b.odometer) || new Date(a.date) - new Date(b.date));
  if (fills.length < 2) return { km: 0, kmpl: null, method: null };

  const km = Number(fills[fills.length - 1].odometer) - Number(fills[0].odometer);
  const fullIdx = fills.map((f, i) => (f.fullTank ? i : -1)).filter((i) => i >= 0);
  if (fullIdx.length >= 2) {
    const first = fullIdx[0];
    const last = fullIdx[fullIdx.length - 1];
    const span = Number(fills[last].odometer) - Number(fills[first].odometer);
    const litres = fills.slice(first + 1, last + 1).reduce((s, f) => s + (Number(f.litres) || 0), 0);
    if (span > 0 && litres > 0) return { km, kmpl: round(span / litres), method: 'full_tank' };
  }
  const litresAfterFirst = fills.slice(1).reduce((s, f) => s + (Number(f.litres) || 0), 0);
  return { km, kmpl: km > 0 && litresAfterFirst > 0 ? round(km / litresAfterFirst) : null, method: 'odometer' };
};

/** Per-vehicle stats from fuel logs. */
const vehicleStats = (logs = []) => {
  const byVehicle = new Map();
  logs.forEach((log) => {
    const key = String(log.vehicleId || log.vehicleSnapshot?.registrationNumber || 'unknown');
    if (!byVehicle.has(key)) byVehicle.set(key, { vehicleId: log.vehicleId || null, vehicle: log.vehicleSnapshot || {}, logs: [] });
    byVehicle.get(key).logs.push(log);
  });

  return [...byVehicle.values()].map(({ vehicleId, vehicle, logs: list }) => {
    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    const litres = round(sorted.reduce((s, l) => s + (Number(l.litres) || 0), 0));
    const cost = round(sorted.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    const { km, kmpl, method } = mileage(sorted);
    const monthly = {};
    sorted.forEach((l) => {
      const k = monthKey(l.date);
      monthly[k] = round((monthly[k] || 0) + (Number(l.amount) || 0));
    });
    return {
      vehicleId,
      vehicle,
      fills: sorted.length,
      litres,
      cost,
      km,
      kmpl,
      mileageMethod: method,
      costPerKm: km > 0 ? round(cost / km) : null,
      avgRate: litres > 0 ? round(cost / litres) : null,
      lastFill: sorted.length ? sorted[sorted.length - 1].date : null,
      monthly: Object.entries(monthly).map(([month, amount]) => ({ month, amount })),
    };
  }).sort((a, b) => b.cost - a.cost);
};

/**
 * Annualise spend observed over `monthsElapsed` months and apply growth.
 * Returns { annualised, projected }.
 */
const projectNextYear = (spent, monthsElapsed, growthPct = 0) => {
  const months = Math.max(1, Math.min(12, Number(monthsElapsed) || 1));
  const annualised = ((Number(spent) || 0) / months) * 12;
  return { annualised: Math.round(annualised), projected: Math.round(annualised * (1 + (Number(growthPct) || 0) / 100)) };
};

/** Calendar months from `from` to `asOf`, inclusive (1..12). */
const monthsCovered = (from, asOf = new Date()) => {
  if (!from) return 12;
  const a = new Date(from);
  const b = new Date(asOf);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(1, Math.min(12, months));
};

/** Months elapsed in an April–March session as of a date (1..12). */
const sessionMonthsElapsed = (sessionLabel, asOf = new Date()) => {
  const start = Number(String(sessionLabel || '').slice(0, 4));
  if (!start) return 12;
  const d = new Date(asOf);
  const elapsed = (d.getFullYear() - start) * 12 + (d.getMonth() + 1) - 4 + 1;
  return Math.max(1, Math.min(12, elapsed));
};

module.exports = {
  monthKey,
  mileage,
  vehicleStats,
  projectNextYear,
  sessionMonthsElapsed,
  monthsCovered,
};
