import {
  ClipboardList,
  FileText,
  type LucideIcon,
} from 'lucide-react-native'

import type { Permissions } from '@/lib/permissions'
import type { User } from '@/services/authService'
import type { TileIndex } from '@/ui'

/**
 * Which staff app a login gets, from its permissions (not role names, so custom roles work):
 * - `glance`: approves calendar events (principal, administrator): Today · Approvals · Students · Calendar · More
 * - `teacher`: linked to a staff record, or marks student attendance: Today · Classes · Attendance · Calendar · More
 * - `staff`: everyone else (office, accounts, library, clinic): Today · Calendar · More
 */
export type StaffMode = 'glance' | 'teacher' | 'staff'

export const staffModeFor = (user: User, perms: Permissions): StaffMode => {
  if (perms.can('clndr.events.approve')) return 'glance'
  if (user.teacher || perms.can('attnd.students.write')) return 'teacher'
  return 'staff'
}

/** Staff tab routes (files in app/(app)/(tabs)) shown for each mode, in order. */
export const STAFF_TABS: Record<StaffMode, string[]> = {
  glance: ['index', 'approvals', 'students', 'calendar', 'more'],
  teacher: ['index', 'classes', 'registers', 'calendar', 'more'],
  staff: ['index', 'calendar', 'more'],
}

/** A tab also needs its module on for the school and the permission to use it. */
export const staffTabAllowed = (route: string, perms: Permissions): boolean => {
  switch (route) {
    case 'students':
    case 'classes':
      return perms.canUse('stdnt_students')
    case 'registers':
      return perms.canUse('attnd_student_attendance') && perms.can('attnd.students.write')
    case 'calendar':
      return perms.featureOn('clndr_calendar')
    case 'approvals':
      return perms.can('clndr.events.approve')
    default:
      return true
  }
}

export type WebModule = {
  label: string
  reason: string
  icon: LucideIcon
  tile: TileIndex
  pages: { feature: string; path: string }[]
  /** Setup is for people who can change it: any one of these (reading alone is done in the app). */
  anyOf: string[]
}

/**
 * Desk work that stays on the website, for More → "On the website": school setup, bulk imports,
 * print layouts and generating timetables (reasons in docs/requirements/mobile-staff-plan.md).
 * Everything a person checks, approves, marks or records is in the app; don't add day-to-day work
 * here. Each opens the first page of the module this login may see. Labels never use module codes.
 */
export const WEB_MODULES: WebModule[] = [
  {
    label: 'Exam print designs',
    anyOf: ['exam.setup.write'],
    reason: 'Laying out admit cards, report cards and award lists; printing them is in the app',
    icon: FileText,
    tile: 5,
    pages: [{ feature: 'exmcl_performas', path: '/exmcl/performas' }],
  },
  {
    label: 'Seating plan layout',
    anyOf: ['exam.conduct.write'],
    reason: 'Bench layouts, which rooms sit on which day, and the seating, sticker and slip designs (the centre and its imports are in the app)',
    icon: ClipboardList,
    tile: 3,
    pages: [
      { feature: 'seatingplan', path: '/seatingplan' },
      { feature: 'examrooms', path: '/examrooms' },
    ],
  },
]

/** The website path a login would open for a module, or null when they can't use any of its pages. */
export const webModulePath = (module: WebModule, perms: Permissions): string | null =>
  module.anyOf.some((key) => perms.can(key)) ? (module.pages.find((page) => perms.canUse(page.feature))?.path ?? null) : null

/** Takes appointments as a host (appointments on for the school, and the host permission). */
export const isMeetingHost = (perms: Permissions) => perms.canUse('appnt_desk') && perms.can('appnt.appointments.host')

/** Books and manages everyone's meetings (front desk, office, principal). */
export const isFrontDesk = (perms: Permissions) => perms.canUse('appnt_desk') && (perms.can('appnt.appointments.book') || perms.can('appnt.appointments.manage'))
