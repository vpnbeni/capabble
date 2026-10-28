import { useLocalSearchParams, useRouter } from 'expo-router'
import { Award, Eye, EyeOff } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate, formatTime } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useEntryStatus, useExamDatesheets, useExams, usePublishResults } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, Dialog, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

/**
 * One exam: its datesheet by class, how far marks entry is in each class, and publishing results
 * to families (the principal), with a confirm because families are told at once.
 */
export default function ExamScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const exams = useExams()
  const exam = exams.data?.find((row) => row._id === id)
  const status = useEntryStatus(id)
  const sheets = useExamDatesheets(staff.can('exam.setup.read'))
  const publish = usePublishResults()
  const [asking, setAsking] = useState(false)
  const canPublish = staff.canUse('exmcl_exams') && staff.can('exam.setup.write')

  const datesheets = useMemo(
    () => (sheets.data ?? []).filter((sheet) => (typeof sheet.examId === 'string' ? sheet.examId : sheet.examId?._id) === id),
    [sheets.data, id],
  )
  const classes = status.data ?? []
  const statusOf = (row: (typeof classes)[number]) =>
    row.overallStatus ?? (row.subjects.length && row.subjects.every((subject) => subject.status === 'complete') ? 'complete' : row.subjects.some((subject) => subject.filledCount) ? 'partial' : 'pending')
  const done = classes.filter((row) => statusOf(row) === 'complete').length

  const toggle = async () => {
    if (!exam) return
    setAsking(false)
    try {
      await publish.mutateAsync({ examId: exam._id, published: !exam.resultsPublished })
      haptic.success()
      toast(exam.resultsPublished ? 'Results hidden from families' : 'Results published. Families are told.')
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={status.isRefetching}
      onRefresh={() => {
        status.refetch()
        exams.refetch()
      }}
      nav={<NavBar title={exam?.name ?? 'Exam'} back={{ label: 'Exams', onPress: router.back }} />}
      actionBar={
        exam && canPublish ? (
          <ActionBar
            icon={exam.resultsPublished ? EyeOff : Eye}
            summary={`${done} of ${classes.length} classes complete`}
            detail={exam.resultsPublished ? 'Families can see the results' : 'Families can’t see them yet'}
            label={publish.isPending ? 'Saving…' : exam.resultsPublished ? 'Hide results' : 'Publish results'}
            onPress={() => setAsking(true)}
          />
        ) : undefined
      }
      overlay={
        <Dialog
          open={asking}
          onClose={() => setAsking(false)}
          tone={exam?.resultsPublished ? 'danger' : 'default'}
          title={exam?.resultsPublished ? `Hide ${exam.name} results?` : `Publish ${exam?.name ?? ''} results?`}
          description={
            exam?.resultsPublished
              ? 'Families stop seeing these marks in the app until you publish again.'
              : `Every family sees their child's marks and gets a notification.${done < classes.length ? ` ${classes.length - done} classes still have marks missing.` : ''}`
          }
          footer={
            <>
              <MobileButton variant="gray" onPress={() => setAsking(false)}>
                Not now
              </MobileButton>
              <MobileButton variant={exam?.resultsPublished ? 'destructive' : 'filled'} loading={publish.isPending} onPress={toggle}>
                {exam?.resultsPublished ? 'Hide results' : 'Publish'}
              </MobileButton>
            </>
          }
        />
      }
    >
      {exams.isPending || status.isPending ? (
        <CardSkeleton rows={4} />
      ) : !exam ? (
        <LoadFailed what="The exam" error={exams.error} onRetry={exams.refetch} />
      ) : (
        <>
          {status.isError ? (
            <LoadFailed what="Marks entry" error={status.error} onRetry={status.refetch} />
          ) : classes.length ? (
            <ListGroup
              header="Marks entry"
              footer="Teachers enter marks from Marks in the app."
              items={classes.map((row) => {
                const state = statusOf(row)
                const students = `${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}`
                return {
                  title: classLabel(row.class, row.section),
                  subtitle: row.totalCells ? `${row.filledCells ?? 0} of ${row.totalCells} marks entered · ${students}` : `No subjects set for this exam · ${students}`,
                  badge: state === 'complete' ? { label: 'Complete', tone: 'success' as const } : state === 'partial' ? { label: 'In progress', tone: 'warning' as const } : { label: 'Not started', tone: 'neutral' as const },
                  lines: 2,
                }
              })}
            />
          ) : null}
          {datesheets.length ? (
            datesheets.map((sheet) => (
              <ListGroup
                key={sheet._id}
                header={`Datesheet · ${classLabel(sheet.class, sheet.section)}`}
                items={[...sheet.subjects]
                  .sort((a, b) => a.examDate.localeCompare(b.examDate))
                  .map((entry) => ({
                    title: entry.subject?.name ?? 'Subject',
                    subtitle: [formatDate(entry.examDate), entry.timeSlot?.start ? `${formatTime(entry.timeSlot.start)}${entry.timeSlot.end ? ` to ${formatTime(entry.timeSlot.end)}` : ''}` : null].filter(Boolean).join(' · '),
                    lines: 2,
                  }))}
              />
            ))
          ) : sheets.isSuccess ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Award} title="No datesheet yet" body="The exam's datesheet shows here once the school makes it." />
            </Surface>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
