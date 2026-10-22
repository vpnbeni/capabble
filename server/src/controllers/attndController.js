const { StaffAttendanceDaily, StudentAttendanceDaily, StudentAttendanceDay } = require('../models/AttndDailyRecord');
const schoolDays = require('../modules/clndr/schoolDays');
const { isAssignedScope, getAssignedSections, sectionKey } = require('../rbac/scope');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const TimetableState = require('../models/TimetableState');
const { sortSectionNames, sortClassNames } = require('../utils/sortSections');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');

const normalizeDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const normalizeMonthKey = (value) => {
  const month = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return '';
  const [year, mm] = month.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(mm) || mm < 1 || mm > 12) return '';
  return month;
};

const normalizeString = (value) => String(value || '').trim();

const getStaffDirectory = async (req, res) => {
  try {
    const TeacherModel = req.models?.Teacher || Teacher;
    const teachers = await TeacherModel.find({})
      .select('_id name employeeId designation dutyType isActive')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: teachers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff directory',
      error: error.message,
    });
  }
};

const getStudentDirectory = async (req, res) => {
  try {
    const StudentModel = req.models?.Student || Student;
    const className = normalizeString(req.query.className);
    const section = normalizeString(req.query.section);

    const filter = { isActive: true };
    if (className) filter.class = className;
    if (section) filter.section = section;

    const students = await StudentModel.find(filter)
      .select('_id name rollNumber class section isActive')
      .sort({ name: 1, rollNumber: 1 })
      .lean();

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student directory',
      error: error.message,
    });
  }
};

const getStudentFilters = async (req, res) => {
  try {
    const TimetableStateModel = req.models?.TimetableState || TimetableState;
    const StudentModel = req.models?.Student || Student;
    const latest = await TimetableStateModel.findOne({}).sort({ updatedAt: -1 }).lean();

    const classSectionPairs = [];
    const classMap = new Map();

    if (latest?.matrixSelection && Array.isArray(latest?.matrixClasses) && Array.isArray(latest?.matrixSections)) {
      latest.matrixClasses.forEach((classItem) => {
        const className = normalizeString(classItem?.name);
        if (!className) return;
        const sectionList = [];
        latest.matrixSections.forEach((sectionItem) => {
          const sectionName = normalizeString(sectionItem?.name);
          if (!sectionName) return;
          if (latest.matrixSelection?.[classItem.id]?.[sectionItem.id]) {
            sectionList.push(sectionName);
            classSectionPairs.push({ className, section: sectionName });
          }
        });
        if (sectionList.length > 0) {
          classMap.set(className, sectionList.sort((a, b) => sortSectionNames(a, b, className)));
        }
      });
    }

    if (classSectionPairs.length === 0) {
      const rows = await StudentModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: { className: '$class', section: '$section' } } },
        { $project: { _id: 0, className: '$_id.className', section: '$_id.section' } },
      ]);

      rows.forEach((row) => {
        const className = normalizeString(row.className);
        const section = normalizeString(row.section);
        if (!className || !section) return;
        classSectionPairs.push({ className, section });
        const current = classMap.get(className) || [];
        if (!current.includes(section)) current.push(section);
        classMap.set(className, current);
      });
    }

    // Teachers limited to their own sections only see those sections.
    if (isAssignedScope(req, 'attnd.students.read')) {
      const allowed = new Set((await getAssignedSections(req)).map((entry) => entry.key));
      Array.from(classMap.entries()).forEach(([className, sections]) => {
        const visible = sections.filter((section) => allowed.has(sectionKey(className, section)));
        if (visible.length > 0) classMap.set(className, visible);
        else classMap.delete(className);
      });
    }

    const classOptions = Array.from(classMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([className, sections]) => ({
        className,
        sections: sections.sort((a, b) => sortSectionNames(a, b, className)),
      }));

    res.json({
      success: true,
      data: {
        classOptions,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student filter options',
      error: error.message,
    });
  }
};

const getStaffAttendance = async (req, res) => {
  try {
    const StaffAttendanceModel = req.models?.StaffAttendanceDaily || StaffAttendanceDaily;
    const date = normalizeDateKey(req.query.date);
    const month = normalizeMonthKey(req.query.month);
    if (!date && !month) {
      return res.status(400).json({ success: false, message: 'Valid date or month is required.' });
    }

    const filter = { status: 'A' };
    if (date) filter.attendanceDate = date;
    else filter.attendanceDate = { $regex: `^${month}-` };

    const [records, schoolDaysMap] = await Promise.all([
      StaffAttendanceModel.find(filter).select('staffId attendanceDate status remarks').lean(),
      schoolDayMap(req, { month: month || date.slice(0, 7), date })
    ]);

    // `data` stays the list of records for older screens; school days ride alongside.
    res.json({ success: true, data: records, schoolDays: schoolDaysMap });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch staff attendance', error: error.message });
  }
};

const saveStaffAttendance = async (req, res) => {
  try {
    const StaffAttendanceModel = req.models?.StaffAttendanceDaily || StaffAttendanceDaily;
    const date = normalizeDateKey(req.body?.date);
    const month = normalizeMonthKey(req.body?.month);
    const absences = Array.isArray(req.body?.absences) ? req.body.absences : [];
    const staffIds = Array.isArray(req.body?.staffIds)
      ? req.body.staffIds.map((item) => normalizeString(item)).filter(Boolean)
      : [];

    if (!date && !month) {
      return res.status(400).json({ success: false, message: 'Valid date or month is required.' });
    }
    if (staffIds.length === 0) {
      return res.status(400).json({ success: false, message: 'staffIds are required so other groups are not overwritten.' });
    }

    const filter = { staffId: { $in: staffIds } };
    if (date) filter.attendanceDate = date;
    else filter.attendanceDate = { $regex: `^${month}-` };
    await StaffAttendanceModel.deleteMany(filter);

    const docs = absences
      .map((item) => ({
        staffId: normalizeString(item.staffId),
        attendanceDate: normalizeDateKey(item.attendanceDate),
      }))
      .filter((item) => {
        if (!item.staffId || !item.attendanceDate || !staffIds.includes(item.staffId)) return false;
        if (date) return item.attendanceDate === date;
        return item.attendanceDate.startsWith(`${month}-`);
      })
      .map((item) => ({
        ...item,
        status: 'A',
      }));

    if (docs.length > 0) await StaffAttendanceModel.insertMany(docs, { ordered: false });

    return res.json({ success: true, message: 'Staff attendance saved successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save staff attendance', error: error.message });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const StudentAttendanceModel = req.models?.StudentAttendanceDaily || StudentAttendanceDaily;
    const date = normalizeDateKey(req.query.date);
    const month = normalizeMonthKey(req.query.month);
    const className = normalizeString(req.query.className);
    const section = normalizeString(req.query.section);

    if (date && !className && !section) {
      const records = await StudentAttendanceModel.find({ attendanceDate: date })
        .select('studentId attendanceDate status remarks className section')
        .lean();
      const DayModel = req.models?.StudentAttendanceDay || StudentAttendanceDay;
      const daySettings = await DayModel.find({ attendanceDate: date })
        .select('attendanceDate category className section')
        .lean();
      return res.json({
        success: true,
        data: { records, daySettings },
      });
    }

    if (!className || !section || (!date && !month)) {
      return res.status(400).json({ success: false, message: 'className, section, and date or month are required.' });
    }

    const filter = { className, section };
    if (date) filter.attendanceDate = date;
    else filter.attendanceDate = { $regex: `^${month}-` };

    const records = await StudentAttendanceModel.find(filter)
      .select('studentId attendanceDate status remarks')
      .lean();

    const DayModel = req.models?.StudentAttendanceDay || StudentAttendanceDay;
    const dayFilter = { className, section };
    if (date) dayFilter.attendanceDate = date;
    else dayFilter.attendanceDate = { $regex: `^${month}-` };
    const [daySettings, schoolDaysMap] = await Promise.all([
      DayModel.find(dayFilter).select('attendanceDate category').lean(),
      schoolDayMap(req, { month: month || date.slice(0, 7), date, className, section })
    ]);

    return res.json({
      success: true,
      data: {
        records,
        daySettings,
        schoolDays: schoolDaysMap,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch student attendance', error: error.message });
  }
};

/** Tell families about absences in a day's register (the listener ignores older days). */
const announceAbsences = (req, date, docs) => {
  if (!docs.length) return;
  eventBus.emitFromRequest(req, EVENTS.STUDENTS_MARKED_ABSENT, { date, studentIds: [...new Set(docs.map((d) => d.studentId))] });
};

const saveStudentAttendance = async (req, res) => {
  try {
    const StudentAttendanceModel = req.models?.StudentAttendanceDaily || StudentAttendanceDaily;
    const date = normalizeDateKey(req.body?.date);
    const month = normalizeMonthKey(req.body?.month);
    const className = normalizeString(req.body?.className);
    const section = normalizeString(req.body?.section);
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    const absences = Array.isArray(req.body?.absences) ? req.body.absences : [];

    if (date && !className && !section) {
      const DayModel = req.models?.StudentAttendanceDay || StudentAttendanceDay;
      const daySettings = Array.isArray(req.body?.daySettings) ? req.body.daySettings : [];
      const holidayKeys = new Set(
        daySettings
          .filter((item) => {
            const category = String(item.category || '').toLowerCase()
            return category === 'non-academic' || category === 'non-academic'
          })
          .map((item) => `${normalizeString(item.className)}||${normalizeString(item.section)}`)
      );

      await StudentAttendanceModel.deleteMany({ attendanceDate: date });
      const docs = absences
        .map((item) => ({
          studentId: normalizeString(item.studentId),
          attendanceDate: date,
          className: normalizeString(item.className),
          section: normalizeString(item.section),
          status: 'A',
        }))
        .filter((item) => item.studentId && item.className && item.section && !holidayKeys.has(`${item.className}||${item.section}`));
      if (docs.length > 0) await StudentAttendanceModel.insertMany(docs, { ordered: false });
      announceAbsences(req, date, docs);

      const dayOps = daySettings
        .map((item) => {
          const settingClassName = normalizeString(item.className);
          const settingSection = normalizeString(item.section);
          if (!settingClassName || !settingSection) return null;
          return {
            updateOne: {
              filter: { attendanceDate: date, className: settingClassName, section: settingSection },
              update: {
                $set: {
                  category: String(item.category || 'academic').toLowerCase() === 'non-academic' ? 'non-academic' : 'academic',
                },
              },
              upsert: true,
            },
          };
        })
        .filter(Boolean);
      if (dayOps.length > 0) await DayModel.bulkWrite(dayOps, { ordered: false });

      return res.json({ success: true, message: 'Student attendance saved successfully.' });
    }

    if (!className || !section || (!date && !month)) {
      return res.status(400).json({ success: false, message: 'className, section, and date or month are required.' });
    }

    const DayModel = req.models?.StudentAttendanceDay || StudentAttendanceDay;
    const daySettings = Array.isArray(req.body?.daySettings) ? req.body.daySettings : [];
    const holidayDates = new Set(
      daySettings
        .filter((item) => String(item.category || '').toLowerCase() === 'non-academic')
        .map((item) => normalizeDateKey(item.attendanceDate || item.date))
        .filter(Boolean)
    );

    if (date) {
      await StudentAttendanceModel.deleteMany({ attendanceDate: date, className, section });
      if (!holidayDates.has(date)) {
        const docs = records
          .map((item) => ({
            studentId: normalizeString(item.studentId),
            attendanceDate: date,
            className,
            section,
            status: String(item.status || 'P').toUpperCase() === 'A' ? 'A' : 'P',
          }))
          .filter((item) => item.studentId && item.status === 'A');
        if (docs.length > 0) await StudentAttendanceModel.insertMany(docs, { ordered: false });
        announceAbsences(req, date, docs);
      }
    } else {
      await StudentAttendanceModel.deleteMany({
        attendanceDate: { $regex: `^${month}-` },
        className,
        section,
      });

      const docs = absences
        .map((item) => ({
          studentId: normalizeString(item.studentId),
          attendanceDate: normalizeDateKey(item.attendanceDate),
        }))
        .filter((item) => item.studentId && item.attendanceDate && item.attendanceDate.startsWith(`${month}-`) && !holidayDates.has(item.attendanceDate))
        .map((item) => ({
          ...item,
          className,
          section,
          status: 'A',
        }));

      if (docs.length > 0) await StudentAttendanceModel.insertMany(docs, { ordered: false });
    }

    const monthPrefix = month || (date ? date.slice(0, 7) : '');
    if (monthPrefix) {
      await DayModel.deleteMany({
        className,
        section,
        attendanceDate: { $regex: `^${monthPrefix}-` },
      });
      const dayDocs = daySettings
        .map((item) => ({
          attendanceDate: normalizeDateKey(item.attendanceDate || item.date),
          className,
          section,
          category: String(item.category || 'academic').toLowerCase() === 'non-academic' ? 'non-academic' : 'academic',
        }))
        .filter((item) => item.attendanceDate && item.attendanceDate.startsWith(`${monthPrefix}-`));
      if (dayDocs.length > 0) await DayModel.insertMany(dayDocs, { ordered: false });
    }

    return res.json({ success: true, message: 'Student attendance saved successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save student attendance', error: error.message });
  }
};

const pad2 = (value) => String(value).padStart(2, '0');

const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const localMonthKey = (date = new Date()) => localDateKey(date).slice(0, 7);

const isSundayKey = (dateKey) => new Date(`${dateKey}T00:00:00`).getDay() === 0;

/**
 * Days the school calendar marks as not ordinary working days (holidays, closures,
 * half days) for a month or a date, for one class-section or the whole school.
 * { [date]: { working, kind, label, halfDayEndTime, implicit } }. Fails soft to {}.
 */
const schoolDayMap = async (req, { month, date, className, section }) => {
  try {
    const from = date || `${month}-01`;
    const to = date || daysInMonthKeys(month).slice(-1)[0];
    const scope = className ? { className, section } : null;
    const days = await schoolDays.range(req.models, from, to, scope);
    return Object.fromEntries(Object.values(days)
      .filter((day) => day.kind !== 'working')
      .map((day) => [day.date, {
        working: day.working,
        kind: day.kind,
        label: day.label,
        halfDayEndTime: day.halfDayEndTime,
        implicit: day.rules.length > 0 && day.rules.every((rule) => rule.implicit)
      }]));
  } catch (error) {
    console.warn(`[attnd] school days unavailable: ${error.message}`);
    return {};
  }
};

const daysInMonthKeys = (month) => {
  const [yearValue, monthValue] = String(month).split('-').map(Number);
  const count = new Date(yearValue, monthValue, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${month}-${pad2(index + 1)}`);
};

const isHalfDayRecord = (record) => {
  const status = String(record?.status || '').toUpperCase();
  if (status === 'HD' || status === 'H') return true;
  return /half/i.test(String(record?.remarks || ''));
};

const isAbsentRecord = (record) => {
  const status = String(record?.status || 'A').toUpperCase();
  return (status === 'A' || status === 'ABSENT') && !isHalfDayRecord(record);
};

const STAFF_GROUP_ORDER = ['Teaching', 'Sports Coach', 'Admin', 'Drivers', 'Conductors', 'Security', 'Other'];

const staffGroupOf = (staff) => {
  const text = `${staff.dutyType || ''} ${staff.designation || ''}`.toLowerCase();
  if (text.includes('driver')) return 'Drivers';
  if (text.includes('conductor')) return 'Conductors';
  if (text.includes('security') || text.includes('guard')) return 'Security';
  if (text.includes('coach') || text.includes('pet') || text.includes('physical')) return 'Sports Coach';
  if (text.includes('admin') || text.includes('clerk') || text.includes('accountant')) return 'Admin';
  if (
    text.includes('teacher') ||
    /\bprt\b/.test(text) ||
    /\btgt\b/.test(text) ||
    /\bpgt\b/.test(text) ||
    text.includes('principal')
  ) {
    return 'Teaching';
  }
  return 'Other';
};

const summarizeRecords = (records, dateKey) => {
  const onDate = records.filter((item) => item.attendanceDate === dateKey);
  return {
    absent: onDate.filter(isAbsentRecord).length,
    halfDay: onDate.filter(isHalfDayRecord).length,
  };
};

const getDashboard = async (req, res) => {
  try {
    const month = normalizeMonthKey(req.query.month) || localMonthKey();
    const todayKey = normalizeDateKey(req.query.date) || localDateKey();
    const viewDate = todayKey.startsWith(`${month}-`) ? todayKey : `${month}-01`;

    const TeacherModel = req.models?.Teacher || Teacher;
    const StudentModel = req.models?.Student || Student;
    const StaffAttendanceModel = req.models?.StaffAttendanceDaily || StaffAttendanceDaily;
    const StudentAttendanceModel = req.models?.StudentAttendanceDaily || StudentAttendanceDaily;

    const [staff, students, staffRecords, studentRecords] = await Promise.all([
      TeacherModel.find({}).select('_id name employeeId designation dutyType isActive').lean(),
      StudentModel.find({ isActive: true }).select('_id name rollNumber class section').lean(),
      StaffAttendanceModel.find({ attendanceDate: { $regex: `^${month}-` } })
        .select('staffId attendanceDate status remarks')
        .lean(),
      StudentAttendanceModel.find({ attendanceDate: { $regex: `^${month}-` } })
        .select('studentId attendanceDate status remarks className section')
        .lean(),
    ]);

    const dayKeys = daysInMonthKeys(month);
    // Working days come from the school calendar (weekly offs, holidays, closures); Sunday if unset.
    const offDays = await schoolDayMap(req, { month });
    const isWorkingKey = (dateKey) => (offDays[dateKey] ? offDays[dateKey].working : true);
    const elapsedDays = dayKeys.filter((dateKey) => dateKey <= viewDate && isWorkingKey(dateKey));
    const workingDayCount = Math.max(elapsedDays.length, 1);

    const staffToday = summarizeRecords(staffRecords, viewDate);
    const studentToday = summarizeRecords(studentRecords, viewDate);
    const staffMonthAbsent = staffRecords.filter(isAbsentRecord).length;
    const staffMonthHalfDay = staffRecords.filter(isHalfDayRecord).length;
    const studentMonthAbsent = studentRecords.filter(isAbsentRecord).length;
    const studentMonthHalfDay = studentRecords.filter(isHalfDayRecord).length;

    const staffStrength = staff.length;
    const studentStrength = students.length;

    const rate = (absent, halfDay, strength) => {
      if (!strength) return 0;
      const missed = absent + halfDay * 0.5;
      return Math.round((1 - missed / (strength * workingDayCount)) * 1000) / 10;
    };

    const sectionSetByClass = new Map();
    students.forEach((item) => {
      const className = normalizeString(item.class);
      const section = normalizeString(item.section);
      if (!className || !section) return;
      const current = sectionSetByClass.get(className) || new Set();
      current.add(section);
      sectionSetByClass.set(className, current);
    });
    studentRecords.forEach((item) => {
      const className = normalizeString(item.className);
      const section = normalizeString(item.section);
      if (!className || !section) return;
      const current = sectionSetByClass.get(className) || new Set();
      current.add(section);
      sectionSetByClass.set(className, current);
    });

    const classNames = Array.from(sectionSetByClass.keys()).sort(sortClassNames);
    const allSections = Array.from(
      new Set(classNames.flatMap((className) => Array.from(sectionSetByClass.get(className) || [])))
    ).sort((left, right) => sortSectionNames(left, right));

    const classMatrix = classNames.map((className) => {
      const sections = Array.from(sectionSetByClass.get(className) || []).sort((left, right) =>
        sortSectionNames(left, right, className)
      );
      return {
        className,
        sections: sections.map((section) => {
          const strength = students.filter(
            (item) => normalizeString(item.class) === className && normalizeString(item.section) === section
          ).length;
          const classRecords = studentRecords.filter(
            (item) => normalizeString(item.className) === className && normalizeString(item.section) === section
          );
          const today = summarizeRecords(classRecords, viewDate);
          return {
            section,
            strength,
            todayAbsent: today.absent,
            todayHalfDay: today.halfDay,
            monthAbsent: classRecords.filter(isAbsentRecord).length,
            monthHalfDay: classRecords.filter(isHalfDayRecord).length,
          };
        }),
      };
    });

    const staffMatrix = STAFF_GROUP_ORDER.map((group) => {
      const members = staff.filter((item) => staffGroupOf(item) === group);
      const ids = new Set(members.map((item) => String(item._id)));
      const groupRecords = staffRecords.filter((item) => ids.has(String(item.staffId)));
      const today = summarizeRecords(groupRecords, viewDate);
      return {
        group,
        strength: members.length,
        todayAbsent: today.absent,
        todayHalfDay: today.halfDay,
        monthAbsent: groupRecords.filter(isAbsentRecord).length,
        monthHalfDay: groupRecords.filter(isHalfDayRecord).length,
      };
    }).filter((item) => item.strength > 0 || item.monthAbsent > 0 || item.todayAbsent > 0);

    // Names of students absent on the view date, for the desk's hover cards. Only for users who
    // can read student attendance, and limited to their own sections on an "assigned" grant.
    let studentsAbsentToday = [];
    const studentScope = req.rbac?.scopeOf('attnd.students.read') || null;
    if (studentScope) {
      const allowedKeys = isAssignedScope(req, 'attnd.students.read')
        ? new Set((await getAssignedSections(req)).map((entry) => entry.key))
        : null;
      const studentById = new Map(students.map((item) => [String(item._id), item]));
      studentsAbsentToday = studentRecords
        .filter((item) => item.attendanceDate === viewDate && (isAbsentRecord(item) || isHalfDayRecord(item)))
        .map((item) => {
          const student = studentById.get(String(item.studentId));
          const className = normalizeString(item.className || student?.class);
          const section = normalizeString(item.section || student?.section);
          return {
            studentId: String(item.studentId),
            name: student?.name || 'Unknown student',
            rollNumber: student?.rollNumber || '',
            className,
            section,
            halfDay: isHalfDayRecord(item),
          };
        })
        .filter((item) => !allowedKeys || allowedKeys.has(sectionKey(item.className, item.section)))
        .sort((left, right) =>
          sortClassNames(left.className, right.className)
          || sortSectionNames(left.section, right.section, left.className)
          || left.name.localeCompare(right.name));
    }

    const dailyTrend = dayKeys.map((dateKey) => {
      const staffDay = summarizeRecords(staffRecords, dateKey);
      const studentDay = summarizeRecords(studentRecords, dateKey);
      return {
        date: dateKey,
        weekday: new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
        isSunday: isSundayKey(dateKey),
        isWorking: isWorkingKey(dateKey),
        dayLabel: offDays[dateKey]?.label || '',
        staffAbsent: staffDay.absent,
        staffHalfDay: staffDay.halfDay,
        studentAbsent: studentDay.absent,
        studentHalfDay: studentDay.halfDay,
      };
    });

    return res.json({
      success: true,
      data: {
        month,
        date: viewDate,
        workingDays: elapsedDays.length,
        today: offDays[viewDate] ? { working: offDays[viewDate].working, label: offDays[viewDate].label } : { working: true, label: '' },
        staff: {
          strength: staffStrength,
          todayPresent: Math.max(staffStrength - staffToday.absent - staffToday.halfDay, 0),
          todayAbsent: staffToday.absent,
          todayHalfDay: staffToday.halfDay,
          monthAbsent: staffMonthAbsent,
          monthHalfDay: staffMonthHalfDay,
          attendancePercent: rate(staffMonthAbsent, staffMonthHalfDay, staffStrength),
        },
        students: {
          strength: studentStrength,
          todayPresent: Math.max(studentStrength - studentToday.absent - studentToday.halfDay, 0),
          todayAbsent: studentToday.absent,
          todayHalfDay: studentToday.halfDay,
          monthAbsent: studentMonthAbsent,
          monthHalfDay: studentMonthHalfDay,
          attendancePercent: rate(studentMonthAbsent, studentMonthHalfDay, studentStrength),
        },
        classMatrix,
        studentsAbsentToday,
        sections: allSections,
        staffMatrix,
        dailyTrend,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load attendance dashboard', error: error.message });
  }
};

module.exports = {
  getStaffDirectory,
  getStudentDirectory,
  getStudentFilters,
  getStaffAttendance,
  saveStaffAttendance,
  getStudentAttendance,
  saveStudentAttendance,
  getDashboard,
};
