const Room = require('../../models/Room');
const {
  syncExamRoomsFromAsets,
  listAsetsExamRoomCandidates,
} = require('../asetsExamRoomSync');

jest.mock('../../models/Room', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
}));

function mockLocationModel(locations = []) {
  return {
    find: jest.fn().mockReturnValue({
      lean: async () => locations,
    }),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  };
}

describe('asetsExamRoomSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deactivates legacy active rooms without assetLocationId before creating ASETS exam room', async () => {
    const locationId = 'loc-1';
    const locations = [{
      _id: locationId,
      type: 'Room',
      roomNumber: '1',
      name: 'Old SKT',
      parentId: 'floor-1',
      isActive: true,
      isArchived: false,
    }, {
      _id: 'floor-1',
      type: 'Floor',
      name: 'Second Floor',
      parentId: null,
      isActive: true,
      isArchived: false,
    }];

    const req = {
      models: {
        AssetLocation: mockLocationModel(locations),
      },
    };

    Room.find.mockImplementation((query = {}) => {
      if (query.assetLocationId?.$ne !== undefined && !query.roomNo) {
        return { lean: async () => [] };
      }
      if (query.roomNo === '1' && query.isActive === true && query.$or) {
        return {
          select: () => Promise.resolve([{ _id: 'legacy-room-1' }]),
        };
      }
      if (query.roomNo === '1' && query.assetLocationId?.$exists) {
        return {
          select: () => ({ lean: async () => [] }),
        };
      }
      return { lean: async () => [], select: async () => [] };
    });

    Room.findOne.mockResolvedValue(null);

    Room.updateMany.mockResolvedValue({ modifiedCount: 1 });
    Room.create.mockResolvedValue({ _id: 'new-room-1' });

    const result = await syncExamRoomsFromAsets(req, [locationId]);

    expect(Room.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['legacy-room-1'] } },
      { isActive: false },
    );
    expect(Room.create).toHaveBeenCalled();
    expect(result.created).toBe(1);
  });
});
