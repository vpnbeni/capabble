import { useRouter } from 'expo-router'
import { Award, Plus } from 'lucide-react-native'
import { useState } from 'react'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { ExamSheet } from '@/staff/ExamSheet'
import { useExams } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** The school's internal exams: each opens its datesheets, how far marks are, printing and publishing. */
export default function ExamsScreen() {
  const router = useRouter()
  const staff = useStaff()
  const exams = useExams()
  const [adding, setAdding] = useState(false)
  const canSetUp = staff.canUse('exmcl_exams') && staff.can('exam.setup.write')
  const rows = [...(exams.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

  return (
    <MobileScreen
      refreshing={exams.isRefetching}
      onRefresh={exams.refetch}
      nav={<NavBar title="Exams" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canSetUp && exams.isSuccess ? (
          <ActionBar icon={Plus} summary={`${rows.length} ${rows.length === 1 ? 'exam' : 'exams'}`} detail="Unit tests, term exams and finals" label="Add an exam" onPress={() => setAdding(true)} />
        ) : undefined
      }
      overlay={canSetUp ? <ExamSheet open={adding} onClose={() => setAdding(false)} exams={rows} /> : undefined}
    >
      {exams.isPending ? (
        <CardSkeleton rows={3} />
      ) : exams.isError ? (
        <LoadFailed what="Exams" error={exams.error} onRetry={exams.refetch} />
      ) : rows.length ? (
        <ListGroup
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
          <StatusView compact kind="empty" icon={Award} title="No exams yet" body={canSetUp ? 'Add the year’s exams: unit tests, term exams and finals.' : 'Exams the school sets up show here.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
