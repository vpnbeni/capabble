import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'

import { formatDate } from '@/lib/format'
import { usePortalNotices } from '@/portal/queries'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { ListGroup, MobileScreen, NavBar, SearchBar, StatusView, Surface } from '@/ui'

/** Circulars the school has published, newest first. */
export default function NoticesScreen() {
  const router = useRouter()
  const notices = usePortalNotices()
  const [query, setQuery] = useState('')
  const all = useMemo(() => notices.data ?? [], [notices.data])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    return words ? all.filter((notice) => notice.title.toLowerCase().includes(words)) : all
  }, [all, query])

  return (
    <MobileScreen tabs refreshing={notices.isRefetching} onRefresh={notices.refetch} nav={<NavBar large title="Notices" />}>
      {all.length > 6 ? <SearchBar placeholder="Search notices" value={query} onChange={setQuery} /> : null}
      {notices.isPending ? (
        <CardSkeleton rows={4} />
      ) : notices.isError ? (
        <LoadFailed what="Notices" error={notices.error} onRetry={notices.refetch} />
      ) : shown.length === 0 ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            title={query ? `No notices match "${query.trim()}"` : 'No notices yet'}
            body={query ? 'Try another word from the title.' : 'Circulars from school show here.'}
          />
        </Surface>
      ) : (
        <ListGroup
          items={shown.map((notice) => ({
            title: notice.title,
            subtitle: formatDate(notice.circularDate),
            lines: 2,
            onPress: () => router.push({ pathname: '/notice/[id]', params: { id: notice._id } }),
          }))}
        />
      )}
    </MobileScreen>
  )
}
