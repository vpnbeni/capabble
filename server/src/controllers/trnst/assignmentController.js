/**
 * TRNST student assignments: which route and stop each student uses.
 * Saving an assignment also sets Student.busNo so older screens keep working.
 */
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/asyncHandler');
const { ASSIGNMENT_SHIFTS } = require('../../models/TransportRecords');

const MAX_BULK = 300;
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value) => String(value || '').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/trnst/assignments?className=&section=&routeId= — students with their route
const listAssignments = asyncHandler(async (req, res) => {
  const { Student, TransportAssignment, TransportSelfStudent } = req.models;
  const className = clean(req.query.className);
  const section = clean(req.query.section);
  const routeId = isId(req.query.routeId) ? req.query.routeId : null;

  const studentFilter = { isActive: true };
  if (className) studentFilter.class = { $regex: `^${escapeRegex(className)}$`, $options: 'i' };
  if (section) studentFilter.section = { $regex: `^${escapeRegex(section)}$`, $options: 'i' };

  const [students, assignments, selfRows, classRows] = await Promise.all([
    Student.find(studentFilter).select('name rollNumber class section busNo')
      .sort({ class: 1, section: 1, name: 1 }).lean(),
    TransportAssignment.find({ isActive: true, ...(routeId ? { routeId } : {}) }).lean(),
    TransportSelfStudent
      ? TransportSelfStudent.find({ isActive: { $ne: false } }).select('studentId commuteMode').lean()
      : [],
    // find (not aggregate) so the academic session filter applies.
    Student.find({ isActive: true }).select('class section -_id').lean()
  ]);

  const byStudent = new Map(assignments.map((row) => [String(row.studentId), row]));
  const selfByStudent = new Map(selfRows.map((row) => [String(row.studentId), row.commuteMode]));
  const rows = students
    .map((student) => {
      const assignment = byStudent.get(String(student._id));
      return {
        studentId: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        className: student.class,
        section: student.section,
        selfCommute: selfByStudent.get(String(student._id)) || null,
        assignment: assignment ? {
          _id: assignment._id,
          routeId: assignment.routeId,
          stopId: assignment.stopId,
          stopName: assignment.stopName,
          shift: assignment.shift
        } : null
      };
    })
    .filter((row) => !routeId || row.assignment);

  const classMap = new Map();
  classRows.forEach((row) => {
    const name = clean(row.class);
    if (!name) return;
    const sections = classMap.get(name) || new Set();
    if (clean(row.section)) sections.add(clean(row.section));
    classMap.set(name, sections);
  });

  return res.json({
    success: true,
    data: {
      rows,
      classOptions: [...classMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([name, sections]) => ({ className: name, sections: [...sections].sort() }))
    }
  });
});

// POST /api/trnst/assignments/bulk { studentIds, routeId, stopId, shift }
const assignStudents = asyncHandler(async (req, res) => {
  const { Student, TransportRoute, TransportVehicle, TransportAssignment, TransportSelfStudent } = req.models;
  const body = req.body || {};
  const studentIds = [...new Set((Array.isArray(body.studentIds) ? body.studentIds : []).filter(isId).map(String))];
  if (!studentIds.length) return res.status(400).json({ success: false, message: 'Select at least one student.' });
  if (studentIds.length > MAX_BULK) {
    return res.status(400).json({ success: false, message: `Assign at most ${MAX_BULK} students at a time.` });
  }
  if (!isId(body.routeId)) return res.status(400).json({ success: false, message: 'Choose a route.' });
  const shift = ASSIGNMENT_SHIFTS.includes(body.shift) ? body.shift : 'both';

  const route = await TransportRoute.findOne({ _id: body.routeId, isActive: { $ne: false } })
    .select('name vehicleId stops').lean();
  if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
  const stop = isId(body.stopId) ? (route.stops || []).find((row) => String(row._id) === String(body.stopId)) : null;
  if (body.stopId && !stop) return res.status(400).json({ success: false, message: 'That stop is not on this route.' });

  const [students, vehicle] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select('name rollNumber class section').lean(),
    route.vehicleId ? TransportVehicle.findById(route.vehicleId).select('busNo').lean() : null
  ]);
  if (!students.length) return res.status(404).json({ success: false, message: 'Students not found.' });

  const updatedBy = req.user?.name || req.user?.email || '';
  await TransportAssignment.bulkWrite(students.map((student) => ({
    updateOne: {
      filter: { studentId: student._id },
      update: {
        $set: {
          rollNumber: student.rollNumber,
          name: student.name,
          className: student.class,
          section: student.section,
          routeId: route._id,
          stopId: stop?._id || null,
          stopName: stop?.name || '',
          shift,
          isActive: true,
          updatedBy
        }
      },
      upsert: true
    }
  })));

  const ids = students.map((student) => student._id);
  await Promise.all([
    vehicle?.busNo ? Student.updateMany({ _id: { $in: ids } }, { $set: { busNo: vehicle.busNo } }) : null,
    // Riding the school bus means the student no longer commutes on their own.
    TransportSelfStudent
      ? TransportSelfStudent.updateMany({ studentId: { $in: ids } }, { $set: { isActive: false } })
      : null
  ]);

  return res.json({
    success: true,
    data: { assigned: students.length },
    message: `${students.length} student${students.length === 1 ? '' : 's'} assigned to `
      + `${route.name}${stop ? `, ${stop.name}` : ''}.`
  });
});

// DELETE /api/trnst/assignments/:studentId — take a student off school transport
const removeAssignment = asyncHandler(async (req, res) => {
  const { Student, TransportAssignment } = req.models;
  if (!isId(req.params.studentId)) return res.status(404).json({ success: false, message: 'Assignment not found.' });
  const removed = await TransportAssignment.findOneAndDelete({ studentId: req.params.studentId });
  if (!removed) return res.status(404).json({ success: false, message: 'Assignment not found.' });
  await Student.updateOne({ _id: req.params.studentId }, { $unset: { busNo: '' } });
  return res.json({ success: true, message: 'Student removed from the route.' });
});

module.exports = { listAssignments, assignStudents, removeAssignment };
