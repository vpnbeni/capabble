import { useRouter } from 'expo-router'
import { GraduationCap } from 'lucide-react-native'

import { formatDate } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalResults } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { Badge, Card, EmptyState, ListRow, Screen, Text } from '@/ui'

/** Marks for exams the school has published to families, newest first. */
export default function ResultsScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const results = usePortalResults(child?.studentId)
  const exams = [...(results.data ?? [])].reverse()

  return (
    <Screen title="Results" onBack={router.back} headerAction={<ChildSwitcher />} refreshing={results.isRefetching} onRefresh={results.refetch}>
      {!child ? (
        <NoChild />
      ) : results.isPending ? (
        <CardSkeleton rows={5} />
      ) : results.isError ? (
        <LoadFailed what="Results" error={results.error} onRetry={results.refetch} />
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState icon={GraduationCap} title="No results published yet" body="Marks appear here once the school publishes an exam's results." />
        </Card>
      ) : (
        exams.map((exam) => (
          <Card
            key={exam.examId}
            title={exam.examName}
            subtitle={`${exam.total} / ${exam.maxTotal} · ${exam.percentage}%${
              exam.publishedAt ? ` · Published ${formatDate(exam.publishedAt, { year: new Date(exam.publishedAt).getFullYear() !== new Date().getFullYear() })}` : ''
            }`}
            action={exam.absent ? <Badge label="Absent" tone="danger" /> : exam.grade ? <Badge label={`Grade ${exam.grade}`} dot={false} /> : undefined}
            flush
          >
            {exam.subjects.map((subject, index) => {
              const absent = exam.absentSubjects.includes(subject.name)
              return (
                <ListRow
                  key={subject.name}
                  primary={subject.name}
                  secondary={subject.role === 'additional' ? 'Additional subject' : undefined}
                  divider={index < exam.subjects.length - 1}
                  trailing={
                    absent ? (
                      <Badge label="Absent" tone="danger" />
                    ) : (
                      <Text variant="body-lg" numeric>
                        {subject.marksObtained} / {subject.maxMarks}
                        {subject.grade ? `  ·  ${subject.grade}` : ''}
                      </Text>
                    )
                  }
                />
              )
            })}
          </Card>
        ))
      )}
    </Screen>
  )
}
