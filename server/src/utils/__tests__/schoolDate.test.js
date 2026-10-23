const schoolDate = require('../schoolDate');

describe('school dates', () => {
  it('uses the school day, not the UTC day, for early-morning times', () => {
    // 00:30 IST on 1 Apr 2027 is still 31 Mar in UTC.
    expect(schoolDate.dateKey(new Date('2027-03-31T19:00:00.000Z'))).toBe('2027-04-01');
    expect(schoolDate.dateKey(new Date('2027-03-31T18:29:00.000Z'))).toBe('2027-03-31');
  });

  it('keeps day keys as they are and rejects nonsense', () => {
    expect(schoolDate.dateKey('2026-10-22')).toBe('2026-10-22');
    expect(schoolDate.dateKey('not a date')).toBe('');
    expect(schoolDate.isDateKey('2026-02-30')).toBe(false);
    expect(schoolDate.isDateKey('2028-02-29')).toBe(true);
  });

  it('reads UTC-midnight dates stored by older records as the same school day', () => {
    expect(schoolDate.dateKey(new Date('2027-02-15T00:00:00.000Z'))).toBe('2027-02-15');
  });

  it('does day arithmetic on keys across months and leap years', () => {
    expect(schoolDate.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(schoolDate.addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(schoolDate.daysBetween('2026-04-01', '2027-03-31')).toBe(364);
  });

  it('names weekdays and finds the 2nd and 4th Saturday', () => {
    expect(schoolDate.weekdayName('2026-10-22')).toBe('Thursday');
    expect(schoolDate.weekday('2026-10-24')).toBe(6);
    expect(schoolDate.weekOfMonth('2026-10-10')).toBe(2);
    expect(schoolDate.weekOfMonth('2026-10-24')).toBe(4);
    expect(schoolDate.weekOfMonth('2026-10-31')).toBe(5);
  });

  it('starts a school day at local midnight', () => {
    expect(schoolDate.startOfDay('2026-10-22').toISOString()).toBe('2026-10-21T18:30:00.000Z');
    expect(schoolDate.startOfDay('2026-10-22', 'UTC').toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });

  it('puts April to March in one session', () => {
    expect(schoolDate.sessionLabelFor('2026-04-01')).toBe('2026-2027');
    expect(schoolDate.sessionLabelFor('2027-03-31')).toBe('2026-2027');
    expect(schoolDate.sessionLabelFor('2027-04-01')).toBe('2027-2028');
    expect(schoolDate.sessionDates('2026-2027')).toEqual({ startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(schoolDate.sessionDates('26-27')).toBeNull();
  });

  it('falls back to India time for a missing or invalid zone', () => {
    expect(schoolDate.timeZoneOf({ timeZone: 'Asia/Dubai' })).toBe('Asia/Dubai');
    expect(schoolDate.timeZoneOf({ timeZone: 'Mars/Base' })).toBe('Asia/Kolkata');
    expect(schoolDate.timeZoneOf(null)).toBe('Asia/Kolkata');
  });
});
