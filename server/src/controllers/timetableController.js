const asyncHandler = require('../middleware/asyncHandler');
const TimetableState = require('../models/TimetableState');
const TimetableVersion = require('../models/TimetableVersion');
const BellTimingVersion = require('../models/BellTimingVersion');
const { generateResponse } = require('../utils/helpers');
const { SUCCESS_MESSAGES, HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');
const { generate: runGenerator } = require('../services/timetableGeneratorService');
const exportService = require('../services/timetableExportService');
const eventBus = require('../events/eventBus');
const schoolDate = require('../utils/schoolDate');
const { getTeacherDays } = require('../modules/timetable/teacherSchedule');
const EVENTS = require('../events/eventNames');

const DEFAULT_BELL_TIMINGS = Object.freeze({
  meta: {
    schoolName: '',
    title: 'SUMMER BELL TIMINGS',
    session: '',
    effectiveDate: '',
  },
  startTime: '08:00',
  rows: [
    { id: 'bt-default-1', type: 'break', label: 'RECREATION', duration: 45 },
    { id: 'bt-default-2', type: 'period', label: '1st', duration: 40 },
    { id: 'bt-default-3', type: 'period', label: '2nd', duration: 40 },
    { id: 'bt-default-4', type: 'period', label: '3rd', duration: 40 },
    { id: 'bt-default-5', type: 'break', label: 'LUNCH', duration: 15 },
    { id: 'bt-default-6', type: 'period', label: '4th', duration: 40 },
    { id: 'bt-default-7', type: 'period', label: '5th', duration: 40 },
    { id: 'bt-default-8', type: 'period', label: '6th', duration: 40 },
    { id: 'bt-default-9', type: 'period', label: '7th', duration: 40 },
  ],
});

const cloneDefaultBellTimings = (session = '') => ({
  meta: {
    ...DEFAULT_BELL_TIMINGS.meta,
    session: session || DEFAULT_BELL_TIMINGS.meta.session,
  },
  startTime: DEFAULT_BELL_TIMINGS.startTime,
  rows: DEFAULT_BELL_TIMINGS.rows.map((row) => ({ ...row })),
});

const DEFAULT_STATE = Object.freeze({
  classes: [],
  subjects: [],
  teachers: [],
  teacherSubjectAllocations: [],
  parallelSubjectPairs: [],
  commonPeriods: [],
  periodsPerWeek: 42,
  periodAllocation: {},
  timetableGrid: {},
  matrixClasses: [],
  matrixSections: [],
  matrixSelection: {},
  bellTimings: cloneDefaultBellTimings(''),
});

const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const toTrimmedString = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const sanitizeObjectShallow = (value) => {
  if (!isPlainObject(value)) return {};

  const safeObject = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    if (!RESERVED_KEYS.has(key)) {
      safeObject[key] = entryValue;
    }
  });

  return safeObject;
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];

  const deduped = [];
  const seen = new Set();

  value.forEach((entry) => {
    const normalized = toTrimmedString(entry);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push(normalized);
  });

  return deduped;
};

const buildSubjectNameMap = (subjects) => {
  const map = new Map();
  subjects.forEach((subject) => {
    const name = toTrimmedString(subject?.name);
    if (!name) return;
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, name);
    }
  });
  return map;
};

const normalizeSubjectNames = (value, subjectNameMap) => {
  if (!subjectNameMap || subjectNameMap.size === 0) return [];

  const deduped = [];
  const seen = new Set();
  normalizeStringArray(value).forEach((entry) => {
    const canonical = subjectNameMap.get(entry.toLowerCase());
    if (!canonical) return;

    const key = canonical.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(canonical);
  });

  return deduped;
};

const normalizeCommonPeriods = (value, subjectNameMap) => {
  if (!Array.isArray(value)) return [];

  const output = [];
  const seen = new Set();

  value.forEach((entry) => {
    if (!isPlainObject(entry)) return;
    const id = toTrimmedString(entry.id);
    const className = toTrimmedString(entry.className);
    const rawSubject = toTrimmedString(entry.subject);
    const subject = subjectNameMap.get(rawSubject.toLowerCase()) || rawSubject;
    const sections = normalizeStringArray(entry.sections);

    if (!id || !className || !subject) return;
    if (sections.length < 2) return;

    const key = `${className.toLowerCase()}|${subject.toLowerCase()}|${sections.map((s) => s.toLowerCase()).sort().join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);

    output.push({
      id,
      className,
      subject,
      sections,
    });
  });

  return output;
};

const ROMAN_CLASS_LEVELS = Object.freeze({
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
});

const getClassKey = (value) => toTrimmedString(value).toLowerCase();

const parseClassLevel = (className) => {
  const normalized = toTrimmedString(className).replace(/^class\s*/i, '').toLowerCase();
  if (!normalized) return null;

  const numericMatch = normalized.match(/\d+/);
  if (numericMatch && numericMatch[0]) {
    const parsed = Number.parseInt(numericMatch[0], 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return ROMAN_CLASS_LEVELS[normalized] ?? null;
};

const shouldSyncSubjectsAcrossSections = (className) => {
  const classLevel = parseClassLevel(className);
  return classLevel !== 11 && classLevel !== 12;
};

const normalizeClasses = (value, subjectNameMap) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;

      const id = toTrimmedString(entry.id);
      const className = toTrimmedString(entry.className);
      const section = toTrimmedString(entry.section);
      const floor = toTrimmedString(entry.floor);

      if (!id || !className || !section || !floor) return null;

      const displayOrderInput = Number.parseInt(String(entry.displayOrder), 10);

      return {
        id,
        className,
        section,
        floor,
        subjects: normalizeSubjectNames(entry.subjects, subjectNameMap),
        incharge: toTrimmedString(entry.incharge),
        classGroup: toTrimmedString(entry.classGroup),
        displayOrder: Number.isFinite(displayOrderInput) ? displayOrderInput : 0,
      };
    })
    .filter(Boolean);
};

const syncClassSubjectsAcrossSections = (classes) => {
  const canonicalByClass = new Map();

  classes.forEach((entry) => {
    if (!shouldSyncSubjectsAcrossSections(entry.className)) return;

    const classKey = getClassKey(entry.className);
    const existing = canonicalByClass.get(classKey);
    if (!existing || entry.subjects.length > existing.length) {
      canonicalByClass.set(classKey, entry.subjects);
    }
  });

  return classes.map((entry) => {
    if (!shouldSyncSubjectsAcrossSections(entry.className)) return entry;

    const classKey = getClassKey(entry.className);
    const canonicalSubjects = canonicalByClass.get(classKey);
    if (!canonicalSubjects) return entry;

    return {
      ...entry,
      subjects: [...canonicalSubjects],
      classGroup: entry.classGroup,
      displayOrder: entry.displayOrder,
    };
  });
};

const normalizeSubjects = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;

      const id = toTrimmedString(entry.id);
      const name = toTrimmedString(entry.name);

      if (!id || !name) return null;

      const consecutivePeriodCount = Number.parseInt(String(entry.consecutivePeriodCount), 10);

      return {
        id,
        name,
        type: toTrimmedString(entry.type),
        requiresConsecutivePeriods: Boolean(entry.requiresConsecutivePeriods),
        consecutivePeriodCount:
          Number.isFinite(consecutivePeriodCount) && consecutivePeriodCount >= 2
            ? consecutivePeriodCount
            : 2,
        color: toTrimmedString(entry.color),
      };
    })
    .filter(Boolean);
};

const normalizeTeachers = (value, subjectNameMap) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;

      const id = toTrimmedString(entry.id);
      const name = toTrimmedString(entry.name);

      if (!id || !name) return null;

      return {
        id,
        name,
        shortName: toTrimmedString(entry.shortName),
        subjects: normalizeSubjectNames(entry.subjects, subjectNameMap),
      };
    })
    .filter(Boolean);
};

const normalizeTeacherSubjectAllocations = (value, classById, subjectNameMap) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;

      const teacherId = toTrimmedString(entry.teacherId);
      if (!teacherId) return null;

      const teacherName = toTrimmedString(entry.teacherName);
      const assignmentEntries = Array.isArray(entry.assignments) ? entry.assignments : [];
      const mergedAssignmentsByClass = new Map();

      assignmentEntries.forEach((assignment) => {
        if (!isPlainObject(assignment)) return;

        const classId = toTrimmedString(assignment.classId);
        if (!classId) return;

        const classInfo = classById.get(classId);
        if (!classInfo) return;

        const allowedClassSubjects = new Set((classInfo.subjects || []).map((subject) => subject.toLowerCase()));
        const normalizedSubjects = normalizeSubjectNames(assignment.subjects, subjectNameMap)
          .filter((subject) => allowedClassSubjects.has(subject.toLowerCase()));

        if (normalizedSubjects.length === 0) return;

        const existing = mergedAssignmentsByClass.get(classId);
        if (!existing) {
          mergedAssignmentsByClass.set(classId, {
            classId,
            className: classInfo.className,
            section: classInfo.section,
            subjects: normalizedSubjects,
          });
          return;
        }

        existing.subjects = normalizeStringArray([...existing.subjects, ...normalizedSubjects]);
      });

      return {
        teacherId,
        teacherName,
        assignments: Array.from(mergedAssignmentsByClass.values()),
      };
    })
    .filter((entry) => entry && entry.assignments.length > 0);
};

const normalizeParallelSubjectPairs = (value, classes, subjectNameMap) => {
  if (!Array.isArray(value)) return [];

  const classNamesByKey = new Map();
  const classSubjectsByKey = new Map();

  classes.forEach((entry) => {
    const classKey = getClassKey(entry.className);
    if (!classKey) return;
    if (!classNamesByKey.has(classKey)) {
      classNamesByKey.set(classKey, entry.className);
    }
    if (!classSubjectsByKey.has(classKey)) {
      classSubjectsByKey.set(classKey, new Set());
    }
    const classSubjects = classSubjectsByKey.get(classKey);
    (entry.subjects || []).forEach((subject) => classSubjects.add(subject.toLowerCase()));
  });

  const dedupe = new Set();
  const normalizedPairs = [];

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) return;

    const rawClassName = toTrimmedString(entry.className);
    if (!rawClassName) return;

    const classKey = getClassKey(rawClassName);
    const canonicalClassName = classNamesByKey.get(classKey) || rawClassName;

    const rawSubjectA = toTrimmedString(entry.subjectA);
    const rawSubjectB = toTrimmedString(entry.subjectB);
    if (!rawSubjectA || !rawSubjectB) return;

    const canonicalSubjectA = subjectNameMap.get(rawSubjectA.toLowerCase());
    const canonicalSubjectB = subjectNameMap.get(rawSubjectB.toLowerCase());
    if (!canonicalSubjectA || !canonicalSubjectB) return;
    if (canonicalSubjectA.toLowerCase() === canonicalSubjectB.toLowerCase()) return;

    const classSubjects = classSubjectsByKey.get(classKey);
    if (classSubjects && classSubjects.size > 0) {
      if (!classSubjects.has(canonicalSubjectA.toLowerCase())) return;
      if (!classSubjects.has(canonicalSubjectB.toLowerCase())) return;
    }

    const pairSubjects = [canonicalSubjectA, canonicalSubjectB].sort((a, b) => a.localeCompare(b));
    const dedupeKey = `${classKey}::${pairSubjects[0].toLowerCase()}::${pairSubjects[1].toLowerCase()}`;
    if (dedupe.has(dedupeKey)) return;
    dedupe.add(dedupeKey);

    const id = toTrimmedString(entry.id) || `psp-${index + 1}`;
    normalizedPairs.push({
      id,
      className: canonicalClassName,
      subjectA: pairSubjects[0],
      subjectB: pairSubjects[1],
    });
  });

  return normalizedPairs;
};

const normalizeMatrixClasses = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const id = toTrimmedString(entry.id);
      if (!id) return null;

      return {
        id,
        name: toTrimmedString(entry.name),
      };
    })
    .filter(Boolean);
};

const normalizeMatrixSections = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const id = toTrimmedString(entry.id);
      if (!id) return null;

      return {
        id,
        name: toTrimmedString(entry.name),
      };
    })
    .filter(Boolean);
};

const normalizeMatrixSelection = (value, matrixClasses, matrixSections) => {
  const selectedClassIds = new Set(matrixClasses.map((item) => item.id));
  const selectedSectionIds = new Set(matrixSections.map((item) => item.id));
  const matrix = sanitizeObjectShallow(value);
  const normalized = {};

  Object.entries(matrix).forEach(([classId, sectionMapValue]) => {
    const safeClassId = toTrimmedString(classId);
    if (!safeClassId || !selectedClassIds.has(safeClassId)) return;

    const sectionMap = sanitizeObjectShallow(sectionMapValue);
    const normalizedSectionMap = {};

    Object.entries(sectionMap).forEach(([sectionId, checkedValue]) => {
      const safeSectionId = toTrimmedString(sectionId);
      if (!safeSectionId || !selectedSectionIds.has(safeSectionId)) return;
      normalizedSectionMap[safeSectionId] = Boolean(checkedValue);
    });

    normalized[safeClassId] = normalizedSectionMap;
  });

  return normalized;
};

const sumPeriodAllocationCounts = (subjectMap) => {
  if (!isPlainObject(subjectMap)) return 0;
  return Object.values(subjectMap).reduce((sum, rawCount) => {
    const parsed = Number.parseInt(String(rawCount), 10);
    return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  }, 0);
};

// MongoDB does not allow dots in key names. We keep subject names (which may
// contain dots like "I.T.") in the API + in-memory state, but encode them
// when persisting to Mongo and decode them when reading.
const encodeMongoKey = (value) => {
  const safe = toTrimmedString(value);
  if (!safe) return '';
  return safe.replace(/\./g, '\uFF0E');
};

const decodeMongoKey = (value) => {
  const safe = toTrimmedString(value);
  if (!safe) return '';
  return safe.replace(/\uFF0E/g, '.');
};

const encodePeriodAllocationForMongo = (allocation) => {
  const normalized = {};
  const safeAllocation = sanitizeObjectShallow(allocation);

  Object.entries(safeAllocation).forEach(([classId, subjectMap]) => {
    const safeClassId = toTrimmedString(classId);
    if (!safeClassId || !isPlainObject(subjectMap)) return;

    const encodedSubjectMap = {};
    Object.entries(subjectMap).forEach(([subjectName, countValue]) => {
      const safeSubjectName = toTrimmedString(subjectName);
      if (!safeSubjectName) return;
      const encodedKey = encodeMongoKey(safeSubjectName);
      if (!encodedKey) return;
      encodedSubjectMap[encodedKey] = countValue;
    });

    normalized[safeClassId] = encodedSubjectMap;
  });

  return normalized;
};

const decodePeriodAllocationFromMongo = (allocation) => {
  const decoded = {};
  const safeAllocation = sanitizeObjectShallow(allocation);

  Object.entries(safeAllocation).forEach(([classId, subjectMap]) => {
    const safeClassId = toTrimmedString(classId);
    if (!safeClassId || !isPlainObject(subjectMap)) return;

    const decodedSubjectMap = {};
    Object.entries(subjectMap).forEach(([subjectName, countValue]) => {
      const decodedKey = decodeMongoKey(subjectName);
      if (!decodedKey) return;
      decodedSubjectMap[decodedKey] = countValue;
    });

    decoded[safeClassId] = decodedSubjectMap;
  });

  return decoded;
};

const normalizePeriodAllocation = (value) => {
  // Very permissive normalizer: keep whatever the client sends, only ensuring
  // keys are safe strings and counts are non-negative integers. We do NOT
  // drop entries based on subject master / class subjects here so that
  // subjects with dots (e.g. "I.T.") or legacy names are preserved exactly.
  const allocation = sanitizeObjectShallow(value);
  const normalizedByClassId = {};

  Object.entries(allocation).forEach(([classId, classAllocation]) => {
    const safeClassId = toTrimmedString(classId);
    if (!safeClassId || !isPlainObject(classAllocation)) return;

    const subjectMap = sanitizeObjectShallow(classAllocation);
    const normalizedSubjectMap = {};

    Object.entries(subjectMap).forEach(([subjectName, countValue]) => {
      const safeSubjectName = toTrimmedString(subjectName);
      if (!safeSubjectName) return;
      const parsedCount = Number.parseInt(String(countValue), 10);
      normalizedSubjectMap[safeSubjectName] =
        Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0;
    });

    normalizedByClassId[safeClassId] = normalizedSubjectMap;
  });

  return normalizedByClassId;
};

const normalizeTimetableGrid = (value, subjectNameMap) => {
  const grid = sanitizeObjectShallow(value);
  const normalizedGrid = {};
  const busyTeacherByDayAndSlot = new Set();

  Object.entries(grid)
    .sort(([classIdA], [classIdB]) => classIdA.localeCompare(classIdB))
    .forEach(([classId, classDaysValue]) => {
      const safeClassId = toTrimmedString(classId);
      if (!safeClassId) return;

      const classDays = sanitizeObjectShallow(classDaysValue);
      const normalizedDays = {};

      Object.entries(classDays).forEach(([day, slotsValue]) => {
        const safeDay = toTrimmedString(day);
        if (!safeDay) return;

        const slots = sanitizeObjectShallow(slotsValue);
        const normalizedSlots = {};

        Object.entries(slots).forEach(([slot, cellValue]) => {
          if (!isPlainObject(cellValue)) return;

          const safeSlot = toTrimmedString(slot);
          if (!safeSlot) return;

          const rawSubject = toTrimmedString(cellValue.subject);
          const canonicalSubject = rawSubject ? subjectNameMap.get(rawSubject.toLowerCase()) || '' : '';
          const rawTeacher = canonicalSubject ? toTrimmedString(cellValue.teacher) : '';
          const teacherKey = rawTeacher.toLowerCase();

          let safeTeacher = rawTeacher;
          if (teacherKey) {
            const occupancyKey = `${safeDay.toLowerCase()}::${safeSlot}::${teacherKey}`;
            if (busyTeacherByDayAndSlot.has(occupancyKey)) {
              safeTeacher = '';
            } else {
              busyTeacherByDayAndSlot.add(occupancyKey);
            }
          }

          normalizedSlots[safeSlot] = {
            subject: canonicalSubject,
            teacher: safeTeacher,
          };
        });

        normalizedDays[safeDay] = normalizedSlots;
      });

      normalizedGrid[safeClassId] = normalizedDays;
    });

  return normalizedGrid;
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeBellTimings = (value, academicSession = '') => {
  if (!isPlainObject(value)) {
    return cloneDefaultBellTimings(toTrimmedString(academicSession));
  }

  const metaValue = isPlainObject(value.meta) ? value.meta : {};
  const normalizedMeta = {
    schoolName: toTrimmedString(metaValue.schoolName),
    title: toTrimmedString(metaValue.title) || DEFAULT_BELL_TIMINGS.meta.title,
    session: toTrimmedString(metaValue.session) || toTrimmedString(academicSession),
    effectiveDate: toTrimmedString(metaValue.effectiveDate),
  };

  if (!DATE_ONLY_REGEX.test(normalizedMeta.effectiveDate)) {
    normalizedMeta.effectiveDate = '';
  }

  const startTimeValue = toTrimmedString(value.startTime);
  const normalizedStartTime = TIME_24H_REGEX.test(startTimeValue)
    ? startTimeValue
    : DEFAULT_BELL_TIMINGS.startTime;

  const rawRows = Array.isArray(value.rows) ? value.rows : [];
  const normalizedRows = rawRows
    .map((entry, index) => {
      if (!isPlainObject(entry)) return null;

      const type = entry.type === 'break' ? 'break' : 'period';
      const fallbackLabel = type === 'break' ? 'BREAK' : `Period ${index + 1}`;
      const label = toTrimmedString(entry.label) || fallbackLabel;
      const id = toTrimmedString(entry.id) || `bt-row-${index + 1}`;
      const parsedDuration = Number.parseInt(String(entry.duration), 10);
      const defaultDuration = type === 'break' ? 15 : 40;
      const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480
        ? parsedDuration
        : defaultDuration;

      return {
        id,
        type,
        label,
        duration,
      };
    })
    .filter(Boolean);

  return {
    meta: normalizedMeta,
    startTime: normalizedStartTime,
    rows: normalizedRows.length > 0 ? normalizedRows : cloneDefaultBellTimings(normalizedMeta.session).rows,
  };
};

const normalizeStatePayload = (payload, options = {}) => {
  const safePayload = isPlainObject(payload) ? payload : {};
  const academicSession = toTrimmedString(options.academicSession);
  const matrixClasses = normalizeMatrixClasses(safePayload.matrixClasses);
  const matrixSections = normalizeMatrixSections(safePayload.matrixSections);
  const normalizedSubjects = normalizeSubjects(safePayload.subjects);
  const subjectNameMap = buildSubjectNameMap(normalizedSubjects);
  const normalizedClasses = normalizeClasses(safePayload.classes, subjectNameMap);
  const syncedClasses = syncClassSubjectsAcrossSections(normalizedClasses);
  const classById = new Map(syncedClasses.map((entry) => [entry.id, entry]));

  const periodsPerWeekInput = Number.parseInt(String(safePayload.periodsPerWeek), 10);
  const periodsPerWeek = Number.isFinite(periodsPerWeekInput) && periodsPerWeekInput > 0
    ? periodsPerWeekInput
    : DEFAULT_STATE.periodsPerWeek;

  return {
    classes: syncedClasses,
    subjects: normalizedSubjects,
    teachers: normalizeTeachers(safePayload.teachers, subjectNameMap),
    teacherSubjectAllocations: normalizeTeacherSubjectAllocations(
      safePayload.teacherSubjectAllocations,
      classById,
      subjectNameMap
    ),
    parallelSubjectPairs: normalizeParallelSubjectPairs(
      safePayload.parallelSubjectPairs,
      syncedClasses,
      subjectNameMap
    ),
    commonPeriods: normalizeCommonPeriods(safePayload.commonPeriods, subjectNameMap),
    periodsPerWeek,
    periodAllocation: normalizePeriodAllocation(safePayload.periodAllocation, subjectNameMap, classById),
    timetableGrid: normalizeTimetableGrid(safePayload.timetableGrid, subjectNameMap),
    matrixClasses,
    matrixSections,
    matrixSelection: normalizeMatrixSelection(safePayload.matrixSelection, matrixClasses, matrixSections),
    bellTimings: normalizeBellTimings(safePayload.bellTimings, academicSession),
  };
};

const toResponseState = (document) => {
  if (!document) {
    return { ...DEFAULT_STATE };
  }

  const safeDocument = document || {};
  const decodedPeriodAllocation = decodePeriodAllocationFromMongo(safeDocument.periodAllocation);

  return normalizeStatePayload(
    {
      ...safeDocument,
      periodAllocation: decodedPeriodAllocation,
    },
  );
};

const getSessionScopedFilter = (req) => {
  if (req.academicSession) {
    return { academicSession: req.academicSession };
  }

  return { academicSession: null };
};

const getTimetableState = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const state = await TimetableState.findOne(filter).lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, toResponseState(state))
  );
});

const upsertTimetableState = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const nextState = normalizeStatePayload(req.body, { academicSession: req.academicSession });
  const hasBellTimingsInPayload = isPlainObject(req.body)
    && Object.prototype.hasOwnProperty.call(req.body, 'bellTimings');

  const persistableState = {
    ...nextState,
    periodAllocation: encodePeriodAllocationForMongo(nextState.periodAllocation),
  };

  // Bell timings are managed via /timetable/bell-timings.
  // Preserve the existing persisted bell timings when /state updates don't include them.
  if (!hasBellTimingsInPayload) {
    delete persistableState.bellTimings;
  }

  if (req.academicSession) {
    nextState.academicSession = req.academicSession;
  }

  const updatedState = await TimetableState.findOneAndUpdate(
    filter,
    persistableState,
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.UPDATED, toResponseState(updatedState))
  );
});

const getBellTimings = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const state = await TimetableState.findOne(filter).lean();
  const bellTimings = normalizeBellTimings(state?.bellTimings, req.academicSession);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, bellTimings)
  );
});

const upsertBellTimings = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const nextBellTimings = normalizeBellTimings(req.body, req.academicSession);
  const updatePayload = { bellTimings: nextBellTimings };

  if (req.academicSession) {
    updatePayload.academicSession = req.academicSession;
  }

  const updatedState = await TimetableState.findOneAndUpdate(
    filter,
    updatePayload,
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(
      true,
      SUCCESS_MESSAGES.UPDATED,
      normalizeBellTimings(updatedState?.bellTimings, req.academicSession)
    )
  );
});

const bellTimingVersionSummary = (doc) => ({
  _id: doc._id,
  name: doc.name,
  academicSession: doc.academicSession,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const getBellTimingVersions = asyncHandler(async (req, res) => {
  const BellTimingVersionModel = req.models?.BellTimingVersion || BellTimingVersion;
  const filter = getSessionScopedFilter(req);
  const versions = await BellTimingVersionModel.find(filter)
    .select('-bellTimings')
    .sort({ updatedAt: -1 })
    .lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, versions.map(bellTimingVersionSummary))
  );
});

const createBellTimingVersion = asyncHandler(async (req, res) => {
  const BellTimingVersionModel = req.models?.BellTimingVersion || BellTimingVersion;
  const TimetableStateModel = req.models?.TimetableState || TimetableState;
  const filter = getSessionScopedFilter(req);

  // Prefer the timings sent by the client (what is on screen, saved or not);
  // fall back to the persisted bell timings for older clients.
  let sourceBellTimings = req.body?.bellTimings;
  if (!isPlainObject(sourceBellTimings)) {
    const state = await TimetableStateModel.findOne(filter).lean();
    sourceBellTimings = state?.bellTimings;
  }
  const bellTimings = normalizeBellTimings(sourceBellTimings, req.academicSession);

  const currentCount = await BellTimingVersionModel.countDocuments(filter);
  const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const versionName = requestedName || `Bell Timings v${currentCount + 1}`;

  const created = await BellTimingVersionModel.create({
    name: versionName,
    bellTimings,
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });

  res.status(HTTP_STATUS.CREATED).json(
    generateResponse(true, SUCCESS_MESSAGES.CREATED, bellTimingVersionSummary(created))
  );
});

const getBellTimingVersion = asyncHandler(async (req, res) => {
  const BellTimingVersionModel = req.models?.BellTimingVersion || BellTimingVersion;
  const filter = { ...getSessionScopedFilter(req), _id: req.params.id };
  const version = await BellTimingVersionModel.findOne(filter).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, {
      ...bellTimingVersionSummary(version),
      bellTimings: normalizeBellTimings(version.bellTimings, req.academicSession),
    })
  );
});

const applyBellTimingVersion = asyncHandler(async (req, res) => {
  const BellTimingVersionModel = req.models?.BellTimingVersion || BellTimingVersion;
  const TimetableStateModel = req.models?.TimetableState || TimetableState;
  const sessionFilter = getSessionScopedFilter(req);
  const version = await BellTimingVersionModel.findOne({ ...sessionFilter, _id: req.params.id }).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const normalized = normalizeBellTimings(version.bellTimings, req.academicSession);
  const updatePayload = { bellTimings: normalized };
  if (req.academicSession) {
    updatePayload.academicSession = req.academicSession;
  }

  await TimetableStateModel.findOneAndUpdate(
    sessionFilter,
    updatePayload,
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Bell timing version applied successfully.', normalized)
  );
});

const deleteBellTimingVersion = asyncHandler(async (req, res) => {
  const BellTimingVersionModel = req.models?.BellTimingVersion || BellTimingVersion;
  const filter = { ...getSessionScopedFilter(req), _id: req.params.id };
  const deleted = await BellTimingVersionModel.findOneAndDelete(filter).lean();

  if (!deleted) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.DELETED)
  );
});

// ── Version helpers ──────────────────────────────────────────────────────────

const versionSummary = (doc) => ({
  _id: doc._id,
  name: doc.name,
  status: doc.status,
  generatedAt: doc.generatedAt,
  publishedAt: doc.publishedAt,
  academicSession: doc.academicSession,
  generationStats: doc.generationStats,
  conflictCount: doc.conflictReport ? doc.conflictReport.length : 0,
});

// ── Generation ───────────────────────────────────────────────────────────────

const generateTimetable = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const stateDoc = await TimetableState.findOne(filter).lean();
  const state = toResponseState(stateDoc);

  if (!state.classes || state.classes.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'No classes configured. Please add classes before generating.')
    );
  }

  const { grid, conflictReport, stats } = runGenerator(state);

  // Determine version number for naming
  const existingCount = await TimetableVersion.countDocuments(filter);
  const versionName = req.body && req.body.name
    ? String(req.body.name).trim()
    : `v${existingCount + 1} — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const newVersion = await TimetableVersion.create({
    name: versionName,
    status: 'draft',
    generatedAt: new Date(),
    generationStats: stats,
    conflictReport,
    grid,
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });

  eventBus.emit(EVENTS.TIMETABLE_GENERATED, {
    tenant: { dbName: req.tenant.dbName, slug: req.tenant.slug, id: String(req.tenant.id) },
    versionId: String(newVersion._id),
    versionName: newVersion.name,
  });

  res.status(HTTP_STATUS.CREATED).json(
    generateResponse(true, 'Timetable generated successfully.', {
      version: versionSummary(newVersion),
      conflictReport,
      stats,
    })
  );
});

// ── Version CRUD ─────────────────────────────────────────────────────────────

const getVersions = asyncHandler(async (req, res) => {
  const filter = getSessionScopedFilter(req);
  const versions = await TimetableVersion.find(filter)
    .select('-grid')
    .sort({ generatedAt: -1 })
    .lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, versions.map(versionSummary))
  );
});

const getVersion = asyncHandler(async (req, res) => {
  const filter = { ...getSessionScopedFilter(req), _id: req.params.id };
  const version = await TimetableVersion.findOne(filter).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, version)
  );
});

const publishVersion = asyncHandler(async (req, res) => {
  const sessionFilter = getSessionScopedFilter(req);

  // Archive any currently published version first
  await TimetableVersion.updateMany(
    { ...sessionFilter, status: 'published' },
    { $set: { status: 'archived' } }
  );

  const version = await TimetableVersion.findOneAndUpdate(
    { ...sessionFilter, _id: req.params.id },
    { $set: { status: 'published', publishedAt: new Date() } },
    { new: true }
  ).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  eventBus.emit(EVENTS.TIMETABLE_PUBLISHED, {
    tenant: { dbName: req.tenant.dbName, slug: req.tenant.slug, id: String(req.tenant.id) },
    versionId: String(version._id),
    versionName: version.name,
  });

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Version published successfully.', versionSummary(version))
  );
});

const archiveVersion = asyncHandler(async (req, res) => {
  const filter = { ...getSessionScopedFilter(req), _id: req.params.id };
  const version = await TimetableVersion.findOneAndUpdate(
    filter,
    { $set: { status: 'archived' } },
    { new: true }
  ).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Version archived.', versionSummary(version))
  );
});

const deleteVersion = asyncHandler(async (req, res) => {
  const filter = { ...getSessionScopedFilter(req), _id: req.params.id, status: 'draft' };
  const version = await TimetableVersion.findOneAndDelete(filter).lean();

  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Version not found or cannot be deleted (only drafts can be deleted).')
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.DELETED)
  );
});

// ── Exports ──────────────────────────────────────────────────────────────────

const getVersionAndState = async (req) => {
  const sessionFilter = getSessionScopedFilter(req);
  const [version, stateDoc] = await Promise.all([
    TimetableVersion.findOne({ ...sessionFilter, _id: req.params.id }).lean(),
    TimetableState.findOne(sessionFilter).lean(),
  ]);
  return { version, state: toResponseState(stateDoc) };
};

const exportVersionExcel = asyncHandler(async (req, res) => {
  const { version, state } = await getVersionAndState(req);
  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const buffer = await exportService.generateExcel(version, state);
  const filename = `timetable-${(version.name || 'export').replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

const exportVersionClassPDF = asyncHandler(async (req, res) => {
  const { version, state } = await getVersionAndState(req);
  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const classId = req.params.classId || null;
  const buffer = await exportService.generateClassPDF(version, state, classId);
  const filename = classId ? `class-timetable-${classId}.pdf` : 'class-timetable-all.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

const exportVersionTeacherPDF = asyncHandler(async (req, res) => {
  const { version, state } = await getVersionAndState(req);
  if (!version) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const teacherId = req.params.teacherId || null;
  const buffer = await exportService.generateTeacherPDF(version, state, teacherId);
  const filename = teacherId ? `teacher-timetable-${teacherId}.pdf` : 'teacher-timetable-all.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

/**
 * GET /api/timetable/me?from=&to= — the signed-in teacher's own periods, day by
 * day (the phone's "Your periods" and "My timetable"). Any staff login may ask;
 * it only ever returns the timetable of the staff record linked to that login.
 * Defaults to today; at most 14 days.
 */
const getMyTimetable = asyncHandler(async (req, res) => {
  const from = String(req.query.from || schoolDate.today());
  const to = String(req.query.to || from);
  if (!schoolDate.isDateKey(from) || !schoolDate.isDateKey(to)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(generateResponse(false, 'Dates must be YYYY-MM-DD'));
  }
  if (to < from) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(generateResponse(false, 'The end date must be on or after the start date'));
  }
  if (schoolDate.daysBetween(from, to) > 13) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(generateResponse(false, 'Ask for at most 14 days at a time'));
  }
  const data = await getTeacherDays(req.models || { TimetableState, TimetableVersion }, req.user?.teacher, {
    from, to, filter: getSessionScopedFilter(req)
  });
  return res.status(HTTP_STATUS.OK).json(generateResponse(true, SUCCESS_MESSAGES.FETCHED, data));
});

module.exports = {
  getMyTimetable,
  getTimetableState,
  upsertTimetableState,
  getBellTimings,
  upsertBellTimings,
  getBellTimingVersions,
  createBellTimingVersion,
  getBellTimingVersion,
  applyBellTimingVersion,
  deleteBellTimingVersion,
  generateTimetable,
  getVersions,
  getVersion,
  publishVersion,
  archiveVersion,
  deleteVersion,
  exportVersionExcel,
  exportVersionClassPDF,
  exportVersionTeacherPDF,
};
