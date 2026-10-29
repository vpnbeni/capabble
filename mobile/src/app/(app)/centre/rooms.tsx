import { useRouter } from 'expo-router'
import { Boxes, DoorOpen } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ExamRoom, RoomInput } from '@/services/centreService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useAddRoom, useAssetRooms, useExamRooms, useRemoveRoom, useSaveRoom, useSyncAssetRooms } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, BottomSheet, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

const FIELDS: RecordField[] = [
  { key: 'roomNo', label: 'Room number', kind: 'text', placeholder: '12', required: true },
  { key: 'roomName', label: 'Name (optional)', kind: 'text', placeholder: 'Science lab' },
  { key: 'floor', label: 'Floor', kind: 'text', placeholder: 'First Floor' },
  { key: 'capacity', label: 'Seats', kind: 'number', placeholder: '24', required: true },
]
// A room whose benches were laid out on the website gets its seats from that layout.
const LAID_OUT = FIELDS.filter((field) => field.key !== 'capacity')

const hasLayout = (room: ExamRoom) => Boolean(room.seatingLayout?.rows?.length)
const valuesOf = (room: ExamRoom): RecordValues => ({ roomNo: room.roomNo, roomName: room.roomName ?? '', floor: room.floor ?? '', capacity: String(room.capacity ?? '') })

/**
 * The centre's exam rooms (the website's Exam room/hall): number, name, floor and seats; add,
 * change or remove one, or take the school's rooms from the asset register. Bench layouts and
 * which rooms are used on which day are set on the website with the seating plan.
 */
export default function CentreRoomsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.conduct.write')
  const rooms = useExamRooms()
  const add = useAddRoom()
  const saveRoom = useSaveRoom()
  const remove = useRemoveRoom()
  const sync = useSyncAssetRooms()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ room: ExamRoom; values: RecordValues } | null>(null)
  const [removing, setRemoving] = useState<ExamRoom | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [picked, setPicked] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const empty = useMemo<RecordValues>(() => ({ roomNo: '', roomName: '', floor: 'First Floor', capacity: '24' }), [])
  const canSync = canWrite && staff.canUse('asets_dashboard')
  const assetRooms = useAssetRooms(canSync && syncing)

  const list = rooms.data ?? []
  const seats = list.reduce((sum, room) => sum + (room.capacity || 0), 0)

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const toInput = (values: RecordValues): RoomInput | null => {
    const input: RoomInput = {}
    if (values.roomNo !== undefined) input.roomNo = values.roomNo.trim()
    if (values.roomName !== undefined) input.roomName = values.roomName.trim()
    if (values.floor !== undefined) input.floor = values.floor.trim()
    if (values.capacity !== undefined) {
      const seatsCount = Number(values.capacity)
      if (!Number.isInteger(seatsCount) || seatsCount < 1 || seatsCount > 500) {
        setError('Seats is a whole number from 1 to 500.')
        return null
      }
      input.capacity = seatsCount
    }
    return input
  }

  const doAdd = async (_: RecordValues, all: RecordValues) => {
    const input = toInput(all)
    if (!input) return
    try {
      await add.mutateAsync(input)
      haptic.success()
      setAdding(false)
      toast(`Room ${input.roomNo} added`)
    } catch (failure) {
      setError(fail(failure, "It wasn't added. Try again."))
    }
  }

  const doSave = async (changes: RecordValues) => {
    if (!editing) return
    if (!Object.keys(changes).length) return setEditing(null)
    const input = toInput(changes)
    if (!input) return
    try {
      await saveRoom.mutateAsync({ id: editing.room._id, input })
      haptic.success()
      setEditing(null)
      toast(`Room ${input.roomNo ?? editing.room.roomNo} saved`)
    } catch (failure) {
      setError(fail(failure, "It wasn't saved. Try again."))
    }
  }

  const doRemove = async () => {
    if (!removing) return
    const room = removing
    setRemoving(null)
    try {
      await remove.mutateAsync(room._id)
      haptic.medium()
      toast(`Room ${room.roomNo} removed`)
    } catch (failure) {
      toast(fail(failure, "It wasn't removed. Try again."), 'danger')
    }
  }

  // Ticks start from the asset rooms already used for exams.
  const options = assetRooms.data ?? []
  const ticked = picked ?? options.filter((row) => row.useForExams).map((row) => row.locationId)

  const doSync = async () => {
    try {
      await sync.mutateAsync(ticked)
      haptic.success()
      setSyncing(false)
      toast(`${ticked.length} ${ticked.length === 1 ? 'room' : 'rooms'} used for exams`)
    } catch (failure) {
      toast(fail(failure, "That didn't work. Try again."), 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={rooms.isRefetching}
      onRefresh={rooms.refetch}
      nav={
        <NavBar
          title="Rooms"
          back={{ label: 'Centre', onPress: router.back }}
          actions={canSync ? [{ label: 'From the asset register', icon: Boxes, onPress: () => (setPicked(null), setSyncing(true)) }] : undefined}
        />
      }
      actionBar={
        canWrite ? (
          <ActionBar
            icon={DoorOpen}
            summary={`${list.length} ${list.length === 1 ? 'room' : 'rooms'}`}
            detail={`${seats} seats`}
            label="Add a room"
            onPress={() => (setError(null), setAdding(true))}
          />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet open={adding} onClose={() => setAdding(false)} title="Add a room" fields={FIELDS} initial={empty} isNew saving={add.isPending} error={error} onSave={doAdd} />
          <RecordSheet
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            title={editing ? `Room ${editing.room.roomNo}` : ''}
            fields={editing && hasLayout(editing.room) ? LAID_OUT : FIELDS}
            initial={editing?.values ?? empty}
            isNew={false}
            saving={saveRoom.isPending}
            error={error}
            onSave={doSave}
            onRemove={() => editing && (setRemoving(editing.room), setEditing(null))}
            removeLabel="Remove this room"
          />
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={removing ? `Remove room ${removing.roomNo}?` : ''}
            message="It stops being used for seating and duties. Past seating plans keep it."
            actions={[{ label: 'Remove room', tone: 'danger', onSelect: doRemove }]}
          />
          <BottomSheet
            open={syncing}
            onClose={() => setSyncing(false)}
            title="Rooms from the asset register"
            description="Ticked rooms are used for exams; unticked ones stop being exam rooms."
            detent="large"
            footer={
              <MobileButton fullWidth loading={sync.isPending} disabled={assetRooms.isPending} onPress={doSync}>
                Use {ticked.length} {ticked.length === 1 ? 'room' : 'rooms'}
              </MobileButton>
            }
          >
            {assetRooms.isPending ? (
              <CardSkeleton rows={4} />
            ) : assetRooms.isError ? (
              <LoadFailed what="Asset rooms" error={assetRooms.error} onRetry={assetRooms.refetch} />
            ) : options.length ? (
              <OptionList
                multiple
                label="Rooms"
                value={ticked}
                onChange={setPicked}
                options={options.map((row) => ({
                  value: row.locationId,
                  label: [row.roomNumber, row.name].filter(Boolean).join(' · ') || 'Room',
                  meta: [row.floor, `${row.capacity} seats`].filter(Boolean).join(' · '),
                }))}
              />
            ) : (
              <StatusView compact kind="empty" icon={Boxes} title="No rooms in the asset register" body="Add the school's rooms under Assets → Locations first." />
            )}
          </BottomSheet>
        </>
      }
    >
      {rooms.isPending ? (
        <CardSkeleton rows={5} />
      ) : rooms.isError ? (
        <LoadFailed what="Rooms" error={rooms.error} onRetry={rooms.refetch} />
      ) : list.length ? (
        <ListGroup
          footer={canWrite ? 'Tap a room to change it. Bench layouts and which rooms sit on which day are set with the seating plan on the website.' : undefined}
          items={list.map((room) => ({
            title: `Room ${room.roomNo}${room.roomName ? ` · ${room.roomName}` : ''}`,
            subtitle: [room.floor, `${room.capacity} seats`, hasLayout(room) ? 'benches laid out' : null].filter(Boolean).join(' · '),
            lines: 2 as const,
            onPress: canWrite ? () => (setError(null), setEditing({ room, values: valuesOf(room) })) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={DoorOpen} title="No exam rooms yet" body="Add each room candidates sit in, with its seats." />
        </Surface>
      )}
    </MobileScreen>
  )
}
