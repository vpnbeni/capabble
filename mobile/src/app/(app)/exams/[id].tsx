import { useLocalSearchParams, useRouter } from 'expo-router'
import { Award, BookOpen, Ellipsis, Eye, EyeOff, ListChecks, Pencil, Plus, Printer } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ExamDatesheet } from '@/services/examService'
import { ExamSheet } from '@/staff/ExamSheet'
import { useRemoveExam } from '@/staff/examSetupQueries'
import { useEntryStatus, useExamDatesheets, useExams, usePublishResults } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, Dialog, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, haptic, useToast, type NavAction } from '@/ui'

const sheetExamId = (sheet: ExamDatesheet) => (typeof sheet.examId === 'string' ? sheet.examId : sheet.examId?._id)

/** "12 to 20 Mar · 6 papers" for a datesheet row. */
const sheetSummary = (sheet: ExamDatesheet) => {
  const dates = sheet.subjects.map((entry) => entry.examDate).filter(Boolean).sort()
  const papers = `${sheet.subjects.length} ${sheet.subjects.length === 1 ? 'paper' : 'papers'}`
  if (!dates.length) return 'No papers yet'
  const first = formatDate(dates[0])
  const last = formatDate(dates[dates.length - 1])
  return `${first === last ? first : `${first} to ${last}`} · ${papers}`
}

/**
 * One exam: how far marks entry is in each class, its datesheets (open one to change or publish
 * it), its subjects, printing, and publishing results to families with a confirm because they are
 * told at once. Those who set exams up also edit or remove the exam here.
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
  const remove = useRemoveExam()
  const [asking, setAsking] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const canSetUp = staff.canUse('exmcl_exams') && staff.can('exam.setup.write')
  const canDatesheets = staff.canUse('exmcl_datesheets') && staff.can('exam.setup.write')
  const canSubjects = staff.canUse('exmcl_subjects') && staff.can('exam.setup.write')
  const canPrint =
    (staff.canUse('exmcl_admit_cards') && staff.can('exam.setup.write')) ||
    ((staff.canUse('exmcl_award_list') || staff.canUse('exmcl_report_card')) && staff.can('exam.results.read'))

  const datesheets = useMemo(
    () => (sheets.data ?? []).filter((sheet) => sheetExamId(sheet) === id).sort((a, b) => a.class.localeCompare(b.class, undefined, { numeric: true }) || (a.section ?? '').localeCompare(b.section ?? '')),
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

  const removeExam = async () => {
    if (!exam) return
    try {
      await remove.mutateAsync(exam._id)
      haptic.medium()
      setRemoving(false)
      toast(`${exam.name} removed`)
      router.back()
    } catch (error) {
      haptic.error()
      setRemoving(false)
      toast(error instanceof ApiError ? error.message : "The exam wasn't removed. Try again.", 'danger')
    }
  }

  const navActions: NavAction[] = [
    ...(exam && canPrint ? [{ icon: Printer, label: 'Print', onPress: () => router.push({ pathname: '/exams/print', params: { id: exam._id } }) }] : []),
    ...(exam && canSetUp ? [{ icon: Ellipsis, label: 'More actions', onPress: () => setMenu(true) }] : []),
  ]
  const subjectCount = exam?.subjectKeys?.length ?? 0

  return (
    <MobileScreen
      refreshing={status.isRefetching}
      onRefresh={() => {
        status.refetch()
        exams.refetch()
        sheets.refetch()
      }}
      nav={<NavBar title={exam?.name ?? 'Exam'} back={{ label: 'Exams', onPress: router.back }} actions={navActions} />}
      actionBar={
        exam && canSetUp ? (
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
        <>
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
          {exam && canSetUp ? (
            <>
              <ActionSheet
                open={menu}
                onClose={() => setMenu(false)}
                title={exam.name}
                actions={[
                  { label: 'Edit exam', icon: Pencil, onSelect: () => (setMenu(false), setEditing(true)) },
                  ...(canSubjects ? [{ label: 'Choose subjects', icon: ListChecks, onSelect: () => (setMenu(false), router.push({ pathname: '/exams/subjects', params: { id: exam._id } })) }] : []),
                  { label: 'Remove exam', tone: 'danger' as const, onSelect: () => (setMenu(false), setRemoving(true)) },
                ]}
              />
              <ExamSheet open={editing} onClose={() => setEditing(false)} exam={exam} exams={exams.data ?? []} />
              <Dialog
                open={removing}
                onClose={() => setRemoving(false)}
                tone="danger"
                title={`Remove ${exam.name}?`}
                description="It leaves the exam list, marks entry and printing. Marks already entered stay saved."
                footer={
                  <>
                    <MobileButton variant="gray" onPress={() => setRemoving(false)}>
                      Keep it
                    </MobileButton>
                    <MobileButton variant="destructive" loading={remove.isPending} onPress={removeExam}>
                      Remove
                    </MobileButton>
                  </>
                }
              />
            </>
          ) : null}
        </>
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

          {canSubjects ? (
            <ListGroup
              header="Subjects"
              items={[
                {
                  title: subjectCount ? `${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}` : 'Every subject of each class',
                  subtitle: subjectCount ? undefined : 'Choose subjects to leave some out of this exam.',
                  icon: BookOpen,
                  tile: 6,
                  chevron: true,
                  lines: 2,
                  onPress: () => router.push({ pathname: '/exams/subjects', params: { id: exam._id } }),
                },
              ]}
            />
          ) : null}

          {sheets.isError ? (
            <LoadFailed what="Datesheets" error={sheets.error} onRetry={sheets.refetch} />
          ) : datesheets.length || canDatesheets ? (
            <ListGroup
              header="Datesheets"
              footer={canDatesheets && datesheets.length ? 'A published datesheet can’t be changed.' : undefined}
              items={[
                ...datesheets.map((sheet) => ({
                  title: classLabel(sheet.class, sheet.section),
                  subtitle: sheetSummary(sheet),
                  badge: sheet.status === 'published' ? { label: 'Published', tone: 'success' as const } : { label: 'Draft', tone: 'neutral' as const },
                  chevron: true,
                  lines: 2,
                  onPress: () => router.push({ pathname: '/exams/datesheet', params: { examId: exam._id, id: sheet._id } }),
                })),
                ...(canDatesheets ? [{ title: 'Add a datesheet', icon: Plus, tile: 6 as const, onPress: () => router.push({ pathname: '/exams/datesheet', params: { examId: exam._id } }) }] : []),
              ]}
            />
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
