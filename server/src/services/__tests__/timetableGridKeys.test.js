/**
 * The generator and the web timetable key a class's cells by teachable-period
 * index ("0", "1", …; breaks skipped). Bell rows carry their own ids (the web
 * makes random ones), so readers must look cells up by index, not by row id.
 */

jest.mock('../../utils/pdfGenerator', () => ({ generatePDF: jest.fn() }));

const { buildClassPDFContext, buildTeacherPDFContext } = require('../timetableExportService');
const { generate } = require('../timetableGeneratorService');
const { busyPeriodsFromGrid } = require('../../modules/timetable/teacherSchedule');

const bellTimings = {
  startTime: '08:00',
  rows: [
    { id: '665f1c2a9b1e8a0012a1b001', type: 'period', label: 'I', duration: 40 },
    { id: '665f1c2a9b1e8a0012a1b002', type: 'period', label: 'II', duration: 40 },
    { id: '665f1c2a9b1e8a0012a1b003', type: 'break', label: 'RECESS', duration: 20 },
    { id: '665f1c2a9b1e8a0012a1b004', type: 'period', label: 'III', duration: 40 }
  ]
};

const cls = { id: 'cls-7a', className: '7', section: 'A', incharge: 'Ms Rao' };

// What the generator writes: slots "0".."2" for the three teachable periods.
const grid = {
  [cls.id]: {
    Monday: {
      0: { subject: 'Maths', teacher: 'Ms Rao' },
      1: { subject: 'English', teacher: 'Mr Das' },
      2: { subject: 'Science', teacher: 'Ms Rao' }
    }
  }
};

const state = { bellTimings, classes: [cls], teachers: [{ id: 't1', name: 'Ms Rao' }] };

describe('timetable grid keys', () => {
  it('the generator keys cells by teachable-period index', () => {
    const { grid: generated } = generate({
      ...state,
      subjects: [{ id: 's1', name: 'Maths' }],
      teacherSubjectAllocations: [],
      periodAllocation: {}
    });
    expect(Object.keys(generated[cls.id].Monday)).toEqual(['0', '1', '2']);
  });

  it('class PDF / portal context reads index-keyed cells', () => {
    const monday = buildClassPDFContext([cls], grid, state).classes[0].days[0].slots;
    expect(monday).toEqual([
      { isBreak: false, subject: 'Maths', teacher: 'Ms Rao' },
      { isBreak: false, subject: 'English', teacher: 'Mr Das' },
      { isBreak: true },
      { isBreak: false, subject: 'Science', teacher: 'Ms Rao' }
    ]);
  });

  it('teacher PDF context reads index-keyed cells', () => {
    const [rao] = buildTeacherPDFContext(state.teachers, grid, state).teachers;
    expect(rao.totalPeriods).toBe(2);
    expect(rao.periods.map((p) => p.daySlots[0].subject)).toEqual(['Maths', '', undefined, 'Science']);
  });

  it('teacher busy periods read index-keyed cells', () => {
    const busy = busyPeriodsFromGrid({ grid, bellTimings, teacherName: 'Ms Rao', dayName: 'Monday', classes: [cls] });
    expect(busy).toEqual([
      { start: '08:00', end: '08:40', label: 'I · Maths · 7 A' },
      { start: '09:40', end: '10:20', label: 'III · Science · 7 A' }
    ]);
  });

  it('still reads grids keyed by bell row id', () => {
    const byId = { [cls.id]: { Monday: { [bellTimings.rows[3].id]: { subject: 'Art', teacher: 'Ms Rao' } } } };
    const monday = buildClassPDFContext([cls], byId, state).classes[0].days[0].slots;
    expect(monday[3]).toEqual({ isBreak: false, subject: 'Art', teacher: 'Ms Rao' });
  });
});
