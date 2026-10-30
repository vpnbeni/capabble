import { useRouter } from 'expo-router'
import { Award } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { EntryStatus } from '@/services/examService'
import { useAcademicOptions, useEntryStatus, useExams } from '@/staff/queries'
import { type Tone } from '@/theme/tokens'
import { BottomSheet, Callout, ListGroup, MobileScreen, NavBar, OptionList, StatusView, Surface } from '@/ui'

const slug = (name: string) => String(name || '').trim().toLowerCase().replace(/\s+/g, '-')

const STATUS: Record<EntryStatus, { label: string; tone: Tone }> = {
  complete: { label: 'Complete', tone: 'success' },
  partial: { label: 'Partly entered', tone: 'warning' },
  pending: { label: 'Not started', tone: 'neutral' },
}

/** Marks to enter for an exam: each of the login's classes, subject by subject, with how far it got. */
export default function MarksScreen() {
  const router = useRouter()
  const exams = useExams()
  const [examId, setExamId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const list = [...(exams.data ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  // Default: the latest exam whose results aren't out yet, else the latest one.
  const exam = list.find((entry) => entry._id === examId) ?? [...list].reverse().find((entry) => !entry.resultsPublished) ?? list[list.length - 1]
  const status = useEntryStatus(exam?._id)
  const options = useAcademicOptions()
  // Subjects come from the exam (it lists the ones it covers); their names from the class's
  // subjects where the school has them, else from the key ("social-science" → "Social science").
  const nameOf = (key: string, className: string) =>
    (options.data?.subjects ?? []).find((subject) => slug(subject.name) === key && (!subject.className || subject.className === className))?.name ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ')
  const classes = (status.data ?? []).map((row) => {
    const keys = exam?.subjectKeys?.length ? exam.subjectKeys : row.subjects.map((subject) => subject.subjectId)
    return {
      ...row,
      subjects: keys.map((key) => {
        const stat = row.subjects.find((subject) => subject.subjectId === key)
        return { subjectId: key, subjectName: stat?.subjectName ?? nameOf(key, row.class), stat }
      }),
    }
  })

  return (
    <MobileScreen
      refreshing={status.isRefetching}
      onRefresh={status.refetch}
      nav={<NavBar title="Marks" back={{ label: 'Back', onPress: router.back }} />}
      overlay={
        <BottomSheet open={picking} onClose={() => setPicking(false)} title="Exam">
          <OptionList
            label="Exam"
            value={exam?._id ?? null}
            onChange={(value) => {
              setExamId(value)
              setPicking(false)
            }}
            options={list.map((entry) => ({ value: entry._id, label: entry.name, meta: entry.resultsPublished ? 'Results published' : undefined }))}
          />
        </BottomSheet>
      }
    >
      {exams.isPending ? (
        <CardSkeleton rows={4} />
      ) : exams.isError ? (
        <LoadFailed what="Exams" error={exams.error} onRetry={exams.refetch} />
      ) : !exam ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Award} title="No exams yet" body="Exams are set up on the website. Their marks can be entered here." />
        </Surface>
      ) : (
        <>
          <ListGroup
            items={[{ title: 'Exam', value: exam.name, onPress: list.length > 1 ? () => setPicking(true) : undefined }]}
            footer={exam.maximumMarks ? `Out of ${exam.maximumMarks} in every subject.` : undefined}
          />
          {exam.resultsPublished ? (
            <Callout tone="warning" title="These results are published">
              Families see any change you save straight away.
            </Callout>
          ) : null}
          {status.isPending ? (
            <CardSkeleton rows={3} />
          ) : status.isError ? (
            <LoadFailed what="Your classes" error={status.error} onRetry={status.refetch} />
          ) : classes.length ? (
            classes.map((row) => (
              <ListGroup
                key={`${row.class}|${row.section}`}
                header={`${classLabel(row.class, row.section)} · ${row.studentCount} ${row.studentCount === 1 ? 'student' : 'students'}`}
                items={row.subjects.map((subject) => ({
                  title: subject.subjectName,
                  subtitle: subject.stat ? `${subject.stat.filledCount} of ${subject.stat.studentCount} entered` : undefined,
                  icon: Award,
                  tile: 6 as const,
                  badge: subject.stat ? STATUS[subject.stat.status] : undefined,
                  onPress: () =>
                    router.push({
                      pathname: '/marks/entry',
                      params: {
                        examId: exam._id,
                        className: row.class,
                        section: row.section,
                        subjectId: subject.subjectId,
                        subjectName: subject.subjectName,
                        max: String(exam.maximumMarks ?? ''),
                      },
                    }),
                }))}
              />
            ))
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Award} title="No classes to enter marks for" body="Classes you teach show here. Ask the office if one is missing." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
