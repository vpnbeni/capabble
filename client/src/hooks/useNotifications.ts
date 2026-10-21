import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import notificationService, {
  type NotificationAudience,
  type NotificationListParams,
  type NotificationPage,
} from '@/services/notificationService'

/**
 * Notifications are delivered by polling one cheap count every 10 s while the tab
 * is visible (and again on focus). The list is only fetched when it is on screen,
 * and refetched when the count moves. Swap the count query for a stream later
 * without touching callers.
 */
const POLL_MS = 10_000

const keys = {
  all: (audience: NotificationAudience) => ['notifications', audience] as const,
  count: (audience: NotificationAudience) => [...keys.all(audience), 'count'] as const,
  list: (audience: NotificationAudience, params: NotificationListParams) => [...keys.all(audience), 'list', params] as const,
}

export function useUnreadNotificationCount(audience: NotificationAudience) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.count(audience),
    queryFn: () => notificationService.unreadCount(audience),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  })
  const previous = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (query.data === undefined) return
    if (previous.current !== undefined && previous.current !== query.data) {
      queryClient.invalidateQueries({ queryKey: [...keys.all(audience), 'list'] })
    }
    previous.current = query.data
  }, [audience, query.data, queryClient])
  return query
}

export function useNotificationList(
  audience: NotificationAudience,
  params: Omit<NotificationListParams, 'before'> = {},
  enabled = true,
) {
  return useInfiniteQuery<NotificationPage, Error, InfiniteData<NotificationPage>, ReturnType<typeof keys.list>, string | null>({
    queryKey: keys.list(audience, params),
    queryFn: ({ pageParam }) => notificationService.list(audience, { ...params, before: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextBefore,
    enabled,
    staleTime: 15_000,
  })
}

const markLocally = (data: InfiniteData<NotificationPage> | undefined, id: string | null) => {
  if (!data) return data
  const now = new Date().toISOString()
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (!item.readAt && (id === null || item._id === id) ? { ...item, readAt: now } : item)),
    })),
  }
}

/** Mark one (id) or all (null) notifications read, updating the bell straight away. */
export function useMarkNotificationsRead(audience: NotificationAudience) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string | null) => (id ? notificationService.markRead(audience, id) : notificationService.markAllRead(audience)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.all(audience) })
      queryClient.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: [...keys.all(audience), 'list'] }, (data) => markLocally(data, id))
      queryClient.setQueryData<number>(keys.count(audience), (count) => (id ? Math.max(0, (count || 0) - 1) : 0))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(audience) })
    },
  })
}
