const { upsertResults } = require('../examResultController');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const lean = (value) => ({ select: () => ({ lean: async () => value }) });

const run = async (body) => {
  const bulkWrite = jest.fn(async () => ({}));
  const res = createRes();
  const next = jest.fn();
  upsertResults({
    body,
    academicSession: '2026-2027',
    models: {
      ExamResult: { bulkWrite },
      ExamDefinition: { findById: () => lean({ maximumMarks: 100, code: 'T1' }) }
    }
  }, res, next);
  await new Promise((resolve) => { setImmediate(resolve); });
  if (next.mock.calls.length) throw next.mock.calls[0][0];
  return { res, bulkWrite };
};

describe('POST /exam-results/bulk for one subject', () => {
  it('changes only that subject for each student', async () => {
    const { res, bulkWrite } = await run({
      examId: 'e1',
      class: '7th',
      section: 'A',
      subjectId: 'english',
      results: [
        { studentId: 's1', marks: { english: 78 } },
        { studentId: 's2', marks: {}, absentSubjects: ['english'] },
        { studentId: 's3', marks: { english: '' } }
      ]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const [first, second, third] = bulkWrite.mock.calls[0][0].map((op) => op.updateOne.update);
    expect(first.$set).toEqual({
      class: '7th', section: 'A', academicSession: '2026-2027', 'marks.english': 78
    });
    expect(first.$pull).toEqual({ absentSubjects: 'english' });
    expect(first).not.toHaveProperty('$set.marks');
    expect(second.$addToSet).toEqual({ absentSubjects: 'english' });
    expect(second.$unset).toEqual({ 'marks.english': '' });
    expect(third.$unset).toEqual({ 'marks.english': '' });
  });

  it('refuses marks above the maximum', async () => {
    const { res } = await run({
      examId: 'e1',
      class: '7th',
      section: 'A',
      subjectId: 'english',
      results: [{ studentId: 's1', marks: { english: 120 } }]
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refuses a subject key that is not a plain slug', async () => {
    const { res } = await run({
      examId: 'e1', class: '7th', section: 'A', subjectId: '$where', results: [{ studentId: 's1', marks: {} }]
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
