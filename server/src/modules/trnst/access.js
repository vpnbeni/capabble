/**
 * TRNST crew access rules.
 *
 * A driver or conductor acts only on the vehicles where their staff record is
 * the vehicle's driver or conductor. Administrators may act on any vehicle.
 */
const P = Object.freeze({
  OPERATE: 'trnst.trips.operate',
  MARK: 'trnst.boarding.mark',
  TRIPS_READ: 'trnst.trips.read',
  BOARDING_READ: 'trnst.boarding.read'
});

/** Vehicle ids the signed-in user crews (cached per request). */
const getMyVehicleIds = async (req) => {
  if (req.trnstVehicleIds) return req.trnstVehicleIds;
  const Vehicle = req.models?.TransportVehicle;
  const teacher = req.user?.teacher?._id || req.user?.teacher;
  let rows = [];
  if (Vehicle && req.rbac?.isAdmin) {
    rows = await Vehicle.find({ isActive: { $ne: false } }).select('_id').lean();
  } else if (Vehicle && teacher) {
    rows = await Vehicle.find({
      isActive: { $ne: false },
      $or: [{ driverId: teacher }, { conductorId: teacher }]
    }).select('_id').lean();
  }
  req.trnstVehicleIds = rows.map((row) => String(row._id));
  return req.trnstVehicleIds;
};

const crewsVehicle = async (req, vehicleId) => {
  const ids = await getMyVehicleIds(req);
  return ids.includes(String(vehicleId?._id || vehicleId));
};

module.exports = { P, getMyVehicleIds, crewsVehicle };
