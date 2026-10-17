import { useQuery } from '@tanstack/react-query'
import portalService from './portalService'

const keys = {
  all: ['portal'] as const,
  home: () => [...keys.all, 'home'] as const,
  student: (id: string, part: string, extra = '') => [...keys.all, 'student', id, part, extra] as const,
  notices: () => [...keys.all, 'notices'] as const,
  notice: (id: string) => [...keys.all, 'notice', id] as const,
}

const STALE = 2 * 60 * 1000

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

export const usePortalResults = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'results'), queryFn: () => portalService.results(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalFees = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'fees'), queryFn: () => portalService.fees(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalTransport = (id?: string, enabled = true) =>
  useQuery({ queryKey: keys.student(id || '', 'transport'), queryFn: () => portalService.transport(id as string), enabled: Boolean(id) && enabled, staleTime: STALE })

export const usePortalNotices = (enabled = true) =>
  useQuery({ queryKey: keys.notices(), queryFn: portalService.notices, enabled, staleTime: STALE })

export const usePortalNotice = (id?: string) =>
  useQuery({ queryKey: keys.notice(id || ''), queryFn: () => portalService.notice(id as string), enabled: Boolean(id), staleTime: STALE })
