import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import calendarService, {
  type EventInput,
  type PersonType,
  type RuleInput,
  type Segment,
} from '@/services/calendarService'

export const calendarKeys = {
  all: ['calendar'] as const,
  mine: (from: string, to: string, layers?: string[]) => [...calendarKeys.all, 'mine', from, to, layers?.join(',') || ''] as const,
  view: (id: string) => [...calendarKeys.all, 'view', id] as const,
  events: (status?: string, mine?: boolean) => [...calendarKeys.all, 'events', status || '', Boolean(mine)] as const,
  event: (id: string) => [...calendarKeys.all, 'event', id] as const,
  options: () => [...calendarKeys.all, 'audience-options'] as const,
  people: (q: string, kind: PersonType, by?: string) => [...calendarKeys.all, 'people', q, kind, by || ''] as const,
  schoolDays: (from?: string, to?: string, all?: boolean) => [...calendarKeys.all, 'school-days', from || '', to || '', Boolean(all)] as const,
}

export const useMyCalendar = (from: string, to: string, options: { layers?: string[]; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: calendarKeys.mine(from, to, options.layers),
    queryFn: () => calendarService.mine({ from, to, layers: options.layers }),
    enabled: options.enabled !== false && Boolean(from && to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

export const useEventView = (id?: string | null) =>
  useQuery({ queryKey: calendarKeys.view(id || ''), queryFn: () => calendarService.view(id as string), enabled: Boolean(id) })

export const useCalendarEvents = (status?: string, mine?: boolean, enabled = true) =>
  useQuery({ queryKey: calendarKeys.events(status, mine), queryFn: () => calendarService.events({ status, mine }), enabled })

export const useCalendarEvent = (id?: string | null) =>
  useQuery({ queryKey: calendarKeys.event(id || ''), queryFn: () => calendarService.event(id as string), enabled: Boolean(id) })

export const useAudienceOptions = (enabled = true) =>
  useQuery({ queryKey: calendarKeys.options(), queryFn: calendarService.audienceOptions, enabled, staleTime: 5 * 60_000 })

export const usePeopleSearch = (q: string, kind: PersonType, by?: 'student') =>
  useQuery({
    queryKey: calendarKeys.people(q, kind, by),
    queryFn: () => calendarService.people(q, kind, by),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  })

export const useSchoolDays = (params: { from?: string; to?: string; all?: boolean } = {}, enabled = true) =>
  useQuery({
    queryKey: calendarKeys.schoolDays(params.from, params.to, params.all),
    queryFn: () => calendarService.schoolDays(params),
    enabled,
    placeholderData: keepPreviousData,
  })

const useInvalidate = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: calendarKeys.all })
}

export const useCreateEvent = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: EventInput) => calendarService.create(input), onSuccess: invalidate })
}

export const useUpdateEvent = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EventInput> & { notify?: 'affected' | 'everyone' | 'none' } }) =>
      calendarService.update(id, input),
    onSuccess: invalidate,
  })
}

export const useEventAction = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (action:
      | { type: 'publish'; id: string; publishAt?: string | null }
      | { type: 'approve'; id: string }
      | { type: 'reject'; id: string; note: string }
      | { type: 'cancel'; id: string; reason?: string; occurrence?: string | null; notify?: boolean }
      | { type: 'delete'; id: string }) => {
      switch (action.type) {
        case 'publish': return calendarService.publish(action.id, action.publishAt)
        case 'approve': return calendarService.approve(action.id)
        case 'reject': return calendarService.reject(action.id, action.note)
        case 'cancel': return calendarService.cancel(action.id, action)
        default: return calendarService.remove(action.id)
      }
    },
    onSuccess: invalidate,
  })
}

export const useAudiencePreview = () => useMutation({ mutationFn: (segments: Segment[]) => calendarService.preview(segments) })

export const useSaveRule = () => {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RuleInput }) =>
      (id ? calendarService.updateRule(id, input) : calendarService.createRule(input)),
    onSuccess: invalidate,
  })
}

export const useImportRules = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (rules: RuleInput[]) => calendarService.createRules(rules), onSuccess: invalidate })
}

export const useCancelRule = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => calendarService.cancelRule(id, reason), onSuccess: invalidate })
}
