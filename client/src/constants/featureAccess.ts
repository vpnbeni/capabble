import featureCatalog from '@capabble/shared/tenantFeatureCatalog.json'

export type TenantFeatureToggles = Record<string, boolean> | null | undefined

type FeatureCatalogEntry = {
  key: string
  label: string
  path: string
  group: string
  module: string
  prefixes: string[]
  fallbackPriority?: number
}

const FEATURE_CATALOG = featureCatalog as FeatureCatalogEntry[]

const FEATURE_RULES = FEATURE_CATALOG.map(({ key, prefixes }) => ({
  key,
  prefixes,
}))

// Opt-in features are hidden by default and only shown when explicitly enabled
// by a platform admin. Add feature keys here to make them opt-in.
const OPT_IN_FEATURES = new Set(['school_hub'])

const FALLBACK_ROUTE_PRIORITY = FEATURE_CATALOG
  .filter((entry) => typeof entry.fallbackPriority === 'number')
  .sort((left, right) => (left.fallbackPriority ?? Number.MAX_SAFE_INTEGER) - (right.fallbackPriority ?? Number.MAX_SAFE_INTEGER))
  .map((entry) => entry.path)

const matchesPrefix = (pathname: string, prefix: string): boolean => {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

const resolveFeatureKeyFromPath = (pathname: string): string | null => {
  for (const rule of FEATURE_RULES) {
    if (rule.prefixes.some((prefix) => matchesPrefix(pathname, prefix))) {
      return rule.key
    }
  }

  return null
}

export const isFeatureEnabledForPath = (pathname: string, toggles: TenantFeatureToggles): boolean => {
  const featureKey = resolveFeatureKeyFromPath(pathname)
  if (!featureKey) {
    return true
  }

  // Opt-in features must be explicitly enabled (true); absence or null means hidden
  if (OPT_IN_FEATURES.has(featureKey)) {
    return toggles?.[featureKey] === true
  }

  return toggles?.[featureKey] !== false
}

export const getFirstEnabledPath = (toggles: TenantFeatureToggles): string | null => {
  const firstEnabled = FALLBACK_ROUTE_PRIORITY.find((path) => isFeatureEnabledForPath(path, toggles))
  return firstEnabled || null
}

// Pages a module owns that have no feature key of their own (e.g. /time-table/generate)
// still belong to that module, judged by the start of the path.
const MODULE_PATH_ROOTS: Array<[prefix: string, module: string]> = [
  ['/time-table', 'timetable'],
  ['/stdnt', 'stdnt'],
  ['/almni', 'stdnt'],
  ['/staaf', 'staaf'],
  ['/attnd', 'attnd'],
  ['/acdmc', 'acdmc'],
  ['/actvt', 'actvt'],
  ['/mdcl', 'mdcl'],
  ['/asets', 'asets'],
  ['/cpitl', 'cpitl'],
  ['/trnst', 'trnst'],
  ['/exmcl', 'exmcl'],
]

export const getModuleForPath = (pathname: string): string | null => {
  const featureKey = resolveFeatureKeyFromPath(pathname)
  const entry = featureKey ? FEATURE_CATALOG.find((e) => e.key === featureKey) : undefined
  if (entry && entry.module !== 'core') return entry.module
  const root = MODULE_PATH_ROOTS.find(([prefix]) => matchesPrefix(pathname, prefix))
  return root?.[1] ?? entry?.module ?? null
}

export const getAccessibleModules = (toggles: TenantFeatureToggles): Set<string> => {
  const modules = new Set<string>()
  for (const entry of FEATURE_CATALOG) {
    if (entry.module === 'core') continue
    if (isFeatureEnabledForPath(entry.path, toggles)) {
      modules.add(entry.module)
    }
  }
  return modules
}

export const getFirstEnabledPathForModule = (module: string, toggles: TenantFeatureToggles): string | null => {
  const moduleEntries = FEATURE_CATALOG.filter((entry) => entry.module === module)
  const firstEnabled = moduleEntries.find((entry) => isFeatureEnabledForPath(entry.path, toggles))
  return firstEnabled?.path ?? null
}

const CORE_ALLOWED_PREFIXES = [
  '/',
  '/home',
  '/dashboard',
  '/candidate-details',
  '/candidates',
  '/subjects',
  '/datesheets',
  '/billing',
]

// Pages still reachable when billing restricts the tenant to core features (accessMode 'core_only').
export const isCoreAllowedPath = (pathname: string): boolean => {
  return CORE_ALLOWED_PREFIXES.some((prefix) => {
    if (prefix === '/') {
      return pathname === '/'
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}
