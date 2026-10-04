const ExcelJS = require('exceljs');
const asyncHandler = require('../../middleware/asyncHandler');
const { httpError, getModel, auditUser } = require('../../modules/cpitl/feeService');
const { upsertForSource, voidForSource } = require('../../modules/cpitl/expenseLedger');
const { vehicleStats, projectNextYear, sessionMonthsElapsed, monthsCovered } = require('../../modules/cpitl/fuelAnalytics');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

const FIELDS = ['vehicleId', 'vehicleSnapshot', 'date', 'fuelType', 'litres', 'ratePerLitre', 'amount', 'odometer', 'fullTank', 'station', 'billNo', 'filledBy', 'mode', 'notes', 'attachments'];
const pick = (body) => FIELDS.reduce((acc, f) => {
  if (body[f] !== undefined) acc[f] = body[f];
  return acc;
}, {});

/** Vehicles from TRNST when active, plus any seen in past logs (keeps working when TRNST is off). */
const listVehicles = asyncHandler(async (req, res) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const vehicles = new Map();
  if (req.models.TransportVehicle) {
    (await req.models.TransportVehicle.find({ isActive: { $ne: false } }).select('busNo registrationNumber vehicleType status').sort({ busNo: 1 }).lean())
      .forEach((v) => vehicles.set(String(v._id), { _id: v._id, busNo: v.busNo, registrationNumber: v.registrationNumber, vehicleType: v.vehicleType, source: 'trnst' }));
  }
  (await FuelLog.aggregate([
    { $sort: { date: -1 } },
    { $group: { _id: { id: '$vehicleId', reg: '$vehicleSnapshot.registrationNumber' }, snap: { $first: '$vehicleSnapshot' }, lastOdometer: { $max: '$odometer' } } },
  ])).forEach((row) => {
    const key = String(row._id.id || row._id.reg);
    if (vehicles.has(key)) {
      vehicles.get(key).lastOdometer = row.lastOdometer;
      return;
    }
    vehicles.set(key, { _id: row._id.id || null, ...row.snap, lastOdometer: row.lastOdometer, source: 'logs' });
  });
  return ok(res, [...vehicles.values()], { meta: { trnstActive: Boolean(req.models.TransportVehicle) } });
});

const resolveSnapshot = async (models, payload) => {
  if (payload.vehicleId && models.TransportVehicle) {
    const v = await models.TransportVehicle.findById(payload.vehicleId).select('busNo registrationNumber vehicleType').lean();
    if (v) return { busNo: v.busNo, registrationNumber: v.registrationNumber, vehicleType: v.vehicleType };
  }
  const snap = payload.vehicleSnapshot || {};
  if (!snap.registrationNumber && !snap.busNo) throw httpError('Pick a vehicle or enter its registration number.');
  return snap;
};

const normalize = (payload) => {
  const litres = Number(payload.litres);
  if (!Number.isFinite(litres) || litres <= 0) throw httpError('Enter litres filled.');
  const rate = Number(payload.ratePerLitre) || 0;
  const amount = payload.amount !== undefined && payload.amount !== '' ? Number(payload.amount) : litres * rate;
  if (!Number.isFinite(amount) || amount <= 0) throw httpError('Enter the amount or rate per litre.');
  const date = new Date(payload.date || Date.now());
  if (Number.isNaN(date.getTime())) throw httpError('Invalid date.');
  const odometer = payload.odometer === '' || payload.odometer === null || payload.odometer === undefined ? null : Number(payload.odometer);
  if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) throw httpError('Invalid odometer reading.');
  return {
    ...payload,
    vehicleId: payload.vehicleId || null,
    litres: round(litres),
    ratePerLitre: round(rate || amount / litres),
    amount: round(amount),
    date,
    odometer,
  };
};

const listLogs = asyncHandler(async (req, res) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const filter = { isActive: { $ne: false } };
  if (req.query.vehicleId) filter.vehicleId = req.query.vehicleId;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(`${req.query.to}T23:59:59`);
  }
  const logs = await FuelLog.find(filter).sort({ date: -1, createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 300, 2000)).lean();
  return ok(res, logs);
});

const createLog = asyncHandler(async (req, res) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const payload = normalize(pick(req.body));
  payload.vehicleSnapshot = await resolveSnapshot(req.models, payload);
  if (payload.vehicleId && payload.odometer !== null) {
    const later = await FuelLog.findOne({ vehicleId: payload.vehicleId, isActive: { $ne: false }, date: { $lte: payload.date }, odometer: { $gt: payload.odometer } }).lean();
    if (later) throw httpError(`Odometer ${payload.odometer} is lower than an earlier reading (${later.odometer}).`);
  }
  const log = await FuelLog.create({ ...payload, createdBy: auditUser(req), ...(req.academicSession ? { academicSession: req.academicSession } : {}) });
  const expense = await upsertForSource(req.models, { kind: 'fuel', sourceModel: 'FuelLog', source: log, sessionLabel: req.academicSession, user: auditUser(req) });
  log.expenseId = expense._id;
  await log.save();
  return res.status(201).json({ success: true, data: log, message: 'Fuel entry saved.' });
});

const updateLog = asyncHandler(async (req, res) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const log = await FuelLog.findById(req.params.id);
  if (!log || log.isActive === false) throw httpError('Fuel entry not found.', 404);
  const payload = normalize({ ...log.toObject(), ...pick(req.body) });
  payload.vehicleSnapshot = await resolveSnapshot(req.models, payload);
  log.set(payload);
  await log.save();
  await upsertForSource(req.models, { kind: 'fuel', sourceModel: 'FuelLog', source: log, sessionLabel: req.academicSession, user: auditUser(req) });
  return ok(res, log, { message: 'Fuel entry updated.' });
});

const removeLog = asyncHandler(async (req, res) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const log = await FuelLog.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!log) throw httpError('Fuel entry not found.', 404);
  await voidForSource(req.models, log._id, req.body?.reason || 'Fuel entry removed', auditUser(req));
  return ok(res, null, { message: 'Fuel entry removed.' });
});

const analytics = async (req) => {
  const FuelLog = getModel(req.models, 'FuelLog');
  const logs = await FuelLog.find({ isActive: { $ne: false } }).sort({ date: 1 }).lean();
  const stats = vehicleStats(logs);
  const monthsElapsed = sessionMonthsElapsed(req.academicSession);
  const growthPct = Number(req.query.growthPct) || 0;
  // Annualise each vehicle over the months it has actually been logged, so a fleet that
  // started logging mid-session isn't under-projected.
  const vehicles = stats.map((v) => {
    const firstFill = logs.find((l) => String(l.vehicleId || l.vehicleSnapshot?.registrationNumber) === String(v.vehicleId || v.vehicle?.registrationNumber))?.date;
    const months = Math.min(monthsElapsed, monthsCovered(firstFill));
    return { ...v, monthsLogged: months, ...projectNextYear(v.cost, months, growthPct) };
  });
  const fleet = vehicles.reduce((acc, v) => ({
    litres: round(acc.litres + v.litres),
    cost: round(acc.cost + v.cost),
    km: acc.km + v.km,
    annualised: acc.annualised + v.annualised,
    projected: acc.projected + v.projected,
  }), { litres: 0, cost: 0, km: 0, annualised: 0, projected: 0 });
  fleet.costPerKm = fleet.km > 0 ? round(fleet.cost / fleet.km) : null;
  return { vehicles, fleet, meta: { monthsElapsed, growthPct } };
};

const getAnalytics = asyncHandler(async (req, res) => ok(res, await analytics(req)));

const projectionXlsx = asyncHandler(async (req, res) => {
  const { vehicles, fleet, meta } = await analytics(req);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fuel projection');
  ws.columns = [
    { header: 'Bus No.', key: 'busNo', width: 10 },
    { header: 'Months logged', key: 'months', width: 14 },
    { header: 'Registration', key: 'reg', width: 16 },
    { header: 'Fills', key: 'fills', width: 8 },
    { header: 'Litres', key: 'litres', width: 10 },
    { header: 'Spent so far (₹)', key: 'cost', width: 16 },
    { header: 'Km run', key: 'km', width: 10 },
    { header: 'Km / litre', key: 'kmpl', width: 10 },
    { header: '₹ / km', key: 'cpk', width: 10 },
    { header: 'Full-year estimate (₹)', key: 'annualised', width: 20 },
    { header: `Next year @ +${meta.growthPct}% (₹)`, key: 'projected', width: 22 },
  ];
  vehicles.forEach((v) => ws.addRow({
    busNo: v.vehicle?.busNo || '',
    months: v.monthsLogged,
    reg: v.vehicle?.registrationNumber || '',
    fills: v.fills,
    litres: v.litres,
    cost: v.cost,
    km: v.km,
    kmpl: v.kmpl ?? '',
    cpk: v.costPerKm ?? '',
    annualised: v.annualised,
    projected: v.projected,
  }));
  const total = ws.addRow({ busNo: 'Fleet', litres: fleet.litres, cost: fleet.cost, km: fleet.km, cpk: fleet.costPerKm ?? '', annualised: fleet.annualised, projected: fleet.projected });
  total.font = { bold: true };
  ws.getRow(1).font = { bold: true };
  ws.addRow([]);
  ws.addRow([`Session ${req.academicSession || ''}: each vehicle's spend is scaled to 12 months over the months it was logged, then +${meta.growthPct}%.`]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="fuel-projection_${req.academicSession || 'session'}.xlsx"`);
  await wb.xlsx.write(res);
  return res.end();
});

module.exports = { listVehicles, listLogs, createLog, updateLog, removeLog, getAnalytics, projectionXlsx };
