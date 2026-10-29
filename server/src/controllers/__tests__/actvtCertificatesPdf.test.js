/**
 * Certificates as a PDF (the phone app prints these): the ids asked for, in that order, with the
 * school's name; bad requests are refused before any PDF is made.
 */
jest.mock('../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('../../config/cloudinary', () => ({}));

const pdfGenerator = require('../../utils/pdfGenerator');
const { certificates } = require('../actvtController');

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn();
  return res;
};

const models = (rows) => ({
  ActivityCertificate: { find: jest.fn(() => ({ lean: async () => rows })) },
  SchoolProfile: { findOne: () => ({ lean: async () => ({ schoolName: 'R.E.D. School' }) }) }
});

beforeEach(() => pdfGenerator.generatePDF.mockClear());

test('prints the certificates asked for, in that order', async () => {
  const res = fakeRes();
  const rows = [
    {
      _id: A,
      title: 'Sports meet',
      participantName: 'Aarav',
      className: '7',
      section: 'A',
      role: 'Winner',
      issuedOn: '2026-10-29'
    },
    { _id: B, title: 'Science fair', participantName: 'Diya' }
  ];
  await certificates.pdf({ body: { ids: [B, A] }, models: models(rows) }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  const [template, data] = pdfGenerator.generatePDF.mock.calls[0];
  expect(template).toBe('actvt-certificate');
  expect(data.school.name).toBe('R.E.D. School');
  expect(data.certificates.map((row) => row.participantName)).toEqual(['Diya', 'Aarav']);
  expect(data.certificates[1]).toMatchObject({ classLabel: '7-A', role: 'Winner', issuedOn: '29 Oct 2026' });
  expect(data.certificates[0].role).toBe('Participant');
});

test('refuses no ids, a bad id and too many', async () => {
  const asks = [[], ['nope'], Array.from({ length: 201 }, (_, i) => String(i).padStart(24, '0'))];
  const answers = await Promise.all(asks.map(async (ids) => {
    const res = fakeRes();
    await certificates.pdf({ body: { ids }, models: models([]) }, res);
    return res;
  }));
  answers.forEach((res) => expect(res.status).toHaveBeenCalledWith(400));
  expect(pdfGenerator.generatePDF).not.toHaveBeenCalled();
});

test('says so when none are found', async () => {
  const res = fakeRes();
  await certificates.pdf({ body: { ids: [A] }, models: models([]) }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});
