import { useLocalSearchParams, useRouter } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { useMemo } from 'react'
import { View } from 'react-native'

import { htmlDocument } from '@/components/htmlDocument'
import { HtmlView } from '@/components/HtmlView'
import { formatDate } from '@/lib/format'
import { usePortalNotice } from '@/portal/queries'
import { useTheme } from '@/theme/ThemeProvider'
import { space } from '@/theme/tokens'
import { Button, Card, EmptyState, Screen, Skeleton } from '@/ui'

/** One circular: its title, date and the school's own formatting. */
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const notice = usePortalNotice(id)
  const back = () => (router.canGoBack() ? router.back() : router.replace('/notices'))

  const html = useMemo(() => {
    if (!notice.data) return ''
    const { referenceSeries: series = '', referenceNumber: number = '' } = notice.data
    // The number is often stored with its series already in front ("CIR/2026-27/001").
    const reference = number && series && !number.startsWith(series) ? `${series.replace(/\/+$/, '')}/${number}` : number || series
    return htmlDocument({
      title: notice.data.title,
      subtitle: [formatDate(notice.data.circularDate), reference ? `No. ${reference}` : ''].filter(Boolean).join(' · '),
      body: notice.data.content || '<p>This notice has no text.</p>',
      colors,
    })
  }, [notice.data, colors])

  if (notice.data) {
    return (
      <Screen title="Notice" onBack={back} scroll={false}>
        <HtmlView html={html} />
      </Screen>
    )
  }

  return (
    <Screen title="Notice" onBack={back}>
      {notice.isError ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="Notice not found"
            body="It may have been withdrawn by the school."
            action={<Button label="Back to notices" variant="secondary" onPress={back} />}
          />
        </Card>
      ) : (
        <View style={{ gap: space['space-3'] }}>
          <Skeleton width="70%" height={22} />
          <Skeleton width="30%" height={14} />
          <Skeleton height={240} />
        </View>
      )}
    </Screen>
  )
}
