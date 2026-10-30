import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { fileStore } from '@/lib/fileStore'
import { shortClass } from '@/lib/format'
import { appntService, type AppointmentAction, type BookingInput } from '@/services/appntService'
import type { ReplyInput } from '@/services/calendarTypes'
import { clinicService, type ClinicSupplyInput, type ClinicVisitInput } from '@/services/clinicService'
import { examService, type SubjectMark } from '@/services/examService'
import { lessonService, type LessonStatus } from '@/services/lessonService'
import { homeworkService, type HomeworkInput, type HomeworkStatus, type SubmissionRow, type WorkKind } from '@/services/homeworkService'
import { notificationService } from '@/services/notificationService'
import { studentService, type StudentInput } from '@/services/studentService'
import { staffService, type StaffInput, type NewEvent, type RosterStudent } from '@/services/staffService'
import { useSession } from '@/session/SessionProvider'

// React Query hooks for the staff app. Writes invalidate `staffKeys.all` parts they touch.

export const staffKeys = {
  all: ['staff'] as const,
  timetable: (from: string, to: string) => [...staffKeys.all, 'timetable', from, to] as const,
  registers: (date: string) => [...staffKeys.all, 'registers', date] as const,
  roster: (className: string, section: string) => [...staffKeys.all, 'roster', className, section] as const,
  register: (date: string, className: string, section: string) => [...staffKeys.all, 'register', date, className, section] as const,
  calendar: (from: string, to: string) => [...staffKeys.all, 'calendar', from, to] as const,
  event: (id: string) => [...staffKeys.all, 'calendar-event', id] as const,
  myEvents: () => [...staffKeys.all, 'my-events'] as const,
  audience: () => [...staffKeys.all, 'audience'] as const,
}

/** The signed-in teacher's periods, day by day (at most 14 days). */
export const useMyTimetable = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: staffKeys.timetable(from, to),
    queryFn: () => staffService.myTimetable(from, to),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    enabled,
  })

/** Class registers this login may see for a day, marked or not. */
export const useRegisters = (date: string, enabled = true) =>
  useQuery({
    queryKey: staffKeys.registers(date),
    queryFn: () => staffService.registers(date),
    staleTime: 60_000,
    enabled,
  })

const rosterFile = (className: string, section: string) => `roster-${encodeURIComponent(`${className}|${section}`)}`

export type Roster = { students: RosterStudent[]; savedAt: string; offline: boolean }

/**
 * A class list for the roll call. Each one loaded is kept on the phone, so a teacher can
 * still take the register without a connection (marked `offline` with when it was saved).
 */
export const fetchRoster = async (className: string, section: string): Promise<Roster> => {
  try {
    const students = await staffService.roster(className, section)
    const roster = { students, savedAt: new Date().toISOString(), offline: false }
    fileStore.write(rosterFile(className, section), roster).catch(() => undefined)
    return roster
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      const saved = await fileStore.read<Roster>(rosterFile(className, section))
      if (saved) return { ...saved, offline: true }
    }
    throw error
  }
}

export const useRoster = (className?: string, section?: string) =>
  useQuery({
    queryKey: staffKeys.roster(className ?? '', section ?? ''),
    queryFn: () => fetchRoster(className as string, section as string),
    enabled: Boolean(className && section),
    staleTime: 10 * 60 * 1000,
  })

/** The absent students already saved for a class and day (empty when offline: the roll starts from all present). */
export const useRegisterMarks = (date: string, className?: string, section?: string) =>
  useQuery({
    queryKey: staffKeys.register(date, className ?? '', section ?? ''),
    queryFn: async () => {
      try {
        const data = await staffService.register(date, className as string, section as string)
        return { absent: data.records.filter((record) => record.status === 'A').map((record) => String(record.studentId)), offline: false }
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) return { absent: [] as string[], offline: true }
        throw error
      }
    },
    enabled: Boolean(className && section),
    staleTime: 30_000,
  })

export const useStaffCalendar = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: staffKeys.calendar(from, to),
    queryFn: () => staffService.calendar(from, to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })

export const useStaffEvent = (id?: string | null, enabled = true) =>
  useQuery({ queryKey: staffKeys.event(id ?? ''), queryFn: () => staffService.calendarEvent(id as string), enabled: enabled && Boolean(id) })

export const useStaffRespond = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: ReplyInput }) => staffService.respondToEvent(eventId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'calendar'] })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'calendar-event'] })
    },
  })
}

export const useMyEvents = (enabled = true) =>
  useQuery({ queryKey: staffKeys.myEvents(), queryFn: staffService.myEvents, staleTime: 60_000, enabled })

export const useAudienceOptions = (enabled = true) =>
  useQuery({ queryKey: staffKeys.audience(), queryFn: staffService.audienceOptions, staleTime: 10 * 60 * 1000, enabled })

export const useCreateEvent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (event: NewEvent) => staffService.createEvent(event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.myEvents() })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'calendar'] })
    },
  })
}

// Appointments (hosts). Writes refresh every meeting list.
const meetingKeys = {
  all: [...staffKeys.all, 'meetings'] as const,
  day: (date: string) => [...staffKeys.all, 'meetings', 'day', date] as const,
  list: (kind: string, from: string) => [...staffKeys.all, 'meetings', 'list', kind, from] as const,
  host: () => [...staffKeys.all, 'meetings', 'host'] as const,
}

export const useMeetingDay = (date: string, enabled = true) =>
  useQuery({ queryKey: meetingKeys.day(date), queryFn: () => appntService.day(date), staleTime: 30_000, enabled })

/** Requests still to answer, or confirmed meetings after today, soonest first. */
export const useMeetingList = (kind: 'requests' | 'upcoming', from: string, enabled = true) =>
  useQuery({
    queryKey: meetingKeys.list(kind, from),
    queryFn: () => appntService.list({ status: kind === 'requests' ? 'requested' : 'confirmed', from, sort: 'upcoming' }),
    staleTime: 30_000,
    enabled,
  })

export const useMyHost = (enabled = true) =>
  useQuery({ queryKey: meetingKeys.host(), queryFn: appntService.myHost, retry: false, enabled })

export const useMeetingAction = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: AppointmentAction; note?: string }) => appntService.act(id, action, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meetingKeys.all }),
  })
}

export const useSaveMeetingNotes = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => appntService.saveNotes(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meetingKeys.all }),
  })
}

export const useMeetingHosts = (enabled = true) => useQuery({ queryKey: [...meetingKeys.all, 'hosts'], queryFn: appntService.hosts, staleTime: 60_000, enabled })

export const useAllHosts = (enabled = true) => useQuery({ queryKey: [...meetingKeys.all, 'hosts', 'all'], queryFn: appntService.allHosts, staleTime: 60_000, enabled })
export const useHostCandidates = (enabled = true) =>
  useQuery({ queryKey: [...meetingKeys.all, 'staff'], queryFn: appntService.staff, staleTime: 5 * 60 * 1000, enabled })
export const useCreateHost = () => useMeetingWrite((teacherId: string) => appntService.createHost(teacherId))

export const useHostSlots = (hostId: string, date: string) =>
  useQuery({ queryKey: [...meetingKeys.all, 'slots', hostId, date], queryFn: () => appntService.slots(hostId, date), enabled: Boolean(hostId && date), staleTime: 15_000 })

export const useDeskSettings = () => useQuery({ queryKey: [...meetingKeys.all, 'settings'], queryFn: appntService.settings, staleTime: 10 * 60 * 1000 })

export const useDeskStudents = (enabled = true) =>
  useQuery({ queryKey: [...meetingKeys.all, 'students'], queryFn: appntService.students, staleTime: 10 * 60 * 1000, enabled })

const useMeetingWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: meetingKeys.all }) })
}

export const useBookMeeting = () => useMeetingWrite(({ input, walkIn }: { input: BookingInput; walkIn: boolean }) => (walkIn ? appntService.walkIn(input) : appntService.book(input)))
export const useRescheduleMeeting = () => useMeetingWrite(({ id, date, startTime }: { id: string; date: string; startTime: string }) => appntService.reschedule(id, date, startTime))
export const useUpdateHost = () =>
  useMeetingWrite(({ id, changes }: { id: string; changes: Parameters<typeof appntService.updateHost>[1] }) => appntService.updateHost(id, changes))

export const useSaveMyHours = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: appntService.saveMyHours,
    onSuccess: (host) => queryClient.setQueryData(meetingKeys.host(), host),
  })
}

// Principal's glance and approvals.
const glanceKeys = {
  approvals: [...staffKeys.all, 'approvals'] as const,
  event: (id: string) => [...staffKeys.all, 'approvals', 'event', id] as const,
  attendance: (date: string) => [...staffKeys.all, 'glance', 'attendance', date] as const,
  fees: [...staffKeys.all, 'glance', 'fees'] as const,
}

export const usePendingEvents = (enabled = true) =>
  useQuery({ queryKey: glanceKeys.approvals, queryFn: staffService.pendingEvents, staleTime: 30_000, enabled })

export const useEventRecord = (id?: string | null) =>
  useQuery({ queryKey: glanceKeys.event(id ?? ''), queryFn: () => staffService.eventRecord(id as string), enabled: Boolean(id) })

export const useEventDecision = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      decision === 'approve' ? staffService.approveEvent(id) : staffService.rejectEvent(id, note ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: glanceKeys.approvals })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'calendar'] })
    },
  })
}

export const useAttendanceGlance = (date: string, enabled = true) =>
  useQuery({ queryKey: glanceKeys.attendance(date), queryFn: () => staffService.attendanceGlance(date), staleTime: 60_000, enabled })

export const useFeesGlance = (enabled = true) =>
  useQuery({ queryKey: glanceKeys.fees, queryFn: staffService.feesGlance, staleTime: 5 * 60 * 1000, enabled })

// Students (Classes and Students tabs).
const studentKeys = {
  all: [...staffKeys.all, 'students'] as const,
  classes: (scope: string) => [...staffKeys.all, 'students', 'classes', scope] as const,
  roster: (className: string, section: string) => [...staffKeys.all, 'students', 'roster', className, section] as const,
  search: (q: string) => [...staffKeys.all, 'students', 'search', q] as const,
  one: (id: string) => [...staffKeys.all, 'students', 'one', id] as const,
}

export type ClassSection = { className: string; section: string; students: number }

const classOrder = (name: string) => {
  const n = Number(shortClass(name))
  return Number.isFinite(n) ? n : -1
}
const sortClasses = (rows: ClassSection[]) =>
  rows.sort((a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className) || a.section.localeCompare(b.section))

/**
 * The class-sections this login can see, with how many students: whole-school logins from the
 * school's counts, "own classes only" logins from their own (server-limited) student list.
 */
export const useClassSections = (wholeSchool: boolean, enabled = true) =>
  useQuery({
    queryKey: studentKeys.classes(wholeSchool ? 'all' : 'mine'),
    queryFn: async (): Promise<ClassSection[]> => {
      if (wholeSchool) {
        const stats = await studentService.stats()
        return sortClasses(
          stats.byClassSection
            .filter((row) => row._id.class && row._id.section && row.active)
            .map((row) => ({ className: row._id.class, section: row._id.section, students: row.active })),
        )
      }
      const { students } = await studentService.list({})
      const counts = new Map<string, ClassSection>()
      students.forEach((student) => {
        const key = `${student.class}|${student.section}`
        const entry = counts.get(key) ?? { className: student.class, section: student.section, students: 0 }
        entry.students += 1
        counts.set(key, entry)
      })
      return sortClasses([...counts.values()])
    },
    staleTime: 10 * 60 * 1000,
    enabled,
  })

export const useClassRoster = (className?: string, section?: string) =>
  useQuery({
    queryKey: studentKeys.roster(className ?? '', section ?? ''),
    queryFn: async () => (await studentService.list({ class: className, section })).students,
    enabled: Boolean(className && section),
    staleTime: 10 * 60 * 1000,
  })

export const useStudentSearch = (q: string) =>
  useQuery({
    queryKey: studentKeys.search(q),
    queryFn: async () => (await studentService.list({ search: q, limit: 30 })).students,
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

export const useStudentRecord = (id?: string) =>
  useQuery({ queryKey: studentKeys.one(id ?? ''), queryFn: () => studentService.get(id as string), enabled: Boolean(id), staleTime: 5 * 60 * 1000 })

/** Adds a student, or changes only the given fields of one. */
export const useSaveStudent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: StudentInput }) => (id ? studentService.update(id, input) : studentService.create(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentKeys.all }),
  })
}

export const useAlumni = (search: string, enabled = true) =>
  useQuery({ queryKey: [...studentKeys.all, 'alumni', search], queryFn: () => studentService.alumni(search), placeholderData: keepPreviousData, staleTime: 5 * 60 * 1000, enabled })

// Notifications (the bell on Today, and on a family's Home). Families read the portal's list.
const notificationKeys = {
  all: [...staffKeys.all, 'notifications'] as const,
  count: [...staffKeys.all, 'notifications', 'count'] as const,
}
const useFamilyLogin = () => {
  const session = useSession()
  return session.status === 'signedIn' && session.user.kind !== 'staff'
}

/** Unread count for the bell: refreshed every minute while the app is open. */
export const useUnreadCount = (enabled = true) => {
  const family = useFamilyLogin()
  return useQuery({
    queryKey: [...notificationKeys.count, family],
    queryFn: () => notificationService.unreadCount(family),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled,
  })
}

export const useNotifications = () => {
  const family = useFamilyLogin()
  return useInfiniteQuery({
    queryKey: [...notificationKeys.all, 'list', family],
    queryFn: ({ pageParam }) => notificationService.list(family, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })
}

export const useMarkNotificationRead = () => {
  const family = useFamilyLogin()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? notificationService.markAllRead(family) : notificationService.markRead(family, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

// Staff attendance (office).
const staffAttendanceKeys = {
  directory: [...staffKeys.all, 'staff-directory'] as const,
  day: (date: string) => [...staffKeys.all, 'staff-attendance', date] as const,
}

export const useStaffDirectory = (enabled = true) =>
  useQuery({ queryKey: staffAttendanceKeys.directory, queryFn: staffService.staffDirectory, staleTime: 10 * 60 * 1000, enabled })

export const useStaffAttendance = (date: string, enabled = true) =>
  useQuery({ queryKey: staffAttendanceKeys.day(date), queryFn: () => staffService.staffAttendance(date), staleTime: 30_000, enabled })

export const useSaveStaffAttendance = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ date, staffIds, absentIds }: { date: string; staffIds: string[]; absentIds: string[] }) =>
      staffService.saveStaffAttendance(date, staffIds, absentIds),
    onSuccess: (_, { date }) => {
      queryClient.invalidateQueries({ queryKey: staffAttendanceKeys.day(date) })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'glance'] })
    },
  })
}

// Homework.
const homeworkKeys = {
  all: [...staffKeys.all, 'homework'] as const,
  options: [...staffKeys.all, 'homework', 'options'] as const,
  list: (kind: WorkKind, className: string, section: string) => [...staffKeys.all, 'homework', kind, 'list', className, section] as const,
  one: (kind: WorkKind, id: string) => [...staffKeys.all, 'homework', kind, 'one', id] as const,
  roster: (kind: WorkKind, id: string) => [...staffKeys.all, 'homework', kind, 'roster', id] as const,
}

const lessonKeys = {
  all: [...staffKeys.all, 'lessons'] as const,
  week: (from: string) => [...staffKeys.all, 'lessons', from] as const,
  coverage: [...staffKeys.all, 'coverage'] as const,
}

export const useLessonPlans = (from: string, to: string) =>
  useQuery({ queryKey: lessonKeys.week(from), queryFn: async () => (await lessonService.list(from, to)).items, staleTime: 60_000 })

export const useLessonStatus = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: LessonStatus; note?: string }) => lessonService.setStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lessonKeys.all })
      queryClient.invalidateQueries({ queryKey: lessonKeys.coverage })
    },
  })
}

export const useCoverage = () => useQuery({ queryKey: lessonKeys.coverage, queryFn: lessonService.overview, staleTime: 5 * 60 * 1000 })

export const useExamDatesheets = (enabled = true) =>
  useQuery({ queryKey: [...staffKeys.all, 'exam-datesheets'], queryFn: examService.datesheets, staleTime: 10 * 60 * 1000, enabled })

export const usePublishResults = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ examId, published }: { examId: string; published: boolean }) => examService.setPublished(examId, published),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'marks'] }),
  })
}

export const useAcademicOptions = () =>
  useQuery({ queryKey: homeworkKeys.options, queryFn: homeworkService.options, staleTime: 10 * 60 * 1000 })

/** Homework (or assignments, quizzes) due from a date on, for one class or every class this login may see. */
export const useHomeworkList = (className = '', section = '', from = '', kind: WorkKind = 'homework') =>
  useQuery({
    queryKey: homeworkKeys.list(kind, className, section),
    queryFn: async () => (await homeworkService.list(kind, { className: className || undefined, section: section || undefined, from: from || undefined })).items,
    staleTime: 60_000,
  })

export const useHomework = (id?: string, kind: WorkKind = 'homework') =>
  useQuery({ queryKey: homeworkKeys.one(kind, id ?? ''), queryFn: () => homeworkService.get(kind, id as string), enabled: Boolean(id) })

export const useSaveHomework = (kind: WorkKind = 'homework') => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: HomeworkInput }) => (id ? homeworkService.update(kind, id, input) : homeworkService.create(kind, input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: homeworkKeys.all }),
  })
}

export const useHomeworkStatus = (kind: WorkKind = 'homework') => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: HomeworkStatus }) => homeworkService.setStatus(kind, id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: homeworkKeys.all }),
  })
}

export const useWorkRoster = (kind: WorkKind, id?: string) =>
  useQuery({ queryKey: homeworkKeys.roster(kind, id ?? ''), queryFn: () => homeworkService.roster(kind, id as string), enabled: Boolean(id) })

export const useSaveSubmissions = (kind: WorkKind) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rows }: { id: string; rows: SubmissionRow[] }) => homeworkService.saveSubmissions(kind, id, rows),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: homeworkKeys.all }),
  })
}

export const useStaffRecord = (id?: string) =>
  useQuery({ queryKey: [...staffKeys.all, 'colleague', id ?? ''], queryFn: () => staffService.staffRecord(id as string), enabled: Boolean(id), staleTime: 5 * 60 * 1000 })

export const useUpdateStaff = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StaffInput }) => staffService.updateStaff(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'colleague'] })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'colleagues'] })
    },
  })
}

export const useColleagues = (search: string) =>
  useQuery({
    queryKey: [...staffKeys.all, 'colleagues', search] as const,
    queryFn: () => staffService.directory(search),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })

// Marks (exam results).
const marksKeys = {
  all: [...staffKeys.all, 'marks'] as const,
  exams: [...staffKeys.all, 'marks', 'exams'] as const,
  status: (examId: string) => [...staffKeys.all, 'marks', 'status', examId] as const,
  results: (examId: string, className: string, section: string) => [...staffKeys.all, 'marks', 'results', examId, className, section] as const,
}

export const useExams = (enabled = true) => useQuery({ queryKey: marksKeys.exams, queryFn: examService.exams, staleTime: 10 * 60 * 1000, enabled })

export const useEntryStatus = (examId?: string) =>
  useQuery({ queryKey: marksKeys.status(examId ?? ''), queryFn: () => examService.entryStatus(examId as string), enabled: Boolean(examId), staleTime: 30_000 })

export const useClassResults = (examId?: string, className?: string, section?: string) =>
  useQuery({
    queryKey: marksKeys.results(examId ?? '', className ?? '', section ?? ''),
    queryFn: () => examService.results(examId as string, className as string, section as string),
    enabled: Boolean(examId && className && section),
  })

export const useSaveSubjectMarks = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ examId, className, section, subjectId, rows }: { examId: string; className: string; section: string; subjectId: string; rows: SubjectMark[] }) =>
      examService.saveSubject(examId, className, section, subjectId, rows),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marksKeys.all }),
  })
}

// Clinic visits.
const clinicKey = [...staffKeys.all, 'clinic'] as const

export const useClinicVisits = () => useQuery({ queryKey: clinicKey, queryFn: clinicService.list, staleTime: 30_000 })

export const useSaveClinicVisit = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, visit }: { id?: string; visit: ClinicVisitInput }) => (id ? clinicService.update(id, visit) : clinicService.create(visit)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clinicKey }),
  })
}

export const useClinicSupplies = () => useQuery({ queryKey: [...staffKeys.all, 'clinic-supplies'], queryFn: clinicService.supplies, staleTime: 60_000 })

export const useSaveSupply = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ClinicSupplyInput }) => (id ? clinicService.updateSupply(id, input) : clinicService.addSupply(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'clinic-supplies'] }),
  })
}
