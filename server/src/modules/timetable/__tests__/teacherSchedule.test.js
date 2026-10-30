jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn() }));

const { teacherDayFromGrid, getTeacherDays } = require('../teacherSchedule');
const { resolveRouteRequirement } = require('../../../rbac/catalog');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const bellTimings = {
  startTime: '08:00',
  rows: [
    { id: 'r1', type: 'period', label: 'I', duration: 40 },
    { id: 'r2', type: 'period', label: 'II', duration: 40 },
    { id: 'r3', type: 'break', label: 'Recess', duration: 20 },
    { id: 'r4', type: 'period', label: 'III', duration: 40 }
  ]
};
const classes = [
  { id: 'c7a', className: '7', section: 'A' },
  { id: 'c8b', className: '8', section: 'B' }
];
const grid = {
  c7a: { Monday: { 0: { subject: 'Science', teacher: 'Ms Rao' }, 1: { subject: 'English', teacher: 'Mr Das' } } },
  c8b: { Monday: { 2: { subject: 'Science', teacher: 'Ms Rao/Mr Sen' } } }
};
const teachers = [{ id: 't1', name: 'Ms Rao' }];

describe('teacherDayFromGrid', () => {
  it('lists every bell row as a class, a free period or a break', () => {
    const day = teacherDayFromGrid({ grid, bellTimings, teacherName: 'Ms Rao', dayName: 'Monday', classes });
    expect(day).toEqual([
      {
        id: 'r1',
        label: 'I',
        start: '08:00',
        end: '08:40',
        kind: 'class',
        subject: 'Science',
        className: '7',
        section: 'A'
      },
      { id: 'r2', label: 'II', start: '08:40', end: '09:20', kind: 'free' },
      { id: 'r3', label: 'Recess', start: '09:20', end: '09:40', kind: 'break' },
      {
        id: 'r4',
        label: 'III',
        start: '09:40',
        end: '10:20',
        kind: 'class',
        subject: 'Science',
        className: '8',
        section: 'B'
      }
    ]);
  });
});

describe('getTeacherDays', () => {
  const models = {
    TimetableState: { findOne: jest.fn(() => query({ teachers, classes, bellTimings })) },
    TimetableVersion: { findOne: jest.fn(() => query({ grid, publishedAt: new Date('2026-10-01') })) }
  };

  it('returns the teacher, periods on working days and none on Sunday', async () => {
    // 19 Oct 2026 is a Monday; 25 Oct a Sunday.
    const data = await getTeacherDays(models, 't1', { from: '2026-10-19', to: '2026-10-25' });
    expect(data.teacher).toEqual({ id: 't1', name: 'Ms Rao' });
    expect(data.days).toHaveLength(7);
    expect(data.days[0].periods.filter((period) => period.kind === 'class')).toHaveLength(2);
    // Tuesday has nothing timetabled for her: no periods rather than a day of free ones.
    expect(data.days[1].periods).toEqual([]);
    expect(data.days[6]).toMatchObject({ date: '2026-10-25', working: false, periods: [] });
  });

  it('has no teacher and no periods for a login with no staff record', async () => {
    const data = await getTeacherDays(models, null, { from: '2026-10-19', to: '2026-10-19' });
    expect(data.teacher).toBeNull();
    expect(data.days[0].periods).toEqual([]);
  });

  it('refuses more than 14 days', async () => {
    await expect(getTeacherDays(models, 't1', { from: '2026-10-01', to: '2026-10-31' })).rejects.toThrow(/14 days/);
  });
});

describe('route rules', () => {
  it('lets any staff login read its own timetable but not the setup', () => {
    expect(resolveRouteRequirement('GET', '/timetable/me')).toMatchObject({ staff: true });
    expect(resolveRouteRequirement('PUT', '/timetable/me')).toMatchObject({ anyOf: ['timetable.timetable.write'] });
    expect(resolveRouteRequirement('GET', '/timetable/state')).toMatchObject({ anyOf: ['timetable.timetable.read'] });
  });

  it('checks student attendance read for the registers list', () => {
    expect(resolveRouteRequirement('GET', '/attnd/student-registers'))
      .toMatchObject({ anyOf: ['attnd.students.read'] });
  });
});
