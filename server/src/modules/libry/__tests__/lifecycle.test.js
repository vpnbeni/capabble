const { assertCopyTransition, calculateDueAt, assertBorrowingEligibility, calculateFine, orderReservations } = require('../lifecycle');

describe('LIBRY lifecycle', () => {
  test('calculates due dates in UTC from the configured policy duration', () => {
    expect(calculateDueAt(new Date('2026-10-17T00:00:00.000Z'), 14).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  test('rejects inactive members and exhausted borrowing limits', () => {
    expect(() => assertBorrowingEligibility({ member: { status: 'suspended' }, policy: { isActive: true, maxActiveLoans: 2 }, activeLoans: 0 })).toThrow('Member is not active');
    expect(() => assertBorrowingEligibility({ member: { status: 'active' }, policy: { isActive: true, maxActiveLoans: 2 }, activeLoans: 2 })).toThrow('borrowing limit');
  });

  test('enforces copy status transitions', () => {
    expect(() => assertCopyTransition('available', 'issued')).not.toThrow();
    expect(() => assertCopyTransition('withdrawn', 'available')).toThrow('Invalid copy status transition');
  });

  test('calculates fines with grace days and cap supplied by policy', () => {
    expect(calculateFine({ overdueDays: 5, graceDays: 2, dailyRate: 3, maximum: 8 })).toBe(8);
  });

  test('orders queued reservations deterministically', () => {
    const ordered = orderReservations([{ status: 'queued', createdAt: '2026-10-12' }, { status: 'cancelled', createdAt: '2026-10-01' }, { status: 'queued', createdAt: '2026-10-10' }]);
    expect(ordered.map((row) => row.createdAt)).toEqual(['2026-10-10', '2026-10-12']);
  });
});
