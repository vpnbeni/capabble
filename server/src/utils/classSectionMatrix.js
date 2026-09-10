const {
  getCanonicalSectionName,
  normalizeAllowedSections,
  resolveSectionAgainstAllowed,
} = require('./sectionMetadata');

const normalizeString = (value) => String(value || '').trim();

const getOrdinalSuffix = (value) => {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return 'st';
  if (remainderTen === 2 && remainderHundred !== 12) return 'nd';
  if (remainderTen === 3 && remainderHundred !== 13) return 'rd';
  return 'th';
};

const ROMAN_CLASS_TO_NUMBER = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

const normalizeClassValue = (value) => {
  const raw = normalizeString(value);
  if (!raw) return '';

  const normalized = raw
    .toLowerCase()
    .replace(/[._\-_/\\]+/g, ' ')
    .replace(/\b(?:class|cls|std|standard|grade)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const romanMatch = normalized.match(/^(i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)$/i);
  if (romanMatch) {
    const classNumber = ROMAN_CLASS_TO_NUMBER[romanMatch[1].toLowerCase()];
    if (classNumber) return `${classNumber}${getOrdinalSuffix(classNumber)}`;
  }

  const numericMatch = normalized.match(/^(\d+)(?:st|nd|rd|th)?$/i);
  if (numericMatch) {
    const classNumber = Number.parseInt(numericMatch[1], 10);
    if (Number.isFinite(classNumber) && classNumber > 0 && classNumber <= 12) {
      return `${classNumber}${getOrdinalSuffix(classNumber)}`;
    }
  }

  const ordinalMatch = normalized.match(/^(\d+)(st|nd|rd|th)$/i);
  if (ordinalMatch) {
    const classNumber = Number.parseInt(ordinalMatch[1], 10);
    if (Number.isFinite(classNumber) && classNumber > 0 && classNumber <= 12) {
      return `${classNumber}${getOrdinalSuffix(classNumber)}`;
    }
  }

  return raw;
};

const buildClassSectionMatrixLookup = (stateDoc) => {
  const matrixClasses = Array.isArray(stateDoc?.matrixClasses) ? stateDoc.matrixClasses : [];
  const matrixSections = Array.isArray(stateDoc?.matrixSections) ? stateDoc.matrixSections : [];
  const matrixSelection = stateDoc?.matrixSelection || {};

  const sectionNameById = new Map(
    matrixSections
      .map((section) => [String(section?.id || '').trim(), normalizeString(section?.name)])
      .filter(([id, name]) => id && name)
  );

  const sectionsByClass = new Map();
  matrixClasses.forEach((item) => {
    const classId = String(item?.id || '').trim();
    const className = normalizeClassValue(item?.name);
    if (!classId || !className) return;

    const selectedSectionMap = matrixSelection[classId] || {};
    const sectionNames = Object.entries(selectedSectionMap)
      .filter(([, checked]) => Boolean(checked))
      .map(([sectionId]) => sectionNameById.get(String(sectionId).trim()) || '')
      .map((name) => normalizeString(name))
      .filter(Boolean);

    sectionsByClass.set(className, normalizeAllowedSections(sectionNames));
  });

  return sectionsByClass;
};

const buildClassSectionOptions = (stateDoc) => (
  Array.from(buildClassSectionMatrixLookup(stateDoc).entries())
    .map(([className, sections]) => ({ className, sections }))
    .filter((item) => item.sections.length > 0)
);

const getClassSectionLookupFromRequest = async (req) => {
  const TimetableStateModel = req.models?.TimetableState;
  if (!TimetableStateModel) return new Map();

  const filter = req.academicSession ? { academicSession: req.academicSession } : { academicSession: null };
  const latestTimetableState = await TimetableStateModel.findOne(filter)
    .sort({ updatedAt: -1 })
    .select('matrixClasses matrixSections matrixSelection')
    .lean();

  return buildClassSectionMatrixLookup(latestTimetableState);
};

const validateRoomClassSection = (lookup, className, section) => {
  const normalizedClass = normalizeClassValue(className);
  const trimmedSection = normalizeString(section);

  if (!normalizedClass && !trimmedSection) {
    return { ok: true, className: '', section: '' };
  }

  if (!normalizedClass || !trimmedSection) {
    return { ok: false, error: 'Both class and section are required when linking a room.' };
  }

  if (!lookup || lookup.size === 0) {
    return {
      ok: true,
      className: normalizedClass,
      section: getCanonicalSectionName(trimmedSection),
    };
  }

  const allowedSections = lookup.get(normalizedClass) || [];
  if (!allowedSections.length) {
    return {
      ok: false,
      error: `Class "${normalizedClass}" is not configured in the Class Section Matrix.`,
    };
  }

  const resolved = resolveSectionAgainstAllowed(trimmedSection, allowedSections);
  if (resolved.error) return { ok: false, error: resolved.error };

  return {
    ok: true,
    className: normalizedClass,
    section: resolved.section,
  };
};

module.exports = {
  normalizeClassValue,
  buildClassSectionMatrixLookup,
  buildClassSectionOptions,
  getClassSectionLookupFromRequest,
  validateRoomClassSection,
};
