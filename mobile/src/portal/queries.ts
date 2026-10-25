import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ReplyInput } from '@/services/calendarTypes'
import { portalService, type PortalAppointmentRequest } from '@/services/portalService'

// React Query hooks for the family portal. Keys match the web (client/src/portal/usePortal.ts).

export const portalKeys = {
  all: ['portal'] as const,
  home: () => [...portalKeys.all, 'home'] as const,
  fees: (studentId: string) => [...portalKeys.all, 'student', studentId, 'fees'] as const,
  notices: () => [...portalKeys.all, 'notices'] as const,
  notice: (id: string) => [...portalKeys.all, 'notice', id] as const,
  calendar: (from: string, to: string) => [...portalKeys.all, 'calendar', from, to] as const,
  event: (id: string) => [...portalKeys.all, 'calendar-event', id] as const,
}

const STALE = 2 * 60 * 1000

export const usePortalHome = (enabled = true) =>
  useQuery({ queryKey: portalKeys.home(), queryFn: portalService.home, staleTime: STALE, enabled })

export const usePortalFees = (studentId?: string) =>
  useQuery({
    queryKey: portalKeys.fees(studentId ?? ''),
    queryFn: () => portalService.fees(studentId as string),
    enabled: Boolean(studentId),
    staleTime: STALE,
  })

export const usePortalNotices = (enabled = true) =>
  useQuery({ queryKey: portalKeys.notices(), queryFn: portalService.notices, staleTime: STALE, enabled })

export const usePortalNotice = (id?: string) =>
  useQuery({ queryKey: portalKeys.notice(id ?? ''), queryFn: () => portalService.notice(id as string), enabled: Boolean(id), staleTime: STALE })

/** The family's calendar between two school days (all linked children merged). */
export const usePortalCalendar = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: portalKeys.calendar(from, to),
    queryFn: () => portalService.calendar(from, to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })

/** An event's full view (description, attachments, parts) when the list item doesn't carry its parts. */
export const usePortalEvent = (id?: string | null) =>
  useQuery({ queryKey: portalKeys.event(id ?? ''), queryFn: () => portalService.calendarEvent(id as string), enabled: Boolean(id) })

const studentKey = (id: string | undefined, part: string, extra = '') => [...portalKeys.all, 'student', id ?? '', part, extra] as const

export const usePortalProfile = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'profile'), queryFn: () => portalService.profile(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalAttendance = (id: string | undefined, month: string) =>
  useQuery({
    queryKey: studentKey(id, 'attendance', month),
    queryFn: () => portalService.attendance(id as string, month),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })

export const usePortalTimetable = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'timetable'), queryFn: () => portalService.timetable(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalHomework = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'homework'), queryFn: () => portalService.homework(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalResults = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'results'), queryFn: () => portalService.results(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalTransport = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'transport'), queryFn: () => portalService.transport(id as string), enabled: Boolean(id), staleTime: STALE })

/** Every 10 s while the bus is on a trip, every minute otherwise. */
export const usePortalBusLive = (id: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: studentKey(id, 'transport', 'live'),
    queryFn: () => portalService.busLive(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => (query.state.data?.active ? 10_000 : 60_000),
  })

export const usePortalAppointments = () =>
  useQuery({ queryKey: [...portalKeys.all, 'appointments'], queryFn: portalService.appointments })

export const usePortalAppointmentHosts = (id?: string) =>
  useQuery({ queryKey: studentKey(id, 'appointment-hosts'), queryFn: () => portalService.appointmentHosts(id as string), enabled: Boolean(id), staleTime: STALE })

export const usePortalAppointmentSlots = (id: string | undefined, hostId: string, date: string) =>
  useQuery({
    queryKey: studentKey(id, 'appointment-slots', `${hostId}|${date}`),
    queryFn: () => portalService.appointmentSlots(id as string, hostId, date),
    enabled: Boolean(id && hostId && date),
  })

export const useRequestAppointment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, payload }: { studentId: string; payload: PortalAppointmentRequest }) =>
      portalService.requestAppointment(studentId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalKeys.all }),
  })
}

export const useCancelAppointment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => portalService.cancelAppointment(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalKeys.all }),
  })
}

export const useRespondToEvent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: ReplyInput }) => portalService.respondToEvent(eventId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...portalKeys.all, 'calendar'] })
      queryClient.invalidateQueries({ queryKey: [...portalKeys.all, 'calendar-event'] })
    },
  })
}
