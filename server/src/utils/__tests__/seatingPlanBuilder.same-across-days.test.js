jest.mock('../../models/SeatingPlanAllocation', () => ({
  find: jest.fn(),
}));

const SeatingPlanAllocation = require('../../models/SeatingPlanAllocation');
const seatingPlanBuilder = require('../seatingPlanBuilder');

describe('SeatingPlanBuilder same_across_days mode', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reuses earliest persisted room for each roll number', async () => {
    SeatingPlanAllocation.find.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: async () => ([
            { rollNo: '1001', roomNo: '03', examDate: '2026-02-17' },
            { rollNo: '1002', roomNo: '02', examDate: '2026-02-17' },
            { rollNo: '1001', roomNo: '05', examDate: '2026-02-18' },
          ]),
        }),
      }),
    });

    const fixedRoomByRoll = await seatingPlanBuilder.buildEarliestFixedRoomMap(['1001', '1002']);
    expect(fixedRoomByRoll.get('1001')).toBe('03');
    expect(fixedRoomByRoll.get('1002')).toBe('02');
  });

  it('places candidates in their fixed rooms and assigns new candidates sequentially', () => {
    const rooms = [
      { roomNo: '1', roomName: 'Room 1', floor: 'Ground' },
      { roomNo: '2', roomName: 'Room 2', floor: 'Ground' },
      { roomNo: '3', roomName: 'Room 3', floor: 'First' },
    ];
    const fixedRoomByRoll = new Map([
      ['1001', '03'],
      ['1002', '02'],
    ]);
    const candidates = [
      { rollNo: '1001', name: 'Alpha' },
      { rollNo: '1002', name: 'Beta' },
      { rollNo: '1003', name: 'Gamma' },
    ];

    const allocations = seatingPlanBuilder.allocateCandidatesToFixedRooms(
      candidates,
      rooms,
      fixedRoomByRoll
    );

    const roomByRoll = seatingPlanBuilder.getAllocationMapByRollNo(allocations);
    expect(roomByRoll.get('1001')).toBe('03');
    expect(roomByRoll.get('1002')).toBe('02');
    expect(roomByRoll.get('1003')).toBe('01');
  });
});
