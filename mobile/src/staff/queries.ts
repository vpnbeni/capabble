import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { fileStore } from '@/lib/fileStore'
import { shortClass } from '@/lib/format'
import { appntService, type AppointmentAction } from '@/services/appntService'
import type { ReplyInput } from '@/services/calendarTypes'
import { notificationService } from '@/services/notificationService'
import { studentService } from '@/services/studentService'
import { staffService, type NewEvent, type RosterStudent } from '@/services/staffService'

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

// Notifications (the bell on Today).
const notificationKeys = {
  all: [...staffKeys.all, 'notifications'] as const,
  count: [...staffKeys.all, 'notifications', 'count'] as const,
}

/** Unread count for the bell: refreshed every minute while the app is open. */
export const useUnreadCount = (enabled = true) =>
  useQuery({ queryKey: notificationKeys.count, queryFn: notificationService.unreadCount, refetchInterval: 60_000, staleTime: 30_000, enabled })

export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: notificationKeys.all,
    queryFn: ({ pageParam }) => notificationService.list(pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? notificationService.markAllRead() : notificationService.markRead(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
