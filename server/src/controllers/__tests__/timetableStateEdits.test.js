/**
 * The timetable state is one document per session, saved whole by the website. These check that a
 * save naming an older version is refused (409) and that the app's one-change endpoints keep the
 * classes grid in step and refuse to drop a class that still has periods.
 */
const store = { doc: null };

jest.mock('../../models/TimetableState', () => {
  const clone = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);
  const time = (value) => new Date(value).getTime();
  const matches = (filter) => !filter.updatedAt || (store.doc && time(store.doc.updatedAt) === time(filter.updatedAt));
  return {
    findOne: jest.fn(() => ({
      select: () => ({ lean: async () => clone(store.doc) }),
      lean: async () => clone(store.doc)
    })),
    findOneAndUpdate: jest.fn((filter, update, options) => ({
      lean: async () => {
        if (store.doc && !matches(filter)) return null;
        if (!store.doc && !options.upsert) return null;
        const previous = store.doc ? new Date(store.doc.updatedAt).getTime() : 0;
        const updatedAt = new Date(Math.max(Date.now(), previous + 1000)).toISOString();
        store.doc = { ...(store.doc || {}), ...clone(update), updatedAt };
        return clone(store.doc);
      }
    }))
  };
});

jest.mock('../../services/timetableExportService', () => ({}));
jest.mock('../../services/timetableGeneratorService', () => ({ generate: jest.fn() }));

const ctrl = require('../timetableController');

const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const run = async (handler, req) => {
  const res = fakeRes();
  let failure = null;
  await handler({ academicSession: '2026-2027', params: {}, body: {}, ...req }, res, (error) => { failure = error; });
  // asyncHandler doesn't hand back its promise: let it finish.
  await new Promise((resolve) => { setTimeout(resolve, 20); });
  if (failure) throw failure;
  return res;
};
const body = (res) => res.json.mock.calls[0][0];

const seed = () => {
  store.doc = {
    academicSession: '2026-2027',
    updatedAt: '2026-10-29T10:00:00.000Z',
    subjects: [{ id: 'ts-1', name: 'English' }, { id: 'ts-2', name: 'Maths' }],
    classes: [{ id: 'tc-1', className: '7th', section: 'A', floor: 'First Floor', subjects: ['English'] }],
    matrixClasses: [{ id: 'mc-1', name: '7th' }],
    matrixSections: [{ id: 'ms-1', name: 'A' }],
    matrixSelection: { 'mc-1': { 'ms-1': true } },
    periodAllocation: { 'tc-1': { English: 6 } },
    teachers: [
      {
        id: 't-1', name: 'Ms Rao', shortName: 'RAO', subjects: ['English']
      },
      {
        id: 't-2', name: 'Mr Sen', shortName: 'SEN', subjects: []
      }
    ],
    teacherSubjectAllocations: [
      {
        teacherId: 't-1',
        teacherName: 'Ms Rao',
        assignments: [{
          classId: 'tc-1', className: '7th', section: 'A', subjects: ['English']
        }]
      }
    ],
    timetableGrid: {}
  };
};

describe('timetable state versions and one-change edits', () => {
  beforeEach(seed);

  test('a whole save naming an older version is refused', async () => {
    const older = '2026-10-28T10:00:00.000Z';
    const res = await run(ctrl.upsertTimetableState, { body: { expectedUpdatedAt: older, classes: [] } });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(store.doc.classes).toHaveLength(1);
  });

  test('a whole save naming the current version goes through and returns the new version', async () => {
    const current = '2026-10-29T10:00:00.000Z';
    const res = await run(ctrl.upsertTimetableState, { body: { ...store.doc, expectedUpdatedAt: current } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).data.updatedAt).not.toBe('2026-10-29T10:00:00.000Z');
  });

  test('adding a section copies the class subjects and ticks it in the classes grid', async () => {
    const res = await run(ctrl.addClassSection, { body: { className: '7th', section: 'b' } });
    expect(res.status).toHaveBeenCalledWith(200);
    const added = store.doc.classes.find((row) => row.section === 'B');
    expect(added.subjects).toEqual(['English']);
    const sectionId = store.doc.matrixSections.find((row) => row.name === 'B').id;
    expect(store.doc.matrixSelection['mc-1'][sectionId]).toBe(true);
  });

  test('a class with periods set is not removed', async () => {
    const res = await run(ctrl.removeClassSection, { params: { id: 'tc-1' } });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(store.doc.classes).toHaveLength(1);
  });

  test('a class\'s periods keep only its own subjects', async () => {
    await run(ctrl.setClassPeriods, { params: { classId: 'tc-1' }, body: { subjects: { English: 7, Maths: 5 } } });
    expect(store.doc.periodAllocation['tc-1']).toEqual({ English: 7 });
  });

  test('a class\'s teachers for a subject replace the old ones and give the new teacher the subject', async () => {
    const res = await run(ctrl.setClassTeachers, {
      params: { classId: 'tc-1' },
      body: { subjects: { english: ['t-2'] } }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(store.doc.teacherSubjectAllocations).toEqual([{
      teacherId: 't-2',
      teacherName: 'Mr Sen',
      assignments: [{
        classId: 'tc-1', className: '7th', section: 'A', subjects: ['English']
      }]
    }]);
    expect(store.doc.teachers.find((row) => row.id === 't-2').subjects).toEqual(['English']);
  });

  test('a subject the class doesn\'t take or an unknown teacher is refused', async () => {
    const params = { classId: 'tc-1' };
    const maths = await run(ctrl.setClassTeachers, { params, body: { subjects: { Maths: ['t-1'] } } });
    expect(maths.status).toHaveBeenCalledWith(400);
    const nobody = await run(ctrl.setClassTeachers, { params, body: { subjects: { English: ['t-9'] } } });
    expect(nobody.status).toHaveBeenCalledWith(400);
    expect(store.doc.teacherSubjectAllocations[0].teacherId).toBe('t-1');
  });

  test('taking a subject from a teacher also takes it from their classes', async () => {
    await run(ctrl.setTeacherSubjects, { params: { id: 't-1' }, body: { subjects: ['Maths'] } });
    expect(store.doc.teachers.find((row) => row.id === 't-1').subjects).toEqual(['Maths']);
    expect(store.doc.teacherSubjectAllocations).toEqual([]);
  });
});
