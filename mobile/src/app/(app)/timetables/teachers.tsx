import { useRouter } from 'expo-router'
import { Users } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { TimetableSetup } from '@/services/timetableService'
import { periodsOf, teacherLoad, teachersOf, teachingOf } from '@/staff/teacherLoad'
import { useSetClassTeachers, useSetTeacherSubjects, useTimetableSetup } from '@/staff/timetableQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, SearchBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

type View_ = 'class' | 'teacher'
type Teacher = TimetableSetup['teachers'][number]

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const classOrder = (name: string) => {
  const n = Number.parseInt(name, 10)
  return Number.isFinite(n) ? n : -1
}
const perWeek = (n: number) => `${n} a week`

/**
 * Who teaches what (the website's Departments page), one change at a time. By class: each of a
 * class-section's subjects with its teachers and periods; tap one to choose its teachers. By
 * teacher: their classes and periods a week, and the subjects they can teach. Each change is
 * saved on its own, so an open website page can't undo it.
 */
export default function WhoTeachesWhatScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('timetable.timetable.write')
  const setup = useTimetableSetup()
  const setClassTeachers = useSetClassTeachers()
  const setTeacherSubjects = useSetTeacherSubjects()
  const [view, setView] = useState<View_>('class')
  const [classId, setClassId] = useState<string | null>(null)
  const [pickingClass, setPickingClass] = useState(false)
  const [subject, setSubject] = useState<{ name: string; ids: string[] } | null>(null)
  const [teacher, setTeacher] = useState<{ row: Teacher; subjects: string[] | null } | null>(null)
  const [dropping, setDropping] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const data = setup.data
  const classes = [...(data?.classes ?? [])].sort((a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className) || a.section.localeCompare(b.section))
  const row = classes.find((entry) => entry.id === classId) ?? classes[0]
  const teachers = [...(data?.teachers ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const nameOf = (id: string) => teachers.find((entry) => entry.id === id)?.name ?? 'A teacher no longer listed'

  const saveSubject = async () => {
    if (!subject || !row) return
    try {
      await setClassTeachers.mutateAsync({ classId: row.id, subjects: { [subject.name]: subject.ids } })
      haptic.success()
      toast(subject.ids.length ? `${subject.name} in ${classLabel(row.className, row.section)}: ${subject.ids.map(nameOf).join(', ')}` : `${subject.name} has no teacher now`)
      setSubject(null)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const saveTeacherSubjects = async (force = false) => {
    if (!teacher?.subjects || !data) return
    const keeping = teacher.subjects
    const lost = [
      ...new Set(
        teachingOf(data, teacher.row.id)
          .filter((entry) => !keeping.some((name) => same(name, entry.subject)))
          .map((entry) => entry.subject),
      ),
    ]
    if (lost.length && !force) return setDropping(lost)
    setDropping(null)
    try {
      await setTeacherSubjects.mutateAsync({ teacherId: teacher.row.id, subjects: keeping })
      haptic.success()
      toast(`${teacher.row.name}'s subjects saved`)
      setTeacher(null)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const shownTeachers = teachers.filter((entry) => !query.trim() || entry.name.toLowerCase().includes(query.trim().toLowerCase()))
  const teaching = teacher && data ? teachingOf(data, teacher.row.id) : []

  return (
    <MobileScreen
      refreshing={setup.isRefetching}
      onRefresh={setup.refetch}
      nav={<NavBar title="Who teaches what" back={{ label: 'Setup', onPress: router.back }} />}
      overlay={
        <>
          <BottomSheet open={pickingClass} onClose={() => setPickingClass(false)} title="Class" detent="large">
            <OptionList
              label="Class"
              value={row?.id ?? null}
              onChange={(id) => (setClassId(id), setPickingClass(false))}
              options={classes.map((entry) => ({ value: entry.id, label: classLabel(entry.className, entry.section), meta: `${entry.subjects.length} subjects` }))}
            />
          </BottomSheet>
          <BottomSheet
            open={Boolean(subject)}
            onClose={() => setSubject(null)}
            title={subject && row ? `${subject.name}, ${classLabel(row.className, row.section)}` : ''}
            detent="large"
            footer={
              <MobileButton fullWidth loading={setClassTeachers.isPending} onPress={saveSubject}>
                Save teachers
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            {subject && data ? (
              <OptionList
                multiple
                label="Teachers"
                header="Two for a shared period"
                value={subject.ids}
                onChange={(ids) => setSubject({ ...subject, ids })}
                options={[...teachers]
                  .sort((a, b) => Number(b.subjects.some((name) => same(name, subject.name))) - Number(a.subjects.some((name) => same(name, subject.name))) || a.name.localeCompare(b.name))
                  .map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                    meta: `${perWeek(teacherLoad(data, entry.id))}${entry.subjects.some((name) => same(name, subject.name)) ? '' : ` · ${subject.name} gets added to their subjects`}`,
                  }))}
              />
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={Boolean(teacher)}
            onClose={() => (teacher?.subjects ? setTeacher({ ...teacher, subjects: null }) : setTeacher(null))}
            title={teacher ? (teacher.subjects ? `${teacher.row.name} can teach` : teacher.row.name) : ''}
            detent="large"
            footer={
              teacher?.subjects ? (
                <MobileButton fullWidth loading={setTeacherSubjects.isPending} onPress={() => saveTeacherSubjects()}>
                  Save subjects
                </MobileButton>
              ) : canWrite && teacher ? (
                <MobileButton fullWidth variant="tinted" onPress={() => (setError(null), setTeacher({ ...teacher, subjects: [...teacher.row.subjects] }))}>
                  Change the subjects they can teach
                </MobileButton>
              ) : undefined
            }
          >
            {error && teacher?.subjects ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            {teacher?.subjects ? (
              <OptionList
                multiple
                label="Subjects"
                value={teacher.subjects}
                onChange={(subjects) => setTeacher({ ...teacher, subjects })}
                options={(data?.subjects ?? []).map((entry) => ({ value: entry.name, label: entry.name }))}
              />
            ) : teacher && data ? (
              <View style={{ gap: space['space-4'] }}>
                <ListGroup
                  items={[
                    { title: 'Can teach', subtitle: teacher.row.subjects.join(', ') || 'No subjects yet', lines: 3 as const },
                    { title: 'Periods a week', value: String(teacherLoad(data, teacher.row.id)) },
                  ]}
                />
                <ListGroup
                  header="Teaches"
                  footer="Choose a class's teachers under By class."
                  items={
                    teaching.length
                      ? teaching.map((entry) => ({ title: `${entry.subject}, ${classLabel(entry.className, entry.section)}`, value: perWeek(entry.periods) }))
                      : [{ title: 'No classes yet' }]
                  }
                />
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(dropping)}
            onClose={() => setDropping(null)}
            title={`Take ${dropping?.join(', ')} from ${teacher?.row.name}?`}
            message="They stop teaching it in their classes too, as on the website."
            actions={[{ label: 'Save subjects', tone: 'danger', onSelect: () => saveTeacherSubjects(true) }]}
          />
        </>
      }
    >
      <SegmentedControl
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'class', label: 'By class' },
          { value: 'teacher', label: 'By teacher' },
        ]}
      />
      {setup.isPending ? (
        <CardSkeleton rows={6} />
      ) : setup.isError || !data ? (
        <LoadFailed what="The timetable" error={setup.error} onRetry={setup.refetch} />
      ) : view === 'class' ? (
        row ? (
          <>
            <ListGroup items={[{ title: 'Class', value: classLabel(row.className, row.section), onPress: () => setPickingClass(true) }]} />
            {row.subjects.length ? (
              <ListGroup
                header="Subjects"
                footer={canWrite ? 'Tap a subject to choose its teachers.' : undefined}
                items={row.subjects.map((name) => {
                  const ids = teachersOf(data, row.id, name)
                  return {
                    title: name,
                    subtitle: ids.length ? ids.map(nameOf).join(', ') : 'No teacher yet',
                    value: perWeek(periodsOf(data, row.id, name)),
                    lines: 2 as const,
                    chevron: canWrite,
                    onPress: canWrite ? () => (setError(null), setSubject({ name, ids })) : undefined,
                  }
                })}
              />
            ) : (
              <Surface padded={false}>
                <StatusView compact kind="empty" icon={Users} title="No subjects for this class" body="Choose them under Classes and subjects." />
              </Surface>
            )}
          </>
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Users} title="No classes yet" body="Add them under Classes and subjects." />
          </Surface>
        )
      ) : (
        <>
          {teachers.length > 12 ? <SearchBar label="Search teachers" placeholder="Search teachers" value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
          {shownTeachers.length ? (
            <ListGroup
              items={shownTeachers.map((entry) => ({
                title: entry.name,
                subtitle: entry.subjects.join(', ') || 'No subjects yet',
                value: perWeek(teacherLoad(data, entry.id)),
                lines: 2 as const,
                chevron: true,
                onPress: () => (setError(null), setTeacher({ row: entry, subjects: null })),
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Users} title="No teachers in the timetable" body="Teachers are added on the website's timetable pages." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
