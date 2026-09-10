const {
  calculateLayoutCapacity,
  calculateRowSeats,
  normalizeSeatingLayout,
} = require('../roomSeatingLayout');

describe('roomSeatingLayout', () => {
  it('calculates seats per row from bench count and type', () => {
    expect(calculateRowSeats({ benchCount: 6, benchType: 'double' })).toBe(12);
    expect(calculateRowSeats({ benchCount: 4, benchType: 'triple' })).toBe(12);
    expect(calculateRowSeats({ benchCount: 5, benchType: 'single' })).toBe(5);
  });

  it('calculates total layout capacity', () => {
    const layout = normalizeSeatingLayout({
      rows: [
        { benchCount: 6, benchType: 'double' },
        { benchCount: 4, benchType: 'triple' },
      ],
    });
    expect(calculateLayoutCapacity(layout)).toBe(24);
  });

  it('falls back to default layout when rows are empty', () => {
    const layout = normalizeSeatingLayout({ rows: [] });
    expect(layout.rows).toHaveLength(1);
    expect(calculateLayoutCapacity(layout)).toBe(24);
  });
});
