const { mileage, vehicleStats, projectNextYear, sessionMonthsElapsed } = require('../fuelAnalytics');

describe('CPITL fuel analytics', () => {
  it('uses the full-tank method when two full fills exist', () => {
    const logs = [
      { date: '2026-04-01', odometer: 10000, litres: 50, fullTank: true },
      { date: '2026-04-10', odometer: 10200, litres: 20, fullTank: false },
      { date: '2026-04-20', odometer: 10500, litres: 30, fullTank: true },
    ];
    expect(mileage(logs)).toEqual({ km: 500, kmpl: 10, method: 'full_tank' });
  });

  it('falls back to odometer span ÷ litres after first fill', () => {
    const logs = [
      { date: '2026-04-01', odometer: 10000, litres: 40 },
      { date: '2026-04-15', odometer: 10400, litres: 50 },
    ];
    expect(mileage(logs)).toEqual({ km: 400, kmpl: 8, method: 'odometer' });
  });

  it('returns no mileage for a single fill', () => {
    expect(mileage([{ date: '2026-04-01', odometer: 10000, litres: 40 }])).toEqual({ km: 0, kmpl: null, method: null });
  });

  it('builds per-vehicle stats with cost per km', () => {
    const [bus] = vehicleStats([
      { vehicleId: 'v1', vehicleSnapshot: { busNo: '1' }, date: '2026-04-01', odometer: 1000, litres: 50, amount: 4500, fullTank: true },
      { vehicleId: 'v1', vehicleSnapshot: { busNo: '1' }, date: '2026-05-01', odometer: 1500, litres: 50, amount: 4600, fullTank: true },
    ]);
    expect(bus).toMatchObject({ fills: 2, litres: 100, cost: 9100, km: 500, kmpl: 10, costPerKm: 18.2, avgRate: 91 });
    expect(bus.monthly).toEqual([{ month: '2026-04', amount: 4500 }, { month: '2026-05', amount: 4600 }]);
  });

  it('projects next year from months elapsed', () => {
    expect(projectNextYear(60000, 6, 10)).toEqual({ annualised: 120000, projected: 132000 });
    expect(sessionMonthsElapsed('2026-2027', new Date('2026-10-04'))).toBe(7);
    expect(sessionMonthsElapsed('2026-2027', new Date('2027-05-01'))).toBe(12);
  });
});

describe('CPITL months covered', () => {
  const { monthsCovered } = require('../fuelAnalytics');
  it('counts calendar months inclusively', () => {
    expect(monthsCovered('2026-09-01', new Date('2026-10-04'))).toBe(2);
    expect(monthsCovered('2026-10-01', new Date('2026-10-04'))).toBe(1);
    expect(monthsCovered(null)).toBe(12);
  });
});
