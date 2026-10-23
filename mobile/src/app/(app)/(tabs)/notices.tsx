import { useRouter } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { View } from 'react-native'

import { formatDate } from '@/lib/format'
import { usePortalNotices } from '@/portal/queries'
import { space } from '@/theme/tokens'
import { Button, Card, EmptyState, ListRow, Screen, Skeleton } from '@/ui'

/** Circulars the school has published, newest first. */
export default function NoticesScreen() {
  const router = useRouter()
  const notices = usePortalNotices()

  return (
    <Screen title="Notices" refreshing={notices.isRefetching} onRefresh={notices.refetch}>
      <Card flush>
        {notices.isPending ? (
          <View style={{ padding: space['space-4'], gap: space['space-5'] }}>
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={{ gap: space['space-2'] }}>
                <Skeleton width="80%" />
                <Skeleton width="30%" height={12} />
              </View>
            ))}
          </View>
        ) : notices.isError ? (
          <EmptyState
            title="Notices didn't load"
            body={notices.error.message}
            action={<Button label="Try again" variant="secondary" onPress={() => notices.refetch()} />}
          />
        ) : notices.data.length === 0 ? (
          <EmptyState icon={Bell} title="No notices yet" body="New circulars from the school show here." />
        ) : (
          notices.data.map((notice, index) => (
            <ListRow
              key={notice._id}
              primary={notice.title}
              secondary={formatDate(notice.circularDate)}
              lines={3}
              divider={index < notices.data.length - 1}
              onPress={() => router.push({ pathname: '/notice/[id]', params: { id: notice._id } })}
            />
          ))
        )}
      </Card>
    </Screen>
  )
}
