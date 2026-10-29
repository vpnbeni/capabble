import { useRouter } from 'expo-router'
import { CalendarCheck, DoorOpen } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { CentrePaper, ExamRoom } from '@/services/centreService'
import { useAllocationMode, useCentrePapers, useExamRooms, useSaveRoom, useSeatingMode, useSetAllocationMode, useSetSeatingMode } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, Callout, ChipRail, ListGroup, MobileScreen, NavBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

const dayKey = (value: string) => String(value || '').slice(0, 10)
const roomNumber = (room: ExamRoom) => {
  const match = String(room.roomNo)
    .trim()
    .match(/^(\d+)/)
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY
}
const byRoomNo = (a: ExamRoom, b: ExamRoom) =>
  (roomNumber(a) === roomNumber(b) ? 0 : roomNumber(a) < roomNumber(b) ? -1 : 1) || String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true, sensitivity: 'base' })
const classNumber = (paper: CentrePaper) => Number.parseInt(String(paper.class || '').replace(/th$/i, ''), 10) || 0

/** The rooms a day has by hand: its order on each room, then rooms ticked without one. */
const manualOrder = (rooms: ExamRoom[], day: string) =>
  rooms
    .map((room) => ({ id: room._id, order: Number(room.allocationOrderByDate?.[day]) || null, ticked: (room.allocatedExamDates ?? []).includes(day) }))
    .filter((row) => row.order !== null || row.ticked)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .map((row) => row.id)

/**
 * Automatic: as the website works it out, each day takes the rooms it needs in room-number order,
 * starting one room later when the day before began with the same class.
 */
const autoOrder = (rooms: ExamRoom[], papers: CentrePaper[], needed: Record<string, number>) => {
  const sorted = [...rooms].sort(byRoomNo)
  const entries = [...papers].sort(
    (a, b) => dayKey(a.examDate).localeCompare(dayKey(b.examDate)) || classNumber(a) - classNumber(b) || String(a.subjectCode).localeCompare(String(b.subjectCode), undefined, { numeric: true }),
  )
  const days = [...new Set(entries.map((paper) => dayKey(paper.examDate)))]
  const firstClass = Object.fromEntries(days.map((day) => [day, String(entries.find((paper) => dayKey(paper.examDate) === day)?.class ?? '')]))
  return Object.fromEntries(
    days.map((day, index) => {
      const count = Math.min(needed[day] ?? 0, sorted.length)
      if (count <= 0) return [day, [] as string[]]
      const start = Math.min(index > 0 && firstClass[day] === firstClass[days[index - 1]] ? 1 : 0, Math.max(sorted.length - 1, 0))
      return [day, Array.from({ length: count }, (_, offset) => sorted[(start + offset) % sorted.length]._id)]
    }),
  )
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/**
 * Which rooms sit on which day (the website's Exam room/hall allocation), one exam day at a time:
 * automatic, or by hand, ticking rooms in the order they fill up to what the day's papers need.
 * Also whether candidates keep the same seats every day. Saving a day changes only the rooms whose
 * days changed.
 */
export default function RoomAllocationScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.conduct.write')
  const rooms = useExamRooms()
  const papers = useCentrePapers()
  const mode = useAllocationMode()
  const seating = useSeatingMode()
  const setMode = useSetAllocationMode()
  const setSeating = useSetSeatingMode()
  const saveRoom = useSaveRoom()
  const [day, setDay] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  const list = useMemo(() => [...(rooms.data ?? [])].sort(byRoomNo), [rooms.data])
  const sitting = useMemo(() => (papers.data ?? []).filter((paper) => Number(paper.candidateCount) > 0), [papers.data])
  const needed = useMemo(
    () => sitting.reduce<Record<string, number>>((sum, paper) => ({ ...sum, [dayKey(paper.examDate)]: (sum[dayKey(paper.examDate)] ?? 0) + (Number(paper.roomsNeeded) || 0) }), {}),
    [sitting],
  )
  const days = Object.keys(needed).sort()
  const shown = day && days.includes(day) ? day : days[0]
  const auto = mode.data !== 'manual'
  const autoRooms = useMemo(() => autoOrder(list, sitting, needed), [list, sitting, needed])
  const saved = shown ? manualOrder(list, shown) : []
  const picked = shown ? (draft[shown] ?? saved) : []
  const chosen = auto ? (shown ? (autoRooms[shown] ?? []) : []) : picked
  const need = shown ? (needed[shown] ?? 0) : 0
  const dirty = !auto && Boolean(shown && draft[shown] && JSON.stringify(draft[shown]) !== JSON.stringify(saved))
  const mostNeeded = Math.max(0, ...Object.values(needed))

  const toggle = (id: string) => {
    if (!shown || auto || !canWrite) return
    const current = [...picked]
    const at = current.indexOf(id)
    if (at >= 0) current.splice(at, 1)
    else if (need > 0 && current.length >= need) return toast(`This day needs ${need} ${need === 1 ? 'room' : 'rooms'}; untick one first.`, 'danger')
    else current.push(id)
    haptic.selection()
    setDraft({ ...draft, [shown]: current })
  }

  const saveDay = async () => {
    if (!shown) return
    const order = draft[shown] ?? []
    const changed = list.filter((room) => {
      const was = saved.indexOf(room._id)
      const now = order.indexOf(room._id)
      return was !== now
    })
    setSaving(true)
    try {
      await Promise.all(
        changed.map((room) => {
          const now = order.indexOf(room._id)
          const others = (room.allocatedExamDates ?? []).filter((entry) => entry !== shown)
          const orders = Object.fromEntries(Object.entries(room.allocationOrderByDate ?? {}).filter(([key]) => key !== shown))
          return saveRoom.mutateAsync({
            id: room._id,
            input: {
              allocatedExamDates: now >= 0 ? [...others, shown].sort() : others,
              allocationOrderByDate: now >= 0 ? { ...orders, [shown]: now + 1 } : orders,
            },
          })
        }),
      )
      haptic.success()
      const { [shown]: _done, ...rest } = draft
      setDraft(rest)
      toast(`${formatDayKey(shown)}: ${order.length} ${order.length === 1 ? 'room' : 'rooms'}`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "Some rooms weren't saved. Try again.", 'danger')
    } finally {
      setSaving(false)
    }
  }

  const changeMode = async (next: 'auto' | 'manual') => {
    if (next === mode.data) return
    if (next === 'auto' && mostNeeded > list.length) return toast(`One day needs ${mostNeeded} rooms and the centre has ${list.length}. Add rooms first.`, 'danger')
    try {
      await setMode.mutateAsync(next)
      haptic.success()
      setDraft({})
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It didn't change. Try again.", 'danger')
    }
  }

  const changeSeating = async (next: 'same_across_days' | 'different_per_day') => {
    if (next === seating.data) return
    try {
      await setSeating.mutateAsync(next)
      haptic.success()
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It didn't change. Try again.", 'danger')
    }
  }

  const loading = rooms.isPending || papers.isPending || mode.isPending || seating.isPending
  const failed = rooms.isError || papers.isError || mode.isError || seating.isError

  return (
    <MobileScreen
      refreshing={rooms.isRefetching || papers.isRefetching}
      onRefresh={() => (rooms.refetch(), papers.refetch(), mode.refetch(), seating.refetch())}
      nav={<NavBar title="Rooms by day" back={{ label: 'Centre', onPress: router.back }} />}
      actionBar={
        dirty && shown ? (
          <ActionBar icon={CalendarCheck} summary={`${picked.length} of ${need} rooms`} detail={formatDayKey(shown)} label={saving ? 'Saving…' : 'Save the day'} onPress={saveDay} />
        ) : undefined
      }
    >
      {loading ? (
        <CardSkeleton rows={6} />
      ) : failed ? (
        <LoadFailed what="Rooms" error={rooms.error ?? papers.error ?? mode.error ?? seating.error} onRetry={() => (rooms.refetch(), papers.refetch(), mode.refetch(), seating.refetch())} />
      ) : (
        <>
          <ListGroup
            header="Seating"
            footer={seating.data === 'same_across_days' ? 'Candidates keep the same seat every day.' : 'A new seating is made for each day.'}
            items={[
              {
                title: 'Same seats every day',
                accessory: canWrite ? (
                  <SegmentedControl
                    label="Same seats every day"
                    value={seating.data ?? 'different_per_day'}
                    onChange={changeSeating}
                    options={[
                      { value: 'same_across_days', label: 'Yes' },
                      { value: 'different_per_day', label: 'No' },
                    ]}
                  />
                ) : undefined,
                accessoryWidth: 120,
                value: canWrite ? undefined : seating.data === 'same_across_days' ? 'Yes' : 'No',
              },
            ]}
          />
          <ListGroup
            header="Which rooms each day"
            footer={auto ? 'Each day takes the rooms it needs in room-number order.' : 'Tick rooms in the order they fill.'}
            items={[
              {
                title: 'Chosen',
                accessory: canWrite ? (
                  <SegmentedControl
                    label="Chosen"
                    value={mode.data ?? 'auto'}
                    onChange={changeMode}
                    options={[
                      { value: 'auto', label: 'Automatically' },
                      { value: 'manual', label: 'By hand' },
                    ]}
                  />
                ) : undefined,
                accessoryWidth: 220,
                value: canWrite ? undefined : auto ? 'Automatically' : 'By hand',
              },
            ]}
          />
          {!days.length ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={CalendarCheck} title="No exam days yet" body="Days show once the board's datesheet and candidates are in." />
            </Surface>
          ) : !list.length ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={DoorOpen} title="No exam rooms yet" body="Add them under Rooms." />
            </Surface>
          ) : shown ? (
            <>
              <ChipRail label="Day" value={shown} onChange={setDay} items={days.map((entry) => ({ id: entry, label: formatDayKey(entry), count: draft[entry] ? undefined : needed[entry] }))} />
              {need > list.length ? (
                <Callout tone="warning" title={`${need} rooms needed`}>
                  The centre has {list.length}. Add rooms before this day.
                </Callout>
              ) : null}
              <ListGroup
                header={`${chosen.length} of ${need} ${need === 1 ? 'room' : 'rooms'} needed`}
                items={(auto ? chosen.map((id) => list.find((room) => room._id === id)).filter((room): room is ExamRoom => Boolean(room)) : list).map((room) => {
                  const at = chosen.indexOf(room._id)
                  return {
                    title: `Room ${room.roomNo}${room.roomName ? ` · ${room.roomName}` : ''}`,
                    subtitle: [room.floor, `${room.capacity} seats`].filter(Boolean).join(' · '),
                    badge: at >= 0 ? { label: `${ordinal(at + 1)} to fill`, tone: 'info' as const } : undefined,
                    lines: 2 as const,
                    onPress: !auto && canWrite ? () => toggle(room._id) : undefined,
                  }
                })}
              />
            </>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
