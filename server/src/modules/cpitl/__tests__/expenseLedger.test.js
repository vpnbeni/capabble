const { ledgerFieldsFor, assertEditableExpense } = require('../expenseLedger');

describe('CPITL expense ledger mapping', () => {
  it('maps a fuel log', () => {
    const fields = ledgerFieldsFor('fuel', {
      date: '2026-05-01', amount: 4500, station: 'HP Pump', billNo: 'B12', litres: 50, ratePerLitre: 90, odometer: 12000,
      vehicleSnapshot: { busNo: '7', registrationNumber: 'HR26AB1234' },
    });
    expect(fields).toMatchObject({ amount: 4500, payee: 'HP Pump', reference: 'B12', title: 'Fuel — Bus 7 · HR26AB1234' });
    expect(fields.notes).toContain('50 L');
  });

  it('maps a paid electricity bill to its payment date', () => {
    const fields = ledgerFieldsFor('electricity', { paidOn: '2026-06-05', amount: 18000, billMonth: '2026-05', units: 2100, connectionSnapshot: { name: 'Main Block' } });
    expect(fields).toMatchObject({ date: '2026-06-05', amount: 18000, title: 'Electricity — Main Block (2026-05)', notes: '2100 units' });
  });

  it('books salary at net pay plus employer contributions', () => {
    const fields = ledgerFieldsFor('salary', { month: '2026-09', paidOn: '2026-10-01', totals: { staff: 40, net: 1000000, employerPf: 60000, employerEsi: 5000 } });
    expect(fields.amount).toBe(1065000);
    expect(fields.title).toBe('Salary — 2026-09');
  });

  it('blocks editing ledger rows owned by another record, but not infra payments', () => {
    expect(() => assertEditableExpense({ kind: 'fuel', status: 'valid', sourceRef: { model: 'FuelLog', id: 'x' } })).toThrow(/fuel page/);
    expect(() => assertEditableExpense({ kind: 'infra', status: 'valid', sourceRef: { model: 'InfraProject', id: 'p' } })).not.toThrow();
    expect(() => assertEditableExpense({ kind: 'operating', status: 'void', sourceRef: {} })).toThrow(/void/);
  });
});
