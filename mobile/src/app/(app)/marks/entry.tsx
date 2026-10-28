import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { Award, Users } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useClassResults, useClassRoster, useSaveSubjectMarks } from '@/staff/queries'
import {
  ActionBar,
  ActionSheet,
  Callout,
  ListGroup,
  MobileScreen,
  NavBar,
  NumberCell,
  StatusView,
  Surface,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

/** A mark being typed: the text in the box, or absent. */
type Entry = { text: string; absent: boolean }

const byRoll = (a: { classRollNo?: number | null; name: string }, b: { classRollNo?: number | null; name: string }) =>
  (a.classRollNo ?? 9999) - (b.classRollNo ?? 9999) || a.name.localeCompare(b.name)

/**
 * Marks for one subject of one class: a number box per student, Return to the next, tap a student
 * to mark them absent. Saving sends only this subject; other subjects' marks are left alone.
 */
export default function MarksEntryScreen() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ examId: string; className: string; section: string; subjectId: string; subjectName: string; max?: string }>()
  const { examId, className, section, subjectId, subjectName } = params
  const max = Number(params.max) > 0 ? Number(params.max) : null
  const roster = useClassRoster(className, section)
  const results = useClassResults(examId, className, section)
  const save = useSaveSubjectMarks()
  const [edits, setEdits] = useState<Map<string, Entry>>(() => new Map())
  const [asking, setAsking] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [error, setError] = useState<string | null>(null)
  const cells = useRef(new Map<string, MobileTextFieldRef | null>())
  const dirty = edits.size > 0
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const students = useMemo(() => [...(roster.data ?? [])].sort(byRoll), [roster.data])
  const saved = useMemo(() => {
    const map = new Map<string, Entry>()
    ;(results.data ?? []).forEach((row) => {
      const value = row.marks?.[subjectId]
      map.set(String(row.studentId), {
        text: value === null || value === undefined ? '' : String(value),
        absent: row.absentSubjects.includes(subjectId) || (row.absent && !row.absentSubjects.length),
      })
    })
    return map
  }, [results.data, subjectId])
  const entryOf = (id: string): Entry => edits.get(id) ?? saved.get(id) ?? { text: '', absent: false }
  const problemOf = (entry: Entry): string | null => {
    if (entry.absent || entry.text.trim() === '') return null
    const value = Number(entry.text)
    if (!Number.isFinite(value) || value < 0) return 'Enter a number'
    if (max !== null && value > max) return `Marks can't be more than ${max}`
    return null
  }
  const set = (id: string, entry: Entry) => {
    setEdits((current) => new Map(current).set(id, entry))
    setError(null)
  }

  const entered = students.filter((student) => {
    const entry = entryOf(student._id)
    return entry.absent || entry.text.trim() !== ''
  }).length
  const problems = students.filter((student) => problemOf(entryOf(student._id))).length

  const submit = async () => {
    if (problems) {
      haptic.error()
      setError(`Fix ${problems === 1 ? 'the mark' : `${problems} marks`} shown in red first.`)
      return
    }
    setError(null)
    try {
      await save.mutateAsync({
        examId,
        className,
        section,
        subjectId,
        rows: students
          .filter((student) => edits.has(student._id))
          .map((student) => {
            const entry = entryOf(student._id)
            return { studentId: student._id, absent: entry.absent, value: entry.absent || entry.text.trim() === '' ? null : Number(entry.text) }
          }),
      })
      haptic.success()
      setEdits(new Map())
      allowLeaving()
      toast(`${subjectName} marks saved for ${classLabel(className, section)}`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The marks didn't save. Check your connection and try again.")
    }
  }

  const askingStudent = students.find((student) => student._id === asking)

  return (
    <MobileScreen
      refreshing={roster.isRefetching || results.isRefetching}
      onRefresh={() => {
        roster.refetch()
        if (!dirty) results.refetch()
      }}
      nav={<NavBar title={`${subjectName} · ${classLabel(className, section)}`} back={{ label: 'Marks', onPress: router.back }} />}
      actionBar={
        dirty ? (
          <ActionBar
            icon={Award}
            summary={`${entered} of ${students.length} entered`}
            detail={problems ? `${problems} to fix` : max ? `Out of ${max}` : subjectName}
            label={save.isPending ? 'Saving…' : 'Save marks'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={Boolean(askingStudent)}
            onClose={() => setAsking(null)}
            title={askingStudent?.name ?? ''}
            actions={
              askingStudent
                ? [
                    entryOf(askingStudent._id).absent
                      ? { label: 'Not absent', onSelect: () => set(askingStudent._id, { text: '', absent: false }) }
                      : { label: `Mark absent for ${subjectName}`, onSelect: () => set(askingStudent._id, { text: '', absent: true }) },
                    { label: 'Clear mark', onSelect: () => set(askingStudent._id, { text: '', absent: false }) },
                  ]
                : []
            }
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard these marks?"
            message="They aren't saved yet."
            actions={[
              {
                label: 'Discard marks',
                tone: 'danger',
                onSelect: () => {
                  setEdits(new Map())
                  leaving?.()
                },
              },
            ]}
            cancelLabel="Keep entering"
          />
        </>
      }
    >
      {error ? (
        <Callout tone="danger" title="The marks weren't saved">
          {error}
        </Callout>
      ) : null}
      {roster.isPending || results.isPending ? (
        <CardSkeleton rows={6} />
      ) : roster.isError ? (
        <LoadFailed what="The class list" error={roster.error} onRetry={roster.refetch} />
      ) : results.isError ? (
        <LoadFailed what="Saved marks" error={results.error} onRetry={results.refetch} />
      ) : !students.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title={`No students in ${classLabel(className, section)}`} body="Students show here once the office adds them." />
        </Surface>
      ) : (
        <ListGroup
          footer="Tap a student to mark them absent. Return moves to the next box."
          items={students.map((student, index) => {
            const entry = entryOf(student._id)
            const problem = problemOf(entry)
            const next = students[index + 1]
            return {
              title: student.name,
              subtitle: problem ?? (entry.absent ? 'Absent' : student.classRollNo ? `Roll ${student.classRollNo}` : student.rollNumber),
              onPress: () => setAsking(student._id),
              accessory: (
                <NumberCell
                  ref={(input) => {
                    cells.current.set(student._id, input)
                  }}
                  label={`${student.name}, ${subjectName} marks`}
                  value={entry.absent ? 'AB' : entry.text}
                  disabled={entry.absent}
                  invalid={Boolean(problem)}
                  placeholder={max ? `/${max}` : '—'}
                  returnKeyType={next ? 'next' : 'done'}
                  submitBehavior={next ? 'submit' : 'blurAndSubmit'}
                  onSubmitEditing={() => (next ? cells.current.get(next._id)?.focus() : undefined)}
                  onChangeText={(text) => set(student._id, { text: text.replace(/[^0-9.]/g, ''), absent: false })}
                />
              ),
            }
          })}
        />
      )}
    </MobileScreen>
  )
}
