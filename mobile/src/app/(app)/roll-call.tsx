import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { ClipboardCheck, CloudOff, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { classLabel, formatDayKey, formatRelative, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { RosterStudent } from '@/services/staffService'
import { discardRegister, flushAttendanceQueue, peekQueued, queueRegister, registerKey, useAttendanceQueue } from '@/staff/attendanceQueue'
import { staffKeys, useRegisterMarks, useRoster } from '@/staff/queries'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  Avatar,
  Callout,
  ListGroup,
  MobileScreen,
  NavBar,
  SearchBar,
  SegmentedControl,
  StatusView,
  Surface,
  haptic,
  useFixedColumn,
  useToast,
} from '@/ui'

type Mark = 'P' | 'A'

const byRoll = (a: RosterStudent, b: RosterStudent) => {
  const ra = Number(a.rollNumber)
  const rb = Number(b.rollNumber)
  if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb
  return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
}

/**
 * Roll call: one class's register for a day. Everyone starts present; the teacher taps the
 * absent ones. Saved on the phone first and sent from there, so it works without a connection.
 * Design system: MobileScreens · Teacher roll call.
 */
export default function RollCallScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const params = useLocalSearchParams<{ className: string; section: string; date?: string }>()
  const { className, section } = params
  const date = params.date || schoolToday()
  const title = classLabel(className, section)
  const key = registerKey(date, className, section)

  const roster = useRoster(className, section)
  const marks = useRegisterMarks(date, className, section)
  const waiting = useAttendanceQueue().find((entry) => entry.key === key)
  const segmentWidth = useFixedColumn(132)

  // Only what the teacher changed; the rest comes from the phone's queue or the school.
  const [edits, setEdits] = useState<Map<string, Mark>>(() => new Map())
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<'all' | 'absent'>('all')
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)

  // Start from what is waiting on this phone, else what the school already has, else everyone present.
  const absent = useMemo(() => {
    if (!roster.data || marks.isPending) return null
    const start = waiting
      ? waiting.records.filter((record) => record.status === 'A').map((record) => record.studentId)
      : marks.data?.absent ?? []
    const next = new Set(start)
    edits.forEach((value, studentId) => (value === 'A' ? next.add(studentId) : next.delete(studentId)))
    return next
  }, [roster.data, marks.isPending, marks.data, waiting, edits])

  // Leaving with marks not saved asks first (swipe back included).
  const allowLeaving = usePreventRemove(dirty && !saving, ({ repeat }) => setLeaving(() => repeat))

  const students = useMemo(() => [...(roster.data?.students ?? [])].sort(byRoll), [roster.data])
  const absentCount = absent ? students.filter((student) => absent.has(student._id)).length : 0
  const visible = students.filter((student) => {
    if (show === 'absent' && !absent?.has(student._id)) return false
    const q = query.trim().toLowerCase()
    return !q || student.name.toLowerCase().includes(q) || String(student.rollNumber ?? '').toLowerCase().includes(q)
  })
  const alreadyMarked = Boolean(marks.data && !marks.data.offline && (marks.data.absent.length || waiting))

  const mark = (studentId: string, value: Mark) => {
    setEdits((current) => new Map(current).set(studentId, value))
    setDirty(true)
  }

  const save = async () => {
    if (!absent || saving) return
    setSaving(true)
    const records = students.map((student) => ({ studentId: student._id, status: (absent.has(student._id) ? 'A' : 'P') as Mark }))
    const entry = await queueRegister({ date, className, section, records }, { absent: absentCount, total: students.length })
    await flushAttendanceQueue()
    queryClient.invalidateQueries({ queryKey: staffKeys.all })
    setSaving(false)

    const stillWaiting = peekQueued(entry.key)
    if (stillWaiting?.error) {
      haptic.error()
      return
    }
    setDirty(false)
    allowLeaving()
    if (stillWaiting) {
      toast("Saved on this phone. It's sent when you're back online.", 'info')
    } else {
      haptic.success()
      toast(`Attendance saved for ${title}`)
    }
    router.back()
  }

  const nav = <NavBar title={title} back={{ label: 'Back', onPress: () => router.back() }} />

  return (
    <MobileScreen
      nav={nav}
      refreshing={roster.isRefetching}
      onRefresh={() => {
        roster.refetch()
        if (!dirty) marks.refetch()
      }}
      actionBar={
        absent && students.length ? (
          <ActionBar
            icon={ClipboardCheck}
            summary={`${students.length - absentCount} of ${students.length} present`}
            detail={`${formatDayKey(date, { weekday: 'short' })} · ${absentCount} absent`}
            label={saving ? 'Saving…' : alreadyMarked ? 'Save changes' : 'Save attendance'}
            onPress={save}
          />
        ) : undefined
      }
      overlay={
        <ActionSheet
          open={Boolean(leaving)}
          onClose={() => setLeaving(null)}
          title="Discard your marks?"
          message={`The register for ${title} isn't saved yet.`}
          actions={[
            {
              label: 'Discard marks',
              tone: 'danger',
              onSelect: () => {
                setDirty(false)
                leaving?.()
              },
            },
          ]}
          cancelLabel="Keep marking"
        />
      }
    >
      {waiting?.error ? (
        <Callout
          tone="danger"
          title="The school didn't accept this register"
          action={{
            label: 'Discard',
            onPress: async () => {
              await discardRegister(waiting.key)
              setEdits(new Map())
              setDirty(false)
            },
          }}
        >
          {waiting.error}
        </Callout>
      ) : waiting ? (
        <Callout tone="info" icon={CloudOff} title={`Saved on this phone at ${formatTime(new Date(waiting.savedAt).toTimeString().slice(0, 5))}`}>
          {"It hasn't reached school yet. It's sent by itself when you're back online."}
        </Callout>
      ) : roster.data?.offline ? (
        <Callout tone="neutral" icon={CloudOff} title="You're offline">
          {`Showing the class list saved ${formatRelative(roster.data.savedAt).toLowerCase()}. Your register is saved on this phone and sent when you're back online.`}
        </Callout>
      ) : null}

      {roster.isPending || (roster.data && !absent) ? (
        <CardSkeleton rows={6} />
      ) : roster.isError ? (
        <LoadFailed what="The class list" error={roster.error} onRetry={roster.refetch} />
      ) : !students.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title={`No students in ${title}`} body="Students show here once the office adds them to this class." />
        </Surface>
      ) : (
        <>
          <View style={{ gap: space['space-3'] }}>
            {students.length > 12 ? (
              <SearchBar placeholder={`Search ${students.length} students`} value={query} onChange={setQuery} onCancel={() => setQuery('')} />
            ) : null}
            <SegmentedControl
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { value: 'all', label: `All ${students.length}` },
                { value: 'absent', label: `Absent ${absentCount}` },
              ]}
            />
          </View>
          {visible.length ? (
            <ListGroup
              header={`Roll call · ${formatDayKey(date, { weekday: 'short' })}`}
              footer={show === 'all' && !query ? 'Everyone is present unless you mark them absent.' : undefined}
              items={visible.map((student) => {
                const value: Mark = absent?.has(student._id) ? 'A' : 'P'
                return {
                  title: student.name,
                  subtitle: student.rollNumber ? `Roll ${student.rollNumber}` : undefined,
                  avatar: <Avatar name={student.name} size={36} />,
                  onPress: () => {
                    haptic.selection()
                    mark(student._id, value === 'A' ? 'P' : 'A')
                  },
                  accessoryWidth: segmentWidth,
                  accessory: (
                    <SegmentedControl
                      label={`${student.name}: attendance`}
                      value={value}
                      onChange={(next) => mark(student._id, next)}
                      options={[
                        { value: 'P', label: 'Present' },
                        { value: 'A', label: 'Absent' },
                      ]}
                    />
                  ),
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView
                compact
                kind="empty"
                icon={Users}
                title={show === 'absent' && !query ? 'No one is marked absent' : 'No student matches'}
                body={show === 'absent' && !query ? 'Tap a student to mark them absent.' : 'Check the name or roll number.'}
              />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
