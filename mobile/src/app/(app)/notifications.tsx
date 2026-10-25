import { type Href, useRouter } from 'expo-router'
import { Bell, CheckCheck, ChevronDown } from 'lucide-react-native'

import { formatRelative } from '@/lib/format'
import { staffRouteFor } from '@/lib/notificationLinks'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { StaffNotification } from '@/services/notificationService'
import { useMarkNotificationRead, useNotifications } from '@/staff/queries'
import { openWebsite } from '@/staff/useStaff'
import { ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, SwipeRow, useToast } from '@/ui'

/** Staff's notifications, newest first: tap opens the thing (in the app, or on the website) and marks it read. */
export default function NotificationsScreen() {
  const router = useRouter()
  const toast = useToast()
  const list = useNotifications()
  const mark = useMarkNotificationRead()
  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  const unread = list.data?.pages[0]?.unread ?? 0

  const open = (item: StaffNotification) => {
    if (!item.readAt) mark.mutate(item._id)
    const route = item.link ? staffRouteFor(item.link) : null
    if (route) router.push(route as Href)
    else if (item.link?.startsWith('/')) openWebsite(item.link)
  }

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={
        <NavBar
          title="Notifications"
          back={{ label: 'Back', onPress: router.back }}
          actions={
            unread
              ? [
                  {
                    icon: CheckCheck,
                    label: 'Mark all as read',
                    onPress: () => mark.mutate('all', { onSuccess: () => toast('All marked as read') }),
                  },
                ]
              : []
          }
        />
      }
    >
      {list.isPending ? (
        <CardSkeleton rows={5} />
      ) : list.isError ? (
        <LoadFailed what="Your notifications" error={list.error} onRetry={list.refetch} />
      ) : !items.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Bell} title="No notifications yet" body="Approvals, meetings and changes to your calendar show here." />
        </Surface>
      ) : (
        <>
          <ListGroup>
            {items.map((item, index) => (
              <SwipeRow
                key={item._id}
                divider={index > 0}
                unread={!item.readAt}
                title={item.title}
                subtitle={item.body}
                meta={formatRelative(item.createdAt)}
                onPress={() => open(item)}
                actions={item.readAt ? [] : [{ label: 'Mark read', icon: CheckCheck, tone: 'neutral', onPress: () => mark.mutate(item._id) }]}
              />
            ))}
          </ListGroup>
          {list.hasNextPage ? (
            <MobileButton variant="gray" size="medium" icon={ChevronDown} loading={list.isFetchingNextPage} onPress={() => list.fetchNextPage()}>
              Show earlier
            </MobileButton>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
