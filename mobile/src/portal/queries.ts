import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ReplyInput } from '@/services/calendarTypes'
import { portalService } from '@/services/portalService'

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

export const usePortalNotices = () => useQuery({ queryKey: portalKeys.notices(), queryFn: portalService.notices, staleTime: STALE })

export const usePortalNotice = (id?: string) =>
  useQuery({ queryKey: portalKeys.notice(id ?? ''), queryFn: () => portalService.notice(id as string), enabled: Boolean(id), staleTime: STALE })

/** The family's calendar between two school days (all linked children merged). */
export const usePortalCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: portalKeys.calendar(from, to),
    queryFn: () => portalService.calendar(from, to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

/** An event's full view (description, attachments, parts) when the list item doesn't carry its parts. */
export const usePortalEvent = (id?: string | null) =>
  useQuery({ queryKey: portalKeys.event(id ?? ''), queryFn: () => portalService.calendarEvent(id as string), enabled: Boolean(id) })

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
