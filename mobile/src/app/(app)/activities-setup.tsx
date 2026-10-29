import { useRouter } from 'expo-router'
import { Flag, Plus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { SetupKind, SetupRecord } from '@/services/activityService'
import { useRemoveSetupRecord, useSaveSetupRecord, useSetupRecords } from '@/staff/activityQueries'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, ChipRail, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

// House colours as the website stores them (a hex value), named for choosing.
const HOUSE_COLOURS = [
  { value: '#d32f2f', label: 'Red' },
  { value: '#1976d2', label: 'Blue' },
  { value: '#388e3c', label: 'Green' },
  { value: '#fbc02d', label: 'Yellow' },
  { value: '#7b1fa2', label: 'Purple' },
  { value: '#f57c00', label: 'Orange' },
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((value) => ({ value, label: value }))
const year = schoolToday().slice(0, 4)

/** Each kind of record: its name on the chip, the singular, its fields and what its row shows. */
const KINDS: Record<SetupKind, { chip: string; one: string; title: string; fields: RecordField[]; subtitle: (row: SetupRecord) => string }> = {
  houses: {
    chip: 'Houses',
    one: 'house',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Tagore House', required: true },
      { key: 'motto', label: 'Motto (optional)', kind: 'text' },
      { key: 'color', label: 'Colour', kind: 'choice', options: HOUSE_COLOURS },
    ],
    subtitle: (row) => [HOUSE_COLOURS.find((colour) => colour.value === row.color)?.label, row.motto].filter(Boolean).join(' · '),
  },
  clubs: {
    chip: 'Clubs',
    one: 'club',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Science club', required: true },
      { key: 'incharge', label: 'Teacher in charge (optional)', kind: 'text' },
      { key: 'description', label: 'What it does (optional)', kind: 'long' },
      { key: 'meetingDay', label: 'Meets on', kind: 'choice', options: DAYS },
    ],
    subtitle: (row) => [row.incharge, row.meetingDay ? `meets ${row.meetingDay}` : null].filter(Boolean).join(' · '),
  },
  sports: {
    chip: 'Sports',
    one: 'sports meet',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Annual sports meet', required: true },
      { key: 'year', label: 'Year', kind: 'number', placeholder: year },
      { key: 'venue', label: 'Venue (optional)', kind: 'text' },
      { key: 'events', label: 'Events (optional)', kind: 'long', hint: 'One per line: 100 m, long jump…' },
      { key: 'results', label: 'Results (optional)', kind: 'long', hint: 'Who won what, once it is over.' },
      { key: 'startDate', label: 'Starts', kind: 'date' },
      { key: 'endDate', label: 'Ends', kind: 'date' },
    ],
    subtitle: (row) => [row.venue, row.startDate ? formatDayKey(String(row.startDate).slice(0, 10), { year: true }) : row.year].filter(Boolean).join(' · '),
  },
  tours: {
    chip: 'Tours',
    one: 'tour',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Class 8 trip to Jaipur', required: true },
      { key: 'destination', label: 'Where to (optional)', kind: 'text' },
      { key: 'classes', label: 'Classes going (optional)', kind: 'text', placeholder: '8-A, 8-B' },
      { key: 'students', label: 'Students going (optional)', kind: 'long', hint: 'One per line.' },
      { key: 'description', label: 'Plan (optional)', kind: 'long' },
      { key: 'startDate', label: 'Leaves', kind: 'date' },
      { key: 'endDate', label: 'Returns', kind: 'date' },
    ],
    subtitle: (row) => [row.destination, row.startDate ? formatDayKey(String(row.startDate).slice(0, 10), { year: true }) : null].filter(Boolean).join(' · '),
  },
  functions: {
    chip: 'Functions',
    one: 'function',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Annual day', required: true },
      { key: 'functionType', label: 'Kind (optional)', kind: 'text', placeholder: 'Celebration, assembly…' },
      { key: 'venue', label: 'Venue (optional)', kind: 'text' },
      { key: 'incharge', label: 'In charge (optional)', kind: 'text' },
      { key: 'plan', label: 'Plan (optional)', kind: 'long' },
      { key: 'outcome', label: 'How it went (optional)', kind: 'long' },
      { key: 'date', label: 'Day', kind: 'date' },
    ],
    subtitle: (row) => [row.date ? formatDayKey(String(row.date).slice(0, 10), { year: true }) : null, row.venue, row.incharge].filter(Boolean).join(' · '),
  },
  councils: {
    chip: 'Councils',
    one: 'council',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Student council 2026-27', required: true },
      { key: 'academicYear', label: 'Year (optional)', kind: 'text', placeholder: '2026-2027' },
      { key: 'description', label: 'About (optional)', kind: 'long' },
    ],
    subtitle: (row) => [row.councilType === 'house' ? `${row.houseName || 'House'} council` : 'School council', row.academicYear].filter(Boolean).join(' · '),
  },
}

const valuesOf = (fields: RecordField[], row?: SetupRecord): RecordValues => Object.fromEntries(fields.map((field) => [field.key, row?.[field.key] == null ? '' : String(row[field.key])]))

/**
 * Setting up activities (the website's Activities → Houses, Clubs, Sports, Tours, Functions and
 * Councils): add, change or remove each, one sheet each. House points and certificates are on the
 * Activities screen; logos, house teachers, council posts and certificate designs stay on the website.
 */
export default function ActivitiesSetupScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('actvt.activities.write')
  const canRemove = staff.can('actvt.activities.delete')
  const [kind, setKind] = useState<SetupKind>('houses')
  const records = useSetupRecords(kind)
  const save = useSaveSetupRecord()
  const remove = useRemoveSetupRecord()
  const [open, setOpen] = useState<{ row?: SetupRecord } | null>(null)
  const [removing, setRemoving] = useState<SetupRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const spec = KINDS[kind]
  const initial = useMemo(() => valuesOf(spec.fields, open?.row), [spec.fields, open])

  const doSave = async (changes: RecordValues) => {
    if (!open) return
    if (open.row && !Object.keys(changes).length) return setOpen(null)
    try {
      await save.mutateAsync({ kind, id: open.row?._id, input: changes })
      haptic.success()
      setOpen(null)
      toast(open.row ? 'Saved' : `${spec.one.charAt(0).toUpperCase()}${spec.one.slice(1)} added`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const doRemove = async () => {
    if (!removing) return
    const row = removing
    setRemoving(null)
    try {
      await remove.mutateAsync({ kind, id: row._id })
      haptic.medium()
      toast(`${String(row[spec.title] ?? '')} removed`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  const rows = records.data ?? []

  return (
    <MobileScreen
      refreshing={records.isRefetching}
      onRefresh={records.refetch}
      nav={<NavBar title="Set up activities" back={{ label: 'Activities', onPress: router.back }} />}
      actionBar={canWrite ? <ActionBar icon={Plus} summary={`${rows.length} ${rows.length === 1 ? spec.one : spec.chip.toLowerCase()}`} detail="Add, change or remove" label={`Add a ${spec.one}`} onPress={() => (setError(null), setOpen({}))} /> : undefined}
      overlay={
        <>
          <RecordSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.row ? String(open.row[spec.title] ?? spec.one) : `Add a ${spec.one}`}
            fields={spec.fields}
            initial={initial}
            isNew={!open?.row}
            saving={save.isPending}
            error={error}
            onSave={doSave}
            onRemove={open?.row && canRemove ? () => (setRemoving(open.row ?? null), setOpen(null)) : undefined}
            removeLabel={`Remove ${spec.one}`}
          />
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={`Remove ${String(removing?.[spec.title] ?? '')}?`}
            message="It leaves the lists here and on the website."
            actions={[{ label: `Remove ${spec.one}`, tone: 'danger', onSelect: doRemove }]}
          />
        </>
      }
    >
      <ChipRail label="Show" value={kind} onChange={setKind} items={(Object.keys(KINDS) as SetupKind[]).map((id) => ({ id, label: KINDS[id].chip }))} />
      {records.isPending ? (
        <CardSkeleton rows={4} />
      ) : records.isError ? (
        <LoadFailed what={spec.chip} error={records.error} onRetry={records.refetch} />
      ) : rows.length ? (
        <ListGroup
          items={rows.map((row) => ({
            title: String(row[spec.title] ?? ''),
            subtitle: spec.subtitle(row) || undefined,
            lines: 2 as const,
            chevron: canWrite,
            onPress: canWrite ? () => (setError(null), setOpen({ row })) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Flag} title={`No ${spec.chip.toLowerCase()} yet`} body={canWrite ? `Add the school’s ${spec.chip.toLowerCase()} here.` : `The ${spec.chip.toLowerCase()} the school sets up show here.`} />
        </Surface>
      )}
    </MobileScreen>
  )
}
