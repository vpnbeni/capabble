const BENCH_TYPES = ['single', 'double', 'triple'];

const SEATS_PER_BENCH = {
  single: 1,
  double: 2,
  triple: 3,
};

const DEFAULT_SEATING_LAYOUT = {
  rows: [{ benchCount: 12, benchType: 'double' }],
};

function getSeatsPerBench(benchType) {
  return SEATS_PER_BENCH[String(benchType || '').toLowerCase()] || 0;
}

function calculateRowSeats(row) {
  const benchCount = Math.max(0, Number(row?.benchCount) || 0);
  const seatsPerBench = getSeatsPerBench(row?.benchType);
  return benchCount * seatsPerBench;
}

function calculateLayoutCapacity(layout) {
  const rows = Array.isArray(layout?.rows) ? layout.rows : [];
  return rows.reduce((sum, row) => sum + calculateRowSeats(row), 0);
}

function normalizeSeatingLayout(input) {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_SEATING_LAYOUT };
  }

  const rows = Array.isArray(input.rows)
    ? input.rows
      .map((row) => {
        const benchType = BENCH_TYPES.includes(String(row?.benchType || '').toLowerCase())
          ? String(row.benchType).toLowerCase()
          : 'double';
        const benchCount = Math.max(0, Math.min(50, Math.floor(Number(row?.benchCount) || 0)));
        return { benchCount, benchType };
      })
      .filter((row) => row.benchCount > 0)
    : [];

  if (rows.length === 0) {
    return { ...DEFAULT_SEATING_LAYOUT };
  }

  return { rows };
}

module.exports = {
  BENCH_TYPES,
  SEATS_PER_BENCH,
  DEFAULT_SEATING_LAYOUT,
  getSeatsPerBench,
  calculateRowSeats,
  calculateLayoutCapacity,
  normalizeSeatingLayout,
};
