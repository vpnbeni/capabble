import { useRouter } from 'expo-router'
import { useState } from 'react'

import { formatDate } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalResults } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { ChipRail, Hero, ListGroup, MobileScreen, NavBar, SegmentedControl, StatusView, Surface } from '@/ui'

/** Marks for exams the school has published to families, newest first, one exam at a time. */
export default function ResultsScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const results = usePortalResults(child?.studentId)
  const exams = [...(results.data ?? [])].reverse()
  const [picked, setPicked] = useState<string | null>(null)
  const exam = exams.find((entry) => entry.examId === picked) ?? exams[0]
  const percent = exam ? Number.parseFloat(exam.percentage) : NaN
  const published = exam?.publishedAt
    ? formatDate(exam.publishedAt, { year: new Date(exam.publishedAt).getFullYear() !== new Date().getFullYear() })
    : null
  const options = exams.map((entry) => ({ value: entry.examId, label: entry.examName }))

  return (
    <MobileScreen
      refreshing={results.isRefetching}
      onRefresh={results.refetch}
      nav={<NavBar title="Results" back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
    >
      {!child ? (
        <NoChild />
      ) : results.isPending ? (
        <CardSkeleton rows={5} />
      ) : results.isError ? (
        <LoadFailed what="Results" error={results.error} onRetry={results.refetch} />
      ) : !exam ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" title="No results published yet" body="Marks show here once the school publishes an exam's results." />
        </Surface>
      ) : (
        <>
          {exams.length > 1 && exams.length <= 3 ? (
            <SegmentedControl label="Exam" value={exam.examId} onChange={setPicked} options={options} />
          ) : exams.length > 3 ? (
            <ChipRail label="Exam" value={exam.examId} onChange={setPicked} items={options.map((option) => ({ id: option.value, label: option.label }))} />
          ) : null}
          <Hero
            tone="surface"
            label={`${exam.examName} · overall`}
            value={exam.absent ? 'Absent' : `${exam.percentage}%`}
            detail={[exam.grade ? `Grade ${exam.grade}` : null, `${exam.total} of ${exam.maxTotal} marks`, published ? `published ${published}` : null].filter(Boolean).join(' · ')}
            progress={Number.isFinite(percent) && !exam.absent ? percent : undefined}
          />
          <ListGroup
            header="Subjects"
            items={exam.subjects.map((subject) => {
              const absent = exam.absentSubjects.includes(subject.name)
              return {
                title: subject.name,
                subtitle: [subject.role === 'additional' ? 'Additional subject' : null, subject.grade && !absent ? `Grade ${subject.grade}` : null].filter(Boolean).join(' · ') || undefined,
                value: absent ? undefined : `${subject.marksObtained} / ${subject.maxMarks}`,
                badge: absent ? { label: 'Absent', tone: 'danger' as const } : undefined,
              }
            })}
          />
        </>
      )}
    </MobileScreen>
  )
}
