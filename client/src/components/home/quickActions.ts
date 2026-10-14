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

/** Everyday tasks Home can offer as one-click shortcuts. Shown only when the page is open to the school. */
export type QuickAction = { id: string; label: string; path: string; icon: LucideIcon }

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'collect-fee', label: 'Collect fee', path: '/cpitl/collection', icon: IndianRupee },
  { id: 'student-attendance', label: 'Mark student attendance', path: '/attnd/student-attendance', icon: ClipboardCheck },
  { id: 'staff-attendance', label: 'Mark staff attendance', path: '/attnd/staff-attendance', icon: UserCheck },
  { id: 'add-student', label: 'Add a student', path: '/stdnt/students', icon: UserPlus },
  { id: 'substitution', label: 'Arrange substitution', path: '/time-table/substitution', icon: Repeat },
  { id: 'generate-timetable', label: 'Generate timetable', path: '/time-table/generate', icon: Wand2 },
  { id: 'homework', label: 'Post homework', path: '/acdmc/homework', icon: BookOpenCheck },
  { id: 'record-expense', label: 'Record an expense', path: '/cpitl/operating', icon: Wallet },
  { id: 'medical-case', label: 'Log a medical case', path: '/mdcl/cases', icon: Stethoscope },
  { id: 'report-cards', label: 'Print report cards', path: '/exmcl/report-card', icon: FileText },
  { id: 'fee-slips', label: 'Print fee slips', path: '/cpitl/fee-slips', icon: Printer },
  { id: 'receipts', label: 'Find a receipt', path: '/cpitl/payments', icon: Receipt },
  { id: 'payroll', label: 'Run payroll', path: '/cpitl/payroll', icon: Banknote },
  { id: 'add-teacher', label: 'Add a teacher', path: '/staaf/teaching-staff', icon: UserPlus },
  { id: 'recruitment', label: 'Review applications', path: '/staaf/recruitment', icon: Briefcase },
  { id: 'class-timetable', label: 'View class timetable', path: '/time-table/class-wise', icon: CalendarDays },
  { id: 'lesson-plan', label: 'Write a lesson plan', path: '/acdmc/lesson-plan', icon: PenLine },
  { id: 'admit-cards', label: 'Print admit cards', path: '/exmcl/admit-cards', icon: Ticket },
  { id: 'add-asset', label: 'Add an asset', path: '/asets/assets', icon: PackagePlus },
  { id: 'asset-maintenance', label: 'Log maintenance', path: '/asets/maintenance', icon: Wrench },
  { id: 'bus-routes', label: 'Manage bus routes', path: '/trnst/routes', icon: Bus },
  { id: 'house-ranking', label: 'Update house ranking', path: '/actvt/ranking', icon: Trophy },
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
