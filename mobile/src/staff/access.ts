import {
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
 * What stays on the website, for More → "On the website": only laying out printed forms by hand
 * (reasons in docs/requirements/mobile-staff-setup-next.md). Everything else staff do is in the
 * app; don't add to this. Each opens the first page of the module this login may see. Labels never
 * use module codes. Paying for Capabble is never linked from the app (app store rules).
 */
export const WEB_MODULES: WebModule[] = [
  {
    label: 'Print layouts',
    anyOf: ['exam.setup.write', 'exam.conduct.write'],
    reason: 'Placing text, pictures and lines by hand on an exam form, and the seating forms’ column widths; everything else about printing is in the app',
    icon: FileText,
    tile: 5,
    pages: [
      { feature: 'exmcl_performas', path: '/exmcl/performas' },
      { feature: 'seatingplan', path: '/seatingplan' },
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
