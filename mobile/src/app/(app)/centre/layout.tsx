import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { Armchair, Plus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { SEATS_PER_BENCH, type BenchRow, type BenchType } from '@/services/centreService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useExamRooms, useSaveRoom } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, Callout, ListGroup, MobileScreen, NavBar, haptic, useToast } from '@/ui'

const BENCH_NAMES: Record<BenchType, string> = { single: 'single', double: 'double', triple: 'triple' }
const ROW_FIELDS: RecordField[] = [
  { key: 'benchCount', label: 'Benches in the row', kind: 'number', placeholder: '6', required: true, hint: 'From 1 to 50.' },
  {
    key: 'benchType',
    label: 'Benches seat',
    kind: 'choice',
    options: [
      { value: 'single', label: 'One (single)' },
      { value: 'double', label: 'Two (double)' },
      { value: 'triple', label: 'Three (triple)' },
    ],
  },
]

const rowSeats = (row: BenchRow) => row.benchCount * SEATS_PER_BENCH[row.benchType]

/**
 * A room's benches (the website's room layout designer), row by row from the front: how many
 * benches and whether each seats one, two or three. The seating plan seats candidates bench by
 * bench, and the room's seats come from the layout once it is saved.
 */
export default function RoomLayoutScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.conduct.write')
  const { id } = useLocalSearchParams<{ id: string }>()
  const rooms = useExamRooms()
  const save = useSaveRoom()
  const room = rooms.data?.find((entry) => entry._id === id)
  const saved = useMemo<BenchRow[]>(
    () => (room?.seatingLayout?.rows ?? []).map((row) => ({ benchCount: Number(row.benchCount) || 0, benchType: (SEATS_PER_BENCH[row.benchType] ? row.benchType : 'double') as BenchType })),
    [room],
  )
  const [edited, setRows] = useState<BenchRow[] | null>(null)
  const rows = edited ?? saved
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(saved)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const [editing, setEditing] = useState<{ index: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seats = rows.reduce((sum, row) => sum + rowSeats(row), 0)

  const initial = useMemo<RecordValues>(() => {
    const row = editing?.index != null ? rows[editing.index] : (rows[rows.length - 1] ?? null)
    return { benchCount: row ? String(row.benchCount) : '6', benchType: row?.benchType ?? 'double' }
  }, [editing, rows])

  const saveRow = (_changes: RecordValues, all: RecordValues) => {
    const benchCount = Number(all.benchCount)
    if (!Number.isInteger(benchCount) || benchCount < 1 || benchCount > 50) return setError('Benches in a row is a whole number from 1 to 50.')
    const row = { benchCount, benchType: (all.benchType || 'double') as BenchType }
    setRows(editing?.index != null ? rows.map((entry, index) => (index === editing.index ? row : entry)) : [...rows, row])
    setError(null)
    setEditing(null)
  }

  const submit = async () => {
    if (!room || !rows.length) return
    try {
      await save.mutateAsync({ id: room._id, input: { seatingLayout: { rows } } })
      haptic.success()
      allowLeaving()
      setRows(null)
      toast(`Room ${room.roomNo}: ${seats} seats`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={rooms.isRefetching}
      onRefresh={rooms.refetch}
      nav={<NavBar title={room ? `Room ${room.roomNo} benches` : 'Benches'} back={{ label: 'Rooms', onPress: router.back }} />}
      actionBar={
        dirty && rows.length ? (
          <ActionBar icon={Armchair} summary={`${seats} seats`} detail={`${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`} label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            title={editing?.index != null ? `Row ${editing.index + 1}` : `Row ${rows.length + 1}`}
            fields={ROW_FIELDS}
            initial={initial}
            isNew={editing?.index == null}
            saving={false}
            error={error}
            onSave={saveRow}
            onRemove={editing?.index != null && rows.length > 1 ? () => (setRows(rows.filter((_, index) => index !== editing.index)), setEditing(null)) : undefined}
            removeLabel="Remove this row"
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard the layout?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {rooms.isPending ? (
        <CardSkeleton rows={5} />
      ) : rooms.isError || !room ? (
        <LoadFailed what="The room" error={rooms.error} onRetry={rooms.refetch} />
      ) : (
        <>
          {!saved.length ? (
            <Callout tone="info" title="No benches laid out yet">
              Add the rows from the front. Today the room has {room.capacity} seats, typed in.
            </Callout>
          ) : null}
          <ListGroup
            header="Rows, front to back"
            footer={`${seats} seats in all.${saved.length ? '' : ' Saving sets the room’s seats from the benches.'}`}
            items={[
              ...rows.map((row, index) => ({
                title: `Row ${index + 1}`,
                subtitle: `${row.benchCount} ${BENCH_NAMES[row.benchType]} ${row.benchCount === 1 ? 'bench' : 'benches'}`,
                value: `${rowSeats(row)} seats`,
                chevron: canWrite,
                onPress: canWrite ? () => (setError(null), setEditing({ index })) : undefined,
              })),
              ...(canWrite ? [{ title: 'Add a row', icon: Plus, tile: 2 as const, onPress: () => (setError(null), setEditing({ index: null })) }] : []),
            ]}
          />
        </>
      )}
    </MobileScreen>
  )
}
