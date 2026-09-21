import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useQueryClient } from '@tanstack/react-query'
import { logout, selectUser } from '../../redux/slices/authSlice'
import type { AppDispatch } from '../../redux/store'
import { useAcademicSession } from '../../contexts/AcademicSessionContext'
import { isFeatureEnabledForPath, getModuleForPath, getAccessibleModules, getFirstEnabledPathForModule } from '../../constants/featureAccess'
import { MODULE_REGISTRY, type ModuleId } from '../../constants/moduleRegistry'
import { PartyPopper } from 'lucide-react'
import { useCentreDetails } from '../../hooks/useCentreDetails'
import logoMark from '../../assets/image.png'
import {
  useSidebarCounts,
  sidebarKeys,
  type SidebarCount,
} from '../../hooks/useSidebarCounts'
import { useSchoolProfile } from '../../hooks/useSchoolProfile'
import { useLogoBrandTheme } from '../../hooks/useLogoBrandTheme'

const EMPTY_COUNTS = {
  examFunctionaries: null,
  candidates: null,
  subjects: null,
  answerSheets: null,
  datesheetDays: null,
  rooms: null,
} as const

const toBadgeValue = (value: SidebarCount): string | null => {
  if (value === null || value <= 0) {
    return null
  }
  return value.toString()
}

type SidebarProps = {
  isCollapsed: boolean
  expandedWidth: number
  collapsedWidth: number
  fitToContent?: boolean
  onContentWidthChange?: (width: number) => void
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  expandedWidth,
  collapsedWidth,
  fitToContent = false,
  onContentWidthChange,
}) => {
  const dispatch = useDispatch<AppDispatch>()
  const queryClient = useQueryClient()
  const currentUser = useSelector(selectUser)
  const location = useLocation()
  const navigate = useNavigate()
  const { currentSession, clearSession } = useAcademicSession()
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // Tracks expand/collapse state for group headers + nested sub-groups.
  // "Ungroup all" -> we expand everything based on accessible navigation.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const isPathAllowed = (href: string) => isFeatureEnabledForPath(href, currentUser?.featureToggles)
  const canAccessCentreDetails = isPathAllowed('/centre-details')

  const sidebarCountsAccess = useMemo(
    () => ({
      examFunctionaries: isPathAllowed('/exam-functionaries'),
      candidates: isPathAllowed('/candidate-details'),
      subjects: isPathAllowed('/subjects'),
      answerSheets: isPathAllowed('/answersheets'),
      datesheetDays: isPathAllowed('/datesheets'),
      rooms: isPathAllowed('/examrooms'),
    }),
    [currentUser?.featureToggles]
  )

  const { data: countsData } = useSidebarCounts(sidebarCountsAccess)
  const counts = countsData ?? EMPTY_COUNTS
  const { data: centreDetails } = useCentreDetails({
    enabled: canAccessCentreDetails,
  })
  const { data: schoolProfile } = useSchoolProfile(Boolean(currentUser))

  const schoolCode = String(centreDetails?.centreSchoolCode || '').trim()
  const centreName = String(centreDetails?.centreName || '').trim()
  const profileAffiliationNo = String(schoolProfile?.affiliationNo || '').trim()
  const profileSchoolCode = String(schoolProfile?.schoolCode || '').trim()
  const profileSchoolName = String(schoolProfile?.name || '').trim()
  const schoolLogoUrl = String(schoolProfile?.logoUrl || '').trim()
  const logoBrandTheme = useLogoBrandTheme(schoolLogoUrl)
  const hasLogoBrandMenu = Boolean(logoBrandTheme && schoolLogoUrl)

  const schoolDisplayName = profileSchoolName || centreName || currentUser?.role || 'School'
  const affiliationDisplay = profileAffiliationNo || '—'
  const cbseCodeDisplay = profileSchoolCode || schoolCode || '—'
  const footerFallbackInitial = (schoolDisplayName || currentUser?.email || 'A').charAt(0).toUpperCase()

  // Module switcher state
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false)
  const [selectedModule, setSelectedModule] = useState<ModuleId>('cntr')

  // Sync active module from URL when navigating to a module-specific route
  useEffect(() => {
    const mod = getModuleForPath(location.pathname)
    if (mod && mod !== 'core') {
      setSelectedModule(mod as ModuleId)
    }
  }, [location.pathname])

  const activeModule = selectedModule
  const isStdntNav = activeModule === 'stdnt'

  const renderSchoolLogoAvatar = (
    sizeClass = 'w-10 h-10',
    roundedClass = 'rounded-xl',
    onBrandBackground = false
  ) => {
    if (schoolLogoUrl) {
      return (
        <div
          className={`${sizeClass} flex-shrink-0 overflow-hidden ${roundedClass} ${
            onBrandBackground
              ? 'bg-white/95 shadow-sm ring-1 ring-white/70'
              : 'bg-white shadow-md ring-1 ring-black/5'
          }`}
        >
          <img src={schoolLogoUrl} alt="School logo" className="h-full w-full object-contain p-0.5" />
        </div>
      )
    }

    return (
      <div
        className={`${sizeClass} flex-shrink-0 ${roundedClass} flex items-center justify-center shadow-md transition-all ${
          isStdntNav
            ? 'bg-gradient-to-br from-[#7b61ff] to-[#a855f7] shadow-violet-500/20'
            : 'bg-gradient-to-br from-primary-500 to-indigo-600 shadow-primary-500/10 ring-2 ring-white dark:ring-secondary-800 group-hover:ring-primary-100 dark:group-hover:ring-primary-900/30'
        }`}
      >
        <span className="text-sm font-bold text-white">{footerFallbackInitial}</span>
      </div>
    )
  }

  const accessibleModules = useMemo(
    () => getAccessibleModules(currentUser?.featureToggles),
    [currentUser?.featureToggles]
  )

  const activeModuleDef = MODULE_REGISTRY.find(m => m.id === activeModule)!
  const hasMultipleModules = accessibleModules.size > 1

  // Refresh counts when location changes (user navigates)
  useEffect(() => {
    // Refresh counts after a delay when navigating to relevant pages
    const relevantPaths = ['/candidate-details', '/subjects', '/exam-functionaries', '/duties', '/answersheets', '/datesheets', '/examrooms']
    if (relevantPaths.some(path => location.pathname.includes(path))) {
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [location.pathname, queryClient])

  const handleLogout = () => {
    dispatch(logout())
  }

  const handleSwitchSession = () => {
    clearSession()
    navigate('/select-session')
  }

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))
  }

  // Navigation item type definitions
  type NavItem = {
    name: string
    href: string
    icon: React.ReactNode
    badge: string | null
    module?: string
  }

  type NavGroup = {
    name: string
    icon: React.ReactNode
    href?: string // optional link for the group header itself
    children: NavChild[]
    module?: string
  }

  type NavChild = NavItem | NavSubGroup

  type NavSubGroup = {
    name: string
    icon: React.ReactNode
    children: NavItem[]
  }

  type NavEntry = NavItem | NavGroup

  const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry
  const isSubGroup = (entry: NavChild): entry is NavSubGroup => 'children' in entry

  const navigation: NavEntry[] = [
    {
      name: 'School Hub',
      href: '/school-hub',
      module: 'timetable',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
      children: [
        {
          name: 'Time Table',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          ),
          children: [
            {
              name: 'Teachers',
              href: '/time-table/teachers',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Classes',
              href: '/time-table/classes',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Subjects',
              href: '/time-table/subjects',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Period Distribution',
              href: '/time-table/period-distribution',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Departments',
              href: '/time-table/departments',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 7.5A2.25 2.25 0 016 5.25h3A2.25 2.25 0 0111.25 7.5v3A2.25 2.25 0 019 12.75H6a2.25 2.25 0 01-2.25-2.25v-3zM12.75 7.5A2.25 2.25 0 0115 5.25h3A2.25 2.25 0 0120.25 7.5v3A2.25 2.25 0 0118 12.75h-3a2.25 2.25 0 01-2.25-2.25v-3zM3.75 15A2.25 2.25 0 016 12.75h3A2.25 2.25 0 0111.25 15v3A2.25 2.25 0 019 20.25H6A2.25 2.25 0 013.75 18v-3zM12.75 15A2.25 2.25 0 0115 12.75h3A2.25 2.25 0 0120.25 15v3A2.25 2.25 0 0118 20.25h-3A2.25 2.25 0 0112.75 18v-3z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Bell Timings',
              href: '/time-table/bell-timings',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Generate',
              href: '/time-table/generate',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Class Wise',
              href: '/time-table/class-wise',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Teacher Wise',
              href: '/time-table/teacher-wise',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Substitution',
              href: '/time-table/substitution',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992V4.356m-1.636 11.288A9 9 0 1119.5 10.5l1.515-1.152" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Versions',
              href: '/time-table/versions',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3.75h8.25L19.5 8.25v12A1.5 1.5 0 0118 21.75H6.75a1.5 1.5 0 01-1.5-1.5v-15a1.5 1.5 0 011.5-1.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3.75v4.5h4.5M8.25 12h7.5M8.25 15.75h7.5" />
                </svg>
              ),
              badge: null,
            },
            {
              name: 'Formats',
              href: '/time-table/formats',
              icon: (
                <svg className="w-3.5 h-3.5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 7.5A1.5 1.5 0 015.25 6h13.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 10.5h9M7.5 13.5h5.25" />
                </svg>
              ),
              badge: null,
            },
          ],
        },
      ],
    },
    {
      name: 'Stdntboard',
      href: '/stdnt/stdntboard',
      module: 'stdnt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Students',
      href: '/stdnt/students',
      module: 'stdnt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Classes',
      href: '/stdnt/classes',
      module: 'stdnt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Subjects',
      href: '/stdnt/subjects',
      module: 'stdnt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Alumni Directory',
      href: '/stdnt/alumni',
      module: 'stdnt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.905 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Overview',
      href: '/staaf/overview',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Organisation Structure',
      href: '/staaf/organisation-structure',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 6.75h9M12 6.75v4.5m-6 0h12M6 11.25v3.75m12-3.75v3.75M3.75 15h4.5v3.75h-4.5V15zm6 0h4.5v3.75h-4.5V15zm6 0h4.5v3.75h-4.5V15z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Teaching Staff',
      href: '/staaf/teaching-staff',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Sports Coach',
      href: '/staaf/sports-coach',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3.75a2.25 2.25 0 110 4.5 2.25 2.25 0 010-4.5zM8.25 10.5h7.5M9 10.5L7.5 20.25M15 10.5l1.5 9.75M6.75 14.25h10.5" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Admin Staff',
      href: '/staaf/admin-staff',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Drivers',
      href: '/staaf/drivers',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21m-3.375 0h-1.5M4.5 14.25l1.318-6.588A2.25 2.25 0 017.993 6h8.014a2.25 2.25 0 012.175 1.662L19.5 14.25M4.5 14.25h15" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Conductors',
      href: '/staaf/conductors',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Security',
      href: '/staaf/security',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 5h9l1 1.75H6.5L7.5 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 8.25a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 20.25v-1.5A4.5 4.5 0 0110.5 14.25h3A4.5 4.5 0 0118 18.75v1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11.5v2.25" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.75 14.25h2.5" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Recruitment',
      href: '/staaf/recruitment',
      module: 'staaf',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Attndboard',
      href: '/attnd/attndboard',
      module: 'attnd',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Staff Attendance',
      href: '/attnd/staff-attendance',
      module: 'attnd',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Lesson Plan',
      href: '/acdmc/lesson-plan',
      module: 'acdmc',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25A8.966 8.966 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Homework',
      href: '/acdmc/homework',
      module: 'acdmc',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Assignment',
      href: '/acdmc/assignment',
      module: 'acdmc',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Quiz',
      href: '/acdmc/quiz',
      module: 'acdmc',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Curriculum',
      href: '/acdmc/curriculum',
      module: 'acdmc',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V6.5A2.5 2.5 0 016.5 4H20v13H6.5A2.5 2.5 0 004 19.5z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Activity Board',
      href: '/actvt/board',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Houses',
      href: '/actvt/houses',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Student Council',
      href: '/actvt/student-council',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l2.2 4.45 4.91.71-3.55 3.46.84 4.9L12 15.77l-4.4 2.31.84-4.9L4.89 9.16l4.91-.71L12 4z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Clubs',
      href: '/actvt/clubs',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Tours & Trips',
      href: '/actvt/tours',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0h.5A2.5 2.5 0 0020 5.5V3.935M3.055 11A9 9 0 1021 12H3.055z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Sports',
      href: '/actvt/sports',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="13.5" cy="4.2" r="2" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 8.5l-1.8 4.2-4.7 1" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.2 12.7L6.8 21" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.2 12.7l3.5 2 3.8 6.1" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 8.5l4.2 1.6 2.4-3.6" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Functions',
      href: '/actvt/functions',
      module: 'actvt',
      icon: (
        <PartyPopper className="w-5 h-5 transition-colors duration-200" />
      ),
      badge: null,
    },
    {
      name: 'House Ranking',
      href: '/actvt/ranking',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM5 8H3v2a3 3 0 003 3h1M19 8h2v2a3 3 0 01-3 3h-1" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Certificates',
      href: '/actvt/certificates',
      module: 'actvt',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 4h10a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zm5 13v4l-2-1-2 1v-4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Medical Cases',
      href: '/mdcl/cases',
      module: 'mdcl',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-3-3v6" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Medical Supplies',
      href: '/mdcl/supplies',
      module: 'mdcl',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Asset Overview',
      href: '/asets/dashboard',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zm10-18v6h8V3h-8z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'All Assets',
      href: '/asets/assets',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Categories',
      href: '/asets/categories',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Locations',
      href: '/asets/locations',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Allocations',
      href: '/asets/allocations',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Transfers',
      href: '/asets/transfers',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Maintenance',
      href: '/asets/maintenance',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Stock / Store',
      href: '/asets/stock',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Audits',
      href: '/asets/audits',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Vendors',
      href: '/asets/vendors',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Procurement',
      href: '/asets/procurement',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Disposal',
      href: '/asets/disposals',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Reports',
      href: '/asets/reports',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'ASETS Settings',
      href: '/asets/settings',
      module: 'asets',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Transport',
      href: '/trnst',
      module: 'trnst',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17a2 2 0 104 0 2 2 0 00-4 0zm8 0a2 2 0 104 0 2 2 0 00-4 0zM3 9h13l3 4v4h-2M3 9v8h2M3 9l2-3h8l2 3" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Vehicles',
      href: '/trnst/vehicles',
      module: 'trnst',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v-5l2-4h9l3 4v5M6 16a2 2 0 104 0 2 2 0 00-4 0zm8 0a2 2 0 104 0 2 2 0 00-4 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Self Students',
      href: '/trnst/self-students',
      module: 'trnst',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Routes',
      href: '/trnst/routes',
      module: 'trnst',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Student Attendance',
      href: '/attnd/student-attendance',
      module: 'attnd',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Dashboard',
      href: '/dashboard',
      module: 'cntr',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Centre Details',
      module: 'cntr',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6" />
        </svg>
      ),
      children: [
        {
          name: 'Centre Info',
          href: '/centre-details',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Exam Functionaries',
          href: '/exam-functionaries',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
          badge: toBadgeValue(counts.examFunctionaries),
        },
      ],
    },
    {
      name: 'Centre Details',
      module: 'exmcl',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6" />
        </svg>
      ),
      children: [
        {
          name: 'Centre Info',
          href: '/exmcl/centre-details',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Exam Functionaries',
          href: '/exmcl/exam-functionaries',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
          badge: null,
        },
      ],
    },
    {
      name: 'Centre Records',
      module: 'cntr',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      children: [
        {
          name: 'Centre Guidelines',
          href: '/centre-guidelines',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'CBSE Circulars',
          href: '/cbse-circulars',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-4H5m14 8H8m-3 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'CBSE Portals',
          href: '/cbse-portals',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7m0 0v7m0-7L10 14" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5v14h14" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Subjects',
          href: '/subjects',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          ),
          badge: toBadgeValue(counts.subjects),
        },
        {
          name: 'Undertaking Form',
          href: '/undertaking',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Datesheets',
          href: '/datesheets',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
          badge: toBadgeValue(counts.datesheetDays),
        },
        {
          name: 'Form 66',
          href: '/form66',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Exam Room/Hall',
          href: '/examrooms',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ),
          badge: toBadgeValue(counts.rooms),
        },
        {
          name: 'Answer Sheets',
          href: '/answersheets',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          badge: toBadgeValue(counts.answerSheets),
        },
        {
          name: 'Seating Plan',
          href: '/seatingplan',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Duties',
          href: '/duties',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2m-6 9l2 2 4-4" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Attendance',
          href: '/attendance',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'PwD Info',
          href: '/pwd-info',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.75A2.25 2.25 0 0015.75 21h-7.5A2.25 2.25 0 006 18.75V8.25A2.25 2.25 0 018.25 6h7.5A2.25 2.25 0 0118 8.25v10.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9.75a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-2.25 9v-2.25a2.25 2.25 0 114.5 0v2.25" />
            </svg>
          ),
          badge: null,
        },
        {
          name: "UMC's",
          href: '/umcs',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 3.86l-7.5 13A1.5 1.5 0 004.08 19.5h15.84a1.5 1.5 0 001.29-2.64l-7.5-13a1.5 1.5 0 00-2.58 0z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Stickers',
          href: '/stickers',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 6.75h9m-9 5.25h9m-9 5.25h4.5" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 3.75h13.5A2.25 2.25 0 0121 6v12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: "Performa's",
          href: '/performas',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-3-8h3m-9 13h10.5A2.25 2.25 0 0019.5 18.75V8.121a2.25 2.25 0 00-.659-1.591l-2.371-2.371a2.25 2.25 0 00-1.591-.659H9A2.25 2.25 0 006.75 5.75v13A2.25 2.25 0 009 21z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Candidate Details',
          href: '/candidate-details',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
          badge: toBadgeValue(counts.candidates),
        },
        {
          name: 'Dispatch Slip',
          href: '/dispatch-slip',
          icon: (
            <svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          ),
          badge: null,
        },
        {
          name: 'Remuneration',
          href: '/remuneration',
          icon: (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[13px] font-semibold leading-none">
              ₹
            </span>
          ),
          badge: null,
        },
      ],
    },
    {
      name: 'Centre Records',
      module: 'exmcl',
      icon: (
        <svg className="w-5 h-5 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      children: [
        { name: 'Circulars', href: '/exmcl/centre-guidelines', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>), badge: null },
        { name: 'Admit Cards', href: '/exmcl/admit-cards', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>), badge: null },
        { name: 'Exams', href: '/exmcl/exams', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 6.75h7.5m-7.5 4.5h7.5m-7.5 4.5h4.5M6 3.75h12A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75z" /></svg>), badge: null },
        { name: 'Result', href: '/exmcl/result', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m5 5H4" /></svg>), badge: null },
        { name: 'Report Card', href: '/exmcl/report-card', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-6-8h6m2 13H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" /></svg>), badge: null },
        { name: 'Award List', href: '/exmcl/award-list', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 21h7.5M12 17.25V21m-5.25-9A5.25 5.25 0 0112 6.75 5.25 5.25 0 0117.25 12 5.25 5.25 0 0112 17.25 5.25 5.25 0 016.75 12z" /></svg>), badge: null },
        { name: 'Question Papers', href: '/exmcl/question-papers', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-8.25a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6v12a2.25 2.25 0 002.25 2.25h6.75M14.25 8.25h-4.5m4.5 3h-4.5m3 7.5l2.25 2.25 4.5-4.5" /></svg>), badge: null },
        { name: 'Syllabus', href: '/exmcl/syllabus', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>), badge: null },
        { name: 'Marks Distribution', href: '/exmcl/marks-distribution', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75h16.5v16.5H3.75zM8.25 12h7.5M12 8.25v7.5" /></svg>), badge: null },
        { name: 'Subjects', href: '/exmcl/subjects', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>), badge: null },
        { name: 'Datesheets', href: '/exmcl/datesheets', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>), badge: null },
        { name: 'Exam Room/Hall', href: '/exmcl/examrooms', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>), badge: null },
        { name: 'Answer Sheets', href: '/exmcl/answersheets', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>), badge: null },
        { name: 'Seating Plan', href: '/exmcl/seatingplan', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>), badge: null },
        { name: 'Duties', href: '/exmcl/duties', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2m-6 9l2 2 4-4" /></svg>), badge: null },
        { name: 'Attendance', href: '/exmcl/attendance', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>), badge: null },
        { name: 'Formats', href: '/exmcl/performas', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m-3-8h3m-9 13h10.5A2.25 2.25 0 0019.5 18.75V8.121a2.25 2.25 0 00-.659-1.591l-2.371-2.371a2.25 2.25 0 00-1.591-.659H9A2.25 2.25 0 006.75 5.75v13A2.25 2.25 0 009 21z" /></svg>), badge: null },
        { name: 'Candidate Details', href: '/exmcl/candidate-details', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>), badge: null },
        { name: 'CBSE Registration', href: '/exmcl/cbse-registration', icon: (<svg className="w-4 h-4 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM9 9h.01" /></svg>), badge: null },
      ],
    },
  ]

  const filterNavChildren = (children: NavChild[]): NavChild[] => {
    const filtered: NavChild[] = []

    children.forEach((child) => {
      if (isSubGroup(child)) {
        const grandChildren = child.children.filter((item) => isPathAllowed(item.href))
        if (grandChildren.length > 0) {
          filtered.push({
            ...child,
            children: grandChildren,
          })
        }
        return
      }

      if (isPathAllowed(child.href)) {
        filtered.push(child)
      }
    })

    return filtered
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredNavigation: NavEntry[] = useMemo(() => navigation.reduce<NavEntry[]>((acc, entry) => {
    // Filter by active module: skip entries that don't belong to the active module or core
    const entryModule = isGroup(entry) ? entry.module : (entry as NavItem).module
    if (entryModule && entryModule !== 'core' && entryModule !== activeModule) {
      return acc
    }

    if (isGroup(entry)) {
      // Flatten specific groups into independent top-level items.
      // This removes the group accordion wrappers and promotes children to top-level.
      if (entry.name === 'Centre Details' || entry.name === 'Centre Records' || entry.name === 'School Hub') {
        entry.children.forEach((child) => {
          if (isSubGroup(child)) {
            child.children.forEach((grandChild) => {
              if (isPathAllowed(grandChild.href)) acc.push(grandChild)
            })
            return
          }
          if (isPathAllowed(child.href)) acc.push(child)
        })
        return acc
      }

      const filteredChildren = filterNavChildren(entry.children)
      const groupHrefAllowed = entry.href ? isPathAllowed(entry.href) : false

      // If the group has a gating href and it's not allowed, hide the entire group
      // (even if individual children would otherwise pass their own feature checks)
      if (entry.href && !groupHrefAllowed) {
        return acc
      }

      if (filteredChildren.length === 0 && !groupHrefAllowed) {
        return acc
      }

      acc.push({
        ...entry,
        href: groupHrefAllowed ? entry.href : undefined,
        children: filteredChildren,
      })

      return acc
    }

    if (isPathAllowed(entry.href)) {
      acc.push(entry)
    }

    return acc
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []), [activeModule, currentUser?.featureToggles, counts])

  // Expand all groups/sub-groups once accessible navigation is resolved.
  useEffect(() => {
    const next: Record<string, boolean> = {}

    filteredNavigation.forEach((entry) => {
      if (!isGroup(entry)) return

      next[entry.name] = true
      entry.children.forEach((child) => {
        if (isSubGroup(child)) {
          next[`${entry.name}/${child.name}`] = true
        }
      })
    })

    setOpenGroups(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNavigation])

  const canAccessBilling = isPathAllowed('/billing')
  const canAccessAccountSettings = isPathAllowed('/account-settings')
  const canAccessHelpSupport = isPathAllowed('/help-support')
  const currentSidebarWidth = isCollapsed ? collapsedWidth : expandedWidth

  useLayoutEffect(() => {
    if (!fitToContent || isCollapsed || !onContentWidthChange) return
    const root = rootRef.current
    if (!root) return

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>('nav, [data-sidebar-fit]')
    )
    if (sections.length === 0) return

    const truncated = Array.from(
      root.querySelectorAll<HTMLElement>('nav .truncate, [data-sidebar-fit] .truncate')
    )
    truncated.forEach((el) => {
      el.dataset.prevOverflow = el.style.overflow
      el.dataset.prevTextOverflow = el.style.textOverflow
      el.dataset.prevWhiteSpace = el.style.whiteSpace
      el.style.overflow = 'visible'
      el.style.textOverflow = 'clip'
      el.style.whiteSpace = 'nowrap'
    })

    let measured = 0
    sections.forEach((section) => {
      const previousWidth = section.style.width
      const previousMaxWidth = section.style.maxWidth
      section.style.width = 'max-content'
      section.style.maxWidth = 'none'
      measured = Math.max(measured, Math.ceil(section.getBoundingClientRect().width))
      section.style.width = previousWidth
      section.style.maxWidth = previousMaxWidth
    })

    truncated.forEach((el) => {
      el.style.overflow = el.dataset.prevOverflow || ''
      el.style.textOverflow = el.dataset.prevTextOverflow || ''
      el.style.whiteSpace = el.dataset.prevWhiteSpace || ''
      delete el.dataset.prevOverflow
      delete el.dataset.prevTextOverflow
      delete el.dataset.prevWhiteSpace
    })

    // Include sidebar border so content does not sit flush against the resize edge.
    if (measured > 0) {
      onContentWidthChange(measured + 2)
    }
  }, [
    fitToContent,
    isCollapsed,
    onContentWidthChange,
    filteredNavigation,
    activeModule,
    openGroups,
  ])

  const stdntItemClass = (isActive: boolean, collapsed: boolean) =>
    `group relative flex items-center text-[13px] font-medium rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
      collapsed ? 'justify-center w-11 h-11 p-0' : 'px-3 py-2.5'
    } ${
      isActive
        ? 'bg-gradient-to-r from-[#7b61ff] to-[#a855f7] text-white shadow-lg shadow-violet-500/25'
        : 'text-white/80 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div
      ref={rootRef}
      className={`h-[100vh] min-h-[100vh] transition-all duration-300 flex flex-col overflow-visible relative z-50 ${
        isStdntNav
          ? 'border-r border-white/10 bg-gradient-to-b from-[#1e3a8a] via-[#172554] to-[#0f172a] text-white'
          : 'bg-white dark:bg-secondary-900 border-r border-secondary-200 dark:border-secondary-700'
      }`}
      style={{ width: currentSidebarWidth }}
    >
      {/* Module Switcher Header */}
      <div className={`flex-shrink-0 transition-all duration-300 ${isCollapsed ? 'px-2 py-4' : 'px-4 py-4'} relative z-10`} data-sidebar-fit>
        <div className="relative">
          <div
            aria-hidden
            className={`pointer-events-none absolute -inset-1.5 ${
              isStdntNav
                ? 'rounded-[14px] bg-white/20 shadow-[0_8px_24px_rgba(255,255,255,0.16)]'
                : 'rounded-[14px] bg-sky-100/80 shadow-[0_8px_22px_rgba(56,189,248,0.22)]'
            }`}
          />
          <button
            onClick={() => hasMultipleModules && setModuleSwitcherOpen(!moduleSwitcherOpen)}
            className={`relative w-full flex items-center rounded-xl transition-all duration-200 group outline-none focus-visible:ring-2 ${isStdntNav ? 'bg-[#1e3a8a]/35 ring-1 ring-white/25 focus-visible:ring-violet-400' : 'bg-white ring-1 ring-secondary-200/80 focus-visible:ring-primary-500'} ${isCollapsed ? 'justify-center p-2' : 'px-3 py-3'} ${hasMultipleModules ? (isStdntNav ? 'hover:bg-white/10 cursor-pointer' : 'hover:bg-white hover:shadow-sm cursor-pointer') : 'cursor-default'} ${moduleSwitcherOpen ? (isStdntNav ? 'bg-white/10' : 'bg-white/80 dark:bg-secondary-800/60 shadow-sm') : ''}`}
          >
            <div className={`relative flex-shrink-0 transition-transform duration-300 ${isCollapsed ? 'scale-85' : 'scale-95'}`}>
              <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                <img
                  src={activeModuleDef.icon || logoMark}
                  alt={activeModuleDef.title}
                  className="h-12 w-12 rounded-xl object-cover"
                />
              </div>
            </div>
            {!isCollapsed && (
              <>
                <div className="min-w-0 flex flex-col justify-center ml-3 text-left">
                  <h2 className={`text-[1.5rem] font-black leading-none tracking-tight ${isStdntNav ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                    {activeModuleDef.abbreviation}
                  </h2>
                  <p className={`mt-0.5 text-[11px] font-semibold leading-tight tracking-tight truncate ${isStdntNav ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
                    {activeModuleDef.title}
                  </p>
                </div>
                {hasMultipleModules && (
                  <svg
                    className={`ml-auto w-4 h-4 flex-shrink-0 transition-transform duration-200 ${moduleSwitcherOpen ? 'rotate-180' : ''} ${isStdntNav ? 'text-white/50' : 'text-secondary-400 dark:text-secondary-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </>
            )}
          </button>

          {/* Module Switcher Dropdown */}
          {moduleSwitcherOpen && (
            <>
              {/* In-sidebar overlay */}
              <div
                className="fixed top-0 bottom-0 left-0 z-40"
                style={{ width: currentSidebarWidth }}
                onClick={() => setModuleSwitcherOpen(false)}
                aria-hidden="true"
              />
              <div className={`absolute z-50 bg-white dark:bg-secondary-900 rounded-2xl shadow-hard border border-secondary-100 dark:border-secondary-700 animate-fade-in-up ring-1 ring-black/5 overflow-hidden ${isCollapsed ? 'left-full ml-3 top-0 w-64' : 'top-full left-0 right-0 mt-2'}`}>
                <div className="px-3 pt-3 pb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-secondary-400 dark:text-secondary-500 px-1">
                    Switch Module
                  </p>
                </div>
                <div className="px-2 pb-2 space-y-0.5">
                  {MODULE_REGISTRY
                    .filter(m => accessibleModules.has(m.id))
                    .map(mod => {
                      const isActive = mod.id === activeModule
                      return (
                        <button
                          key={mod.id}
                          onClick={() => {
                            setModuleSwitcherOpen(false)
                            if (!isActive) {
                              const targetPath = getFirstEnabledPathForModule(mod.id, currentUser?.featureToggles) || mod.defaultRoute
                              setSelectedModule(mod.id)
                              navigate(targetPath)
                            }
                          }}
                          className={`w-full flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 text-left ${isActive
                            ? 'bg-primary-50 dark:bg-primary-900/20'
                            : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/50'
                          }`}
                        >
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-secondary-200 dark:bg-secondary-800 dark:ring-secondary-700">
                            <img
                              src={mod.icon}
                              alt=""
                              className="h-9 w-9 rounded-lg object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1 ml-3">
                            <p className={`text-sm font-semibold truncate ${isActive ? 'text-primary-700 dark:text-primary-400' : 'text-secondary-900 dark:text-white'}`}>
                              {mod.abbreviation}
                            </p>
                            <p className="text-[11px] text-secondary-500 dark:text-secondary-400 truncate">
                              {mod.title}
                            </p>
                          </div>
                          {isActive && (
                            <div className="ml-2 w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation - scrollable */}
      <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'px-3 [&_svg]:w-4.5 [&_svg]:h-4.5' : 'px-3'} py-2`}>
        <div className={`space-y-1 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {filteredNavigation.map((entry) => {
            if (isGroup(entry)) {
              const group = entry
              // Check if any child (or sub-group grandchild) is active
              const isChildActive = group.children.some(child => {
                if (isSubGroup(child)) {
                  return child.children.some(gc => location.pathname === gc.href)
                }
                return location.pathname === child.href
              })
              // Also check if the group's own href matches
              const isGroupHrefActive = group.href ? location.pathname === group.href : false
              const isAnyActive = isChildActive || isGroupHrefActive
              const isOpen = openGroups[group.name] ?? isAnyActive

              return (
                <div key={group.name}>
                  {/* Group header */}
                  <button
                    onClick={() => {
                      toggleGroup(group.name)
                      // If the group has an href and is being opened, navigate to it
                      if (group.href && !isOpen) {
                        navigate(group.href)
                      }
                    }}
                    className={`group relative flex items-center w-full text-[12.5px] font-medium rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${isCollapsed
                      ? 'justify-center w-11 h-11 p-0'
                      : 'px-2.5 py-2.5'
                      } ${isAnyActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-900 dark:hover:text-secondary-200'
                      }`}
                    title={isCollapsed ? group.name : undefined}
                  >
                    {isAnyActive && !isCollapsed && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary-500 rounded-r-full" />
                    )}

                    <span className={`flex-shrink-0 transition-colors duration-200 ${isAnyActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                      }`}>
                      {group.icon}
                    </span>

                    {!isCollapsed && (
                      <>
                        <span className="ml-3.5 truncate font-medium">
                          {group.name}
                        </span>
                        <svg
                          className={`ml-auto w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${isAnyActive
                            ? 'text-primary-500 dark:text-primary-400'
                            : 'text-secondary-400 dark:text-secondary-500'
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                  </button>

                  {/* Group children */}
                  {isOpen && !isCollapsed && (
                    <div className="mt-1 ml-4 pl-3.5 border-l-2 border-secondary-100 dark:border-secondary-800 space-y-0.5">
                      {group.children.map((child) => {
                        if (isSubGroup(child)) {
                          // Render sub-group with its own expand/collapse
                          const subGroup = child
                          const isSubChildActive = subGroup.children.some(gc => location.pathname === gc.href)
                          const isSubOpen = openGroups[`${group.name}/${subGroup.name}`] ?? isSubChildActive

                          return (
                            <div key={subGroup.name}>
                              <button
                                onClick={() => toggleGroup(`${group.name}/${subGroup.name}`)}
                                className={`group relative flex items-center w-full text-[13px] font-medium rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 px-3 py-2 ${isSubChildActive
                                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                  : 'text-secondary-500 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-900 dark:hover:text-secondary-200'
                                  }`}
                              >
                                <span className={`flex-shrink-0 transition-colors duration-200 ${isSubChildActive
                                  ? 'text-primary-600 dark:text-primary-400'
                                  : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                                  }`}>
                                  {subGroup.icon}
                                </span>
                                <span className="ml-2.5 truncate">
                                  {subGroup.name}
                                </span>
                                <svg
                                  className={`ml-auto w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${isSubOpen ? 'rotate-90' : ''} ${isSubChildActive
                                    ? 'text-primary-500 dark:text-primary-400'
                                    : 'text-secondary-400 dark:text-secondary-500'
                                    }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>

                              {isSubOpen && (
                                <div className="mt-0.5 ml-3 pl-3 border-l-2 border-secondary-100 dark:border-secondary-800 space-y-0.5">
                                  {subGroup.children.map((grandChild) => {
                                    const isActive = location.pathname === grandChild.href
                                    return (
                                      <NavLink
                                        key={grandChild.name}
                                        to={grandChild.href}
                                        className={`group relative flex items-center text-[12px] font-medium rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 px-2.5 py-1.5 ${isActive
                                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                          : 'text-secondary-500 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-900 dark:hover:text-secondary-200'
                                          }`}
                                      >
                                        <span className={`flex-shrink-0 transition-colors duration-200 ${isActive
                                          ? 'text-primary-600 dark:text-primary-400'
                                          : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                                          }`}>
                                          {grandChild.icon}
                                        </span>
                                        <span className="ml-2 truncate">
                                          {grandChild.name}
                                        </span>
                                        {grandChild.badge && (
                                          <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${isActive
                                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                            : 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-400 group-hover:bg-white group-hover:shadow-sm dark:group-hover:bg-secondary-700'
                                            }`}>
                                            {grandChild.badge}
                                          </span>
                                        )}
                                      </NavLink>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        }

                        // Regular NavItem child
                        const isActive = location.pathname === child.href
                        return (
                          <NavLink
                            key={child.name}
                            to={child.href}
                            className={`group relative flex items-center text-[13px] font-medium rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 px-3 py-2 ${isActive
                              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                              : 'text-secondary-500 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-900 dark:hover:text-secondary-200'
                              }`}
                          >
                            <span className={`flex-shrink-0 transition-colors duration-200 ${isActive
                              ? 'text-primary-600 dark:text-primary-400'
                              : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                              }`}>
                              {child.icon}
                            </span>
                            <span className="ml-2.5 truncate">
                              {child.name}
                            </span>
                            {child.badge && (
                              <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${isActive
                                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                : 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-400 group-hover:bg-white group-hover:shadow-sm dark:group-hover:bg-secondary-700'
                                }`}>
                                {child.badge}
                              </span>
                            )}
                          </NavLink>
                        )
                      })}
                    </div>
                  )}

                  {/* Collapsed mode: show children icons */}
                  {isCollapsed && isOpen && (
                    <div className="mt-1 space-y-0.5 flex flex-col items-center">
                      {group.children.map((child) => {
                        if (isSubGroup(child)) {
                          // For sub-groups in collapsed mode, show sub-group children directly
                          return child.children.map((gc) => {
                            const isActive = location.pathname === gc.href
                            return (
                              <NavLink
                                key={gc.name}
                                to={gc.href}
                                className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${isActive
                                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                  : 'text-secondary-400 dark:text-secondary-500 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-600 dark:hover:text-secondary-300'
                                  }`}
                                title={gc.name}
                              >
                                {gc.icon}
                              </NavLink>
                            )
                          })
                        }

                        const isActive = location.pathname === child.href
                        return (
                          <NavLink
                            key={child.name}
                            to={child.href}
                            className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${isActive
                              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                              : 'text-secondary-400 dark:text-secondary-500 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-600 dark:hover:text-secondary-300'
                              }`}
                            title={child.name}
                          >
                            {child.icon}
                            {child.badge && (
                              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full text-[9px] font-bold bg-primary-500 text-white border-2 border-white dark:border-secondary-900 shadow-sm z-10">
                                {child.badge}
                              </span>
                            )}
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // Regular nav item (not a group)
            const item = entry
            const isActive = location.pathname === item.href
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={
                  isStdntNav
                    ? stdntItemClass(isActive, isCollapsed)
                    : `group relative flex items-center text-[12.5px] font-medium rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${isCollapsed
                      ? 'justify-center w-11 h-11 p-0'
                      : 'px-2.5 py-2.5'
                      } ${isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 hover:text-secondary-900 dark:hover:text-secondary-200'
                      }`
                }
                title={isCollapsed ? item.name : undefined}
              >
                {isActive && !isCollapsed && !isStdntNav && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary-500 rounded-r-full" />
                )}

                <span className={`flex-shrink-0 transition-colors duration-200 ${
                  isStdntNav
                    ? 'text-white'
                    : isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                }`}>
                  {item.icon}
                </span>

                {!isCollapsed && (
                  <>
                    <span className="ml-3.5 truncate font-medium">
                      {item.name}
                    </span>
                    {item.badge && (
                      <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                        isStdntNav
                          ? isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-white/10 text-white/80'
                          : isActive
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                            : 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-400 group-hover:bg-white group-hover:shadow-sm dark:group-hover:bg-secondary-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </>
                )}

                {isCollapsed && item.badge && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-primary-500 text-white border-2 border-white dark:border-secondary-900 shadow-sm z-10">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {isStdntNav && !isCollapsed && (
        <div className="flex-shrink-0 px-3 pb-3" data-sidebar-fit>
          <div className="flex flex-col items-center rounded-2xl bg-white/10 px-4 py-4 text-center ring-1 ring-white/10">
            <span className="mb-2 text-4xl leading-none" aria-hidden="true">
              🎓
            </span>
            <p className="text-sm font-bold text-white">Empower Education</p>
            <p className="mt-1 text-[11px] leading-snug text-white/65">
              Smarter data. Better decisions. Stronger tomorrow.
            </p>
          </div>
        </div>
      )}

      {/* Account at bottom - fixed */}
      <div className={`flex-shrink-0 backdrop-blur-sm ${
        isCollapsed ? 'px-2 py-3' : 'p-[0.8rem]'
      } ${
        isStdntNav
          ? 'border-t border-white/10 bg-black/10'
          : 'border-t border-secondary-100 dark:border-secondary-800 bg-white/50 dark:bg-secondary-900/50'
      } ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className="relative w-full">
          <button
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
            className={`w-full flex items-center rounded-xl transition-all duration-200 group outline-none ${
              isCollapsed
                ? 'justify-center p-0'
                : hasLogoBrandMenu
                  ? 'p-2 ring-1 hover:brightness-[1.03]'
                  : isStdntNav
                    ? 'p-2 hover:bg-white/10'
                    : 'p-2 hover:bg-white dark:hover:bg-secondary-800 hover:shadow-sm ring-1 ring-transparent hover:ring-secondary-200 dark:hover:ring-secondary-700'
            }`}
            style={
              hasLogoBrandMenu && !isCollapsed && logoBrandTheme
                ? {
                    background: `linear-gradient(135deg, ${logoBrandTheme.primary} 0%, ${logoBrandTheme.dark} 100%)`,
                    boxShadow: `0 10px 24px ${logoBrandTheme.primary}33`,
                    borderColor: logoBrandTheme.ring,
                  }
                : undefined
            }
          >
            {renderSchoolLogoAvatar('w-10 h-10', 'rounded-xl', hasLogoBrandMenu && !isCollapsed)}
            {!isCollapsed && (
              <div className="flex-1 min-w-0 text-left ml-2.5">
                <p
                  className={`text-sm font-semibold truncate transition-colors ${
                    hasLogoBrandMenu
                      ? ''
                      : isStdntNav
                        ? 'text-white'
                        : 'text-secondary-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400'
                  }`}
                  style={hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textPrimary } : undefined}
                >
                  {schoolDisplayName}
                </p>
                <p
                  className={`text-xs truncate ${
                    hasLogoBrandMenu
                      ? ''
                      : isStdntNav
                        ? 'text-white/55'
                        : 'text-secondary-500 dark:text-secondary-400'
                  }`}
                  style={hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textMuted } : undefined}
                >
                  {affiliationDisplay !== '—' ? `Aff. No. ${affiliationDisplay}` : 'Aff. No. —'}
                </p>
              </div>
            )}
            {!isCollapsed && (
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${accountDropdownOpen ? 'rotate-180' : ''} ${
                  hasLogoBrandMenu
                    ? ''
                    : isStdntNav
                      ? 'text-white/50'
                      : 'text-secondary-400 group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300'
                }`}
                style={hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textMuted } : undefined}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {accountDropdownOpen && (
            <>
              {/* In-sidebar overlay: clicking nav/rest of sidebar closes dropdown */}
              <div
                className="fixed top-0 bottom-0 left-0 z-40"
                style={{ width: currentSidebarWidth }}
                onClick={() => setAccountDropdownOpen(false)}
                aria-hidden="true"
              />
              <div
                className={`absolute bottom-full left-0 mb-3 w-64 bg-white dark:bg-secondary-900 rounded-2xl shadow-hard border border-secondary-100 dark:border-secondary-700 z-50 animate-fade-in-up origin-bottom-left ring-1 ring-black/5 ${isCollapsed ? 'left-full ml-4 bottom-0' : ''}`}
              >
                <div
                  className={`p-4 border-b border-secondary-100 dark:border-secondary-800 rounded-t-2xl ${
                    hasLogoBrandMenu ? '' : 'bg-secondary-50/50 dark:bg-secondary-800/50'
                  }`}
                  style={
                    hasLogoBrandMenu && logoBrandTheme
                      ? {
                          background: `linear-gradient(135deg, ${logoBrandTheme.light} 0%, ${logoBrandTheme.primary} 100%)`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center space-x-3">
                    {renderSchoolLogoAvatar('w-10 h-10', 'rounded-lg', hasLogoBrandMenu)}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold truncate ${
                          hasLogoBrandMenu ? '' : 'text-secondary-900 dark:text-white'
                        }`}
                        style={
                          hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textPrimary } : undefined
                        }
                      >
                        {schoolDisplayName}
                      </p>
                      <p
                        className={`text-xs truncate ${
                          hasLogoBrandMenu ? '' : 'text-secondary-500 dark:text-secondary-400'
                        }`}
                        style={
                          hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textMuted } : undefined
                        }
                      >
                        {affiliationDisplay !== '—' ? `Aff. No. ${affiliationDisplay}` : 'Aff. No. —'}
                      </p>
                      <p
                        className={`text-xs truncate ${
                          hasLogoBrandMenu ? '' : 'text-secondary-500 dark:text-secondary-400'
                        }`}
                        style={
                          hasLogoBrandMenu && logoBrandTheme ? { color: logoBrandTheme.textMuted } : undefined
                        }
                      >
                        {cbseCodeDisplay !== '—' ? `CBSE Code ${cbseCodeDisplay}` : 'CBSE Code —'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="py-2 px-1">
                  {canAccessAccountSettings && (
                    <NavLink
                      to="/account-settings"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 hover:text-primary-600 dark:hover:text-primary-400'
                        }`
                      }
                    >
                      <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Account Settings
                    </NavLink>
                  )}
                  {canAccessBilling && (
                    <NavLink
                      to="/billing"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 hover:text-primary-600 dark:hover:text-primary-400'
                        }`
                      }
                    >
                      <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2m-2 0h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z" />
                      </svg>
                      Billing
                    </NavLink>
                  )}
                  <a
                    href="#"
                    className="flex items-center px-3 py-2.5 text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Preferences
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountDropdownOpen(false)
                      handleSwitchSession()
                    }}
                    className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">Switch Session</span>
                    {currentSession && (
                      <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        {currentSession}
                      </span>
                    )}
                  </button>
                  {canAccessHelpSupport && (
                    <NavLink
                      to="/help-support"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 hover:text-primary-600 dark:hover:text-primary-400'
                        }`
                      }
                    >
                      <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Help & Support
                    </NavLink>
                  )}
                </div>
                <div className="p-1 border-t border-secondary-100 dark:border-secondary-800">
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {accountDropdownOpen &&
        createPortal(
          <div
            className="fixed top-0 right-0 bottom-0 z-40"
            style={{ left: currentSidebarWidth }}
            onClick={() => setAccountDropdownOpen(false)}
            aria-hidden="true"
          />,
          document.body
        )}

      {moduleSwitcherOpen &&
        createPortal(
          <div
            className="fixed top-0 right-0 bottom-0 z-40"
            style={{ left: currentSidebarWidth }}
            onClick={() => setModuleSwitcherOpen(false)}
            aria-hidden="true"
          />,
          document.body
        )}
    </div>
  )
}

export default Sidebar
