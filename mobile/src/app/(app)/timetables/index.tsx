import { useRouter } from 'expo-router'
import { CalendarClock, Users } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useSchoolTimetable } from '@/staff/timetableQueries'
import { Avatar, ListGroup, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface } from '@/ui'

/**
 * Every class's and every teacher's timetable from the published one (the website's Class wise
 * and Teacher wise pages), for the principal and anyone who reads timetables.
 */
export default function TimetablesScreen() {
  const router = useRouter()
  const school = useSchoolTimetable()
  const [view, setView] = useState<'classes' | 'teachers'>('classes')
  const [query, setQuery] = useState('')
  const data = school.data
  const match = (text: string) => !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase())
  const classes = (data?.classes ?? []).filter((cls) => match(`${classLabel(cls.className, cls.section)} ${cls.incharge ?? ''}`))
  const teachers = [...(data?.teachers ?? [])].sort((a, b) => a.name.localeCompare(b.name)).filter((teacher) => match(teacher.name))
  const count = view === 'classes' ? (data?.classes.length ?? 0) : (data?.teachers.length ?? 0)

  const open = (type: 'class' | 'teacher', id: string, title: string) => router.push({ pathname: '/timetables/view', params: { type, id, title } })

  return (
    <MobileScreen refreshing={school.isRefetching} onRefresh={school.refetch} nav={<NavBar title="Timetables" back={{ label: 'Back', onPress: router.back }} />}>
      <SegmentedControl
        label="Show"
        value={view}
        onChange={(next) => {
          setView(next)
          setQuery('')
        }}
        options={[
          { value: 'classes', label: 'Classes' },
          { value: 'teachers', label: 'Teachers' },
        ]}
      />
      {count > 12 ? <SearchBar label={`Search ${view}`} placeholder={`Search ${view}`} value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
      {school.isPending ? (
        <CardSkeleton rows={5} />
      ) : school.isError || !data ? (
        <LoadFailed what="The timetable" error={school.error} onRetry={school.refetch} />
      ) : !data.published ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarClock} title="The timetable isn't published yet" body="Classes and teachers show here once the school publishes it." />
        </Surface>
      ) : view === 'classes' ? (
        classes.length ? (
          <ListGroup
            footer={data.published.name}
            items={classes.map((cls) => ({
              title: classLabel(cls.className, cls.section),
              subtitle: cls.incharge ? `Class teacher ${cls.incharge}` : undefined,
              lines: 2,
              icon: CalendarClock,
              tile: 4,
              onPress: () => open('class', cls.id, classLabel(cls.className, cls.section)),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={CalendarClock} title="No classes found" body="Check the spelling, or clear the search." />
          </Surface>
        )
      ) : teachers.length ? (
        <ListGroup
          footer={data.published.name}
          items={teachers.map((teacher) => ({
            title: teacher.name,
            avatar: <Avatar name={teacher.name} size={36} />,
            onPress: () => open('teacher', String(teacher.id), teacher.name),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title="No teachers found" body="Check the spelling, or clear the search." />
        </Surface>
      )}
    </MobileScreen>
  )
}
