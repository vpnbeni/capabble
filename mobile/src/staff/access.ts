import {
  Award,
  BookOpen,
  Boxes,
  Bus,
  CalendarClock,
  GraduationCap,
  HeartPulse,
  Landmark,
  Library,
  Trophy,
  Users,
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

export type WebModule = { label: string; icon: LucideIcon; tile: TileIndex; pages: { feature: string; path: string }[] }

/**
 * Modules a login can use on the website, for More → "On the website". Each opens the first page
 * of the module this login may see. Labels are the product's module names (never codes).
 */
export const WEB_MODULES: WebModule[] = [
  { label: 'Students', icon: GraduationCap, tile: 6, pages: [{ feature: 'stdnt_students', path: '/stdnt/students' }] },
  { label: 'Staff', icon: Users, tile: 2, pages: [{ feature: 'staaf_staff_members', path: '/staaf/overview' }] },
  {
    label: 'Timetable',
    icon: CalendarClock,
    tile: 4,
    pages: [
      { feature: 'timetable_teacher_wise', path: '/time-table/teacher-wise' },
      { feature: 'timetable_class_wise', path: '/time-table/class-wise' },
    ],
  },
  { label: 'Academics', icon: BookOpen, tile: 4, pages: [{ feature: 'acdmc_academics', path: '/acdmc/overview' }] },
  {
    label: 'Exams',
    icon: Award,
    tile: 6,
    pages: [
      { feature: 'exmcl_result', path: '/exmcl/result' },
      { feature: 'exmcl_exams', path: '/exmcl/exams' },
    ],
  },
  { label: 'Activities', icon: Trophy, tile: 1, pages: [{ feature: 'actvt_activities', path: '/actvt/houses' }] },
  { label: 'Clinic', icon: HeartPulse, tile: 5, pages: [{ feature: 'mdcl_clinic', path: '/mdcl/cases' }] },
  { label: 'Transport', icon: Bus, tile: 2, pages: [{ feature: 'trnst_transport', path: '/trnst' }] },
  { label: 'Finance', icon: Landmark, tile: 3, pages: [{ feature: 'cpitl_dashboard', path: '/cpitl/dashboard' }] },
  { label: 'Assets', icon: Boxes, tile: 2, pages: [{ feature: 'asets_dashboard', path: '/asets/dashboard' }] },
  { label: 'Library', icon: Library, tile: 1, pages: [{ feature: 'libry_catalogue', path: '/libry/overview' }] },
]

/** The website path a login would open for a module, or null when they can't use any of its pages. */
export const webModulePath = (module: WebModule, perms: Permissions): string | null =>
  module.pages.find((page) => perms.canUse(page.feature))?.path ?? null

/** Takes appointments as a host (appointments on for the school, and the host permission). */
export const isMeetingHost = (perms: Permissions) => perms.canUse('appnt_desk') && perms.can('appnt.appointments.host')

/** Books and manages everyone's meetings (front desk, office, principal). */
export const isFrontDesk = (perms: Permissions) => perms.canUse('appnt_desk') && (perms.can('appnt.appointments.book') || perms.can('appnt.appointments.manage'))
