import { useRouter } from 'expo-router'
import { Award } from 'lucide-react-native'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useExams } from '@/staff/queries'
import { ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** The school's internal exams: each opens its datesheet, how far marks are, and publishing. */
export default function ExamsScreen() {
  const router = useRouter()
  const exams = useExams()
  const rows = [...(exams.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

  return (
    <MobileScreen refreshing={exams.isRefetching} onRefresh={exams.refetch} nav={<NavBar title="Exams" back={{ label: 'Back', onPress: router.back }} />}>
      {exams.isPending ? (
        <CardSkeleton rows={3} />
      ) : exams.isError ? (
        <LoadFailed what="Exams" error={exams.error} onRetry={exams.refetch} />
      ) : rows.length ? (
        <ListGroup
          footer="New exams and their subjects are set up on the website."
          items={rows.map((exam) => ({
            title: exam.name,
            subtitle: [exam.code, exam.maximumMarks ? `Out of ${exam.maximumMarks}` : null].filter(Boolean).join(' · ') || undefined,
            icon: Award,
            tile: 6,
            badge: exam.resultsPublished ? { label: 'Results published', tone: 'success' as const } : { label: 'Not published', tone: 'neutral' as const },
            onPress: () => router.push({ pathname: '/exams/[id]', params: { id: exam._id } }),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Award} title="No exams yet" body="Exams the school sets up show here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
