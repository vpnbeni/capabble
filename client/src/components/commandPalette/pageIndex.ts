/**
 * Every navigable page the ⌘K palette can jump to, mirroring the sidebar navigation
 * (components/layout/Sidebar.tsx). Access is filtered at runtime with the same
 * feature-toggle rules the sidebar and ProtectedRoute use, so listing a page here
 * never exposes it to a tenant that cannot open it.
 *
 * When you add a page to the sidebar, add it here too.
 */
export type PageModule =
  | 'core' | 'cntr' | 'exmcl' | 'timetable' | 'stdnt' | 'staaf' | 'attnd'
  | 'trnst' | 'acdmc' | 'actvt' | 'mdcl' | 'asets' | 'appnt' | 'cpitl'

export type PageEntry = {
  title: string
  path: string
  module: PageModule
  section?: string
  /** Extra words people might type for this page (synonyms, abbreviations). */
  keywords?: string
}

type Row = [title: string, path: string, section?: string, keywords?: string]

const group = (module: PageModule, rows: Row[]): PageEntry[] =>
  rows.map(([title, path, section, keywords]) => ({ title, path, module, section, keywords }))

export const PAGE_INDEX: PageEntry[] = [
  ...group('core', [
    ['School OS', '/home', undefined, 'home main dashboard overview start school hub'],
    ['Dashboard', '/dashboard', undefined, 'home overview'],
    ['Billing', '/billing', 'Account', 'plan subscription invoice payment'],
    ['Account settings', '/account-settings', 'Account', 'profile password preferences'],
    ['Help & support', '/help-support', 'Account', 'ticket contact faq'],
  ]),
  ...group('timetable', [
    ['Teachers', '/time-table/teachers', 'Time Table', 'faculty load'],
    ['Classes', '/time-table/classes', 'Time Table', 'sections'],
    ['Subjects', '/time-table/subjects', 'Time Table'],
    ['Period distribution', '/time-table/period-distribution', 'Time Table', 'allocation periods per week'],
    ['Departments', '/time-table/departments', 'Time Table'],
    ['Bell timings', '/time-table/bell-timings', 'Time Table', 'periods schedule bell'],
    ['Generate timetable', '/time-table/generate', 'Time Table', 'build create auto'],
    ['Class wise timetable', '/time-table/class-wise', 'Time Table'],
    ['Teacher wise timetable', '/time-table/teacher-wise', 'Time Table'],
    ['Substitution', '/time-table/substitution', 'Time Table', 'proxy arrangement absent teacher'],
    ['Versions', '/time-table/versions', 'Time Table', 'history'],
    ['Formats', '/time-table/formats', 'Time Table', 'print export'],
  ]),
  ...group('stdnt', [
    ['Student overview', '/stdnt/stdntboard', 'Students', 'stdntboard dashboard'],
    ['Students', '/stdnt/students', 'Students', 'admission pupils list'],
    ['Classes & sections', '/stdnt/classes', 'Students', 'class section matrix'],
    ['Subjects', '/stdnt/subjects', 'Students'],
    ['Alumni', '/stdnt/alumni', 'Students', 'passout former students'],
  ]),
  ...group('staaf', [
    ['Staff overview', '/staaf/overview', 'Staff', 'hr employees'],
    ['Organisation structure', '/staaf/organisation-structure', 'Staff', 'org chart hierarchy'],
    ['Teaching staff', '/staaf/teaching-staff', 'Staff', 'teachers faculty'],
    ['Sports coaches', '/staaf/sports-coach', 'Staff'],
    ['Admin staff', '/staaf/admin-staff', 'Staff', 'office'],
    ['Drivers', '/staaf/drivers', 'Staff', 'transport'],
    ['Conductors', '/staaf/conductors', 'Staff', 'transport'],
    ['Security', '/staaf/security', 'Staff', 'guards'],
    ['Recruitment', '/staaf/recruitment', 'Staff', 'hiring vacancy'],
  ]),
  ...group('attnd', [
    ['Attendance board', '/attnd/attndboard', 'Attendance', 'attndboard overview'],
    ['Staff attendance', '/attnd/staff-attendance', 'Attendance', 'mark present absent'],
    ['Student attendance', '/attnd/student-attendance', 'Attendance', 'mark present absent'],
  ]),
  ...group('acdmc', [
    ['Academics overview', '/acdmc/overview', 'Academics', 'syllabus coverage due this week'],
    ['Lesson plans', '/acdmc/lesson-plan', 'Academics', 'lesson plan delivered'],
    ['Homework', '/acdmc/homework', 'Academics'],
    ['Assignments', '/acdmc/assignment', 'Academics'],
    ['Quizzes', '/acdmc/quiz', 'Academics', 'test question paper marks'],
    ['Curriculum', '/acdmc/curriculum', 'Academics', 'syllabus units topics books coverage'],
  ]),
  ...group('actvt', [
    ['Activity board', '/actvt/board', 'Activities'],
    ['Houses', '/actvt/houses', 'Activities'],
    ['Student council', '/actvt/student-council', 'Activities', 'prefect captain'],
    ['Clubs', '/actvt/clubs', 'Activities'],
    ['Tours & trips', '/actvt/tours', 'Activities', 'excursion'],
    ['Sports', '/actvt/sports', 'Activities', 'games'],
    ['Functions', '/actvt/functions', 'Activities', 'events celebration'],
    ['House ranking', '/actvt/ranking', 'Activities', 'points leaderboard'],
    ['Certificates', '/actvt/certificates', 'Activities'],
  ]),
  ...group('mdcl', [
    ['Medical cases', '/mdcl/cases', 'Medical', 'clinic infirmary health'],
    ['Medical supplies', '/mdcl/supplies', 'Medical', 'medicine stock'],
  ]),
  ...group('appnt', [
    ['Today\'s appointments', '/appnt/today', 'Appointments', 'visitors front desk meeting parent check in walk-in'],
    ['All appointments', '/appnt/appointments', 'Appointments', 'meetings bookings requests ptm parent'],
    ['My availability', '/appnt/availability', 'Appointments', 'hours meeting times'],
    ['Who takes appointments', '/appnt/hosts', 'Appointments', 'hosts principal teacher meeting'],
    ['Appointment reports', '/appnt/reports', 'Appointments', 'no-show summary'],
    ['Appointment settings', '/appnt/settings', 'Appointments', 'parent requests notice purposes'],
  ]),
  ...group('asets', [
    ['Asset overview', '/asets/dashboard', 'Assets', 'dashboard'],
    ['All assets', '/asets/assets', 'Assets', 'register inventory'],
    ['Categories', '/asets/categories', 'Assets'],
    ['Locations', '/asets/locations', 'Assets', 'rooms buildings'],
    ['Allocations', '/asets/allocations', 'Assets', 'assign issue'],
    ['Transfers', '/asets/transfers', 'Assets', 'move'],
    ['Maintenance', '/asets/maintenance', 'Assets', 'repair service'],
    ['Stock / store', '/asets/stock', 'Assets', 'consumables inventory'],
    ['Audits', '/asets/audits', 'Assets', 'verification'],
    ['Vendors', '/asets/vendors', 'Assets', 'suppliers'],
    ['Procurement', '/asets/procurement', 'Assets', 'purchase order'],
    ['Disposal', '/asets/disposals', 'Assets', 'write off scrap'],
    ['Asset reports', '/asets/reports', 'Assets'],
    ['Asset settings', '/asets/settings', 'Assets'],
  ]),
  ...group('cpitl', [
    ['Fee dashboard', '/cpitl/dashboard', 'Income', 'finance overview'],
    ['Fee collection', '/cpitl/collection', 'Income', 'collect fees payment pay'],
    ['Fee structures', '/cpitl/fee-structures', 'Income', 'fee heads plan'],
    ['Receipts', '/cpitl/payments', 'Income', 'fee payments transactions'],
    ['Fee slips', '/cpitl/fee-slips', 'Income', 'challan demand'],
    ['Fee settings', '/cpitl/settings', 'Income'],
    ['Expense overview', '/cpitl/expenses', 'Expenses', 'spend'],
    ['Operating costs', '/cpitl/operating', 'Expenses'],
    ['Fuel', '/cpitl/fuel', 'Expenses', 'diesel vehicle'],
    ['Electricity', '/cpitl/electricity', 'Expenses', 'power bill'],
    ['Infrastructure', '/cpitl/infra', 'Expenses', 'projects construction'],
    ['Budgets', '/cpitl/budgets', 'Expenses'],
    ['Staff salaries', '/cpitl/salary', 'Payroll', 'salary structure'],
    ['Payroll runs', '/cpitl/payroll', 'Payroll', 'pf esi pt pay'],
  ]),
  ...group('trnst', [
    ['Transport', '/trnst', 'Transport', 'bus'],
    ['Vehicles', '/trnst/vehicles', 'Transport', 'bus'],
    ['Self students', '/trnst/self-students', 'Transport', 'own conveyance'],
    ['Routes', '/trnst/routes', 'Transport', 'stops'],
  ]),
  ...group('cntr', [
    ['Centre details', '/centre-details', 'Exam centre', 'centre info'],
    ['Exam functionaries', '/exam-functionaries', 'Exam centre', 'invigilators teachers'],
    ['Centre guidelines', '/centre-guidelines', 'Exam centre'],
    ['CBSE circulars', '/cbse-circulars', 'Exam centre'],
    ['CBSE portals', '/cbse-portals', 'Exam centre'],
    ['Subjects', '/subjects', 'Exam centre'],
    ['Undertaking form', '/undertaking', 'Exam centre'],
    ['Datesheets', '/datesheets', 'Exam centre', 'date sheet schedule'],
    ['Form 66', '/form66', 'Exam centre', 'attendance'],
    ['Exam rooms', '/examrooms', 'Exam centre', 'halls'],
    ['Answer sheets', '/answersheets', 'Exam centre', 'copies'],
    ['Seating plan', '/seatingplan', 'Exam centre', 'seat arrangement'],
    ['Duties', '/duties', 'Exam centre', 'invigilation'],
    ['Exam attendance', '/attendance', 'Exam centre'],
    ['PwD info', '/pwd-info', 'Exam centre', 'disability'],
    ["UMC's", '/umcs', 'Exam centre', 'unfair means'],
    ['Stickers', '/stickers', 'Exam centre'],
    ["Performa's", '/performas', 'Exam centre', 'forms'],
    ['Candidate details', '/candidate-details', 'Exam centre', 'candidates'],
    ['Dispatch slip', '/dispatch-slip', 'Exam centre'],
    ['Remuneration', '/remuneration', 'Exam centre', 'payment'],
  ]),
  ...group('exmcl', [
    ['Centre details', '/exmcl/centre-details', 'Internal exams'],
    ['Exam functionaries', '/exmcl/exam-functionaries', 'Internal exams'],
    ['Centre guidelines', '/exmcl/centre-guidelines', 'Internal exams'],
    ['Exams', '/exmcl/exams', 'Internal exams', 'tests'],
    ['Results', '/exmcl/result', 'Internal exams', 'marks'],
    ['Report cards', '/exmcl/report-card', 'Internal exams'],
    ['Award list', '/exmcl/award-list', 'Internal exams'],
    ['Admit cards', '/exmcl/admit-cards', 'Internal exams'],
    ['Question papers', '/exmcl/question-papers', 'Internal exams'],
    ['Syllabus', '/exmcl/syllabus', 'Internal exams'],
    ['Marks distribution', '/exmcl/marks-distribution', 'Internal exams'],
    ['Subjects', '/exmcl/subjects', 'Internal exams'],
    ['Datesheets', '/exmcl/datesheets', 'Internal exams'],
    ['Exam rooms', '/exmcl/examrooms', 'Internal exams'],
    ['Answer sheets', '/exmcl/answersheets', 'Internal exams'],
    ['Seating plan', '/exmcl/seatingplan', 'Internal exams'],
    ['Duties', '/exmcl/duties', 'Internal exams'],
    ['Attendance', '/exmcl/attendance', 'Internal exams'],
    ['Formats', '/exmcl/performas', 'Internal exams'],
    ['Candidate details', '/exmcl/candidate-details', 'Internal exams'],
    ['CBSE registration', '/exmcl/cbse-registration', 'Internal exams'],
  ]),
]

/** Longest-prefix match, so `/stdnt/students/abc` counts as a visit to Students. */
export const findPageForPath = (pathname: string): PageEntry | null => {
  let best: PageEntry | null = null
  for (const page of PAGE_INDEX) {
    if (pathname === page.path || pathname.startsWith(`${page.path}/`)) {
      if (!best || page.path.length > best.path.length) best = page
    }
  }
  return best
}
