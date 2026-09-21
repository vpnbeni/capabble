const FEATURE_CATALOG = Object.freeze(require('./tenantFeatureCatalog.json'));

const TENANT_FEATURE_PAGES = Object.freeze(
  FEATURE_CATALOG.map(({ key, label, path, group, module }) => ({
    key,
    label,
    path,
    group,
    module,
  }))
);

const TENANT_FEATURE_KEYS = Object.freeze(TENANT_FEATURE_PAGES.map((entry) => entry.key));

/**
 * Purchasable module definitions.
 * Each module bundles a set of features and declares dependencies on other modules.
 */
const TENANT_MODULE_CATALOG = Object.freeze({
  core: {
    key: 'core',
    label: 'Core',
    description: 'Shared kernel — dashboard, billing, account settings. Included with any module.',
    dependencies: [],
  },
  cntr: {
    key: 'cntr',
    label: 'Cntr — Exam Centre Management',
    description: 'CBSE examination centre operations: datesheets, candidates, seating plans, duties, answer sheets, dispatch.',
    dependencies: ['core'],
  },
  exmcl: {
    key: 'exmcl',
    label: 'ExmCl — Internal Exams',
    description: 'Internal examination operations with CNTR-equivalent workflows under separate module paths.',
    dependencies: ['core'],
  },
  timetable: {
    key: 'timetable',
    label: 'Timetable',
    description: 'School timetable generation: teacher-subject-class allocation, bell timings, conflict resolution, version management.',
    dependencies: ['core'],
  },
  staaf: {
    key: 'staaf',
    label: 'STAAF — Staff Management',
    description: 'Staff member management for institution operations and records.',
    dependencies: ['core'],
  },
  attnd: {
    key: 'attnd',
    label: 'ATTND — Attendance Management',
    description: 'Daily attendance workflows for staff and students.',
    dependencies: ['core'],
  },
  trnst: {
    key: 'trnst',
    label: 'TRNST — School Transport',
    description: 'School transport operations: vehicle records, route planning, and stop timings.',
    dependencies: ['core'],
  },
  acdmc: {
    key: 'acdmc',
    label: 'ACDMC — Academics',
    description: 'Academic planning and tracking: lesson plans, homework, assignments, quizzes, and curriculum books.',
    dependencies: ['core'],
  },
  actvt: {
    key: 'actvt',
    label: 'ACTVT — Activities',
    description: 'Co-curricular and cultural activities: clubs, houses, tours, sports, and school functions.',
    dependencies: ['core'],
  },
  mdcl: {
    key: 'mdcl',
    label: 'MDCL — Medical Clinic',
    description: 'School medical clinic: minor treatment log book, prescriptions, first aid, and medical supplies.',
    dependencies: ['core'],
  },
  asets: {
    key: 'asets',
    label: 'ASETS — Asset Management',
    description: 'School asset lifecycle: ownership, locations, allocations, stock, maintenance, audits, and disposal.',
    dependencies: ['core'],
  },
});

const TENANT_MODULE_KEYS = Object.freeze(Object.keys(TENANT_MODULE_CATALOG));

/**
 * Returns all feature keys belonging to a given module.
 * @param {string} moduleKey - e.g. 'timetable', 'cntr', 'core'
 * @returns {string[]}
 */
const getModuleFeatureKeys = (moduleKey) => {
  return FEATURE_CATALOG
    .filter((entry) => entry.module === moduleKey)
    .map((entry) => entry.key);
};

/**
 * Returns a toggles object with all features for a module set to the given value.
 * Useful for bulk enable/disable of a module's features.
 * @param {string} moduleKey
 * @param {boolean} enabled
 * @returns {Record<string, boolean>}
 */
const createModuleToggles = (moduleKey, enabled) => {
  const keys = getModuleFeatureKeys(moduleKey);
  return keys.reduce((acc, key) => {
    acc[key] = enabled;
    return acc;
  }, {});
};

// Features listed here are disabled by default for new tenants.
// Platform admins can enable them per-tenant from the admin panel.
const FEATURES_DISABLED_BY_DEFAULT = new Set(['school_hub']);

const createAllEnabledFeatureToggles = () => {
  return TENANT_FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = !FEATURES_DISABLED_BY_DEFAULT.has(key);
    return acc;
  }, {});
};

const normalizeFeatureSource = (source) => {
  if (!source) {
    return {};
  }

  if (source instanceof Map) {
    return Object.fromEntries(source.entries());
  }

  if (typeof source === 'object') {
    return source;
  }

  return {};
};

const normalizeTenantFeatureToggles = (source) => {
  const normalized = createAllEnabledFeatureToggles();
  const sourceObject = normalizeFeatureSource(source);

  TENANT_FEATURE_KEYS.forEach((key) => {
    if (sourceObject[key] === false) {
      normalized[key] = false;
      return;
    }

    if (sourceObject[key] === true) {
      normalized[key] = true;
    }
  });

  return normalized;
};

module.exports = {
  TENANT_FEATURE_PAGES,
  TENANT_FEATURE_KEYS,
  TENANT_MODULE_CATALOG,
  TENANT_MODULE_KEYS,
  getModuleFeatureKeys,
  createModuleToggles,
  createAllEnabledFeatureToggles,
  normalizeTenantFeatureToggles,
};
