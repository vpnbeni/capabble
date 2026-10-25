import featureCatalog from '@capabble/shared/tenantFeatureCatalog.json'
import permissionCatalog from '@capabble/shared/permissionCatalog.json'

export type TenantFeatureToggles = Record<string, boolean> | null | undefined

/** Returns true when the user holds any of the given permission keys. */
export type PermissionChecker = (keys: string | string[]) => boolean

/**
 * What decides whether a page is open: the school's feature toggles (what it
 * bought / turned on) and, when given, the user's permissions (their role).
 * Passing only toggles keeps the old, permission-blind behaviour.
 */
export type AccessContext = { toggles: TenantFeatureToggles; can?: PermissionChecker }
export type AccessInput = TenantFeatureToggles | AccessContext

// A toggles map never has a `toggles` key, so its presence marks an AccessContext.
const isAccessContext = (input: AccessInput): input is AccessContext =>
  Boolean(input && typeof input === 'object' && 'toggles' in input)

const toAccess = (input: AccessInput): AccessContext => (isAccessContext(input) ? input : { toggles: input })

const FEATURE_PERMISSIONS = permissionCatalog.features as Record<string, string | string[] | null>

// Pages outside the feature catalog that still need a permission.
const EXTRA_PATH_PERMISSIONS: Array<[prefix: string, permission: string | string[]]> = [
  ['/settings/users', 'core.users.read'],
  ['/settings/roles', 'core.users.read'],
  ['/settings/school-days', 'core.schooldays.write'],
  ['/settings/email', 'core.school.write'],
  ['/settings/payments', 'cpitl.finance.settings'],
  // Everyone can see that the plan isn't set up; only billing managers can choose it.
  ['/get-started', ['core.billing.read', 'core.dashboard.read']],
]

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
const OPT_IN_FEATURES = new Set(['school_hub', 'appnt_desk'])

// Pages inside a feature that need a narrower permission than the feature itself.
// Checked on top of the feature's toggle and permission.
const PAGE_PERMISSIONS: Array<[prefix: string, permission: string | string[]]> = [
  ['/appnt/today', ['appnt.appointments.view', 'appnt.appointments.host']],
  ['/appnt/appointments', ['appnt.appointments.view', 'appnt.appointments.host']],
  ['/appnt/hosts', ['appnt.appointments.settings', 'appnt.appointments.view', 'appnt.appointments.book']],
  ['/appnt/availability', 'appnt.appointments.host'],
  ['/appnt/reports', 'appnt.appointments.report'],
  ['/appnt/settings', 'appnt.appointments.settings'],
  ['/trnst/live', 'trnst.trips.read'],
  ['/trnst/trips', 'trnst.trips.read'],
]

const isPagePermitted = (pathname: string, can?: PermissionChecker): boolean => {
  if (!can) return true
  const rule = PAGE_PERMISSIONS.find(([prefix]) => matchesPrefix(pathname, prefix))
  return !rule || can(rule[1])
}

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

const isToggleOn = (featureKey: string, toggles: TenantFeatureToggles): boolean => {
  // Opt-in features must be explicitly enabled (true); absence or null means hidden
  if (OPT_IN_FEATURES.has(featureKey)) {
    return toggles?.[featureKey] === true
  }
  return toggles?.[featureKey] !== false
}

/** Permission needed to open a feature; null/undefined means any signed-in staff. */
export const getFeaturePermission = (featureKey: string): string | string[] | null => FEATURE_PERMISSIONS[featureKey] ?? null

const isFeaturePermitted = (featureKey: string, can?: PermissionChecker): boolean => {
  if (!can) return true
  const permission = getFeaturePermission(featureKey)
  return !permission || can(permission)
}

export const isFeatureEnabledForPath = (pathname: string, input: AccessInput): boolean => {
  const { toggles, can } = toAccess(input)

  const extra = EXTRA_PATH_PERMISSIONS.find(([prefix]) => matchesPrefix(pathname, prefix))
  if (extra) return !can || can(extra[1])

  const featureKey = resolveFeatureKeyFromPath(pathname)
  if (!featureKey) {
    // Module pages without a feature of their own (e.g. /time-table/generate) are
    // open when any page of that module is open to this user.
    const root = MODULE_PATH_ROOTS.find(([prefix]) => matchesPrefix(pathname, prefix))
    if (!root || !can) return true
    return FEATURE_CATALOG.some((entry) => entry.module === root[1]
      && isToggleOn(entry.key, toggles)
      && isFeaturePermitted(entry.key, can))
  }

  return isToggleOn(featureKey, toggles) && isFeaturePermitted(featureKey, can) && isPagePermitted(pathname, can)
}

export const getFirstEnabledPath = (input: AccessInput): string | null => {
  const firstEnabled = FALLBACK_ROUTE_PRIORITY.find((path) => isFeatureEnabledForPath(path, input))
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
  ['/libry', 'libry'],
  ['/appnt', 'appnt'],
  ['/cpitl', 'cpitl'],
  ['/trnst', 'trnst'],
  ['/exmcl', 'exmcl'],
  // Exam centre setup (importing candidates, Form 66, attendance sheets)
  ['/onboarding', 'cntr'],
]

export const getModuleForPath = (pathname: string): string | null => {
  const featureKey = resolveFeatureKeyFromPath(pathname)
  const entry = featureKey ? FEATURE_CATALOG.find((e) => e.key === featureKey) : undefined
  if (entry && entry.module !== 'core') return entry.module
  const root = MODULE_PATH_ROOTS.find(([prefix]) => matchesPrefix(pathname, prefix))
  return root?.[1] ?? entry?.module ?? null
}

export const getAccessibleModules = (input: AccessInput): Set<string> => {
  const modules = new Set<string>()
  for (const entry of FEATURE_CATALOG) {
    if (entry.module === 'core') continue
    if (isFeatureEnabledForPath(entry.path, input)) {
      modules.add(entry.module)
    }
  }
  return modules
}

export const getFirstEnabledPathForModule = (module: string, input: AccessInput): string | null => {
  const moduleEntries = FEATURE_CATALOG.filter((entry) => entry.module === module)
  const firstEnabled = moduleEntries.find((entry) => isFeatureEnabledForPath(entry.path, input))
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
