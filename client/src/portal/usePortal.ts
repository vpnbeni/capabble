import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import portalService, { type PortalAppointmentRequest } from './portalService'

const keys = {
  all: ['portal'] as const,
  home: () => [...keys.all, 'home'] as const,
  student: (id: string, part: string, extra = '') => [...keys.all, 'student', id, part, extra] as const,
  notices: () => [...keys.all, 'notices'] as const,
  appointments: () => [...keys.all, 'appointments'] as const,
  notice: (id: string) => [...keys.all, 'notice', id] as const,
  calendar: (from: string, to: string) => [...keys.all, 'calendar', from, to] as const,
}

const STALE = 2 * 60 * 1000

/** The family's calendar between two school days (all linked children merged). */
export const usePortalCalendar = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () => portalService.calendar(from, to),
    enabled: enabled && Boolean(from && to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

export const usePortalHome = () => useQuery({ queryKey: keys.home(), queryFn: portalService.home, staleTime: STALE })

export const usePortalProfile = (id?: string) =>
  useQuery({ queryKey: keys.student(id || '', 'profile'), queryFn: () => portalService.profile(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalAttendance = (id: string | undefined, month: string, enabled = true) =>
  useQuery({
    queryKey: keys.student(id || '', 'attendance', month),
    queryFn: () => portalService.attendance(id as string, month),
    enabled: Boolean(id) && enabled,
    staleTime: STALE,
  })

export const usePortalTimetable = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'timetable'), queryFn: () => portalService.timetable(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalHomework = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'homework'), queryFn: () => portalService.homework(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalResults = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'results'), queryFn: () => portalService.results(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalFees = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'fees'), queryFn: () => portalService.fees(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalTransport = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'transport'), queryFn: () => portalService.transport(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

/** Live bus position: every 10 s while the bus is on a trip, every minute otherwise. */
export const usePortalBusLive = (id?: string, enabled = true) =>
  useQuery({
    queryKey: keys.student(id || '', 'transport', 'live'),
    queryFn: () => portalService.busLive(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => (query.state.data?.active ? 10_000 : 60_000),
  })

export const usePortalNotices = (enabled = true) =>
  useQuery({ queryKey: keys.notices(), queryFn: portalService.notices, enabled, staleTime: STALE })

export const usePortalNotice = (id?: string) =>
  useQuery({ queryKey: keys.notice(id || ''), queryFn: () => portalService.notice(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalAppointments = (enabled = true) =>
  useQuery({ queryKey: keys.appointments(), queryFn: portalService.appointments, enabled })

export const usePortalAppointmentHosts = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'appointment-hosts'), queryFn: () => portalService.appointmentHosts(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalAppointmentSlots = (id: string | undefined, hostId: string, date: string) =>
  useQuery({
    queryKey: keys.student(id || '', 'appointment-slots', `${hostId}|${date}`),
    queryFn: () => portalService.appointmentSlots(id as string, hostId, date),
    enabled: Boolean(id && hostId && date),
  })

export const useRequestAppointment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, payload }: { studentId: string; payload: PortalAppointmentRequest }) => portalService.requestAppointment(studentId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export const useCancelAppointment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => portalService.cancelAppointment(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}
