import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import { useTimetable } from '@/contexts/TimetableContext'
import { isFeatureEnabledForPath } from '@/constants/featureAccess'
import { useCentreDetails } from '@/hooks/useCentreDetails'
import { useOnboardingStatus } from '@/hooks/useOnboarding'
import { AttndModeSwitch } from '@/components/attnd/AttndModeSwitch'
import { Bell, CalendarDays, PanelLeft, Search } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { isMacPlatform, useCommandPalette } from '@/components/commandPalette/CommandPaletteProvider'

/** "2026-2027" → "2026–27", as schools write it. */
const formatSessionLabel = (session: string) => {
  const match = String(session).match(/^(\d{4})\s*[-–]\s*(\d{2,4})$/)
  if (!match) return session
  return `${match[1]}–${match[2].slice(-2)}`
}

type HeaderProps = {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
}

const Header: React.FC<HeaderProps> = ({ isSidebarCollapsed, onToggleSidebar }) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { openPalette } = useCommandPalette()
  const shortcutLabel = useMemo(() => (isMacPlatform() ? '⌘K' : 'Ctrl K'), [])
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useSelector(selectUser)
  const isDashboardRoute = location.pathname === '/dashboard'
  const isStudentAttendanceRoute = /\/attnd\/student-attendance\/?$/.test(location.pathname)
  const isStaffAttendanceRoute = /\/attnd\/staff-attendance\/?$/.test(location.pathname)
  const canAccessCentreDetails = isFeatureEnabledForPath('/centre-details', user?.featureToggles)
  const { currentSession } = useAcademicSession()
  const { periodsPerWeek, setPeriodsPerWeek } = useTimetable()
  const [editingPeriodsPerWeek, setEditingPeriodsPerWeek] = useState(false)
  const [draftPeriodsPerWeek, setDraftPeriodsPerWeek] = useState(periodsPerWeek)

  const isDistributionRoute = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    return (
      segments[0] === 'time-table' &&
      (segments[1] === 'period-distribution' || segments[1] === 'distribution' || segments[1] === 'period-allocation')
    )
  }, [location.pathname])

  const { pageTitle, pageSubtitle, showBackButton, backTo } = useMemo(() => {
    const path = location.pathname
    const segments = path.split('/').filter(Boolean)
    const seg = (segments[0] || 'dashboard').toLowerCase()

    // Detail routes: /answersheets/:id, /candidate-details/:id, /exam-functionaries/:id
    const listPathsWithDetail = ['answersheets', 'candidate-details', 'exam-functionaries']
    const isDetailRoute =
      segments.length >= 2 &&
      listPathsWithDetail.includes(seg) &&
      segments[1] !== 'new'
    const backToPath = isDetailRoute ? `/${segments[0]}` : null

    switch (seg) {
      case 'dashboard':
        return {
          pageTitle: 'Dashboard',
          pageSubtitle: 'Welcome to Board Examination Centre Management System',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'datesheets':
        return {
          pageTitle: 'Date Sheets',
          pageSubtitle: 'Create and manage examination date sheets',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'centre-details':
        return {
          pageTitle: 'Centre Details',
          pageSubtitle: 'Manage centre profile, candidate summary, and exam days',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'exam-functionaries':
        return {
          pageTitle: 'Exam Functionaries',
          pageSubtitle: 'Manage examination functionaries and assignments',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'duties':
        return {
          pageTitle: 'Duties',
          pageSubtitle: 'Assign exam functionaries to rooms for each exam day',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'undertaking':
        return {
          pageTitle: 'Undertaking Form',
          pageSubtitle: 'Download undertaking form rolled out by super admin',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'candidate-details':
        return {
          pageTitle: 'Candidate Details',
          pageSubtitle: 'Manage examination candidates and PDF imports',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'subjects':
        return {
          pageTitle: 'Subjects',
          pageSubtitle: 'Manage subjects taught in the classes.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'examrooms':
        return {
          pageTitle: 'Exam Room/Hall',
          pageSubtitle: 'Assign rooms and halls for examinations',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'answersheets':
        return {
          pageTitle: 'Answer Sheets',
          pageSubtitle: 'Track and manage answer sheet dispatches',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'centre-guidelines':
        return {
          pageTitle: 'Centre Guidelines',
          pageSubtitle: 'Important guidelines and instructions for examination centre management',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'seatingplan':
        return {
          pageTitle: 'Seating Plan',
          pageSubtitle: 'Generate and manage seating plan PDFs',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'dispatch-slip':
        return {
          pageTitle: 'Dispatch Slip',
          pageSubtitle: 'Centre datesheet (date-wise). Download a dispatch slip PDF per subject.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'pwd-info':
        return {
          pageTitle: 'PwD Info',
          pageSubtitle: 'Manage PwD candidate support, scribes, and extra time details at the centre.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'umcs':
        return {
          pageTitle: "UMC's",
          pageSubtitle: 'Handle unfair means cases and generate the required forwarding performa.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'stickers':
        return {
          pageTitle: 'Stickers',
          pageSubtitle: 'Generate date-wise roll number sticker grids for exam-day printing.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'performas':
        return {
          pageTitle: "Performa's",
          pageSubtitle: 'Generate relieving letters and answer sheet submission letters for centre operations.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'form66':
        return {
          pageTitle: 'Form 66',
          pageSubtitle: 'Roll-number lists for each paper, arranged by exam date',
          showBackButton: false,
          backTo: null,
        }
      case 'attendance':
        return {
          pageTitle: 'Attendance',
          pageSubtitle: 'Absentees for each paper, with the absentee list PDF',
          showBackButton: false,
          backTo: null,
        }
      case 'remuneration':
        return {
          pageTitle: 'Remuneration',
          pageSubtitle: 'Summary of duties assigned to each exam functionary.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'billing':
        return {
          pageTitle: 'Billing',
          pageSubtitle: 'Manage subscription, invoices, and billing profile',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'help-support':
        return {
          pageTitle: 'Help Centre',
          pageSubtitle: 'Search guides, browse modules, and get support for your school ERP.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'cbse-portals':
        return {
          pageTitle: 'CBSE Portals',
          pageSubtitle: 'Management',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'home':
      case 'school-hub':
        return {
          pageTitle: 'School OS',
          pageSubtitle: 'Your school today, and the modules you use.',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'cbse-circulars':
        return {
          pageTitle: 'CBSE Circulars',
          pageSubtitle: 'Management',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'staff':
        return {
          pageTitle: 'Staff',
          pageSubtitle: 'Details of staff members working in your school',
          showBackButton: isDetailRoute,
          backTo: backToPath,
        }
      case 'time-table': {
        const subPage = segments[1] || ''
        const distribution = { title: 'Period distribution', subtitle: 'How many periods each subject gets per week, class by class.' }
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          'teachers': { title: 'Teachers', subtitle: 'Teachers available for timetable planning.' },
          'classes': { title: 'Classes', subtitle: 'Classes and sections to schedule.' },
          'subjects': { title: 'Subjects', subtitle: 'Subjects taught in each class.' },
          'departments': { title: 'Departments', subtitle: 'Who teaches which subject, and their load by class and section.' },
          'bell-timings': { title: 'Bell timings', subtitle: 'Periods, breaks and the school day schedule.' },
          'class-wise': { title: 'Class timetables', subtitle: 'The week for each class and section.' },
          'teacher-wise': { title: 'Teacher timetables', subtitle: 'The week for each teacher.' },
          'substitution': { title: 'Substitution', subtitle: 'Cover today\'s periods for absent teachers.' },
          'versions': { title: 'Versions', subtitle: 'Draft, published and archived timetables.' },
          'formats': { title: 'Formats', subtitle: 'Download a saved timetable in the format you need.' },
          'generate': { title: 'Generate', subtitle: 'Build a timetable from your classes, teachers and periods.' },
          'period-distribution': distribution,
          'distribution': distribution,
          'period-allocation': distribution,
        }
        const info = titleMap[subPage] || { title: 'Timetable', subtitle: 'School timetable for this session.' }
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: false,
          backTo: null,
        }
      }
      case 'stdnt': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          'classes': { title: 'Classes', subtitle: 'Classes and the sections in each, for this session.' },
          stdntboard: { title: 'Overview', subtitle: 'Student strength by class and section, gender split and ages.' },
          'student-info': { title: 'Overview', subtitle: 'Student strength by class and section, gender split and ages.' },
          'students': { title: 'Students', subtitle: 'Add, import and manage student records for this session.' },
          alumni: { title: 'Alumni', subtitle: 'Students who passed out of Class 12, kept across sessions.' },
          'subjects': { title: 'Subjects', subtitle: 'Subjects taught in each class this session.' },
        }
        const info = titleMap[subPage] || { title: 'Students', subtitle: 'Student records for this session.' }
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: false,
          backTo: null,
        }
      }
      case 'staaf': {
        const subPage = segments[1] || ''
        if (subPage === 'staff' && segments[2]) {
          return {
            pageTitle: 'Staff profile',
            pageSubtitle: 'Work, contact and personal details.',
            showBackButton: true,
            backTo: '/staaf/organisation-structure',
          }
        }
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          overview: { title: 'Overview', subtitle: 'Staff strength by group, designation and gender for this session.' },
          'organisation-structure': { title: 'Organisation structure', subtitle: 'Who reports to whom, from the principal to support staff.' },
          'teaching-staff': { title: 'Teaching staff', subtitle: 'Teachers and their designations, subjects and contact details.' },
          'sports-coach': { title: 'Sports coaches', subtitle: 'Coaches and their contact details.' },
          'admin-staff': { title: 'Admin staff', subtitle: 'Office and administration staff.' },
          drivers: { title: 'Drivers', subtitle: 'School bus and vehicle drivers.' },
          conductors: { title: 'Conductors', subtitle: 'Bus conductors and attendants.' },
          security: { title: 'Security', subtitle: 'Guards and security personnel.' },
          recruitment: { title: 'Recruitment', subtitle: 'Vacant posts, applications and interview schedules.' },
          'staff-members': { title: 'Staff members', subtitle: 'Add, import and manage staff records.' },
        }
        const info = titleMap[subPage] || { title: 'Staff', subtitle: 'Staff records for this session.' }
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: false,
          backTo: null,
        }
      }
      case 'exmcl': {
        const subPage = segments[1] || ''
        const formatPages: Record<string, { title: string; subtitle: string }> = {
          'award-list': { title: 'Award list format', subtitle: 'The award list layout used when you download PDFs.' },
          'admit-card': { title: 'Admit card format', subtitle: 'The admit card layout used when you download PDFs.' },
          'report-card': { title: 'Report card format', subtitle: 'The report card layout used when you download PDFs.' },
        }
        if (subPage === 'performas' && formatPages[segments[2]]) {
          return {
            pageTitle: formatPages[segments[2]].title,
            pageSubtitle: formatPages[segments[2]].subtitle,
            showBackButton: true,
            backTo: '/exmcl/performas',
          }
        }
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          'centre-details': { title: 'Centre details', subtitle: 'Centre profile, candidate summary and exam days.' },
          'exam-functionaries': { title: 'Exam functionaries', subtitle: 'Examination staff and their assignments.' },
          'duties': { title: 'Duties', subtitle: 'Exam functionaries assigned to rooms for each exam day.' },
          'candidate-details': { title: 'Candidates', subtitle: 'Examination candidates and their PDF imports.' },
          'cbse-registration': { title: 'CBSE registration', subtitle: 'Subjects for each class and each student’s additional subject.' },
          'exams': { title: 'Exams', subtitle: 'The tests this session, with duration and maximum marks.' },
          'subjects': { title: 'Subjects', subtitle: 'The subjects each exam covers.' },
          'examrooms': { title: 'Exam rooms', subtitle: 'Rooms and halls used for examinations.' },
          'answersheets': { title: 'Answer sheets', subtitle: 'Answer sheet stock and dispatches.' },
          'attendance': { title: 'Exam attendance', subtitle: 'Candidate attendance for each exam day.' },
          'centre-guidelines': { title: 'Circulars', subtitle: 'Exam notices, drafted and published in series.' },
          'admit-cards': { title: 'Admit cards', subtitle: 'Admit card PDFs in the saved format.' },
          'result': { title: 'Marks entry', subtitle: 'Marks for each class and section, exam by exam.' },
          'report-card': { title: 'Report cards', subtitle: 'Report card PDFs for printing and sending home.' },
          'award-list': { title: 'Award lists', subtitle: 'Award list PDFs in the saved format.' },
          'question-papers': { title: 'Question papers', subtitle: 'Question papers for internal exams.' },
          'syllabus': { title: 'Syllabus', subtitle: 'Syllabus for each subject and exam.' },
          'marks-distribution': { title: 'Marks distribution', subtitle: 'How 100 marks split across theory, practical and internal work.' },
          'seatingplan': { title: 'Seating plan', subtitle: 'Seating plans and their PDFs.' },
          'performas': { title: 'Formats', subtitle: 'Layouts for award lists, admit cards, report cards and other exam documents.' },
          'datesheets': { title: 'Datesheets', subtitle: 'Exam dates and timings for each class.' },
        }
        const info = titleMap[subPage] || { title: 'Exams', subtitle: 'Internal exams for this session.' }
        // /exmcl/<list>/:id detail pages get the same back button as their top-level twins.
        const isExmclDetail =
          segments.length >= 3 && listPathsWithDetail.includes(subPage) && segments[2] !== 'new'
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: isExmclDetail,
          backTo: isExmclDetail ? `/exmcl/${subPage}` : null,
        }
      }
      case 'acdmc': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          'lesson-plan': { title: 'Lesson Plan', subtitle: 'Prepare, edit, and manage class lesson plans' },
          homework: { title: 'Homework', subtitle: 'Record and publish daily homework' },
          assignment: { title: 'Assignment', subtitle: 'Prepare and publish class assignments' },
          quiz: { title: 'Quiz', subtitle: 'Prepare topic quizzes for students to attempt' },
          curriculum: { title: 'Curriculum', subtitle: 'Manage and select books for current and next session' },
        }
        const info = titleMap[subPage] || { title: 'ACDMC', subtitle: 'Academics planning and tracking' }
        return { pageTitle: info.title, pageSubtitle: info.subtitle, showBackButton: false, backTo: null }
      }
      case 'actvt': {
        const subPage = segments[1] || ''
        const houseId = segments[2] || ''
        if (subPage === 'houses' && houseId) {
          return {
            pageTitle: 'House details',
            pageSubtitle: 'Members, teachers, council and points for this house.',
            showBackButton: true,
            backTo: '/actvt/houses',
          }
        }
        if (subPage === 'students' && houseId) {
          return {
            pageTitle: 'Student activity profile',
            pageSubtitle: 'Participation, certificates and achievements.',
            showBackButton: true,
            // Opened from a house or the student council: go back to wherever it came from.
            backTo: 'history',
          }
        }
        if (subPage === 'clubs' && houseId) {
          return {
            pageTitle: 'Club details',
            pageSubtitle: 'Incharge, members, meeting day and activities.',
            showBackButton: true,
            backTo: '/actvt/clubs',
          }
        }
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          board: { title: 'Activity board', subtitle: 'Plan, run and score house and school activities.' },
          calendar: { title: 'Activity board', subtitle: 'Plan, run and score house and school activities.' },
          clubs: { title: 'Clubs', subtitle: 'Each club’s logo, colour, members and meeting day.' },
          houses: { title: 'Houses', subtitle: 'Houses, their colours and the students in each.' },
          'student-council': { title: 'Student council', subtitle: 'School and house councils, posts and members.' },
          ranking: { title: 'House ranking', subtitle: 'Points and live standings for every house.' },
          certificates: { title: 'Certificates', subtitle: 'Print certificates for activity participants.' },
          tours: { title: 'Tours & trips', subtitle: 'Educational tours, trips and student feedback.' },
          sports: { title: 'Sports', subtitle: 'Sports facilities, teams and events.' },
          functions: { title: 'Functions', subtitle: 'Plan and record school functions.' },
        }
        const info = titleMap[subPage] || { title: 'Activities', subtitle: 'Co-curricular and cultural activities.' }
        return { pageTitle: info.title, pageSubtitle: info.subtitle, showBackButton: false, backTo: null }
      }
      case 'mdcl': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          cases: {
            title: 'Medical Cases',
            subtitle: 'Minor treatments, first aid, prescriptions, and supplies used',
          },
          supplies: {
            title: 'Medical Supplies',
            subtitle: 'Clinic stock, reorder levels, and expiry tracking',
          },
        }
        const info = titleMap[subPage] || { title: 'MDCL', subtitle: 'School medical clinic log book and supplies' }
        return { pageTitle: info.title, pageSubtitle: info.subtitle, showBackButton: false, backTo: null }
      }
      case 'cpitl': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          dashboard: { title: 'Fee dashboard', subtitle: 'What has been collected, what is due and who is behind.' },
          'fee-structures': { title: 'Fee structures', subtitle: 'Fee heads, instalments and version history.' },
          collection: { title: 'Fee collection', subtitle: 'Find a student, see their dues and collect fees.' },
          students: { title: 'Student fee ledger', subtitle: 'Instalments, concessions and payments.' },
          'fee-slips': { title: 'Fee slips', subtitle: 'Print fee slips for pending dues.' },
          payments: { title: 'Receipts', subtitle: 'Every fee receipt, day by day.' },
          settings: { title: 'Fee settings', subtitle: 'Fee heads, receipts and concession presets.' },
          expenses: { title: 'Expense overview', subtitle: 'Spending by type, and income against expense.' },
          operating: { title: 'Operating costs', subtitle: 'Day-to-day spending by category.' },
          fuel: { title: 'Fuel', subtitle: 'Fuel log and cost per vehicle.' },
          electricity: { title: 'Electricity', subtitle: 'Bills, units and cost per connection.' },
          infra: { title: 'Infrastructure', subtitle: 'Development projects, budgets and payments.' },
          budgets: { title: 'Budgets', subtitle: 'Budget against actual, and next year’s plan.' },
          salary: { title: 'Staff salaries', subtitle: 'Salary structures and statutory deductions.' },
          payroll: { title: 'Payroll', subtitle: 'Monthly salary runs and payslips.' },
        }
        const info = titleMap[subPage] || { title: 'Finance', subtitle: 'Fees, expenses and payroll.' }
        const detailBack: Record<string, string> = {
          'fee-structures': '/cpitl/fee-structures',
          students: '/cpitl/collection',
          infra: '/cpitl/infra',
          payroll: '/cpitl/payroll',
        }
        const hasDetail = Boolean(detailBack[subPage]) && Boolean(segments[2])
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: hasDetail,
          backTo: hasDetail ? detailBack[subPage] : null,
        }
      }
      case 'asets': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          dashboard: { title: 'Asset overview', subtitle: 'What the school owns, where it is and what needs attention.' },
          assets: { title: 'All assets', subtitle: 'The asset register, with a profile for every item.' },
          categories: { title: 'Categories', subtitle: 'How assets are grouped.' },
          locations: { title: 'Locations', subtitle: 'Campus, blocks, floors and rooms, and what is in each.' },
          allocations: { title: 'Allocations', subtitle: 'Who and where each asset is assigned to.' },
          transfers: { title: 'Transfers', subtitle: 'Asset moves between locations, with full history.' },
          maintenance: { title: 'Maintenance', subtitle: 'Repairs, issues and preventive schedules.' },
          stock: { title: 'Stock / store', subtitle: 'Consumables and quantity-based items.' },
          audits: { title: 'Audits', subtitle: 'Physical checks against the register.' },
          vendors: { title: 'Vendors', subtitle: 'Suppliers and service providers.' },
          procurement: { title: 'Procurement', subtitle: 'Purchase requests through to received assets.' },
          disposals: { title: 'Disposal', subtitle: 'Retiring and disposing of assets formally.' },
          reports: { title: 'Reports', subtitle: 'Registers, valuation and operational reports.' },
          settings: { title: 'Asset settings', subtitle: 'Alerts, approvals and module defaults.' },
        }
        const info = titleMap[subPage] || { title: 'Assets', subtitle: 'School asset management.' }
        const detailBack = segments[2] && (subPage === 'assets' || subPage === 'locations') ? `/asets/${subPage}` : null
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: Boolean(detailBack),
          backTo: detailBack,
        }
      }
      case 'trnst': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          '': { title: 'Transport', subtitle: 'Vehicles, routes and who comes on their own.' },
          vehicles: { title: 'Vehicles', subtitle: 'Buses and vans, their crew and paper renewals.' },
          routes: { title: 'Routes', subtitle: 'Pickup routes, stops and the vehicle on each.' },
          'self-students': { title: 'Self students', subtitle: 'Students who come to school without school transport.' },
        }
        const info = titleMap[subPage] || { title: 'Transport', subtitle: 'School transport.' }
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: false,
          backTo: null,
        }
      }
      case 'attnd': {
        const subPage = segments[1] || ''
        const titleMap: Record<string, { title: string; subtitle: string }> = {
          attndboard: { title: 'Attndboard', subtitle: 'Who is in today, and where absences are adding up.' },
          'staff-attendance': { title: 'Staff attendance', subtitle: 'Tick the days each staff member was absent, then save.' },
          'student-attendance': { title: 'Student attendance', subtitle: 'Tick the days each student was absent, then save.' },
        }
        const info = titleMap[subPage] || { title: 'Attendance', subtitle: 'Staff and student attendance for this session.' }
        return {
          pageTitle: info.title,
          pageSubtitle: info.subtitle,
          showBackButton: false,
          backTo: null,
        }
      }
      default:
        return {
          pageTitle: seg
            .split('-')
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' '),
          pageSubtitle: 'Management',
          showBackButton: isDetailRoute ?? false,
          backTo: backToPath,
        }
    }
  }, [location.pathname])

  const headerSearchConfig = useMemo(() => {
    const path = location.pathname
    if (path === '/stickers') {
      return {
        enabled: true,
        placeholder: 'Search subject name or code...',
        paramKey: 'q',
      }
    }

    return {
      enabled: false,
      placeholder: 'Search...',
      paramKey: null,
    }
  }, [location.pathname])

  const headerSearchValue = headerSearchConfig.enabled
    ? searchParams.get(headerSearchConfig.paramKey || '') || ''
    : ''

  const handleHeaderSearchChange = (value: string) => {
    if (!headerSearchConfig.enabled || !headerSearchConfig.paramKey) return

    const nextParams = new URLSearchParams(searchParams)
    if (value.trim()) {
      nextParams.set(headerSearchConfig.paramKey, value)
    } else {
      nextParams.delete(headerSearchConfig.paramKey)
    }
    setSearchParams(nextParams, { replace: true })
  }

  const notifications = [
    { id: 1, message: 'New exam scheduled for Grade 12', time: '2 hours ago', type: 'info' },
    { id: 2, message: 'Room allocation updated', time: '4 hours ago', type: 'warning' },
    { id: 3, message: 'Teacher John Smith registered', time: '6 hours ago', type: 'success' },
  ]

  const dashboardDateLabel = useMemo(() => {
    const now = new Date()
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
    const date = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${weekday}, ${date}`
  }, [])

  const { data: onboardingStatus } = useOnboardingStatus()
  const showOnboardingBanner =
    !!onboardingStatus?.hasSession && !onboardingStatus?.isComplete

  const { data: centreDetails } = useCentreDetails({
    enabled: isDashboardRoute && canAccessCentreDetails,
  })
  const dashboardCentreLabel = useMemo(() => {
    if (!isDashboardRoute || !canAccessCentreDetails) return ''
    const centreNo = String(centreDetails?.centreNo || '').trim()
    const centreName = String(centreDetails?.centreName || '').trim()
    return [centreNo, centreName].filter(Boolean).join(' - ')
  }, [canAccessCentreDetails, centreDetails, isDashboardRoute])

  const dashboardHeaderLabel = dashboardCentreLabel.trim()

  useEffect(() => {
    setDraftPeriodsPerWeek(periodsPerWeek)
  }, [periodsPerWeek])

  useEffect(() => {
    if (!isDistributionRoute) {
      setEditingPeriodsPerWeek(false)
    }
  }, [isDistributionRoute])

  const handleSavePeriodsPerWeek = () => {
    if (draftPeriodsPerWeek > 0) {
      setPeriodsPerWeek(draftPeriodsPerWeek)
    }
    setEditingPeriodsPerWeek(false)
  }

  return (
    <header
      className="cb-app cb-shellhead"
    >
      <div className="h-full px-3 md:px-6 flex items-center">
        <div className="flex items-center justify-between w-full gap-6">
          {/* Left: Page context + optional back */}
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <Button
              variant="tertiary"
              size="sm"
              icon={PanelLeft}
              onClick={onToggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            />
            <span className="cb-shellhead__divider" aria-hidden="true" />
            {showBackButton && backTo && (
              <button
                type="button"
                onClick={() => {
                  if (backTo === 'history') {
                    // React Router keeps the in-app history position in history.state.idx.
                    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
                    else navigate('/actvt/houses')
                    return
                  }
                  navigate(backTo)
                }}
                className="p-2 bg-white/50 dark:bg-secondary-800/50 hover:bg-white dark:hover:bg-secondary-700 text-secondary-600 dark:text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl shadow-sm hover:shadow-md border border-secondary-200 dark:border-secondary-700 transition-all duration-200 flex-shrink-0 group"
                aria-label="Go back"
              >
                <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            {isDashboardRoute ? (
              dashboardHeaderLabel ? (
                <div className="min-w-0 rounded-xl border border-secondary-200/70 dark:border-secondary-700 bg-white/70 dark:bg-secondary-800/40 px-3 py-2 shadow-sm">
                  <h1 className="text-sm sm:text-base md:text-lg font-bold text-secondary-900 dark:text-white truncate tracking-tight">
                    {dashboardHeaderLabel}
                  </h1>
                </div>
              ) : canAccessCentreDetails ? (
                <button
                  type="button"
                  onClick={() => navigate('/centre-details')}
                  className="min-w-0 rounded-lg border border-dashed border-primary-300 dark:border-primary-700 bg-primary-50/60 dark:bg-primary-900/20 px-2.5 py-1.5 shadow-sm hover:bg-primary-100/60 dark:hover:bg-primary-900/40 transition-colors group"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 group-hover:text-primary-700 dark:group-hover:text-primary-300">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Set up Centre Details
                  </span>
                </button>
              ) : null
            ) : (
              <div className="min-w-0">
                <h1 className="cb-shellhead__title truncate">{pageTitle}</h1>
                <p className="cb-shellhead__subtitle hidden sm:block truncate">{pageSubtitle}</p>
              </div>
            )}
            {isStudentAttendanceRoute || isStaffAttendanceRoute ? <AttndModeSwitch /> : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            {isDistributionRoute && (
              <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white dark:bg-secondary-800/60 border border-secondary-200 dark:border-secondary-700 shadow-sm">
                <span className="text-xs font-semibold text-secondary-700 dark:text-secondary-300 whitespace-nowrap">
                  Periods / Week
                </span>
                {editingPeriodsPerWeek ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draftPeriodsPerWeek}
                      aria-label="Periods per week"
                      title="Periods per week"
                      onChange={(e) => setDraftPeriodsPerWeek(parseInt(e.target.value, 10) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSavePeriodsPerWeek()
                        if (e.key === 'Escape') setEditingPeriodsPerWeek(false)
                      }}
                      className="w-14 px-2 py-1 text-xs font-semibold text-center rounded-md border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900 text-secondary-800 dark:text-secondary-100 outline-none focus:border-primary-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSavePeriodsPerWeek}
                      className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPeriodsPerWeek(false)}
                      className="text-[11px] font-semibold text-secondary-500 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-200"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xl leading-none font-bold text-primary-600 dark:text-primary-400 min-w-7 text-center">
                      {periodsPerWeek}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftPeriodsPerWeek(periodsPerWeek)
                        setEditingPeriodsPerWeek(true)
                      }}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-secondary-200 dark:border-secondary-600 text-[11px] font-semibold text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                      Edit
                    </button>
                  </>
                )}
              </div>
            )}
            {/* Onboarding Banner */}
            {showOnboardingBanner && location.pathname !== '/onboarding' && (
              <button
                type="button"
                onClick={() => navigate('/onboarding')}
                className="cb-btn cb-btn--secondary cb-btn--sm hidden sm:inline-flex"
              >
                <span className="cb-shellhead__warndot" aria-hidden="true" />
                Finish setting up
              </button>
            )}

            {/* Academic Session */}
            {currentSession && (
              <span className="cb-shellhead__session hidden sm:inline-flex" title="Academic session">
                <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
                Session {formatSessionLabel(currentSession)}
              </span>
            )}
            {isDashboardRoute && (
              <div className="hidden lg:block">
                <span className="text-sm font-semibold text-secondary-700 dark:text-secondary-200">
                  {dashboardDateLabel}
                </span>
              </div>
            )}
            {/* Search: a page-level filter on pages that have one, otherwise the ⌘K command palette */}
            {headerSearchConfig.enabled ? (
              <div className="hidden md:block cb-shellhead__search">
                <div className="cb-input cb-input--sm">
                  <Search size={16} strokeWidth={1.75} className="cb-icon cb-input__icon" aria-hidden />
                  <input
                    type="search"
                    value={headerSearchValue}
                    onChange={(event) => handleHeaderSearchChange(event.target.value)}
                    placeholder={headerSearchConfig.placeholder}
                    aria-label={headerSearchConfig.placeholder || 'Search'}
                  />
                </div>
              </div>
            ) : (
              <div className="hidden md:block cb-shellhead__search">
                <button
                  type="button"
                  className="cb-input cb-input--sm cb-shellhead__searchbtn"
                  onClick={openPalette}
                  aria-label={`Search (${shortcutLabel})`}
                  aria-keyshortcuts="Meta+K Control+K"
                >
                  <Search size={16} strokeWidth={1.75} className="cb-icon cb-input__icon" aria-hidden />
                  <span className="cb-shellhead__searchtext">Search…</span>
                  <kbd className="cb-shellhead__searchkbd">{shortcutLabel}</kbd>
                </button>
              </div>
            )}
            <div className="md:hidden">
              <Button variant="tertiary" icon={Search} onClick={openPalette} aria-label="Search" title="Search" />
            </div>

            {/* Notifications */}
            <div className="relative">
              <Button
                variant="tertiary"
                icon={Bell}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="Notifications, 3 new"
                aria-expanded={notificationsOpen}
                title="Notifications"
                className={`cb-shellhead__bell${notificationsOpen ? ' is-open' : ''}`}
              />
              <span className="cb-shellhead__belldot" aria-hidden="true" />

              {/* Notifications Dropdown */}
              {notificationsOpen && (
                <div className="cb-menu__panel cb-menu__panel--end cb-shellhead__notifications" role="dialog" aria-label="Notifications">
                  <div className="cb-shellhead__notifhead">
                    <span className="cb-card__title">Notifications</span>
                    <Badge tone="accent" dot={false}>3 new</Badge>
                  </div>
                  <ul className="cb-shellhead__notiflist">
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <span
                          className={`cb-shellhead__notifdot is-${notification.type === 'info' ? 'info' : notification.type === 'warning' ? 'warning' : 'success'}`}
                          aria-hidden="true"
                        />
                        <span>
                          <span className="cb-shellhead__notiftext">{notification.message}</span>
                          <span className="cb-shellhead__notiftime">{notification.time}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="cb-shellhead__notiffoot">
                    <Button variant="tertiary" size="sm" fullWidth>
                      View all notifications
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close notifications */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setNotificationsOpen(false)}
          aria-hidden="true"
        />
      )}
    </header>
  )
}

export default Header
