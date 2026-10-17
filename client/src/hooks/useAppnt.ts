import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import appntService, {
  type AppointmentAction,
  type AppointmentSettings,
  type BookingPayload,
  type HostPayload,
  type ListParams,
} from '@/services/appntService'

export const appntKeys = {
  all: ['appnt'] as const,
  today: (date: string) => [...appntKeys.all, 'today', date] as const,
  list: (params: ListParams) => [...appntKeys.all, 'list', params] as const,
  item: (id: string) => [...appntKeys.all, 'item', id] as const,
  hosts: (all: boolean) => [...appntKeys.all, 'hosts', all] as const,
  myHost: () => [...appntKeys.all, 'hosts', 'me'] as const,
  slots: (hostId: string, date: string) => [...appntKeys.all, 'slots', hostId, date] as const,
  settings: () => [...appntKeys.all, 'settings'] as const,
  staff: () => [...appntKeys.all, 'lookup', 'staff'] as const,
  students: () => [...appntKeys.all, 'lookup', 'students'] as const,
  report: (from: string, to: string) => [...appntKeys.all, 'report', from, to] as const,
}

export const useAppntToday = (date: string, enabled = true) =>
  useQuery({ queryKey: appntKeys.today(date), queryFn: () => appntService.today(date), enabled, refetchInterval: 60_000 })

export const useAppointments = (params: ListParams) =>
  useQuery({ queryKey: appntKeys.list(params), queryFn: () => appntService.list(params), placeholderData: keepPreviousData })

export const useAppointment = (id?: string) =>
  useQuery({ queryKey: appntKeys.item(id || ''), queryFn: () => appntService.get(id as string), enabled: Boolean(id) })

export const useAppntHosts = (all = false, enabled = true) =>
  useQuery({ queryKey: appntKeys.hosts(all), queryFn: () => appntService.hosts(all), enabled, staleTime: 60_000 })

export const useMyHost = (enabled = true) =>
  useQuery({ queryKey: appntKeys.myHost(), queryFn: appntService.myHost, enabled, retry: false })

export const useSlots = (hostId: string, date: string) =>
  useQuery({ queryKey: appntKeys.slots(hostId, date), queryFn: () => appntService.slots(hostId, date), enabled: Boolean(hostId && date) })

export const useAppntSettings = (enabled = true) =>
  useQuery({ queryKey: appntKeys.settings(), queryFn: appntService.settings, enabled, staleTime: 5 * 60_000 })

export const useStaffOptions = (enabled = true) =>
  useQuery({ queryKey: appntKeys.staff(), queryFn: appntService.staff, enabled, staleTime: 5 * 60_000 })

export const useStudentOptions = (enabled = true) =>
  useQuery({ queryKey: appntKeys.students(), queryFn: appntService.students, enabled, staleTime: 5 * 60_000 })

export const useAppntReport = (from: string, to: string) =>
  useQuery({ queryKey: appntKeys.report(from, to), queryFn: () => appntService.report({ from, to }), placeholderData: keepPreviousData })

const useInvalidate = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: appntKeys.all })
}

export const useBookAppointment = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ payload, walkIn }: { payload: BookingPayload; walkIn?: boolean }) =>
      (walkIn ? appntService.walkIn(payload) : appntService.book(payload)),
    onSuccess: invalidate,
  })
}

export const useAppointmentAction = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: AppointmentAction; note?: string }) => appntService.act(id, action, note),
    onSuccess: invalidate,
  })
}

export const useReschedule = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; date: string; startTime: string; overrideTeaching?: boolean; note?: string }) =>
      appntService.reschedule(id, payload),
    onSuccess: invalidate,
  })
}

export const useSaveNotes = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => appntService.saveNotes(id, notes),
    onSuccess: invalidate,
  })
}

export const useSaveHost = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, payload, mine }: { id?: string; payload: HostPayload; mine?: boolean }) => {
      if (mine) return appntService.updateMyAvailability(payload)
      return id ? appntService.updateHost(id, payload) : appntService.createHost(payload)
    },
    onSuccess: invalidate,
  })
}

export const useSaveAppntSettings = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (payload: Partial<AppointmentSettings>) => appntService.saveSettings(payload),
    onSuccess: invalidate,
  })
}
