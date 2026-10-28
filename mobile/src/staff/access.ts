import {
  Boxes,
  Bus,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  Landmark,
  Library,
  Settings,
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
    label: 'Timetable setup',
    anyOf: ['timetable.timetable.write'],
    reason: 'Periods per subject, bell timings and generating the timetable',
    icon: CalendarClock,
    tile: 4,
    pages: [
      { feature: 'timetable_period_allocation', path: '/time-table/period-distribution' },
      { feature: 'timetable_class_wise', path: '/time-table/class-wise' },
    ],
  },
  {
    label: 'Exam print designs',
    anyOf: ['exam.setup.write'],
    reason: 'Laying out admit cards, report cards and award lists; printing them is in the app',
    icon: FileText,
    tile: 5,
    pages: [{ feature: 'exmcl_performas', path: '/exmcl/performas' }],
  },
  {
    label: 'Board exam centre',
    anyOf: ['exam.setup.write', 'exam.candidates.write', 'exam.conduct.write'],
    reason: 'Datesheet and candidate imports, seating, Form 66 and dispatch',
    icon: ClipboardList,
    tile: 3,
    pages: [
      { feature: 'centre_details', path: '/centre-details' },
      { feature: 'datesheets', path: '/datesheets' },
    ],
  },
  {
    label: 'Students and classes setup',
    anyOf: ['stdnt.students.write'],
    reason: 'Importing students from a spreadsheet, classes and subjects',
    icon: Users,
    tile: 1,
    pages: [
      { feature: 'stdnt_classes', path: '/stdnt/classes' },
      { feature: 'stdnt_students', path: '/stdnt/students' },
    ],
  },
  { label: 'Finance setup', reason: 'Fee structures, budgets, payroll runs, electricity and building projects', icon: Landmark, tile: 3, pages: [{ feature: 'cpitl_dashboard', path: '/cpitl/dashboard' }], anyOf: ['cpitl.finance.manage_structures', 'cpitl.finance.budgets', 'cpitl.finance.payroll', 'cpitl.finance.settings'] },
  { label: 'Activities setup', reason: 'Houses, clubs, sports and certificate designs', icon: Trophy, tile: 1, pages: [{ feature: 'actvt_activities', path: '/actvt/houses' }], anyOf: ['actvt.activities.write'] },
  { label: 'Library purchasing', reason: 'Adding books, purchase orders, stocktakes and reports', icon: Library, tile: 1, pages: [{ feature: 'libry_catalogue', path: '/libry/overview' }], anyOf: ['libry.catalogue.create', 'libry.acquisitions.manage', 'libry.stocktake.manage', 'libry.reports.view'] },
  { label: 'Asset register setup', reason: 'Adding assets, purchases, audits and reports', icon: Boxes, tile: 2, pages: [{ feature: 'asets_dashboard', path: '/asets/dashboard' }], anyOf: ['asets.assets.create', 'asets.assets.procure', 'asets.assets.audit', 'asets.assets.report'] },
  { label: 'Transport setup', reason: 'Routes, stops and buses', icon: Bus, tile: 2, pages: [{ feature: 'trnst_transport', path: '/trnst' }], anyOf: ['trnst.transport.write'] },
  { label: 'School setup', reason: 'Roles and permissions, school email, online payments and logo', icon: Settings, tile: 4, pages: [{ feature: 'account_settings', path: '/account-settings' }], anyOf: ['core.school.write', 'core.users.manage'] },
  { label: 'Billing', reason: 'Your Capabble plan and invoices', icon: CreditCard, tile: 3, pages: [{ feature: 'billing', path: '/billing' }], anyOf: ['core.billing.read'] },
]

/** The website path a login would open for a module, or null when they can't use any of its pages. */
export const webModulePath = (module: WebModule, perms: Permissions): string | null =>
  module.anyOf.some((key) => perms.can(key)) ? (module.pages.find((page) => perms.canUse(page.feature))?.path ?? null) : null

/** Takes appointments as a host (appointments on for the school, and the host permission). */
export const isMeetingHost = (perms: Permissions) => perms.canUse('appnt_desk') && perms.can('appnt.appointments.host')

/** Books and manages everyone's meetings (front desk, office, principal). */
export const isFrontDesk = (perms: Permissions) => perms.canUse('appnt_desk') && (perms.can('appnt.appointments.book') || perms.can('appnt.appointments.manage'))
