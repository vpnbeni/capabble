const seatingPlanBuilder = require('../seatingPlanBuilder');

describe('SeatingPlanBuilder rotation regression', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps day rotation independent for class 10th and 12th', async () => {
    const entries = [
      {
        _id: '10d1',
        examDate: '2026-02-17',
        subject: { class: '10th', code: '041' },
      },
      {
        _id: '10d2',
        examDate: '2026-02-18',
        subject: { class: '10th', code: '241' },
      },
      {
        _id: '12d1',
        examDate: '2026-02-17',
        subject: { class: '12th', code: '048' },
      },
      {
        _id: '12d2',
        examDate: '2026-02-18',
        subject: { class: '12th', code: '042' },
      },
    ];

    const totalRooms = 11;

    const class10Day2Offset = await seatingPlanBuilder.getClassBasedDayRotation(entries[1], entries, totalRooms);
    const class12Day1Offset = await seatingPlanBuilder.getClassBasedDayRotation(entries[2], entries, totalRooms);
    const class12Day2Offset = await seatingPlanBuilder.getClassBasedDayRotation(entries[3], entries, totalRooms);

    expect(class10Day2Offset).toBe(1);
    expect(class12Day1Offset).toBe(0);
    expect(class12Day2Offset).toBe(1);
  });

  it('keeps same-day continuous room progression from previous exams', async () => {
    const rooms = [
      { roomNo: '1' },
      { roomNo: '2' },
      { roomNo: '3' },
      { roomNo: '4' },
    ];

    const exam1 = {
      _id: 'e1',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '10th', code: '041' },
    };

    const exam2 = {
      _id: 'e2',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '10th', code: '241' },
    };

    const currentExam = {
      _id: 'e3',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '12th', code: '048' },
    };

    const allEntries = [exam1, exam2, currentExam];

    jest
      .spyOn(seatingPlanBuilder, 'getClassBasedDayRotation')
      .mockImplementation(async (entry) => (entry._id === 'e1' ? 1 : 2));

    jest.spyOn(seatingPlanBuilder, 'getCandidatesForExam').mockImplementation(async (entry) => {
      if (entry._id === 'e1') return Array.from({ length: 24 }, () => ({ rollNo: 'R' }));
      if (entry._id === 'e2') return Array.from({ length: 6 }, () => ({ rollNo: 'R' }));
      return [];
    });

    const position = await seatingPlanBuilder.calculateStartingPositionClassBased(
      currentExam,
      allEntries,
      null,
      rooms,
      10
    );

    expect(position).toEqual({
      startRoomIndex: 2,
      startSeatOffset: 6,
      allowWrap: false,
    });
  });

  it('keeps same-day logic to move to next room when remaining seats are insufficient', async () => {
    const rooms = [
      { roomNo: '1' },
      { roomNo: '2' },
      { roomNo: '3' },
      { roomNo: '4' },
    ];

    const exam1 = {
      _id: 'e1',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '10th', code: '041' },
    };

    const exam2 = {
      _id: 'e2',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '10th', code: '241' },
    };

    const currentExam = {
      _id: 'e3',
      examDate: '2026-02-17',
      timeSlot: { start: '10:30' },
      subject: { class: '12th', code: '048' },
    };

    const allEntries = [exam1, exam2, currentExam];

    jest
      .spyOn(seatingPlanBuilder, 'getClassBasedDayRotation')
      .mockImplementation(async (entry) => (entry._id === 'e1' ? 1 : 2));

    jest.spyOn(seatingPlanBuilder, 'getCandidatesForExam').mockImplementation(async (entry) => {
      if (entry._id === 'e1') return Array.from({ length: 24 }, () => ({ rollNo: 'R' }));
      if (entry._id === 'e2') return Array.from({ length: 6 }, () => ({ rollNo: 'R' }));
      return [];
    });

    const position = await seatingPlanBuilder.calculateStartingPositionClassBased(
      currentExam,
      allEntries,
      null,
      rooms,
      20
    );

    expect(position).toEqual({
      startRoomIndex: 3,
      startSeatOffset: 0,
      allowWrap: false,
    });
  });
});
