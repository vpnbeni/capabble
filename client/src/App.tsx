import { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { getCurrentUser, selectIsAuthenticated, selectAuthLoading, selectUser } from './redux/slices/authSlice'
import { useAcademicSession } from './contexts/AcademicSessionContext'
import authService from './services/authService'
import type { AppDispatch } from './redux/store'

// Pages
import Dashboard from './pages/Dashboard'
import CentreDetails from './pages/CentreDetails'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import TenantSignupChat from './pages/TenantSignupChat'
import TenantSignupComplete from './pages/TenantSignupComplete'
import Signup from './pages/Signup'
import CntrLanding from './pages/CntrLanding'
import TmtblLanding from './pages/TmtblLanding'
import StdntLanding from './pages/StdntLanding'
import StudentInfo from './pages/StudentInfo'
import Students from './pages/Students'
import StudentProfile from './pages/StudentProfile'
import StaafStaffMembers from './pages/StaafStaffMembers'
import StaafOverview from './pages/StaafOverview'
import StaafStaffGroup from './pages/StaafStaffGroup'
import StaafOrgStructure from './pages/StaafOrgStructure'
import StaafRecruitment from './pages/StaafRecruitment'
import Teachers from './pages/Teachers'
import TeacherDetail from './pages/TeacherDetail'
import Duties from './pages/Duties'
import UndertakingForm from './pages/UndertakingForm'
// Students feature removed
import Candidates from './pages/Candidates'
import CandidateDetail from './pages/CandidateDetail'
import Subjects from './pages/Subjects'
import DateSheets from './pages/DateSheets'
import RoomAllocation from './pages/RoomAllocation'
import AnswerSheets from './pages/AnswerSheets'
import CentreGuidelines from './pages/CentreGuidelines'
import CBSECirculars from './pages/CBSECirculars'
import CBSEPortals from './pages/CBSEPortals'
import SchoolHub from './pages/SchoolHub'
import Staff from './pages/Staff'
import Activities from './pages/Activities'
import BellTimings from './pages/timetable/BellTimings'
import TimetableTeachers from './pages/timetable/TimetableTeachers'
import TimetableClasses from './pages/timetable/TimetableClasses'
import TimetableSubjects from './pages/timetable/TimetableSubjects'
import ClassWise from './pages/timetable/ClassWise'
import TeacherWise from './pages/timetable/TeacherWise'
import PeriodAllocation from './pages/timetable/PeriodAllocation'
import Departments from './pages/timetable/Departments'
import Substitution from './pages/timetable/Substitution'
import Versions from './pages/timetable/Versions'
import Generate from './pages/timetable/Generate'
import Formats from './pages/timetable/Formats'
import { TimetableProvider } from './contexts/TimetableContext'
import Form66 from './pages/Form66'
import SeatingPlan from './pages/SeatingPlan'
import AnswerSheetDetails from './pages/AnswerSheetDetails'
import Attendance from './pages/Attendance'
import PwdInfo from './pages/PwdInfo'
import Umcs from './pages/Umcs'
import Stickers from './pages/Stickers'
import Performas from './pages/Performas'
import DispatchSlip from './pages/DispatchSlip'
import Remuneration from './pages/Remuneration'
import RemunerationDetails from './pages/RemunerationDetails'
import DropdownExamples from './pages/DropdownExamples'
import DialogShowcase from './pages/DialogShowcase'
import Billing from './pages/Billing'
import AccountSettings from './pages/AccountSettings'
import HelpSupport from './pages/HelpSupport'
import SessionSelector from './pages/SessionSelector'
import Pricing from './pages/Pricing'
import ExmclCirculars from './pages/ExmclCirculars'
import ExmclResult from './pages/ExmclResult'
import ExmclReportCard from './pages/ExmclReportCard'
import ExmclAwardList from './pages/ExmclAwardList'
import ExmclAwardListFormat from './pages/ExmclAwardListFormat'
import ExmclAdmitCards from './pages/ExmclAdmitCards'
import ExmclAdmitCardFormat from './pages/ExmclAdmitCardFormat'
import ExmclReportCardFormat from './pages/ExmclReportCardFormat'
import ExmclQuestionPapers from './pages/ExmclQuestionPapers'
import ExmclSyllabus from './pages/ExmclSyllabus'
import ExmclMarksDistribution from './pages/ExmclMarksDistribution'
import ExmclExams from './pages/ExmclExams'
import ExmclDatesheets from './pages/ExmclDatesheets'
import ExmclSubjects from './pages/ExmclSubjects'
import ExmclCbseRegistration from './pages/ExmclCbseRegistration'
import AttndStaffAttendance from './pages/AttndStaffAttendance'
import AttndStudentAttendance from './pages/AttndStudentAttendance'
import Attndboard from './pages/Attndboard'
import AlmniDirectory from './pages/AlmniDirectory'
import TrnstOverview from './pages/TrnstOverview'
import TrnstVehicles from './pages/TrnstVehicles'
import TrnstRoutes from './pages/TrnstRoutes'
import TrnstSelfStudents from './pages/TrnstSelfStudents'
import AcdmcLessonPlan from './pages/acdmc/AcdmcLessonPlan'
import AcdmcHomework from './pages/acdmc/AcdmcHomework'
import AcdmcAssignment from './pages/acdmc/AcdmcAssignment'
import AcdmcQuiz from './pages/acdmc/AcdmcQuiz'
import AcdmcCurriculum from './pages/acdmc/AcdmcCurriculum'
import ActvtClubs from './pages/actvt/ActvtClubs'
import ActvtClubDetail from './pages/actvt/ActvtClubDetail'
import ActvtHouses from './pages/actvt/ActvtHouses'
import ActvtHouseDetail from './pages/actvt/ActvtHouseDetail'
import ActvtStudentCouncil from './pages/actvt/ActvtStudentCouncil'
import ActvtStudentProfile from './pages/actvt/ActvtStudentProfile'
import ActvtBoard from './pages/actvt/ActvtBoard'
import ActvtHouseRanking from './pages/actvt/ActvtHouseRanking'
import ActvtCertificates from './pages/actvt/ActvtCertificates'
import ActvtTours from './pages/actvt/ActvtTours'
import ActvtSports from './pages/actvt/ActvtSports'
import ActvtFunctions from './pages/actvt/ActvtFunctions'
import MdclCases from './pages/mdcl/MdclCases'
import MdclSupplies from './pages/mdcl/MdclSupplies'
import AsetsDashboard from './pages/asets/AsetsDashboard'
import AsetsAssets from './pages/asets/AsetsAssets'
import AsetsAssetDetail from './pages/asets/AsetsAssetDetail'
import { AsetsCategories, AsetsVendors } from './pages/asets/AsetsSimplePages'
import AsetsLocations from './pages/asets/AsetsLocations'
import AsetsLocationDetail from './pages/asets/AsetsLocationDetail'
import {
  AsetsAllocations,
  AsetsTransfers,
  AsetsMaintenance,
  AsetsStock,
  AsetsAudits,
  AsetsProcurement,
  AsetsDisposals,
  AsetsReports,
  AsetsSettings,
} from './pages/asets/AsetsWorkflowPages'
import { OnboardingPage, ValidationReportPage } from './pages/Onboarding'
import { getPublicBrandVariant } from './utils/publicBranding'

// Components
import Layout from './components/layout/Layout'
import ProtectedRoute from './routes/ProtectedRoute'
import Loader from './components/common/Loader'

const LegacyCandidatesRedirect = () => {
  const location = useLocation()
  const nextPath = location.pathname.replace(/^\/candidates/, '/candidate-details')
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />
}

const PublicLanding = () => {
  const variant = getPublicBrandVariant()

  if (variant === 'tmtbl') return <TmtblLanding />
  if (variant === 'stdnt') return <StdntLanding />
  return <CntrLanding />
}

function App() {
  const dispatch = useDispatch<AppDispatch>()
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const loading = useSelector(selectAuthLoading)
  const user = useSelector(selectUser)
  const { hasSession } = useAcademicSession()

  const timetableFeatureEnabled = user?.featureToggles?.timetable_classes !== false

  useEffect(() => {
    // Initialize auth on app startup
    authService.initializeAuth()

    // Refresh current user (and feature toggles) once on mount when token exists.
    const token = authService.getToken()
    if (token) {
      dispatch(getCurrentUser())
    }
  }, [dispatch])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Routes>
          {/* Public Routes */}
          <Route path="/pricing" element={<Pricing />} />
          <Route
            path="/"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <PublicLanding />
              )
            }
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <Login />
              )
            }
          />
          <Route
            path="/forgot-password"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <ForgotPassword />
              )
            }
          />
          <Route
            path="/signup"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <Signup />
              )
            }
          />
          <Route
            path="/signupold"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <TenantSignupChat />
              )
            }
          />
          <Route
            path="/signup/complete"
            element={
              isAuthenticated ? (
                hasSession ? <Navigate to="/dashboard" replace /> : <Navigate to="/select-session" replace />
              ) : (
                <TenantSignupComplete />
              )
            }
          />

          {/* Session Selection (authenticated but no session yet) */}
          <Route
            path="/select-session"
            element={
              !isAuthenticated ? (
                <Navigate to="/" replace />
              ) : hasSession ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <SessionSelector />
              )
            }
          />

          {/* Onboarding (authenticated, has session, but needs onboarding) */}
          <Route
            path="/onboarding"
            element={
              !isAuthenticated ? (
                <Navigate to="/" replace />
              ) : !hasSession ? (
                <Navigate to="/select-session" replace />
              ) : (
                <OnboardingPage />
              )
            }
          />
          <Route
            path="/onboarding/validation"
            element={
              !isAuthenticated ? (
                <Navigate to="/" replace />
              ) : !hasSession ? (
                <Navigate to="/select-session" replace />
              ) : (
                <ValidationReportPage />
              )
            }
          />

          {/* Protected Routes */}
          <Route path="/" element={<ProtectedRoute />}>
            <Route
              path="/"
              element={
                timetableFeatureEnabled ? (
                  <TimetableProvider>
                    <Layout />
                  </TimetableProvider>
                ) : (
                  <Layout />
                )
              }
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="school-hub" element={<SchoolHub />} />
              <Route path="staff" element={<Staff />} />
              <Route path="activities" element={<Activities />} />
              <Route path="time-table/teachers" element={<TimetableTeachers />} />
              <Route path="time-table/classes" element={<TimetableClasses />} />
              <Route path="time-table/subjects" element={<TimetableSubjects />} />
              <Route path="time-table/departments" element={<Departments />} />
              <Route path="time-table/bell-timings" element={<BellTimings />} />
              <Route path="time-table/generate" element={<Generate />} />
              <Route path="time-table/class-wise" element={<ClassWise />} />
              <Route path="time-table/teacher-wise" element={<TeacherWise />} />
              <Route path="time-table/substitution" element={<Substitution />} />
              <Route path="time-table/versions" element={<Versions />} />
              <Route path="time-table/formats" element={<Formats />} />
              <Route path="time-table/period-distribution" element={<PeriodAllocation />} />
              <Route path="time-table/distribution" element={<Navigate to="/time-table/period-distribution" replace />} />
              <Route path="time-table/period-allocation" element={<Navigate to="/time-table/period-distribution" replace />} />
              <Route path="time-table" element={<Navigate to="/time-table/classes" replace />} />
              <Route path="stdnt/stdntboard" element={<StudentInfo />} />
              <Route path="stdnt/student-info" element={<Navigate to="/stdnt/stdntboard" replace />} />
              <Route path="stdnt/students" element={<Students />} />
              <Route path="stdnt/students/:id" element={<StudentProfile />} />
              <Route path="stdnt/classes" element={<TimetableClasses />} />
              <Route
                path="stdnt/subjects"
                element={<TimetableSubjects showParallelSubjectPairs={false} showCommonPeriod={false} />}
              />
              <Route path="stdnt/alumni" element={<AlmniDirectory />} />
              <Route path="stdnt" element={<Navigate to="/stdnt/stdntboard" replace />} />
              <Route path="staaf/overview" element={<StaafOverview />} />
              <Route path="staaf/organisation-structure" element={<StaafOrgStructure />} />
              <Route path="staaf/teaching-staff" element={<StaafStaffGroup group="teaching" />} />
              <Route path="staaf/sports-coach" element={<StaafStaffGroup group="sportsCoach" />} />
              <Route path="staaf/admin-staff" element={<StaafStaffGroup group="admin" />} />
              <Route path="staaf/drivers" element={<StaafStaffGroup group="drivers" />} />
              <Route path="staaf/conductors" element={<StaafStaffGroup group="conductors" />} />
              <Route path="staaf/security" element={<StaafStaffGroup group="security" />} />
              <Route path="staaf/recruitment" element={<StaafRecruitment />} />
              <Route path="staaf/staff-members" element={<StaafStaffMembers />} />
              <Route path="staaf" element={<Navigate to="/staaf/overview" replace />} />
              <Route path="attnd/attndboard" element={<Attndboard />} />
              <Route path="attnd/staff-attendance" element={<AttndStaffAttendance />} />
              <Route path="attnd/student-attendance" element={<AttndStudentAttendance />} />
              <Route path="attnd" element={<Navigate to="/attnd/attndboard" replace />} />
              <Route path="almni" element={<Navigate to="/stdnt/alumni" replace />} />
              <Route path="trnst/vehicles" element={<TrnstVehicles />} />
              <Route path="trnst/routes" element={<TrnstRoutes />} />
              <Route path="trnst/self-students" element={<TrnstSelfStudents />} />
              <Route path="trnst" element={<TrnstOverview />} />
              <Route path="acdmc/lesson-plan" element={<AcdmcLessonPlan />} />
              <Route path="acdmc/homework" element={<AcdmcHomework />} />
              <Route path="acdmc/assignment" element={<AcdmcAssignment />} />
              <Route path="acdmc/quiz" element={<AcdmcQuiz />} />
              <Route path="acdmc/curriculum" element={<AcdmcCurriculum />} />
              <Route path="acdmc" element={<Navigate to="/acdmc/lesson-plan" replace />} />
              <Route path="actvt/houses" element={<ActvtHouses />} />
              <Route path="actvt/houses/:id" element={<ActvtHouseDetail />} />
              <Route path="actvt/student-council" element={<ActvtStudentCouncil />} />
              <Route path="actvt/students/:id" element={<ActvtStudentProfile />} />
              <Route path="actvt/clubs" element={<ActvtClubs />} />
              <Route path="actvt/clubs/:id" element={<ActvtClubDetail />} />
              <Route path="actvt/board" element={<ActvtBoard />} />
              <Route path="actvt/calendar" element={<ActvtBoard />} />
              <Route path="actvt/ranking" element={<ActvtHouseRanking />} />
              <Route path="actvt/certificates" element={<ActvtCertificates />} />
              <Route path="actvt/tours" element={<ActvtTours />} />
              <Route path="actvt/sports" element={<ActvtSports />} />
              <Route path="actvt/functions" element={<ActvtFunctions />} />
              <Route path="actvt" element={<Navigate to="/actvt/houses" replace />} />
              <Route path="mdcl/cases" element={<MdclCases />} />
              <Route path="mdcl/supplies" element={<MdclSupplies />} />
              <Route path="mdcl" element={<Navigate to="/mdcl/cases" replace />} />
              <Route path="asets/dashboard" element={<AsetsDashboard />} />
              <Route path="asets/assets" element={<AsetsAssets />} />
              <Route path="asets/assets/:id" element={<AsetsAssetDetail />} />
              <Route path="asets/categories" element={<AsetsCategories />} />
              <Route path="asets/locations" element={<AsetsLocations />} />
              <Route path="asets/locations/:id" element={<AsetsLocationDetail />} />
              <Route path="asets/allocations" element={<AsetsAllocations />} />
              <Route path="asets/transfers" element={<AsetsTransfers />} />
              <Route path="asets/maintenance" element={<AsetsMaintenance />} />
              <Route path="asets/stock" element={<AsetsStock />} />
              <Route path="asets/audits" element={<AsetsAudits />} />
              <Route path="asets/vendors" element={<AsetsVendors />} />
              <Route path="asets/procurement" element={<AsetsProcurement />} />
              <Route path="asets/disposals" element={<AsetsDisposals />} />
              <Route path="asets/reports" element={<AsetsReports />} />
              <Route path="asets/settings" element={<AsetsSettings />} />
              <Route path="asets" element={<Navigate to="/asets/dashboard" replace />} />
              <Route path="centre-details" element={<CentreDetails />} />
              <Route
                path="exam-functionaries"
                element={<Teachers hidePagination includeAllRecords uiOnlyDelete />}
              />
              <Route path="exam-functionaries/:id" element={<TeacherDetail />} />
              <Route path="duties" element={<Duties />} />
              <Route path="undertaking" element={<UndertakingForm />} />
              {/* Legacy redirects */}
              <Route path="teachers" element={<Navigate to="/exam-functionaries" replace />} />
              <Route path="teachers/:id" element={<Navigate to="/exam-functionaries/:id" replace />} />
              {/* Students feature removed */}
              <Route path="candidate-details" element={<Candidates />} />
              <Route path="candidate-details/:id" element={<CandidateDetail />} />
              <Route path="candidates/*" element={<LegacyCandidatesRedirect />} />
              <Route path="dispatch-slip" element={<DispatchSlip />} />
              <Route path="remuneration" element={<Remuneration />} />
              <Route path="remuneration/:id" element={<RemunerationDetails />} />
              <Route path="exmcl/centre-details" element={<CentreDetails />} />
              <Route
                path="exmcl/exam-functionaries"
                element={<Teachers hidePagination includeAllRecords uiOnlyDelete />}
              />
              <Route path="exmcl/exam-functionaries/:id" element={<TeacherDetail />} />
              <Route path="exmcl/duties" element={<Duties />} />
              <Route path="exmcl/candidate-details" element={<Candidates />} />
              <Route path="exmcl/candidate-details/:id" element={<CandidateDetail />} />
              <Route path="exmcl/candidates/*" element={<Navigate to="/exmcl/candidate-details" replace />} />
              <Route path="exmcl/cbse-registration" element={<ExmclCbseRegistration />} />
              <Route path="exmcl/seatingplan" element={<SeatingPlan />} />
              <Route path="exmcl/subjects" element={<ExmclSubjects />} />
              <Route path="exmcl/datesheets" element={<ExmclDatesheets />} />
              <Route path="exmcl/examrooms" element={<RoomAllocation />} />
              <Route path="exmcl/rooms" element={<Navigate to="/exmcl/examrooms" replace />} />
              <Route path="exmcl/answersheets" element={<AnswerSheets />} />
              <Route path="exmcl/answersheets/:id" element={<AnswerSheetDetails />} />
              <Route path="exmcl/attendance" element={<Attendance />} />
              <Route path="exmcl/performas/award-list" element={<ExmclAwardListFormat />} />
              <Route path="exmcl/performas/admit-card" element={<ExmclAdmitCardFormat />} />
              <Route path="exmcl/performas/report-card" element={<ExmclReportCardFormat />} />
              <Route path="exmcl/performas" element={<Performas />} />
              <Route path="exmcl/centre-guidelines" element={<ExmclCirculars />} />
              <Route path="exmcl/admit-cards" element={<ExmclAdmitCards />} />
              <Route path="exmcl/exams" element={<ExmclExams />} />
              <Route path="exmcl/result" element={<ExmclResult />} />
              <Route path="exmcl/report-card" element={<ExmclReportCard />} />
              <Route path="exmcl/award-list" element={<ExmclAwardList />} />
              <Route path="exmcl/question-papers" element={<ExmclQuestionPapers />} />
              <Route path="exmcl/syllabus" element={<ExmclSyllabus />} />
              <Route path="exmcl/marks-distribution" element={<ExmclMarksDistribution />} />
              <Route path="exmcl" element={<Navigate to="/exmcl/centre-details" replace />} />
              <Route path="form66" element={<Form66 />} />
              <Route path="seatingplan" element={<SeatingPlan />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="datesheets" element={<DateSheets />} />
              <Route path="examrooms" element={<RoomAllocation />} />
              {/* Legacy redirect */}
              <Route path="rooms" element={<Navigate to="/examrooms" replace />} />
              <Route path="answersheets" element={<AnswerSheets />} />
              <Route path="answersheets/:id" element={<AnswerSheetDetails />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="pwd-info" element={<PwdInfo />} />
              <Route path="umcs" element={<Umcs />} />
              <Route path="stickers" element={<Stickers />} />
              <Route path="performas" element={<Performas />} />
              <Route path="centre-guidelines" element={<CentreGuidelines />} />
              <Route path="cbse-circulars" element={<CBSECirculars />} />
              <Route path="cbse-portals" element={<CBSEPortals />} />
              <Route path="billing" element={<Billing />} />
              <Route path="account-settings" element={<AccountSettings />} />
              <Route path="help-support" element={<HelpSupport />} />
              <Route path="dropdown-examples" element={<DropdownExamples />} />
              <Route path="dialog-showcase" element={<DialogShowcase />} />
            </Route>
          </Route>

          {/* Catch all route */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
                  <p className="text-gray-600 dark:text-gray-400 mb-8">Page not found</p>
                  <Link
                    to="/"
                    className="btn btn-primary"
                  >
                    Back to Home
                  </Link>
                </div>
              </div>
            }
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
