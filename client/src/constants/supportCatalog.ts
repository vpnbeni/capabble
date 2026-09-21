import featureCatalog from './tenantFeatureCatalog.json'
import { MODULE_REGISTRY, type ModuleId } from './moduleRegistry'
import { isFeatureEnabledForPath, type TenantFeatureToggles } from './featureAccess'

type FeatureCatalogEntry = {
  key: string
  label: string
  path: string
  module: string
}

const CATALOG = featureCatalog as FeatureCatalogEntry[]

export type SupportPageOption = {
  id: string
  label: string
  path: string
}

export type SupportModuleOption = {
  id: string
  abbreviation: string
  label: string
  pages: SupportPageOption[]
}

const PLATFORM_PAGES: SupportPageOption[] = [
  { id: 'account-settings', label: 'Account Settings', path: '/account-settings' },
  { id: 'billing', label: 'Billing', path: '/billing' },
  { id: 'help-support', label: 'Help & Support', path: '/help-support' },
  { id: 'platform-other', label: 'Other / General', path: '' },
]

const cleanPageLabel = (label: string) =>
  label
    .replace(/^(Stdnt|Time Table|ExmCl|STAAF|ATTND|ACDMC|ACTVT|MDCL|TRNST|ASETS)\s*[-–]\s*/i, '')
    .trim()

export const getSupportModules = (toggles: TenantFeatureToggles): SupportModuleOption[] => {
  const grouped = new Map<string, SupportModuleOption>()

  CATALOG.forEach((entry) => {
    if (entry.module === 'core') return
    if (!isFeatureEnabledForPath(entry.path, toggles)) return

    const moduleDef = MODULE_REGISTRY.find((mod) => mod.id === entry.module)
    if (!moduleDef) return

    const existing =
      grouped.get(entry.module) ||
      ({
        id: entry.module,
        abbreviation: moduleDef.abbreviation,
        label: moduleDef.title,
        pages: [],
      } satisfies SupportModuleOption)

    const pageLabel = cleanPageLabel(entry.label)
    if (!existing.pages.some((page) => page.id === entry.key)) {
      existing.pages.push({
        id: entry.key,
        label: pageLabel,
        path: entry.path,
      })
    }

    grouped.set(entry.module, existing)
  })

  grouped.forEach((moduleOption) => {
    moduleOption.pages.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    if (!moduleOption.pages.some((page) => page.id.endsWith('-other'))) {
      moduleOption.pages.push({
        id: `${moduleOption.id}-other`,
        label: 'Other / General',
        path: '',
      })
    }
  })

  const platformPages = PLATFORM_PAGES.filter(
    (page) => !page.path || isFeatureEnabledForPath(page.path, toggles)
  )
  if (platformPages.length > 0) {
    grouped.set('platform', {
      id: 'platform',
      abbreviation: 'CORE',
      label: 'Account & Platform',
      pages: platformPages,
    })
  }

  const order = MODULE_REGISTRY.map((mod) => mod.id)
  return Array.from(grouped.values()).sort((a, b) => {
    const aIndex = order.indexOf(a.id as ModuleId)
    const bIndex = order.indexOf(b.id as ModuleId)
    if (a.id === 'platform') return 1
    if (b.id === 'platform') return -1
    if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

export const findSupportSelectionFromPath = (
  pathname: string,
  toggles: TenantFeatureToggles
): { moduleId: string; pageId: string } | null => {
  const modules = getSupportModules(toggles)
  for (const moduleOption of modules) {
    const matchedPage = moduleOption.pages.find(
      (page) => page.path && (pathname === page.path || pathname.startsWith(`${page.path}/`))
    )
    if (matchedPage) {
      return { moduleId: moduleOption.id, pageId: matchedPage.id }
    }
  }
  return null
}
