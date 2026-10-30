import { useRouter } from 'expo-router'
import { BellRing, CalendarCog, CalendarDays, Clock, Plus, Sparkles, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { timetableService, type BellRow, type Conflict, type TimetableVersion } from '@/services/timetableService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import {
  useArchiveVersion,
  useBellTimings,
  useGenerateTimetable,
  usePublishVersion,
  useRemoveVersion,
  useSaveBellTimings,
  useSetClassPeriods,
  useTimetableSetup,
  useTimetableVersions,
} from '@/staff/timetableQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, BottomSheet, Callout, ChipRail, Dialog, ListGroup, MobileButton, MobileScreen, NavBar, NumberCell, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'bells' | 'periods' | 'versions'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ROW_FIELDS: RecordField[] = [
  { key: 'label', label: 'Name', kind: 'text', placeholder: '1st or Lunch', required: true },
  { key: 'duration', label: 'Minutes', kind: 'number', placeholder: '40', required: true },
  {
    key: 'type',
    label: 'Kind',
    kind: 'choice',
    options: [
      { value: 'period', label: 'A period' },
      { value: 'break', label: 'A break' },
    ],
  },
]
const START_FIELDS: RecordField[] = [{ key: 'startTime', label: 'School starts at', kind: 'text', placeholder: '08:00', hint: '24-hour time, like 08:00.', required: true }]

const addMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  published: { label: 'Published', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
}

/**
 * Setting the timetable up (the website's Timetable → Bell timings, Period distribution, Generate and
 * Versions): bell timings row by row, one class's periods a week per subject, generating a draft and
 * what didn't fit, publishing a version, and the class and teacher timetables as PDFs. Who teaches
 * what (the teacher × subject × class grid) and editing the grid itself stay on the website.
 */
export default function TimetableSetupScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('timetable.timetable.write')
  const [tab, setTab] = useState<Tab>('bells')
  const bells = useBellTimings()
  const setup = useTimetableSetup()
  const versions = useTimetableVersions()
  const saveBells = useSaveBellTimings()
  const setPeriods = useSetClassPeriods()
  const generate = useGenerateTimetable()
  const publish = usePublishVersion()
  const archive = useArchiveVersion()
  const removeVersion = useRemoveVersion()
  const [rowSheet, setRowSheet] = useState<{ index?: number } | null>(null)
  const [startSheet, setStartSheet] = useState(false)
  const [classId, setClassId] = useState<string | null>(null)
  const [choosingClass, setChoosingClass] = useState(false)
  const [counts, setCounts] = useState<Record<string, string> | null>(null)
  const [generating, setGenerating] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [open, setOpen] = useState<TimetableVersion | null>(null)
  const [deleting, setDeleting] = useState<TimetableVersion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = bells.data?.rows ?? []
  const [rowValues, setRowValues] = useState<RecordValues>({})
  const openRow = (index?: number) => {
    const row = index !== undefined ? rows[index] : undefined
    setRowValues({ label: row?.label ?? '', duration: row ? String(row.duration) : '', type: row?.type ?? 'period' })
    setError(null)
    setRowSheet({ index })
  }
  const startValues = useMemo<RecordValues>(() => ({ startTime: bells.data?.startTime ?? '08:00' }), [bells.data?.startTime])

  const classes = setup.data?.classes ?? []
  const chosen = classes.find((row) => row.id === (classId ?? classes[0]?.id))
  const saved = chosen ? (setup.data?.periodAllocation[chosen.id] ?? {}) : {}
  const draft = counts ?? Object.fromEntries((chosen?.subjects ?? []).map((name) => [name, saved[name] ? String(saved[name]) : '']))
  const total = Object.values(draft).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const changed = counts !== null && (chosen?.subjects ?? []).some((name) => (Number(draft[name]) || 0) !== (Number(saved[name]) || 0))

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  // Bell timings go back whole: what was loaded, with the one change.
  const saveRows = async (nextRows: BellRow[], startTime = bells.data?.startTime ?? '08:00', done = 'Bell timings saved') => {
    if (!bells.data) return false
    try {
      await saveBells.mutateAsync({ ...bells.data, startTime, rows: nextRows })
      haptic.success()
      toast(done)
      return true
    } catch (failure) {
      setError(fail(failure, "The bell timings weren't saved. Try again."))
      return false
    }
  }

  const doSaveRow = async (_: RecordValues, all: RecordValues) => {
    const duration = Number.parseInt(all.duration, 10)
    if (!(duration > 0 && duration <= 240)) return setError('Minutes are 1 to 240.')
    const row = { label: all.label, duration, type: all.type === 'break' ? 'break' : 'period' }
    const index = rowSheet?.index
    const next = index !== undefined ? rows.map((entry, i) => (i === index ? { ...entry, ...row } : entry)) : [...rows, { id: `bt-${Date.now().toString(36)}`, ...row }]
    if (await saveRows(next)) setRowSheet(null)
  }

  const doRemoveRow = async () => {
    const index = rowSheet?.index
    if (index === undefined) return
    if (
      await saveRows(
        rows.filter((_, i) => i !== index),
        undefined,
        `${rows[index].label} removed`,
      )
    )
      setRowSheet(null)
  }

  const doSaveStart = async (_: RecordValues, all: RecordValues) => {
    if (!TIME.test(all.startTime)) return setError('Write the time as 24-hour hours and minutes, like 08:00.')
    if (await saveRows(rows, all.startTime, 'Start time saved')) setStartSheet(false)
  }

  const doSavePeriods = async () => {
    if (!chosen) return
    try {
      await setPeriods.mutateAsync({ classId: chosen.id, subjects: Object.fromEntries(Object.entries(draft).map(([name, value]) => [name, Number(value) || 0])) })
      haptic.success()
      setCounts(null)
      toast(`${classLabel(chosen.className, chosen.section)} periods saved`)
    } catch (failure) {
      toast(fail(failure, "The periods weren't saved. Try again."), 'danger')
    }
  }

  const doGenerate = async () => {
    setGenerating(false)
    try {
      const result = await generate.mutateAsync(`Timetable ${formatDayKey(schoolToday(), { year: true })}`)
      haptic.success()
      setConflicts(result.conflictReport)
      toast(result.conflictReport.length ? `Draft made. ${result.conflictReport.length} didn't fit.` : 'Draft made. Everything fitted.')
    } catch (failure) {
      toast(fail(failure, "It wasn't generated. Try again."), 'danger')
    }
  }

  const versionAction = async (what: 'publish' | 'archive' | 'remove' | 'classes' | 'teachers', version: TimetableVersion) => {
    setOpen(null)
    try {
      if (what === 'publish') await publish.mutateAsync(version._id)
      else if (what === 'archive') await archive.mutateAsync(version._id)
      else if (what === 'remove') {
        await removeVersion.mutateAsync(version._id)
        setConflicts(null)
      } else {
        const bytes = what === 'classes' ? await timetableService.classPdf(version._id) : await timetableService.teacherPdf(version._id)
        await sharePdf(bytes, `${version.name} ${what === 'classes' ? 'classes' : 'teachers'}.pdf`)
        return
      }
      haptic.success()
      toast(what === 'publish' ? `${version.name} published: teachers and families see it now` : what === 'archive' ? 'Archived' : 'Deleted')
    } catch (failure) {
      toast(fail(failure, "That didn't work. Try again."), 'danger')
    }
  }

  const timedRows = rows.map((row, index) => {
    const from = addMinutes(
      bells.data?.startTime ?? '08:00',
      rows.slice(0, index).reduce((sum, entry) => sum + entry.duration, 0),
    )
    return { row, from, to: addMinutes(from, row.duration) }
  })

  const actionBar = !canWrite ? undefined : tab === 'periods' && changed ? (
    <ActionBar
      icon={CalendarCog}
      summary={`${total} periods a week`}
      detail={chosen ? classLabel(chosen.className, chosen.section) : undefined}
      label={setPeriods.isPending ? 'Saving…' : 'Save'}
      onPress={doSavePeriods}
    />
  ) : tab === 'versions' ? (
    <ActionBar
      icon={Sparkles}
      summary="Generate from the setup"
      detail="A draft; the published one stays until you publish"
      label={generate.isPending ? 'Working…' : 'Generate'}
      onPress={() => setGenerating(true)}
    />
  ) : undefined

  return (
    <MobileScreen
      refreshing={bells.isRefetching || setup.isRefetching || versions.isRefetching}
      onRefresh={() => (bells.refetch(), setup.refetch(), versions.refetch())}
      nav={
        <NavBar
          title="Timetable setup"
          back={{ label: 'Timetables', onPress: router.back }}
          actions={[
            { icon: Users, label: 'Who teaches what', onPress: () => router.push('/timetables/teachers') },
            { icon: CalendarDays, label: 'A class’s week', onPress: () => router.push('/timetables/week') },
          ]}
        />
      }
      actionBar={actionBar}
      overlay={
        <>
          <RecordSheet
            open={Boolean(rowSheet)}
            onClose={() => setRowSheet(null)}
            title={rowSheet?.index !== undefined ? (rows[rowSheet.index]?.label ?? 'Row') : 'Add a period or break'}
            fields={ROW_FIELDS}
            initial={rowValues}
            isNew={rowSheet?.index === undefined}
            saving={saveBells.isPending}
            error={error}
            onSave={doSaveRow}
            onRemove={rowSheet?.index !== undefined ? doRemoveRow : undefined}
            removeLabel="Remove from the day"
          />
          <RecordSheet
            open={startSheet}
            onClose={() => setStartSheet(false)}
            title="School starts at"
            fields={START_FIELDS}
            initial={startValues}
            isNew={false}
            saving={saveBells.isPending}
            error={error}
            onSave={doSaveStart}
          />
          <BottomSheet open={choosingClass} onClose={() => setChoosingClass(false)} title="Class" detent="large">
            <OptionList
              label="Class"
              value={chosen?.id ?? ''}
              onChange={(value) => (setClassId(value), setCounts(null), setChoosingClass(false))}
              options={classes.map((row) => ({ value: row.id, label: classLabel(row.className, row.section), meta: `${row.subjects.length} subjects` }))}
            />
          </BottomSheet>
          <Dialog
            open={generating}
            onClose={() => setGenerating(false)}
            title="Generate a timetable?"
            description="It is worked out from the saved setup as a draft. Nothing changes for teachers and families until you publish it."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setGenerating(false)}>
                  Not now
                </MobileButton>
                <MobileButton onPress={doGenerate}>Generate</MobileButton>
              </>
            }
          />
          <Dialog
            open={Boolean(deleting)}
            onClose={() => setDeleting(null)}
            tone="danger"
            title={`Delete ${deleting?.name ?? ''}?`}
            description="This version goes for good. The published one isn't affected."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setDeleting(null)}>
                  Keep it
                </MobileButton>
                <MobileButton variant="destructive" loading={removeVersion.isPending} onPress={() => deleting && (setDeleting(null), versionAction('remove', deleting))}>
                  Delete
                </MobileButton>
              </>
            }
          />
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.name ?? ''}
            message={open ? `${STATUS[open.status]?.label ?? open.status}${open.conflictCount ? ` · ${open.conflictCount} didn't fit` : ''}` : undefined}
            actions={
              open
                ? [
                    ...(canWrite && open.status !== 'published' ? [{ label: 'Publish', onSelect: () => versionAction('publish', open) }] : []),
                    { label: 'Share class timetables', onSelect: () => versionAction('classes', open) },
                    { label: 'Share teacher timetables', onSelect: () => versionAction('teachers', open) },
                    ...(canWrite && open.status === 'published' ? [{ label: 'Archive', onSelect: () => versionAction('archive', open) }] : []),
                    ...(canWrite && open.status !== 'published' ? [{ label: 'Delete', tone: 'danger' as const, onSelect: () => (setOpen(null), setDeleting(open)) }] : []),
                  ]
                : []
            }
          />
        </>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'bells', label: 'Bell timings' },
          { id: 'periods', label: 'Periods' },
          { id: 'versions', label: 'Versions' },
        ]}
      />
      {tab === 'bells' ? (
        bells.isPending ? (
          <CardSkeleton rows={6} />
        ) : bells.isError ? (
          <LoadFailed what="Bell timings" error={bells.error} onRetry={bells.refetch} />
        ) : (
          <>
            <ListGroup
              items={[
                { title: 'School starts at', value: formatTime(bells.data.startTime), icon: Clock, tile: 4 as const, onPress: canWrite ? () => (setError(null), setStartSheet(true)) : undefined },
              ]}
            />
            <ListGroup
              header="The day"
              footer={canWrite ? 'Removing or adding a period changes the timetable’s periods: generate again after.' : undefined}
              items={[
                ...timedRows.map(({ row, from, to }, index) => ({
                  title: row.label || (row.type === 'break' ? 'Break' : 'Period'),
                  subtitle: `${formatTime(from)} to ${formatTime(to)} · ${row.duration} min`,
                  lines: 2 as const,
                  icon: row.type === 'break' ? BellRing : undefined,
                  tile: row.type === 'break' ? (4 as const) : undefined,
                  onPress: canWrite ? () => openRow(index) : undefined,
                })),
                ...(canWrite ? [{ title: 'Add a period or break', icon: Plus, tile: 4 as const, onPress: () => openRow() }] : []),
              ]}
            />
          </>
        )
      ) : tab === 'periods' ? (
        setup.isPending ? (
          <CardSkeleton rows={6} />
        ) : setup.isError ? (
          <LoadFailed what="The timetable setup" error={setup.error} onRetry={setup.refetch} />
        ) : !chosen ? (
          <Surface padded={false}>
            <StatusView compact kind="empty" title="No classes yet" body="Add classes and sections first, from Timetables → Classes." />
          </Surface>
        ) : (
          <>
            <ListGroup items={[{ title: 'Class', value: classLabel(chosen.className, chosen.section), onPress: () => setChoosingClass(true) }]} />
            {chosen.subjects.length ? (
              <ListGroup
                header={`Periods a week · ${total} of ${setup.data.periodsPerWeek}`}
                footer={total > setup.data.periodsPerWeek ? `More than the ${setup.data.periodsPerWeek} periods in a week: some won't fit.` : undefined}
                items={chosen.subjects.map((name) => ({
                  title: name,
                  accessory: (
                    <NumberCell
                      label={`${name} periods a week`}
                      value={draft[name] ?? ''}
                      disabled={!canWrite}
                      onChangeText={(value: string) => setCounts({ ...draft, [name]: value.replace(/[^0-9]/g, '') })}
                      maxLength={2}
                    />
                  ),
                }))}
              />
            ) : (
              <Surface padded={false}>
                <StatusView compact kind="empty" title="No subjects for this class" body="Give the class its subjects from Timetables → Classes." />
              </Surface>
            )}
          </>
        )
      ) : versions.isPending ? (
        <CardSkeleton rows={4} />
      ) : versions.isError ? (
        <LoadFailed what="Versions" error={versions.error} onRetry={versions.refetch} />
      ) : (
        <>
          {conflicts?.length ? (
            <ListGroup
              header={`Didn't fit in the new draft · ${conflicts.length}`}
              items={conflicts.slice(0, 30).map((row) => ({
                title: `${row.className} · ${row.subjectName}`,
                subtitle: `${row.actual} of ${row.expected} periods placed`,
                lines: 2 as const,
              }))}
            />
          ) : conflicts ? (
            <Callout tone="success" title="Everything fitted">
              Every period of every class found a place.
            </Callout>
          ) : null}
          {versions.data.length ? (
            <ListGroup
              header="Versions"
              items={versions.data.map((row) => ({
                title: row.name,
                subtitle:
                  [
                    row.publishedAt ? `published ${formatDate(row.publishedAt)}` : row.generatedAt ? `made ${formatDate(row.generatedAt)}` : null,
                    row.conflictCount ? `${row.conflictCount} didn't fit` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined,
                badge: STATUS[row.status] ?? { label: row.status, tone: 'neutral' as const },
                lines: 2 as const,
                onPress: () => setOpen(row),
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Sparkles} title="No timetable made yet" body="Generate one from the setup; publish it when it looks right." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
