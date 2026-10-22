const { resolveDay, normalizeAppliesTo, IMPLICIT_SUNDAY, range } = require('../schoolDays');

const rule = (overrides) => ({
  _id: overrides.id || 'r1',
  status: 'active',
  appliesTo: { scope: 'school', classes: [], sections: [] },
  ...overrides
});

const SESSION = { startDate: '2026-04-01', endDate: '2027-03-31' };
const sundays = rule({ id: 'sun', kind: 'weekly_off', ...SESSION, weekly: { weekday: 0, weeksOfMonth: [] } });
const secondFourthSat = rule({
  id: 'sat', kind: 'weekly_off', ...SESSION, weekly: { weekday: 6, weeksOfMonth: [2, 4] }
});

describe('school days', () => {
  it('treats Sunday as off and ordinary days as working', () => {
    expect(resolveDay('2026-10-25', [sundays], null)).toMatchObject({ working: false, kind: 'weekly_off' });
    expect(resolveDay('2026-10-22', [sundays], null)).toMatchObject({ working: true, kind: 'working' });
  });

  it('only takes the 2nd and 4th Saturday off', () => {
    const rules = [sundays, secondFourthSat];
    expect(resolveDay('2026-10-03', rules, null).working).toBe(true); // 1st Saturday
    expect(resolveDay('2026-10-10', rules, null).working).toBe(false); // 2nd
    expect(resolveDay('2026-10-17', rules, null).working).toBe(true); // 3rd
    expect(resolveDay('2026-10-24', rules, null).working).toBe(false); // 4th
    expect(resolveDay('2026-10-31', rules, null).working).toBe(true); // 5th
  });

  it('lets a working-day override open a Saturday, but not a closure', () => {
    const open = rule({
      id: 'w', kind: 'working_day', title: 'Compensatory working day', startDate: '2026-10-10', endDate: '2026-10-10'
    });
    expect(resolveDay('2026-10-10', [secondFourthSat, open], null)).toMatchObject({ working: true, kind: 'working' });
    const closure = rule({ id: 'c', kind: 'closure', mode: 'closed', startDate: '2026-10-10', endDate: '2026-10-10' });
    expect(resolveDay('2026-10-10', [secondFourthSat, open, closure], null))
      .toMatchObject({ working: false, kind: 'closure' });
  });

  it('applies a class-only closure to those classes and marks it partial school-wide', () => {
    const grap = rule({
      id: 'g',
      kind: 'closure',
      mode: 'online',
      title: 'GRAP III: classes online',
      startDate: '2026-11-12',
      endDate: '2026-11-14',
      appliesTo: normalizeAppliesTo({ scope: 'classes', classes: ['Class 5th', 'IV'] })
    });
    expect(grap.appliesTo.classes).toEqual(['5', '4']);
    const fifth = resolveDay('2026-11-12', [sundays, grap], { className: '5th', section: 'A' });
    expect(fifth).toMatchObject({ kind: 'closure', mode: 'online', working: true });
    const ninth = resolveDay('2026-11-12', [sundays, grap], { className: '9', section: 'A' });
    expect(ninth).toMatchObject({ kind: 'working', working: true });
    const school = resolveDay('2026-11-12', [sundays, grap], null);
    expect(school.kind).toBe('working');
    expect(school.partial).toHaveLength(1);
  });

  it('closes a section when a closure names it', () => {
    const closed = rule({
      id: 's',
      kind: 'closure',
      mode: 'closed',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      appliesTo: normalizeAppliesTo({ scope: 'classes', sections: ['7|b'] })
    });
    expect(resolveDay('2026-11-02', [closed], { className: 'VII', section: 'B' }).working).toBe(false);
    expect(resolveDay('2026-11-02', [closed], { className: 'VII', section: 'A' }).working).toBe(true);
  });

  it('keeps a half day on a working day only', () => {
    const half = rule({
      id: 'h', kind: 'half_day', halfDayEndTime: '12:30', startDate: '2026-10-25', endDate: '2026-10-26'
    });
    expect(resolveDay('2026-10-26', [sundays, half], null))
      .toMatchObject({ kind: 'half_day', halfDayEndTime: '12:30', working: true });
    expect(resolveDay('2026-10-25', [sundays, half], null)).toMatchObject({ kind: 'weekly_off', working: false });
  });

  it('falls back to Sunday off when a school set no weekly off', async () => {
    const models = {
      SchoolDayRule: {
        find: () => ({ lean: async () => [] }),
        countDocuments: async () => 0
      }
    };
    const days = await range(models, '2026-10-24', '2026-10-26');
    expect(days['2026-10-25']).toMatchObject({ working: false, kind: 'weekly_off' });
    expect(days['2026-10-24'].working).toBe(true);
    expect(IMPLICIT_SUNDAY.weekly.weekday).toBe(0);
  });

  it('refuses huge or backwards ranges', async () => {
    const models = { SchoolDayRule: null };
    await expect(range(models, '2026-10-26', '2026-10-01')).rejects.toThrow('on or after');
    await expect(range(models, '2026-01-01', '2028-01-01')).rejects.toThrow('at most');
  });
});

describe('legacy calendar migration', () => {
  // eslint-disable-next-line global-require
  const { legacyHolidays } = require('../../../../scripts/migrations/migrate-legacy-calendar');

  it('keeps the school\'s own holidays and skips the old seeder defaults', () => {
    const docs = [{
      dates: [
        { date: new Date('2026-08-14T18:30:00.000Z'), isHoliday: true, holidayName: 'Independence Day' },
        { date: new Date('2026-11-07T18:30:00.000Z'), isHoliday: true, holidayName: 'Diwali' },
        { date: new Date('2026-11-09T18:30:00.000Z'), isHoliday: false }
      ]
    }];
    expect(legacyHolidays(docs)).toEqual([{ date: '2026-11-08', title: 'Diwali' }]);
  });
});
