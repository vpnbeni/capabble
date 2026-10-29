import { useRouter } from 'expo-router'
import { FileText, UserCheck } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, schoolToday } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { centreService, roomsForDate, type ExamRoom } from '@/services/centreService'
import { useAssignDuties, useCentrePapers, useDayDuties, useDutyMode, useExamRooms, useInvigilators } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

type Pair = [string, string]

const shortDate = (key: string) => formatDayKey(key, { weekday: 'short' })

/**
 * Who invigilates each exam room on a day (the website's Duties → room duties): the rooms in use
 * that day with their two invigilators, and the duty record as a PDF. With the school's duty mode
 * set to automatic, choose the invigilators and the server spreads them over the rooms (keeping
 * them away from their own school's candidates and subjects); by hand, choose two for each room.
 * Which rooms sit on which day comes from the seating plan on the website.
 */
export default function CentreDutiesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.duties.write')
  const rooms = useExamRooms()
  const papers = useCentrePapers()
  const mode = useDutyMode()

  const dates = [...new Set([...(rooms.data ?? []).flatMap((room) => room.allocatedExamDates ?? []), ...(papers.data ?? []).map((paper) => String(paper.examDate).slice(0, 10))])].sort()
  const today = schoolToday()
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? dates.find((key) => key >= today) ?? dates[dates.length - 1] ?? null
  const duties = useDayDuties(date)
  const dayRooms = date ? roomsForDate(rooms.data ?? [], date) : []

  const assign = useAssignDuties()
  const [pool, setPool] = useState<string[] | null>(null)
  const [draft, setDraft] = useState<Record<string, Pair> | null>(null)
  const [roomSheet, setRoomSheet] = useState<{ room: ExamRoom; slot: 0 | 1 | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const people = useInvigilators(canWrite && (pool !== null || draft !== null))

  const byRoom = new Map((duties.data?.duties ?? []).map((duty) => [duty.room._id, duty]))
  const nameOf = (id: string) => people.data?.find((row) => row._id === id)?.name ?? ''

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const startEditing = () => {
    setError(null)
    if (mode.data === 'auto') {
      setPool((duties.data?.duties ?? []).flatMap((duty) => [duty.functionary._id, duty.functionary2?._id ?? ''].filter(Boolean)))
    } else {
      setDraft(Object.fromEntries(dayRooms.map((room) => [room._id, [byRoom.get(room._id)?.functionary._id ?? '', byRoom.get(room._id)?.functionary2?._id ?? ''] as Pair])))
    }
  }

  const done = (count: number) => {
    haptic.success()
    toast(`Duties saved for ${count} ${count === 1 ? 'room' : 'rooms'}`)
  }

  const saveAuto = async () => {
    if (!date || !pool) return
    if (pool.length < dayRooms.length * 2) return setError(`Choose at least ${dayRooms.length * 2}: two for each of the ${dayRooms.length} rooms.`)
    try {
      const result = await assign.mutateAsync({ examDate: date, functionaryIds: pool })
      setPool(null)
      done(result.totalAssigned)
    } catch (failure) {
      setError(fail(failure, "The duties weren't saved. Try again."))
    }
  }

  const saveByHand = async () => {
    if (!date || !draft) return
    const first = dayRooms.map((room) => draft[room._id]?.[0] ?? '')
    const second = dayRooms.map((room) => draft[room._id]?.[1] ?? '')
    if ([...first, ...second].some((id) => !id)) return setError('Choose two invigilators for every room.')
    try {
      const result = await assign.mutateAsync({ examDate: date, functionaryIds: first, secondFunctionaryIds: second })
      setDraft(null)
      done(result.totalAssigned)
    } catch (failure) {
      setError(fail(failure, "The duties weren't saved. Try again."))
    }
  }

  const printRecord = async () => {
    if (!date || printing) return
    setPrinting(true)
    try {
      const bytes = await centreService.dutyRecord(date)
      haptic.success()
      await sharePdf(bytes, `Duty record ${date}.pdf`)
    } catch (failure) {
      toast(fail(failure, "The duty record didn't download. Try again."), 'danger')
    } finally {
      setPrinting(false)
    }
  }

  // People already given a room that day can't take a second one.
  const usedElsewhere = (roomId: string) => new Set(Object.entries(draft ?? {}).flatMap(([id, pair]) => (id === roomId ? [] : pair.filter(Boolean))))
  const sheetPair: Pair = roomSheet && draft ? (draft[roomSheet.room._id] ?? ['', '']) : ['', '']

  const editing = pool !== null || draft !== null
  const assigned = dayRooms.filter((room) => (draft ? draft[room._id]?.every(Boolean) : byRoom.has(room._id))).length

  return (
    <MobileScreen
      refreshing={duties.isRefetching || rooms.isRefetching}
      onRefresh={() => (duties.refetch(), rooms.refetch(), papers.refetch())}
      nav={
        <NavBar
          title="Room duties"
          back={{ label: 'Centre', onPress: draft ? () => setDraft(null) : router.back }}
          actions={date && byRoom.size ? [{ label: printing ? 'Making the duty record…' : 'Duty record', icon: FileText, onPress: printRecord }] : undefined}
        />
      }
      actionBar={
        !canWrite || !date || !dayRooms.length ? undefined : draft ? (
          <ActionBar icon={UserCheck} summary={`${assigned} of ${dayRooms.length} rooms`} detail="Two invigilators each" label={assign.isPending ? 'Saving…' : 'Save duties'} onPress={saveByHand} />
        ) : (
          <ActionBar
            icon={UserCheck}
            summary={`${byRoom.size} of ${dayRooms.length} rooms`}
            detail={mode.data === 'auto' ? 'Spread automatically' : 'Chosen by hand'}
            label={byRoom.size ? 'Change duties' : 'Assign duties'}
            onPress={startEditing}
          />
        )
      }
      overlay={
        <>
          <BottomSheet
            open={pool !== null}
            onClose={() => setPool(null)}
            title="Invigilators for the day"
            description={`Choose at least ${dayRooms.length * 2}. The server places two in each room, away from their own school's candidates.`}
            detent="large"
            footer={
              <MobileButton fullWidth loading={assign.isPending} disabled={people.isPending} onPress={saveAuto}>
                Assign {pool?.length ?? 0} to {dayRooms.length} {dayRooms.length === 1 ? 'room' : 'rooms'}
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            {people.isPending ? (
              <CardSkeleton rows={5} />
            ) : people.isError ? (
              <LoadFailed what="Invigilators" error={people.error} onRetry={people.refetch} />
            ) : (
              <OptionList
                multiple
                label="Invigilators"
                value={pool ?? []}
                onChange={setPool}
                options={(people.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.designation }))}
              />
            )}
          </BottomSheet>
          <BottomSheet
            open={Boolean(roomSheet)}
            onClose={() => (roomSheet?.slot !== null && roomSheet ? setRoomSheet({ ...roomSheet, slot: null }) : setRoomSheet(null))}
            title={roomSheet ? `Room ${roomSheet.room.roomNo}${roomSheet.slot === null ? '' : ` · invigilator ${roomSheet.slot + 1}`}` : ''}
            detent="large"
            footer={
              roomSheet?.slot === null ? (
                <MobileButton fullWidth onPress={() => setRoomSheet(null)}>
                  Done
                </MobileButton>
              ) : undefined
            }
          >
            {!roomSheet ? null : roomSheet.slot === null ? (
              <ListGroup
                items={[0, 1].map((slot) => ({
                  title: `Invigilator ${slot + 1}`,
                  value: nameOf(sheetPair[slot]) || 'Choose',
                  chevron: true,
                  onPress: () => setRoomSheet({ ...roomSheet, slot: slot as 0 | 1 }),
                }))}
              />
            ) : people.isPending ? (
              <CardSkeleton rows={5} />
            ) : (
              <OptionList
                label={`Invigilator ${roomSheet.slot + 1}`}
                value={sheetPair[roomSheet.slot]}
                onChange={(id) => {
                  const pair: Pair = [...sheetPair]
                  pair[roomSheet.slot as 0 | 1] = id
                  if (pair[0] === pair[1]) pair[roomSheet.slot === 0 ? 1 : 0] = ''
                  setDraft({ ...(draft ?? {}), [roomSheet.room._id]: pair })
                  setRoomSheet({ ...roomSheet, slot: null })
                }}
                options={(people.data ?? []).filter((row) => !usedElsewhere(roomSheet.room._id).has(row._id)).map((row) => ({ value: row._id, label: row.name, meta: row.designation }))}
              />
            )}
          </BottomSheet>
        </>
      }
    >
      {rooms.isPending || papers.isPending ? (
        <CardSkeleton rows={5} />
      ) : rooms.isError ? (
        <LoadFailed what="Rooms" error={rooms.error} onRetry={rooms.refetch} />
      ) : !dates.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={UserCheck} title="No exam days yet" body="Exam days come from the board's datesheet and the seating plan on the website." />
        </Surface>
      ) : (
        <>
          {!editing ? <ChipRail label="Exam day" value={date ?? ''} onChange={setPicked} items={dates.map((key) => ({ id: key, label: shortDate(key) }))} /> : null}
          {draft && error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {duties.isPending ? (
            <CardSkeleton rows={5} />
          ) : duties.isError ? (
            <LoadFailed what="Duties" error={duties.error} onRetry={duties.refetch} />
          ) : dayRooms.length ? (
            <ListGroup
              header={date ? formatDayKey(date, { weekday: 'long', month: 'long' }) : undefined}
              footer={draft ? 'Tap a room to choose its two invigilators.' : undefined}
              items={dayRooms.map((room) => {
                const duty = byRoom.get(room._id)
                const pair = draft?.[room._id]
                const names = pair ? pair.map((id) => nameOf(id)).filter(Boolean) : [duty?.functionary.name, duty?.functionary2?.name].filter(Boolean)
                return {
                  title: `Room ${room.roomNo}${room.roomName ? ` · ${room.roomName}` : ''}`,
                  subtitle: names.length ? names.join(' and ') : 'Not assigned yet',
                  lines: 2 as const,
                  chevron: Boolean(draft),
                  onPress: draft ? () => setRoomSheet({ room, slot: null }) : undefined,
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={UserCheck} title="No rooms on this day" body="Rooms are given to a day with the seating plan on the website." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
