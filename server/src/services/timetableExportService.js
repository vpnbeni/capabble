/**
 * Timetable Export Service
 *
 * Provides Excel (.xlsx) and PDF generation for timetable versions.
 *
 * Excel format mirrors the reference file "Class Time Table 3.3.xlsx":
 *  - Sheet "All": every class combined.
 *  - Additional sheets per classGroup (e.g. "4-5", "9-10").
 *  - Header rows: school name, title + session, effective date.
 *  - Period columns with computed time ranges.
 *  - Merged cells for consecutive same-subject+teacher assignments across days.
 *  - Column O: class incharge teacher.
 *
 * PDF format uses Handlebars HTML templates rendered with Puppeteer.
 */

'use strict';

const ExcelJS = require('exceljs');
const pdfGenerator = require('../utils/pdfGenerator');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT' };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse "HH:MM" → total minutes from midnight. */
const timeToMinutes = (timeStr) => {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Format minutes-since-midnight back to "HH:MM". */
const minutesToTime = (total) => {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Compute computed period schedule from bell timings.
 * Returns an array of { id, type, label, duration, startTime, endTime }.
 */
const computePeriodSchedule = (bellTimings) => {
  const rows = (bellTimings && bellTimings.rows) ? bellTimings.rows : [];
  const startMinutes = timeToMinutes(bellTimings && bellTimings.startTime ? bellTimings.startTime : '08:00');

  let cursor = startMinutes;
  return rows.map((row) => {
    const entry = {
      id: row.id,
      type: row.type,
      label: row.label,
      duration: row.duration,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + row.duration),
      isBreak: row.type === 'break',
    };
    cursor += row.duration;
    return entry;
  });
};

/** Get only the teachable (non-break) period entries. */
const getTeachablePeriods = (schedule) => schedule.filter((p) => !p.isBreak);

/**
 * Get the class display name: "ClassName Section" or just "ClassName".
 */
const classDisplayName = (cls) =>
  cls.section ? `${cls.className} ${cls.section}` : cls.className;

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

/**
 * Build the rows for one class (6 day-rows) ready to write to Excel.
 * Each row: [ dayName, ...perPeriodCell ] where perPeriodCell is
 * { subject, teacher, isBreak } for each slot in the schedule.
 */
const buildClassRows = (cls, grid, schedule) => {
  const classGrid = (grid || {})[cls.id] || {};
  return DAYS.map((day) => {
    const daySlots = classGrid[day] || {};
    const slots = schedule.map((period) => {
      if (period.isBreak) {
        return { subject: '', teacher: '', isBreak: true };
      }
      const cell = daySlots[period.id] || {};
      return { subject: cell.subject || '', teacher: cell.teacher || '', isBreak: false };
    });
    return { day, slots };
  });
};

/**
 * Write a single class block to the worksheet starting at `startRow`.
 * Returns the next available row index.
 */
const writeClassBlock = (ws, cls, rows, schedule, startRow, colOffset) => {
  const CLASS_COL = colOffset;     // B
  const DAY_COL = colOffset + 1;   // C
  const INCHARGE_COL = colOffset + 1 + schedule.length + 1; // after all period cols + 1 for header

  const firstRow = startRow;
  const lastRow = startRow + DAYS.length - 1;

  DAYS.forEach((day, dayIdx) => {
    const rowNum = startRow + dayIdx;
    const wsRow = ws.getRow(rowNum);

    // Day name
    wsRow.getCell(DAY_COL).value = day.toUpperCase();
    wsRow.getCell(DAY_COL).alignment = { horizontal: 'center', vertical: 'middle' };
    wsRow.getCell(DAY_COL).font = { bold: dayIdx === 0, size: 9 };
    wsRow.getCell(DAY_COL).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // Period cells
    const dayRow = rows[dayIdx];
    let colIdx = DAY_COL + 1;
    dayRow.slots.forEach((slot) => {
      const cell = wsRow.getCell(colIdx);
      if (slot.isBreak) {
        cell.value = 'L U N C H';
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };
        cell.font = { bold: true, size: 8 };
      } else if (slot.subject) {
        const shortTeacher = slot.teacher ? slot.teacher.split(' ')[0].toUpperCase() : '';
        cell.value = shortTeacher ? `${slot.subject}\n${shortTeacher}` : slot.subject;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.font = { size: 8 };
      } else {
        cell.value = '';
      }
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
      colIdx++;
    });

    wsRow.height = 28;
    wsRow.commit();
  });

  // Merge class name cell vertically over all day rows
  const classCell = ws.getCell(firstRow, CLASS_COL);
  classCell.value = classDisplayName(cls).toUpperCase();
  classCell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 };
  classCell.font = { bold: true, size: 10 };
  classCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  classCell.border = {
    top: { style: 'medium' }, bottom: { style: 'medium' },
    left: { style: 'medium' }, right: { style: 'medium' },
  };
  if (lastRow > firstRow) {
    ws.mergeCells(firstRow, CLASS_COL, lastRow, CLASS_COL);
  }

  // Incharge cell (merged over all day rows)
  const inchargeCell = ws.getCell(firstRow, INCHARGE_COL);
  inchargeCell.value = cls.incharge || '';
  inchargeCell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 };
  inchargeCell.font = { bold: true, size: 9 };
  inchargeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  inchargeCell.border = {
    top: { style: 'medium' }, bottom: { style: 'medium' },
    left: { style: 'medium' }, right: { style: 'medium' },
  };
  if (lastRow > firstRow) {
    ws.mergeCells(firstRow, INCHARGE_COL, lastRow, INCHARGE_COL);
  }

  return lastRow + 1;
};

/**
 * Add header rows (rows 1–3) to a worksheet.
 */
const writeSheetHeaders = (ws, bellTimings, schedule, totalCols) => {
  const meta = (bellTimings && bellTimings.meta) || {};

  // Row 1: school name
  ws.getRow(1).getCell(1).value = (meta.schoolName || 'SCHOOL TIMETABLE').toUpperCase();
  ws.mergeCells(1, 1, 1, totalCols);
  ws.getRow(1).getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).getCell(1).font = { bold: true, size: 14 };
  ws.getRow(1).height = 24;

  // Row 2: title + session
  const titleSession = [meta.title || 'TIME TABLE', meta.session ? `(Session ${meta.session})` : '']
    .filter(Boolean).join(' ');
  ws.getRow(2).getCell(1).value = titleSession;
  ws.mergeCells(2, 1, 2, totalCols);
  ws.getRow(2).getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).getCell(1).font = { bold: true, size: 12 };
  ws.getRow(2).height = 20;

  // Row 3: effective date
  ws.getRow(3).getCell(1).value = meta.effectiveDate ? `w.e.f — ${meta.effectiveDate}` : '';
  ws.mergeCells(3, 1, 3, totalCols);
  ws.getRow(3).getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).getCell(1).font = { size: 10 };
  ws.getRow(3).height = 18;

  // Row 4: empty spacer
  ws.getRow(4).height = 6;

  // Row 5: column headers — CLASS | DAY | P1 | P2 | ... | INCHARGE
  const headerRow = ws.getRow(5);
  headerRow.getCell(1).value = 'CLASS';
  headerRow.getCell(2).value = 'DAY';
  let col = 3;
  schedule.forEach((period) => {
    headerRow.getCell(col).value = period.isBreak ? 'BREAK' : period.label.toUpperCase();
    headerRow.getCell(col).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: period.isBreak ? 'FFFFE0B2' : 'FFDCE6F1' },
    };
    col++;
  });
  headerRow.getCell(col).value = 'INCHARGE';
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  headerRow.height = 20;

  // Row 6: time ranges
  const timeRow = ws.getRow(6);
  timeRow.getCell(1).value = '';
  timeRow.getCell(2).value = 'TIME';
  col = 3;
  schedule.forEach((period) => {
    timeRow.getCell(col).value = `${period.startTime}-${period.endTime}`;
    col++;
  });
  timeRow.getCell(col).value = '';
  timeRow.eachCell((cell) => {
    cell.font = { italic: true, size: 8 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  timeRow.height = 16;

  // Row 7: durations
  const durRow = ws.getRow(7);
  durRow.getCell(2).value = 'DURATION';
  col = 3;
  schedule.forEach((period) => {
    durRow.getCell(col).value = `${period.duration} min`;
    col++;
  });
  durRow.eachCell((cell) => {
    cell.font = { size: 8 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  durRow.height = 15;
};

/**
 * Set column widths for a timetable worksheet.
 */
const setColumnWidths = (ws, schedule) => {
  ws.getColumn(1).width = 10;  // CLASS
  ws.getColumn(2).width = 11;  // DAY
  let col = 3;
  schedule.forEach((period) => {
    ws.getColumn(col).width = period.isBreak ? 8 : 14;
    col++;
  });
  ws.getColumn(col).width = 12; // INCHARGE
};

/**
 * Add a timetable sheet for a given set of classes.
 */
const addTimetableSheet = (workbook, sheetName, classes, grid, bellTimings) => {
  const schedule = computePeriodSchedule(bellTimings);
  const totalCols = 2 + schedule.length + 1; // CLASS + DAY + periods + INCHARGE

  const ws = workbook.addWorksheet(sheetName);
  ws.properties.defaultRowHeight = 26;

  writeSheetHeaders(ws, bellTimings, schedule, totalCols);
  setColumnWidths(ws, schedule);

  let currentRow = 8; // data starts after 7 header rows + 1 spacer
  classes
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .forEach((cls) => {
      const rows = buildClassRows(cls, grid, schedule);
      currentRow = writeClassBlock(ws, cls, rows, schedule, currentRow, 1);
    });
};

/**
 * Generate the full Excel workbook buffer.
 *
 * @param {object} version  - TimetableVersion document
 * @param {object} state    - TimetableState document (for classes, bell timings, etc.)
 * @returns {Promise<Buffer>}
 */
const generateExcel = async (version, state) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CNTR Timetable Generator';
  workbook.created = new Date();

  const classes = (state.classes || []).slice().sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const bellTimings = state.bellTimings || {};
  const grid = version.grid || {};

  // Sheet "All" — all classes
  addTimetableSheet(workbook, 'All', classes, grid, bellTimings);

  // Group sheets by classGroup
  const groups = {};
  classes.forEach((cls) => {
    const g = (cls.classGroup || '').trim();
    if (g) {
      if (!groups[g]) groups[g] = [];
      groups[g].push(cls);
    }
  });

  Object.entries(groups).forEach(([groupName, groupClasses]) => {
    addTimetableSheet(workbook, groupName, groupClasses, grid, bellTimings);
  });

  return workbook.xlsx.writeBuffer();
};

// ---------------------------------------------------------------------------
// PDF exports
// ---------------------------------------------------------------------------

/**
 * Build Handlebars context for class-wise PDF.
 */
const buildClassPDFContext = (classes, grid, state) => {
  const schedule = computePeriodSchedule(state.bellTimings);
  const meta = (state.bellTimings && state.bellTimings.meta) || {};

  const classData = classes.map((cls) => {
    const classGrid = (grid || {})[cls.id] || {};
    const days = DAYS.map((day) => {
      const daySlots = classGrid[day] || {};
      const slots = schedule.map((period) => {
        if (period.isBreak) return { isBreak: true };
        const cell = daySlots[period.id] || {};
        return {
          isBreak: false,
          subject: cell.subject || '',
          teacher: cell.teacher || '',
        };
      });
      return { name: day.toUpperCase(), slots };
    });

    return {
      displayName: classDisplayName(cls),
      incharge: cls.incharge || '',
      days,
    };
  });

  return {
    meta: {
      schoolName: meta.schoolName || 'SCHOOL TIMETABLE',
      title: meta.title || 'TIME TABLE',
      session: meta.session || '',
      effectiveDate: meta.effectiveDate || '',
    },
    periods: schedule,
    classes: classData,
  };
};

/**
 * Build Handlebars context for teacher-wise PDF.
 */
const buildTeacherPDFContext = (teachers, grid, state) => {
  const schedule = computePeriodSchedule(state.bellTimings);
  const meta = (state.bellTimings && state.bellTimings.meta) || {};
  const classes = state.classes || [];

  // Invert grid: teacherName → { day → { periodId → { className, subject } } }
  const teacherGrid = {};
  Object.entries(grid || {}).forEach(([classId, classDays]) => {
    const cls = classes.find((c) => c.id === classId);
    const className = cls ? classDisplayName(cls) : classId;
    Object.entries(classDays).forEach(([day, daySlots]) => {
      Object.entries(daySlots).forEach(([periodId, cell]) => {
        if (!cell || !cell.subject || !cell.teacher) return;
        const teacher = cell.teacher;
        if (!teacherGrid[teacher]) teacherGrid[teacher] = {};
        if (!teacherGrid[teacher][day]) teacherGrid[teacher][day] = {};
        teacherGrid[teacher][day][periodId] = { className, subject: cell.subject };
      });
    });
  });

  const teacherData = teachers.map((t) => {
    const tg = teacherGrid[t.name] || {};
    let totalPeriods = 0;

    const periodsWithDays = schedule.map((period) => {
      const daySlots = DAYS.map((day) => {
        if (period.isBreak) return { isBreak: true };
        const slot = (tg[day] || {})[period.id];
        if (slot) totalPeriods++;
        return slot
          ? { isBreak: false, className: slot.className, subject: slot.subject }
          : { isBreak: false, className: '', subject: '' };
      });
      return { label: period.label, isBreak: period.isBreak, daySlots };
    });

    return {
      name: t.name,
      shortName: t.shortName || t.name,
      totalPeriods,
      periods: periodsWithDays,
    };
  });

  return {
    meta: {
      schoolName: meta.schoolName || 'SCHOOL TIMETABLE',
      title: meta.title || 'TIME TABLE',
      session: meta.session || '',
    },
    days: DAYS.map((d) => ({ name: d.toUpperCase(), abbr: DAY_ABBR[d] })),
    teachers: teacherData,
  };
};

/**
 * Generate a class-wise PDF buffer.
 *
 * @param {object} version   - TimetableVersion document
 * @param {object} state     - TimetableState document
 * @param {string} [classId] - If provided, only export that class; otherwise all classes.
 * @returns {Promise<Buffer>}
 */
const generateClassPDF = async (version, state, classId) => {
  let classes = (state.classes || [])
    .slice()
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (classId) {
    classes = classes.filter((c) => c.id === classId);
  }

  if (!classes.length) {
    throw new Error('No classes found to export.');
  }

  const context = buildClassPDFContext(classes, version.grid || {}, state);
  return pdfGenerator.generatePDF('timetable-class', context, { landscape: true });
};

/**
 * Generate a teacher-wise PDF buffer.
 *
 * @param {object} version     - TimetableVersion document
 * @param {object} state       - TimetableState document
 * @param {string} [teacherId] - If provided, only that teacher; otherwise all.
 * @returns {Promise<Buffer>}
 */
const generateTeacherPDF = async (version, state, teacherId) => {
  let teachers = state.teachers || [];

  if (teacherId) {
    teachers = teachers.filter((t) => t.id === teacherId);
  }

  if (!teachers.length) {
    throw new Error('No teachers found to export.');
  }

  const context = buildTeacherPDFContext(teachers, version.grid || {}, state);
  return pdfGenerator.generatePDF('timetable-teacher', context, { landscape: true });
};

module.exports = {
  generateExcel,
  generateClassPDF,
  generateTeacherPDF,
  computePeriodSchedule,
  buildClassPDFContext,
};
