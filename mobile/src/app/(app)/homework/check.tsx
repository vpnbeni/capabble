import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { CheckCheck, Users } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDayKey } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { SubmissionRow, SubmissionStatus, WorkKind } from '@/services/homeworkService'
import { useSaveSubmissions, useWorkRoster } from '@/staff/queries'
import { SUBMISSION, WORK } from '@/staff/workUi'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  NavBar,
  NumberCell,
  OptionList,
  StatusView,
  Surface,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

const STATUSES: SubmissionStatus[] = ['submitted', 'late', 'missing', 'excused', 'pending']

/**
 * Who turned in a piece of class work, and their marks when it takes marks: a number box per
 * student (Return to the next), tap a student for their status and a remark. Saving sends only
 * the students that changed.
 */
export default function CheckWorkScreen() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ kind: WorkKind; id: string }>()
  const kind: WorkKind = WORK[params.kind] ? params.kind : 'homework'
  const roster = useWorkRoster(kind, params.id)
  const save = useSaveSubmissions(kind)
  const [edits, setEdits] = useState<Map<string, SubmissionRow>>(() => new Map())
  const [marksText, setMarksText] = useState<Map<string, string>>(() => new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [error, setError] = useState<string | null>(null)
  const cells = useRef(new Map<string, MobileTextFieldRef | null>())
  const allowLeaving = usePreventRemove(edits.size > 0 && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const data = roster.data
  const work = data?.work
  const max = data?.marked ? data.maxMarks : null
  const rows = useMemo(() => (data?.rows ?? []).map((row) => edits.get(row.studentId) ?? row), [data, edits])
  const rowOf = (id: string) => rows.find((row) => row.studentId === id)
  const textOf = (row: SubmissionRow) => marksText.get(row.studentId) ?? (row.marks === null || row.marks === undefined ? '' : String(row.marks))
  const problemOf = (row: SubmissionRow): string | null => {
    const text = textOf(row).trim()
    if (!max || text === '') return null
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) return 'Enter a number'
    if (value > max) return `Marks can't be more than ${max}`
    return null
  }
  const change = (row: SubmissionRow, next: Partial<SubmissionRow>) => {
    setEdits((current) => new Map(current).set(row.studentId, { ...row, ...next }))
    setError(null)
  }
  const typeMarks = (row: SubmissionRow, text: string) => {
    const clean = text.replace(/[^0-9.]/g, '')
    setMarksText((current) => new Map(current).set(row.studentId, clean))
    const value = clean === '' ? null : Number(clean)
    // Marks mean it was turned in.
    change(row, { marks: value !== null && Number.isFinite(value) ? value : null, status: value !== null && row.status === 'pending' ? 'submitted' : row.status })
  }

  const turnedIn = rows.filter((row) => row.status === 'submitted' || row.status === 'late').length
  const pending = rows.filter((row) => row.status === 'pending')
  const problems = rows.filter((row) => problemOf(row)).length

  const submit = async () => {
    if (!work) return
    if (problems) {
      haptic.error()
      setError(`Fix ${problems === 1 ? 'the mark' : `${problems} marks`} shown in red first.`)
      return
    }
    try {
      await save.mutateAsync({ id: work._id, rows: [...edits.values()] })
      haptic.success()
      setEdits(new Map())
      setMarksText(new Map())
      allowLeaving()
      toast(`Saved for ${classLabel(work.className, work.section)}`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Check your connection and try again.")
    }
  }

  const openRow = open ? rowOf(open) : undefined
  const words = WORK[kind]

  return (
    <MobileScreen
      refreshing={roster.isRefetching}
      onRefresh={edits.size ? undefined : roster.refetch}
      nav={
        <NavBar
          title={work ? `${work.subjectName} · ${classLabel(work.className, work.section)}` : words.title}
          back={{ label: words.title, onPress: router.back }}
          actions={pending.length ? [{ icon: CheckCheck, label: 'Everyone pending turned it in', onPress: () => setBulk(true) }] : []}
        />
      }
      actionBar={
        edits.size ? (
          <ActionBar
            icon={CheckCheck}
            summary={`${turnedIn} of ${rows.length} turned in`}
            detail={`${edits.size} ${edits.size === 1 ? 'change' : 'changes'}${problems ? ` · ${problems} to fix` : ''}`}
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet
            open={Boolean(openRow)}
            onClose={() => setOpen(null)}
            detent="large"
            title={openRow?.studentName ?? ''}
            description={openRow?.rollNo ? `Roll ${openRow.rollNo}` : undefined}
            footer={
              <MobileButton fullWidth onPress={() => setOpen(null)}>
                Done
              </MobileButton>
            }
          >
            {openRow ? (
              <View style={{ gap: space['space-4'] }}>
                <OptionList
                  label="Status"
                  value={openRow.status}
                  onChange={(status) => change(openRow, { status })}
                  options={STATUSES.map((status) => ({ value: status, label: SUBMISSION[status].label }))}
                />
                <MobileTextField
                  label="Remark (optional)"
                  value={openRow.remark}
                  onChangeText={(remark) => change(openRow, { remark })}
                  maxLength={500}
                  multiline
                />
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={bulk}
            onClose={() => setBulk(false)}
            title={`Mark ${pending.length} ${pending.length === 1 ? 'student' : 'students'} as submitted?`}
            message="Everyone still pending. Change anyone after, then save."
            actions={[
              {
                label: 'Mark as submitted',
                onSelect: () => {
                  setBulk(false)
                  setEdits((current) => {
                    const next = new Map(current)
                    pending.forEach((row) => next.set(row.studentId, { ...row, status: 'submitted' }))
                    return next
                  })
                  haptic.selection()
                },
              },
            ]}
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            message="They haven't been saved."
            actions={[{ label: 'Discard changes', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep checking"
          />
        </>
      }
    >
      {roster.isPending ? (
        <CardSkeleton rows={5} />
      ) : roster.isError || !data || !work ? (
        <LoadFailed what="The class list" error={roster.error} onRetry={roster.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          <ListGroup
            items={[
              { title: work.title, subtitle: `${kind === 'quiz' ? 'On' : 'Due'} ${formatDayKey(work.date || work.dueDate, { weekday: 'short' })}${max ? ` · out of ${max}` : ''}`, lines: 3 },
            ]}
          />
          {rows.length ? (
            <ListGroup
              footer={max ? 'Type marks, Return moves to the next. Tap a student for their status.' : 'Tap a student to change their status.'}
              items={rows.map((row, index) => {
                const problem = problemOf(row)
                const next = rows[index + 1]
                return {
                  title: row.studentName || 'No name',
                  // With a marks box at the end, the status reads in the subtitle (one control per row).
                  subtitle:
                    problem ??
                    ([max ? SUBMISSION[row.status].label : null, row.rollNo ? `Roll ${row.rollNo}` : null, row.enrolled ? null : 'Left the class', row.remark || null].filter(Boolean).join(' · ') ||
                      undefined),
                  badge: max ? undefined : SUBMISSION[row.status],
                  lines: 2,
                  onPress: () => setOpen(row.studentId),
                  accessory: max ? (
                    <NumberCell
                      ref={(input) => {
                        cells.current.set(row.studentId, input)
                      }}
                      label={`${row.studentName}, marks out of ${max}`}
                      value={textOf(row)}
                      invalid={Boolean(problem)}
                      placeholder={`/${max}`}
                      returnKeyType={next ? 'next' : 'done'}
                      submitBehavior={next ? 'submit' : 'blurAndSubmit'}
                      onSubmitEditing={() => (next ? cells.current.get(next.studentId)?.focus() : undefined)}
                      onChangeText={(text) => typeMarks(row, text)}
                    />
                  ) : undefined,
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Users} title={`No students in ${classLabel(work.className, work.section)}`} body="Students show here once the office adds them." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
