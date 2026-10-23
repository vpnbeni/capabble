const { withEffectiveDueDates } = require('../../cpitl/dueDates');
const { computeLateFee } = require('../../cpitl/feeSchedule');
const { busyPeriodsFromGrid, cellHasTeacher } = require('../../timetable/teacherSchedule');
const { buildSlots } = require('../../appnt/lifecycle');
const { workingDueAt } = require('../../libry/lifecycle');

const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

// Diwali on Sun 8 Nov and Mon 9 Nov 2026; Sundays off.
const models = (holidayDueDates = 'next_working_day') => ({
  CapitalSettings: { findOne: () => query({ holidayDueDates }) },
  SchoolDayRule: {
    find: () => query([{
      _id: 'h', kind: 'holiday', title: 'Diwali', status: 'active', startDate: '2026-11-08', endDate: '2026-11-09',
      appliesTo: { scope: 'school', classes: [], sections: [] }
    }]),
    countDocuments: async () => 0
  }
});

describe('fee due dates on holidays', () => {
  it('moves a due date off a holiday to the next working day, when the school asks', async () => {
    const demands = [{ dueDate: new Date('2026-11-09T00:00:00Z'), balance: 500 }, { dueDate: new Date('2026-11-10T00:00:00Z'), balance: 500 }];
    await withEffectiveDueDates(models(), demands);
    expect(demands[0].effectiveDueDate.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(demands[0].dueDateMovedFrom).toBe('2026-11-09');
    expect(demands[1].effectiveDueDate).toBeUndefined();
  });

  it('keeps stored dates by default', async () => {
    const demands = [{ dueDate: new Date('2026-11-09T00:00:00Z'), balance: 500 }];
    await withEffectiveDueDates(models('keep'), demands);
    expect(demands[0].effectiveDueDate).toBeUndefined();
  });

  it('starts the late fee from the moved date', () => {
    const rule = { type: 'flat', amount: 100, graceDays: 0 };
    const asOf = new Date('2026-11-09T12:00:00Z');
    expect(computeLateFee({ dueDate: new Date('2026-11-09T00:00:00Z'), balance: 500 }, rule, asOf)).toBe(100);
    expect(computeLateFee({ dueDate: new Date('2026-11-09T00:00:00Z'), effectiveDueDate: new Date('2026-11-10T00:00:00Z'), balance: 500 }, rule, asOf)).toBe(0);
  });
});

describe('timetable busy periods', () => {
  it('counts a shared period for both teachers', () => {
    expect(cellHasTeacher('Ms Rao/Mr Sen', 'Mr Sen')).toBe(true);
    expect(cellHasTeacher('Ms Rao', 'Mr Sen')).toBe(false);
    const busy = busyPeriodsFromGrid({
      grid: { c1: { Monday: { p1: { subject: 'Games', teacher: 'Ms Rao/Mr Sen' } } } },
      bellTimings: { startTime: '08:00', rows: [{ id: 'p1', type: 'period', label: 'I', duration: 40 }] },
      teacherName: 'Mr Sen',
      dayName: 'Monday',
      classes: [{ id: 'c1', className: '7', section: 'B' }]
    });
    expect(busy).toEqual([{ start: '08:00', end: '08:40', label: 'I · Games · 7 B' }]);
  });
});

describe('appointments on a half day', () => {
  it('stops slots when school ends', () => {
    const host = { isActive: true, slotMinutes: 30, weeklyAvailability: [{ day: 2, start: '11:00', end: '14:00' }] };
    const { slots } = buildSlots({ host, date: '2026-11-17', latestEnd: '12:30', now: new Date('2026-11-01T00:00:00Z') });
    expect(slots.map((s) => s.start)).toEqual(['11:00', '11:30', '12:00']);
  });
});

describe('library due dates', () => {
  it('moves a due date off a holiday', async () => {
    const due = await workingDueAt(models(), new Date('2026-10-26T06:00:00Z'), 14);
    expect(due.toISOString()).toBe('2026-11-10T06:00:00.000Z');
  });
});
