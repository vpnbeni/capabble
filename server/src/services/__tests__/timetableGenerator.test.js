const { generate } = require('../timetableGeneratorService');
const { buildSchoolState } = require('./timetableFixtures');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const cellsOf = (grid) => Object.entries(grid).flatMap(([classId, days]) => Object.entries(days)
  .flatMap(([day, slots]) => Object.entries(slots).map(([period, cell]) => ({ classId, day, period, ...cell }))));

/** Teacher bookings that collide with another class at the same period. */
const teacherClashes = (grid) => {
  const seen = new Set();
  let clashes = 0;
  cellsOf(grid).forEach((cell) => {
    (cell.teacher ? cell.teacher.split('/') : []).forEach((teacher) => {
      const key = `${teacher}|${cell.day}|${cell.period}`;
      if (seen.has(key)) clashes += 1;
      seen.add(key);
    });
  });
  return clashes;
};

const periodsBySubject = (grid, classId) => cellsOf({ [classId]: grid[classId] })
  .filter((cell) => cell.subject)
  .reduce((acc, cell) => ({ ...acc, [cell.subject]: (acc[cell.subject] || 0) + 1 }), {});

describe('timetable generator', () => {
  it('fills a tight school week completely without teacher clashes', () => {
    for (let run = 0; run < 3; run += 1) {
      const state = buildSchoolState();
      const { grid, stats, conflictReport } = generate(state);
      expect(stats.filledSlots).toBe(stats.totalSlots);
      expect(conflictReport).toEqual([]);
      expect(teacherClashes(grid)).toBe(0);
      state.classes.forEach((cls) => expect(periodsBySubject(grid, cls.id)).toEqual(state.periodAllocation[cls.id]));
    }
  });

  it('keeps the class teacher in the first period and a subject at most twice a day', () => {
    const state = buildSchoolState();
    const { grid } = generate(state);
    state.classes.forEach((cls) => {
      const inchargeDays = DAYS.filter((day) => grid[cls.id][day]['0'].teacher === cls.incharge).length;
      const [subject] = state.teacherSubjectAllocations
        .find((t) => t.teacherName === cls.incharge).assignments.find((a) => a.classId === cls.id).subjects;
      expect(inchargeDays).toBe(Math.min(DAYS.length, state.periodAllocation[cls.id][subject]));
      DAYS.forEach((day) => {
        const counts = {};
        Object.values(grid[cls.id][day]).forEach((cell) => { counts[cell.subject] = (counts[cell.subject] || 0) + 1; });
        Object.entries(counts)
          .filter(([subjectName]) => subjectName)
          .forEach(([, n]) => expect(n).toBeLessThanOrEqual(2));
      });
    });
  });

  it('reports what cannot fit when a teacher has more periods than the week', () => {
    const state = buildSchoolState();
    // Give the PE teacher 6 more periods in every class: 92 periods for 42 slots.
    state.classes.forEach((cls) => {
      state.periodAllocation[cls.id]['Physical Education'] += 6;
      state.periodAllocation[cls.id].Library -= 1;
    });
    const { grid, stats, conflictReport } = generate(state);
    expect(teacherClashes(grid)).toBe(0);
    expect(stats.filledSlots).toBeLessThan(stats.totalSlots);
    expect(conflictReport.every((row) => row.type === 'underallocated')).toBe(true);
    expect(conflictReport.some((row) => row.subjectName === 'Physical Education')).toBe(true);
  });

  it('places a subject that has no teacher', () => {
    const state = buildSchoolState();
    state.teacherSubjectAllocations = state.teacherSubjectAllocations.filter((t) => t.teacherName !== 'Kamla Rana');
    const { stats } = generate(state);
    expect(stats.filledSlots).toBe(stats.totalSlots);
  });

  it('keeps lab doubles together and leaves parallel pairs in one cell', () => {
    const state = buildSchoolState();
    const tenth = state.classes.find((cls) => cls.className === '10th');
    state.subjects.find((s) => s.name === 'Science').requiresConsecutivePeriods = true;
    state.parallelSubjectPairs = [{ className: '9th', subjectA: 'Computer', subjectB: 'Library' }];
    const { grid } = generate(state);
    expect(teacherClashes(grid)).toBe(0);
    DAYS.forEach((day) => {
      const periods = Object.entries(grid[tenth.id][day])
        .filter(([, cell]) => cell.subject === 'Science')
        .map(([period]) => Number(period))
        .sort((a, b) => a - b);
      // Science comes in back-to-back pairs (8 periods = 4 doubles).
      for (let i = 0; i < periods.length; i += 2) expect(periods[i + 1]).toBe(periods[i] + 1);
    });
    const ninth = state.classes.find((cls) => cls.className === '9th');
    const paired = cellsOf({ [ninth.id]: grid[ninth.id] }).filter((cell) => cell.subject === 'Computer/Library');
    expect(paired.length).toBeGreaterThan(0);
    paired.forEach((cell) => expect(cell.teacher).toBe('Anju Dhankhar/Kamla Rana'));
  });
});
