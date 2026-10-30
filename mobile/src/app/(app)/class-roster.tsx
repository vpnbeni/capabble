import { useLocalSearchParams, useRouter } from 'expo-router'
import { ClipboardCheck, NotebookPen, Users } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useClassRoster } from '@/staff/queries'
import { studentRow } from '@/staff/StudentsBrowser'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ListGroup, MobileScreen, NavBar, SearchBar, StatusView, Surface } from '@/ui'

/** One class's students in roll order; opens each student, and the roll call when the login may mark it. */
export default function ClassRosterScreen() {
  const router = useRouter()
  const staff = useStaff()
  const { className, section } = useLocalSearchParams<{ className: string; section: string }>()
  const roster = useClassRoster(className, section)
  const [query, setQuery] = useState('')
  const title = classLabel(className, section)
  const q = query.trim().toLowerCase()
  const students = (roster.data ?? []).filter(
    (student) => !q || student.name.toLowerCase().includes(q) || String(student.rollNumber).toLowerCase().includes(q),
  )
  const canMark = staff.canUse('attnd_student_attendance') && staff.can('attnd.students.write')
  const canSetHomework = staff.canUse('acdmc_academics') && staff.can('acdmc.classwork.write')

  return (
    <MobileScreen
      refreshing={roster.isRefetching}
      onRefresh={roster.refetch}
      nav={
        <NavBar
          title={title}
          back={{ label: 'Back', onPress: router.back }}
          actions={canSetHomework ? [{ icon: NotebookPen, label: 'Homework', onPress: () => router.push({ pathname: '/homework', params: { className, section } }) }] : []}
        />
      }
      actionBar={
        canMark && roster.data?.length ? (
          <ActionBar
            icon={ClipboardCheck}
            summary={`${roster.data.length} ${roster.data.length === 1 ? 'student' : 'students'}`}
            detail="Today's register"
            label="Take attendance"
            onPress={() => router.push({ pathname: '/roll-call', params: { className, section, date: schoolToday() } })}
          />
        ) : undefined
      }
    >
      {roster.isPending ? (
        <CardSkeleton rows={6} />
      ) : roster.isError ? (
        <LoadFailed what="The class list" error={roster.error} onRetry={roster.refetch} />
      ) : !roster.data?.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title={`No students in ${title}`} body="Students show here once the office adds them to this class." />
        </Surface>
      ) : (
        <>
          {roster.data.length > 12 ? (
            <SearchBar placeholder={`Search ${roster.data.length} students`} value={query} onChange={setQuery} onCancel={() => setQuery('')} />
          ) : null}
          {students.length ? (
            <ListGroup
              header={`${roster.data.length} ${roster.data.length === 1 ? 'student' : 'students'}`}
              items={students.map((student) => studentRow(student, () => router.push({ pathname: '/student/[id]', params: { id: student._id } })))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Users} title="No student matches" body="Check the name or admission no." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
