import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { eventService, type EventPatch } from '@/services/eventService'

import { staffKeys } from './queries'

/** Managing events: the creator's list, one event, its replies, and the changes. */
export const eventKeys = {
  all: [...staffKeys.all, 'events'] as const,
  list: (everyone: boolean) => [...eventKeys.all, 'list', everyone] as const,
  detail: (id: string) => [...eventKeys.all, 'detail', id] as const,
  replies: (id: string) => [...eventKeys.all, 'replies', id] as const,
}

export const useEventList = (everyone: boolean, enabled = true) =>
  useQuery({ queryKey: eventKeys.list(everyone), queryFn: () => eventService.list(everyone), staleTime: 30_000, enabled })

export const useEventDetail = (id?: string) =>
  useQuery({ queryKey: eventKeys.detail(id ?? ''), queryFn: () => eventService.get(id as string), enabled: Boolean(id) })

/** Only events that ask families to reply have anything here. */
export const useEventReplies = (id?: string, enabled = true) =>
  useQuery({ queryKey: eventKeys.replies(id ?? ''), queryFn: () => eventService.replies(id as string), enabled: Boolean(id) && enabled, staleTime: 30_000 })

/** Anything that changes an event refreshes the lists, the calendar and the principal's approvals. */
const useRefresh = () => {
  const queryClient = useQueryClient()
  return (id: string) => {
    queryClient.invalidateQueries({ queryKey: eventKeys.all })
    queryClient.invalidateQueries({ queryKey: staffKeys.myEvents() })
    queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'calendar'] })
    queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'approvals'] })
    queryClient.removeQueries({ queryKey: eventKeys.detail(id) })
  }
}

export const useUpdateEvent = () => {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) => eventService.update(id, patch), onSuccess: (_, { id }) => refresh(id) })
}

export const usePublishEvent = () => {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => eventService.publish(id), onSuccess: (_, id) => refresh(id) })
}

export const useCancelEvent = () => {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, reason, notify }: { id: string; reason: string; notify: boolean }) => eventService.cancel(id, reason, notify),
    onSuccess: (_, { id }) => refresh(id),
  })
}

export const useDeleteEvent = () => {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => eventService.remove(id), onSuccess: (_, id) => refresh(id) })
}

export const useRemindPending = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, segmentKey }: { id: string; segmentKey?: string }) => eventService.remind(id, segmentKey),
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: eventKeys.replies(id) }),
  })
}
