import { useRouter } from 'expo-router'
import { BookOpen, School } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { TimetableSetup } from '@/services/timetableService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useAddClassSection, useAddTimetableSubject, useRemoveClassSection, useTimetableSetup, useUpdateClassSection } from '@/staff/timetableQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'classes' | 'subjects'
type ClassRow = TimetableSetup['classes'][number]

const ADD_FIELDS: RecordField[] = [
  { key: 'className', label: 'Class', kind: 'text', placeholder: '7th', required: true, hint: 'As the school writes it: 7th, Nursery, 11th.' },
  { key: 'section', label: 'Section', kind: 'text', placeholder: 'A', required: true },
  { key: 'floor', label: 'Floor (optional)', kind: 'text', placeholder: 'First Floor' },
]
const SUBJECT_FIELDS: RecordField[] = [{ key: 'name', label: 'Subject', kind: 'text', placeholder: 'Computer Science', required: true }]

const classOrder = (name: string) => {
  const n = Number.parseInt(name, 10)
  return Number.isFinite(n) ? n : -1
}

/**
 * The school's classes, sections and subjects as the timetable (and everything that reads it:
 * marks, datesheets, attendance) knows them: add a class or section, set a section's floor and
 * class teacher, a class's subjects (for all its sections), add a subject. A section that still
 * has teachers or periods is removed on the website. Each change is saved on its own, so an open
 * website page can't undo it.
 */
export default function TimetableClassesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('timetable.timetable.write')
  const [tab, setTab] = useState<Tab>('classes')
  const setup = useTimetableSetup()
  const add = useAddClassSection()
  const update = useUpdateClassSection()
  const remove = useRemoveClassSection()
  const addSubject = useAddTimetableSubject()
  const [adding, setAdding] = useState(false)
  const [addingSubject, setAddingSubject] = useState(false)
  const [editing, setEditing] = useState<{ row: ClassRow; floor: string; incharge: string; subjects: string[]; picking: boolean } | null>(null)
  const [removing, setRemoving] = useState<ClassRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const empty = useMemo<RecordValues>(() => ({ className: '', section: '', floor: '' }), [])
  const emptySubject = useMemo<RecordValues>(() => ({ name: '' }), [])

  const classes = [...(setup.data?.classes ?? [])].sort(
    (a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className) || a.section.localeCompare(b.section),
  )
  const subjects = setup.data?.subjects ?? []

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const doAdd = async (_: RecordValues, all: RecordValues) => {
    try {
      await add.mutateAsync({ className: all.className, section: all.section, floor: all.floor || undefined })
      haptic.success()
      setAdding(false)
      toast(`${classLabel(all.className, all.section.toUpperCase())} added`)
    } catch (failure) {
      setError(fail(failure, "It wasn't added. Try again."))
    }
  }

  const doAddSubject = async (_: RecordValues, all: RecordValues) => {
    try {
      await addSubject.mutateAsync(all.name)
      haptic.success()
      setAddingSubject(false)
      toast(`${all.name} added`)
    } catch (failure) {
      setError(fail(failure, "It wasn't added. Try again."))
    }
  }

  const doSave = async () => {
    if (!editing) return
    const { row } = editing
    const input: { floor?: string; incharge?: string; subjects?: string[] } = {}
    if (editing.floor.trim() !== row.floor) input.floor = editing.floor.trim()
    if (editing.incharge.trim() !== (row.incharge ?? '')) input.incharge = editing.incharge.trim()
    if (editing.subjects.length !== row.subjects.length || editing.subjects.some((name) => !row.subjects.includes(name))) input.subjects = editing.subjects
    if (!Object.keys(input).length) return setEditing(null)
    try {
      await update.mutateAsync({ id: row.id, input })
      haptic.success()
      setEditing(null)
      toast(input.subjects ? `${classLabel(row.className)} subjects saved for every section` : `${classLabel(row.className, row.section)} saved`)
    } catch (failure) {
      setError(fail(failure, "It wasn't saved. Try again."))
    }
  }

  const doRemove = async () => {
    if (!removing) return
    const row = removing
    setRemoving(null)
    try {
      await remove.mutateAsync(row.id)
      haptic.medium()
      toast(`${classLabel(row.className, row.section)} removed`)
    } catch (failure) {
      toast(fail(failure, "It wasn't removed. Try again."), 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={setup.isRefetching}
      onRefresh={setup.refetch}
      nav={<NavBar title="Classes and subjects" back={{ label: 'Timetables', onPress: router.back }} />}
      actionBar={
        !canWrite ? undefined : tab === 'classes' ? (
          <ActionBar icon={School} summary={`${classes.length} ${classes.length === 1 ? 'section' : 'sections'}`} detail="Classes and their sections" label="Add a section" onPress={() => (setError(null), setAdding(true))} />
        ) : (
          <ActionBar icon={BookOpen} summary={`${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}`} detail="Classes take them from this list" label="Add a subject" onPress={() => (setError(null), setAddingSubject(true))} />
        )
      }
      overlay={
        <>
          <RecordSheet open={adding} onClose={() => setAdding(false)} title="Add a class or section" fields={ADD_FIELDS} initial={empty} isNew saving={add.isPending} error={error} onSave={doAdd} />
          <RecordSheet open={addingSubject} onClose={() => setAddingSubject(false)} title="Add a subject" fields={SUBJECT_FIELDS} initial={emptySubject} isNew saving={addSubject.isPending} error={error} onSave={doAddSubject} />
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => (editing?.picking ? setEditing({ ...editing, picking: false }) : setEditing(null))}
            title={editing?.picking ? `${classLabel(editing.row.className)} subjects` : editing ? classLabel(editing.row.className, editing.row.section) : ''}
            description={editing?.picking ? 'For every section of the class.' : undefined}
            detent="large"
            footer={
              editing?.picking ? (
                <MobileButton fullWidth onPress={() => setEditing({ ...editing, picking: false })}>
                  Done
                </MobileButton>
              ) : (
                <MobileButton fullWidth loading={update.isPending} onPress={doSave}>
                  Save
                </MobileButton>
              )
            }
          >
            {editing?.picking ? (
              <OptionList multiple label="Subjects" value={editing.subjects} onChange={(value) => setEditing({ ...editing, subjects: value })} options={subjects.map((row) => ({ value: row.name, label: row.name }))} />
            ) : editing ? (
              <View style={{ gap: space['space-4'] }}>
                {error ? (
                  <Callout tone="danger" title="Not saved">
                    {error}
                  </Callout>
                ) : null}
                <MobileTextField label="Floor" value={editing.floor} onChangeText={(floor) => setEditing({ ...editing, floor })} maxLength={60} returnKeyType="next" />
                <MobileTextField label="Class teacher (optional)" value={editing.incharge} onChangeText={(incharge) => setEditing({ ...editing, incharge })} maxLength={100} />
                <ListGroup
                  items={[
                    { title: 'Subjects', value: `${editing.subjects.length}`, onPress: () => setEditing({ ...editing, picking: true }) },
                    { title: 'Remove this section', tone: 'danger', onPress: () => (setRemoving(editing.row), setEditing(null)) },
                  ]}
                />
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={removing ? `Remove ${classLabel(removing.className, removing.section)}?` : ''}
            message="Only a section without teachers or periods can go. Students stay as they are."
            actions={[{ label: 'Remove section', tone: 'danger', onSelect: doRemove }]}
          />
        </>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'classes', label: 'Classes' },
          { id: 'subjects', label: 'Subjects' },
        ]}
      />
      {setup.isPending ? (
        <CardSkeleton rows={6} />
      ) : setup.isError ? (
        <LoadFailed what="Classes" error={setup.error} onRetry={setup.refetch} />
      ) : tab === 'classes' ? (
        classes.length ? (
          <ListGroup
            footer={canWrite ? 'Tap a section for its floor, class teacher and subjects.' : undefined}
            items={classes.map((row) => ({
              title: classLabel(row.className, row.section),
              subtitle: [row.floor, `${row.subjects.length} ${row.subjects.length === 1 ? 'subject' : 'subjects'}`, row.incharge].filter(Boolean).join(' · '),
              lines: 2 as const,
              onPress: canWrite ? () => (setError(null), setEditing({ row, floor: row.floor, incharge: row.incharge ?? '', subjects: [...row.subjects], picking: false })) : undefined,
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={School} title="No classes yet" body="Add each class with its sections." />
          </Surface>
        )
      ) : subjects.length ? (
        <ListGroup items={subjects.map((row) => ({ title: row.name, subtitle: `${classes.filter((entry) => entry.subjects.includes(row.name)).length} sections take it` }))} />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={BookOpen} title="No subjects yet" body="Add the subjects the school teaches." />
        </Surface>
      )}
    </MobileScreen>
  )
}
