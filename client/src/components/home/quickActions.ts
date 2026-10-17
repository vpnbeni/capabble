import {
  Banknote,
  BookOpenCheck,
  Briefcase,
  Bus,
  CalendarDays,
  ClipboardCheck,
  FileText,
  IndianRupee,
  PackagePlus,
  PenLine,
  Printer,
  Receipt,
  Repeat,
  Stethoscope,
  Ticket,
  Trophy,
  UserCheck,
  UserPlus,
  Wallet,
  Wand2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * Everyday tasks Home can offer as one-click shortcuts. Shown only when the page is open to the
 * school and the user's role allows the action the label promises (`permission`).
 */
export type QuickAction = { id: string; label: string; path: string; icon: LucideIcon; permission: string }

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'collect-fee', label: 'Collect fee', path: '/cpitl/collection', icon: IndianRupee, permission: 'cpitl.finance.collect' },
  { id: 'student-attendance', label: 'Mark student attendance', path: '/attnd/student-attendance', icon: ClipboardCheck, permission: 'attnd.students.write' },
  { id: 'staff-attendance', label: 'Mark staff attendance', path: '/attnd/staff-attendance', icon: UserCheck, permission: 'attnd.staff.write' },
  { id: 'add-student', label: 'Add a student', path: '/stdnt/students', icon: UserPlus, permission: 'stdnt.students.write' },
  { id: 'substitution', label: 'Arrange substitution', path: '/time-table/substitution', icon: Repeat, permission: 'timetable.timetable.write' },
  { id: 'generate-timetable', label: 'Generate timetable', path: '/time-table/generate', icon: Wand2, permission: 'timetable.timetable.write' },
  { id: 'homework', label: 'Post homework', path: '/acdmc/homework', icon: BookOpenCheck, permission: 'acdmc.classwork.write' },
  { id: 'record-expense', label: 'Record an expense', path: '/cpitl/operating', icon: Wallet, permission: 'cpitl.finance.expense_log' },
  { id: 'medical-case', label: 'Log a medical case', path: '/mdcl/cases', icon: Stethoscope, permission: 'mdcl.clinic.write' },
  { id: 'report-cards', label: 'Print report cards', path: '/exmcl/report-card', icon: FileText, permission: 'exam.results.read' },
  { id: 'fee-slips', label: 'Print fee slips', path: '/cpitl/fee-slips', icon: Printer, permission: 'cpitl.finance.view' },
  { id: 'receipts', label: 'Find a receipt', path: '/cpitl/payments', icon: Receipt, permission: 'cpitl.finance.view' },
  { id: 'payroll', label: 'Run payroll', path: '/cpitl/payroll', icon: Banknote, permission: 'cpitl.finance.payroll' },
  { id: 'add-teacher', label: 'Add a teacher', path: '/staaf/teaching-staff', icon: UserPlus, permission: 'staaf.staff.write' },
  { id: 'recruitment', label: 'Review applications', path: '/staaf/recruitment', icon: Briefcase, permission: 'staaf.staff.write' },
  { id: 'class-timetable', label: 'View class timetable', path: '/time-table/class-wise', icon: CalendarDays, permission: 'timetable.timetable.read' },
  { id: 'lesson-plan', label: 'Write a lesson plan', path: '/acdmc/lesson-plan', icon: PenLine, permission: 'acdmc.classwork.write' },
  { id: 'admit-cards', label: 'Print admit cards', path: '/exmcl/admit-cards', icon: Ticket, permission: 'exam.setup.read' },
  { id: 'add-asset', label: 'Add an asset', path: '/asets/assets', icon: PackagePlus, permission: 'asets.assets.create' },
  { id: 'asset-maintenance', label: 'Log maintenance', path: '/asets/maintenance', icon: Wrench, permission: 'asets.assets.maintain' },
  { id: 'bus-routes', label: 'Manage bus routes', path: '/trnst/routes', icon: Bus, permission: 'trnst.transport.write' },
  { id: 'house-ranking', label: 'Update house ranking', path: '/actvt/ranking', icon: Trophy, permission: 'actvt.activities.write' },
]

export const DEFAULT_QUICK_ACTIONS = [
  'collect-fee',
  'student-attendance',
  'staff-attendance',
  'add-student',
  'substitution',
  'generate-timetable',
  'homework',
  'record-expense',
  'medical-case',
  'report-cards',
]

export const MAX_QUICK_ACTIONS = 12
