import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, ClipboardCheck, FileText, IndianRupee, Repeat, UserCheck, Wand2 } from 'lucide-react'
import { selectUser } from '@/redux/slices/authSlice'
import { usePermissions } from '@/hooks/usePermissions'
import {
  getAccessibleModules,
  getFeaturePermission,
  getFirstEnabledPathForModule,
  isCoreAllowedPath,
  isFeatureEnabledForPath,
} from '@/constants/featureAccess'
import { MODULE_REGISTRY } from '@/constants/moduleRegistry'
import { navIconFor } from '@/components/layout/navIcons'
import type { SearchRecordType } from '@/services/searchService'
import { PAGE_INDEX } from './pageIndex'

export type LocalEntry = {
  id: string
  kind: 'page' | 'module' | 'action'
  title: string
  subtitle?: string
  keywords?: string
  path: string
  module?: string
  icon?: LucideIcon
  image?: string
  /** Actions that do more than navigate, e.g. switching the academic session. */
  run?: 'switch-session'
}

export type RecordFilter = { type: SearchRecordType; label: string }

const MODULE_BY_ID = new Map(MODULE_REGISTRY.map((module) => [module.id as string, module]))

const moduleLabel = (module: string) => (module === 'core' ? '' : MODULE_BY_ID.get(module)?.abbreviation ?? module.toUpperCase())

const QUICK_ACTIONS: Array<Omit<LocalEntry, 'id' | 'kind'>> = [
  { title: 'Collect fee', path: '/cpitl/collection', icon: IndianRupee, keywords: 'payment receipt pay fees' },
  { title: 'Mark staff attendance', path: '/attnd/staff-attendance', icon: UserCheck, keywords: 'present absent' },
  { title: 'Mark student attendance', path: '/attnd/student-attendance', icon: ClipboardCheck, keywords: 'present absent' },
  { title: 'Generate timetable', path: '/time-table/generate', icon: Wand2, keywords: 'build create' },
  { title: 'Arrange substitution', path: '/time-table/substitution', icon: Repeat, keywords: 'proxy absent teacher' },
  { title: 'Switch academic session', path: '/select-session', icon: CalendarClock, keywords: 'year session change', run: 'switch-session' },
]

// Mirrors server/src/modules/search/providers.js `enabled` gates (the server enforces the same permissions).
const RECORD_FILTERS: Array<RecordFilter & { features: string[] }> = [
  { type: 'student', label: 'Students', features: ['stdnt_students', 'cpitl_fees'] },
  { type: 'staff', label: 'Staff', features: ['staaf_staff_members', 'exam_functionaries'] },
  { type: 'receipt', label: 'Receipts', features: ['cpitl_fees'] },
  { type: 'asset', label: 'Assets', features: ['asets_dashboard'] },
  { type: 'subject', label: 'Subjects', features: ['stdnt_subjects', 'subjects'] },
  { type: 'room', label: 'Rooms', features: ['examrooms'] },
  { type: 'alumni', label: 'Alumni', features: ['almni_directory'] },
  { type: 'candidate', label: 'Candidates', features: ['candidates'] },
]

export const useLocalIndex = () => {
  const user = useSelector(selectUser)
  const { access } = usePermissions()
  const toggles = user?.featureToggles
  const coreOnly = user?.billing?.accessMode === 'core_only'

  return useMemo(() => {
    const accessibleModules = getAccessibleModules(access)
    const isAllowed = (path: string, module?: string) =>
      isFeatureEnabledForPath(path, access)
      && (!module || module === 'core' || accessibleModules.has(module))
      && (!coreOnly || isCoreAllowedPath(path))

    const pages: LocalEntry[] = PAGE_INDEX.filter((page) => isAllowed(page.path, page.module)).map((page) => {
      const module = moduleLabel(page.module)
      return {
        id: `page:${page.path}`,
        kind: 'page',
        title: page.title,
        subtitle: [module, page.section].filter(Boolean).join(' · '),
        keywords: [page.keywords, page.section, module, MODULE_BY_ID.get(page.module)?.title].filter(Boolean).join(' '),
        path: page.path,
        module: page.module,
        icon: navIconFor(page.title, page.path) ?? FileText,
      }
    })

    const modules: LocalEntry[] = coreOnly
      ? []
      : MODULE_REGISTRY.filter((module) => accessibleModules.has(module.id)).map((module) => ({
          id: `module:${module.id}`,
          kind: 'module',
          title: `${module.abbreviation} — ${module.title}`,
          subtitle: 'Switch module',
          keywords: `module app ${module.id}`,
          path: getFirstEnabledPathForModule(module.id, access) || module.defaultRoute,
          module: module.id,
          image: module.icon,
        }))

    const actions: LocalEntry[] = QUICK_ACTIONS.filter((action) => action.run || isAllowed(action.path)).map((action) => ({
      ...action,
      id: `action:${action.title}`,
      kind: 'action',
      subtitle: 'Quick action',
    }))

    const featureOpen = (key: string) => {
      const permission = getFeaturePermission(key)
      return toggles?.[key] !== false && (!permission || Boolean(access.can?.(permission)))
    }
    const recordFilters: RecordFilter[] = RECORD_FILTERS.filter(
      (filter) => !coreOnly && filter.features.some(featureOpen)
    ).map(({ type, label }) => ({ type, label }))

    const pageByPath = new Map(pages.map((page) => [page.path, page]))

    return { pages, modules, actions, entries: [...pages, ...actions, ...modules], recordFilters, pageByPath }
  }, [access, toggles, coreOnly])
}
