import { useRouter } from 'expo-router'
import { CalendarDays } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { BellTimings, GridCell } from '@/services/timetableService'
import { teachersOf } from '@/staff/teacherLoad'
import { useBellTimings, useSetGridCell, useSwapGridCells, useTimetableSetup, useTimetableVersions } from '@/staff/timetableQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionSheet, BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
type Day = (typeof DAYS)[number]
type Place = { day: Day; slot: number }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const classOrder = (name: string) => {
  const n = Number.parseInt(name, 10)
  return Number.isFinite(n) ? n : -1
}

/** Each teaching period's start and end from the bell timings (breaks skipped), by period index. */
const periodClock = (bells?: BellTimings) => {
  const times: string[] = []
  const [h, m] = String(bells?.startTime || '08:00')
    .split(':')
    .map(Number)
  let cursor = (h || 0) * 60 + (m || 0)
  const clock = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  for (const row of bells?.rows ?? []) {
    const minutes = Number(row.duration) || 0
    if (row.type !== 'break') times.push(`${clock(cursor)} to ${clock(cursor + minutes)}`)
    cursor += minutes
  }
  return times
}

/**
 * A class's hand-made week (the website's Class wise page), one day at a time: set a period's
 * subject and teacher, clear it, or swap it with another period of the class. A teacher who has
 * another class then can't be picked, and the server refuses it too. Generated versions are not
 * changed here: once one is published, that is the week everyone sees.
 */
export default function ClassWeekScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('timetable.timetable.write')
  const setup = useTimetableSetup()
  const bells = useBellTimings()
  const versions = useTimetableVersions()
  const setCell = useSetGridCell()
  const swap = useSwapGridCells()
  const [classId, setClassId] = useState<string | null>(null)
  const [day, setDay] = useState<Day>('Monday')
  const [pickingClass, setPickingClass] = useState(false)
  const [menu, setMenu] = useState<Place | null>(null)
  const [editing, setEditing] = useState<(Place & { subject: string | null }) | null>(null)
  const [swapping, setSwapping] = useState<Place | null>(null)

  const data = setup.data
  const classes = [...(data?.classes ?? [])].sort((a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className) || a.section.localeCompare(b.section))
  const row = classes.find((entry) => entry.id === classId) ?? classes[0]
  const periodsPerDay = Math.floor((data?.periodsPerWeek ?? 0) / DAYS.length)
  const clock = periodClock(bells.data)
  const published = (versions.data ?? []).find((version) => version.status === 'published')
  const cellAt = (id: string, place: Place): GridCell | undefined => data?.timetableGrid?.[id]?.[place.day]?.[String(place.slot)]
  const label = (place: Place) => `${place.day}, period ${place.slot + 1}`

  /** The class a teacher has at that time, if any (other classes only). */
  const busyIn = (teacherName: string, place: Place) => classes.find((entry) => entry.id !== row?.id && same(cellAt(entry.id, place)?.teacher ?? '', teacherName))

  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work()
      haptic.success()
      toast(done)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.", 'danger')
    }
  }

  const choose = (place: Place) => {
    if (!row || !canWrite) return
    if (swapping) {
      const from = swapping
      setSwapping(null)
      if (from.day === place.day && from.slot === place.slot) return
      void run(() => swap.mutateAsync({ classId: row.id, a: from, b: place }), `${label(from)} and ${label(place)} swapped`)
      return
    }
    setMenu(place)
  }

  const saveCell = (teacher: string) => {
    if (!row || !editing?.subject) return
    const place = editing
    setEditing(null)
    void run(() => setCell.mutateAsync({ classId: row.id, day: place.day, slot: place.slot, cell: { subject: place.subject as string, teacher } }), `${label(place)}: ${place.subject}`)
  }

  const menuCell = menu && row ? cellAt(row.id, menu) : undefined
  const subjectTeachers = editing?.subject && row && data ? teachersOf(data, row.id, editing.subject) : []
  const teachers = [...(data?.teachers ?? [])].sort((a, b) => Number(subjectTeachers.includes(b.id)) - Number(subjectTeachers.includes(a.id)) || a.name.localeCompare(b.name))

  return (
    <MobileScreen
      refreshing={setup.isRefetching}
      onRefresh={() => (setup.refetch(), versions.refetch())}
      nav={<NavBar title="A class’s week" back={{ label: 'Setup', onPress: router.back }} />}
      overlay={
        <>
          <BottomSheet open={pickingClass} onClose={() => setPickingClass(false)} title="Class" detent="large">
            <OptionList
              label="Class"
              value={row?.id ?? null}
              onChange={(id) => (setClassId(id), setSwapping(null), setPickingClass(false))}
              options={classes.map((entry) => ({ value: entry.id, label: classLabel(entry.className, entry.section) }))}
            />
          </BottomSheet>
          <ActionSheet
            open={Boolean(menu)}
            onClose={() => setMenu(null)}
            title={menu ? label(menu) : ''}
            message={menuCell?.subject ? [menuCell.subject, menuCell.teacher].filter(Boolean).join(' · ') : 'Free'}
            actions={
              menu
                ? [
                    { label: menuCell?.subject ? 'Change the period' : 'Set the period', onSelect: () => (setMenu(null), setEditing({ ...menu, subject: null })) },
                    { label: 'Swap with another period', onSelect: () => (setMenu(null), setSwapping(menu)) },
                    ...(menuCell?.subject
                      ? [
                          {
                            label: 'Clear the period',
                            tone: 'danger' as const,
                            onSelect: () => (setMenu(null), row && void run(() => setCell.mutateAsync({ classId: row.id, day: menu.day, slot: menu.slot, cell: null }), `${label(menu)} cleared`)),
                          },
                        ]
                      : []),
                  ]
                : []
            }
          />
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => (editing?.subject ? setEditing({ ...editing, subject: null }) : setEditing(null))}
            title={editing ? (editing.subject ? `${editing.subject}: teacher` : `${label(editing)}: subject`) : ''}
            detent="large"
          >
            {editing && row && data ? (
              editing.subject ? (
                <OptionList
                  label="Teacher"
                  header={subjectTeachers.length ? `Teachers of ${editing.subject} in ${classLabel(row.className, row.section)} first` : undefined}
                  value={null}
                  onChange={(name) => saveCell(name === '__none' ? '' : name)}
                  options={[
                    ...teachers.map((teacher) => {
                      const busy = busyIn(teacher.name, editing)
                      return {
                        value: teacher.name,
                        label: teacher.name,
                        meta: busy ? `Teaches ${classLabel(busy.className, busy.section)} then` : subjectTeachers.includes(teacher.id) ? `Teaches ${editing.subject} here` : undefined,
                        disabled: Boolean(busy),
                      }
                    }),
                    { value: '__none', label: 'No teacher yet' },
                  ]}
                />
              ) : (
                <OptionList
                  label="Subject"
                  value={cellAt(row.id, editing)?.subject ?? null}
                  onChange={(subject) => setEditing({ ...editing, subject })}
                  options={row.subjects.map((name) => ({ value: name, label: name }))}
                />
              )
            ) : null}
          </BottomSheet>
        </>
      }
    >
      {setup.isPending ? (
        <CardSkeleton rows={8} />
      ) : setup.isError || !data ? (
        <LoadFailed what="The timetable" error={setup.error} onRetry={setup.refetch} />
      ) : !row ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarDays} title="No classes yet" body="Add them under Classes and subjects." />
        </Surface>
      ) : (
        <>
          {published ? (
            <Callout tone="info" title={`Everyone sees “${published.name}”`}>
              This is the hand-made week, used only while no timetable is published. The published one changes by generating a new version.
            </Callout>
          ) : null}
          <ListGroup items={[{ title: 'Class', value: classLabel(row.className, row.section), onPress: () => setPickingClass(true) }]} />
          <ChipRail label="Day" value={day} onChange={setDay} items={DAYS.map((name) => ({ id: name, label: name.slice(0, 3) }))} />
          {swapping ? (
            <Callout tone="info" title={`Swap ${label(swapping)}`}>
              Tap the period to swap it with; any day of this class.
            </Callout>
          ) : null}
          {swapping ? (
            <MobileButton variant="plain" onPress={() => setSwapping(null)}>
              Cancel the swap
            </MobileButton>
          ) : null}
          {periodsPerDay ? (
            <ListGroup
              header={day}
              footer={canWrite && !swapping ? 'Tap a period to set, clear or swap it.' : undefined}
              items={Array.from({ length: periodsPerDay }, (_, slot) => {
                const cell = cellAt(row.id, { day, slot })
                const picked = swapping?.day === day && swapping.slot === slot
                return {
                  title: `Period ${slot + 1}${clock[slot] ? ` · ${clock[slot]}` : ''}`,
                  subtitle: cell?.subject ? [cell.subject, cell.teacher || 'No teacher'].join(' · ') : 'Free',
                  badge: picked ? { label: 'Swapping', tone: 'info' as const } : undefined,
                  lines: 2 as const,
                  chevron: canWrite,
                  onPress: canWrite ? () => choose({ day, slot }) : undefined,
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={CalendarDays} title="No periods a week set" body="Set them on the website's timetable settings." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
