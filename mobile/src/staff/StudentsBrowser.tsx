import { useRouter } from 'expo-router'
import { GraduationCap, Users } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { StudentRow } from '@/services/studentService'
import { Avatar, ListGroup, MobileScreen, NavBar, SearchBar, StatusView, Surface, type ListGroupItem } from '@/ui'

import { useClassSections, useStudentSearch } from './queries'
import { useStaff } from './useStaff'

export const studentRow = (student: StudentRow, onPress: () => void, { withClass = false } = {}): ListGroupItem => ({
  title: student.name,
  subtitle: [withClass ? classLabel(student.class, student.section) : null, student.classRollNo ? `Roll ${student.classRollNo}` : null, student.rollNumber]
    .filter(Boolean)
    .join(' · '),
  avatar: <Avatar name={student.name} src={student.profileImage} size={36} />,
  onPress,
})

/**
 * Classes, then their students: a search across every student this login may see, and the
 * class-sections to open. Teachers limited to their own classes get only those (the server
 * filters the lists); the principal and office get the whole school.
 */
export function StudentsBrowser({ title }: { title: string }) {
  const router = useRouter()
  const staff = useStaff()
  const wholeSchool = staff.scopeOf('stdnt.students.read') === 'all'
  const classes = useClassSections(wholeSchool)
  const [query, setQuery] = useState('')
  const q = query.trim()
  const search = useStudentSearch(q)
  const openStudent = (student: StudentRow) => router.push({ pathname: '/student/[id]', params: { id: student._id } })

  return (
    <MobileScreen tabs refreshing={classes.isRefetching} onRefresh={classes.refetch} nav={<NavBar large title={title} />}>
      <SearchBar placeholder={wholeSchool ? 'Search students' : 'Search your students'} value={query} onChange={setQuery} onCancel={() => setQuery('')} />
      {q.length >= 2 ? (
        search.isPending ? (
          <CardSkeleton rows={3} />
        ) : search.isError ? (
          <LoadFailed what="The search" error={search.error} onRetry={search.refetch} />
        ) : search.data?.length ? (
          <ListGroup
            header="Students"
            footer={search.data.length === 30 ? 'Showing the first 30. Type more of the name to narrow it down.' : undefined}
            items={search.data.map((student) => studentRow(student, () => openStudent(student), { withClass: true }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={GraduationCap} title={`No student matches "${q}"`} body="Search by name, admission no. or father's name." />
          </Surface>
        )
      ) : classes.isPending ? (
        <CardSkeleton rows={4} />
      ) : classes.isError ? (
        <LoadFailed what="Classes" error={classes.error} onRetry={classes.refetch} />
      ) : classes.data?.length ? (
        <ListGroup
          header={wholeSchool ? 'Classes' : 'Your classes'}
          items={classes.data.map((entry) => ({
            title: classLabel(entry.className, entry.section),
            subtitle: `${entry.students} ${entry.students === 1 ? 'student' : 'students'}`,
            icon: Users,
            tile: 6 as const,
            onPress: () => router.push({ pathname: '/class-roster', params: { className: entry.className, section: entry.section } }),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Users}
            title={wholeSchool ? 'No students yet' : 'No classes for you'}
            body={wholeSchool ? 'Students show here once the office adds them.' : 'Classes you teach or are in charge of show here. Ask the office if one is missing.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
