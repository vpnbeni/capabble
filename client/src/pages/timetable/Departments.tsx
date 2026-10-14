import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, LayoutGrid, Layers, Link2, Search, Users } from 'lucide-react'
import {
  useTimetable,
  type TimetableClass,
  type TimetableTeacher,
  type TeacherSubjectAllocation,
} from '@/contexts/TimetableContext'
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, FilterBar, Page, StatCard, cx } from '@/components/ui'
import '@/components/timetable/distribution.css'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const normalize = (value: string) => value.trim().toLowerCase()

const toTitleCase = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ')

const uniqueByNormalized = (values: string[]) => {
  const seen = new Set<string>()
  const output: string[] = []

  values.forEach((value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const key = normalize(trimmed)
    if (seen.has(key)) return
    seen.add(key)
    output.push(trimmed)
  })

  return output
}

const cloneAllocations = (allocations: TeacherSubjectAllocation[]) =>
  allocations.map((allocation) => ({
    ...allocation,
    assignments: allocation.assignments.map((assignment) => ({
      ...assignment,
      subjects: [...assignment.subjects],
    })),
  }))

const removeSubjectFromTeacherAllocations = (
  allocations: TeacherSubjectAllocation[],
  teacherId: string,
  subjectName: string
) => {
  const key = normalize(subjectName)
  const next = cloneAllocations(allocations)
  const teacherIndex = next.findIndex((allocation) => allocation.teacherId === teacherId)
  if (teacherIndex < 0) return allocations

  const allocation = next[teacherIndex]
  allocation.assignments = allocation.assignments
    .map((assignment) => ({
      ...assignment,
      subjects: assignment.subjects.filter((subject) => normalize(subject) !== key),
    }))
    .filter((assignment) => assignment.subjects.length > 0)

  if (allocation.assignments.length === 0) {
    next.splice(teacherIndex, 1)
  } else {
    next[teacherIndex] = allocation
  }

  return next
}

const Departments: React.FC = () => {
  const {
    isHydrated,
    classes,
    subjects,
    teachers,
    setTeachers,
    commonPeriods,
    periodAllocation,
    teacherSubjectAllocations,
    setTeacherSubjectAllocations,
  } = useTimetable()

  const [searchText, setSearchText] = useState('')

  const subjectNames = useMemo(
    () => uniqueByNormalized(subjects.map((subject) => subject.name)).sort((a, b) => a.localeCompare(b)),
    [subjects]
  )

  const subjectAliasMap = useMemo(() => {
    const map = new Map<string, string>()
    subjectNames.forEach((name) => map.set(normalize(name), name))
    return map
  }, [subjectNames])

  const matrixTeachers = useMemo<TimetableTeacher[]>(() => {
    return teachers.map((teacher) => {
      const resolvedSubjects = uniqueByNormalized(
        (teacher.subjects || [])
          .map((subject) => subjectAliasMap.get(normalize(subject)) || '')
          .filter(Boolean)
      )

      return {
        id: teacher.id,
        name: teacher.name,
        shortName: teacher.shortName,
        subjects: resolvedSubjects,
      }
    })
  }, [teachers, subjectAliasMap])

  const searchableTeachers = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    if (!needle) return matrixTeachers
    return matrixTeachers.filter((teacher) => {
      const haystack = `${teacher.name} ${teacher.shortName}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [matrixTeachers, searchText])

  const allocationByTeacher = useMemo(() => {
    const map = new Map<string, TeacherSubjectAllocation>()
    teacherSubjectAllocations.forEach((allocation) => map.set(allocation.teacherId, allocation))
    return map
  }, [teacherSubjectAllocations])

  const classesBySubject = useMemo(() => {
    const map = new Map<string, TimetableClass[]>()
    subjectNames.forEach((subjectName) => {
      map.set(
        subjectName,
        classes.filter((item) => item.subjects.some((subject) => normalize(subject) === normalize(subjectName)))
      )
    })
    return map
  }, [classes, subjectNames])

  const classById = useMemo(() => {
    const map = new Map<string, TimetableClass>()
    classes.forEach((c) => map.set(c.id, c))
    return map
  }, [classes])

  const commonPeriodByClassAndSubject = useMemo(() => {
    const map = new Map<string, string[][]>()
    commonPeriods.forEach((row) => {
      const className = row.className?.trim()
      const subject = row.subject?.trim()
      if (!className || !subject || !Array.isArray(row.sections) || row.sections.length < 2) return
      const key = `${normalize(className)}|||${normalize(subject)}`
      const next = map.get(key) || []
      next.push(row.sections.map((s) => s.trim()).filter(Boolean))
      map.set(key, next)
    })
    return map
  }, [commonPeriods])

  const getClassPeriodCount = (classId: string, subjectName: string) => {
    const counts = periodAllocation[classId] || {}
    for (const key of Object.keys(counts)) {
      if (normalize(key) === normalize(subjectName)) {
        return Number(counts[key]) || 0
      }
    }
    return 0
  }

  const getTeacherSubjectAssignments = (teacherId: string, subjectName: string) => {
    const allocation = allocationByTeacher.get(teacherId)
    if (!allocation) return new Set<string>()

    const assignedClassIds = new Set<string>()
    allocation.assignments.forEach((assignment) => {
      if (assignment.subjects.some((subject) => normalize(subject) === normalize(subjectName))) {
        assignedClassIds.add(assignment.classId)
      }
    })
    return assignedClassIds
  }

  const getTeacherWorkload = (teacherId: string, subjectName: string) => {
    const classIds = getTeacherSubjectAssignments(teacherId, subjectName)
    if (classIds.size === 0) return 0

    const remaining = new Set(classIds)
    let load = 0

    // If a subject is configured as a "Common Period" across multiple sections,
    // count its periods once (not once per section) for workload.
    const assignedByClassName = new Map<string, { classId: string; section: string }[]>()
    remaining.forEach((classId) => {
      const row = classById.get(classId)
      if (!row) return
      const className = row.className?.trim()
      const section = row.section?.trim()
      if (!className || !section) return
      const bucket = assignedByClassName.get(className) || []
      bucket.push({ classId, section })
      assignedByClassName.set(className, bucket)
    })

    for (const [className, assigned] of assignedByClassName.entries()) {
      const key = `${normalize(className)}|||${normalize(subjectName)}`
      const configuredGroups = commonPeriodByClassAndSubject.get(key) || []
      if (configuredGroups.length === 0) continue

      configuredGroups.forEach((sections) => {
        const sectionSet = new Set(sections.map((s) => normalize(s)))
        const involved = assigned.filter((a) => remaining.has(a.classId) && sectionSet.has(normalize(a.section)))
        if (involved.length < 2) return

        const countOnce = involved.reduce((max, a) => Math.max(max, getClassPeriodCount(a.classId, subjectName)), 0)
        load += countOnce
        involved.forEach((a) => remaining.delete(a.classId))
      })
    }

    remaining.forEach((classId) => {
      load += getClassPeriodCount(classId, subjectName)
    })

    return load
  }

  const handleToggleMatrix = (teacherId: string, subjectName: string) => {
    const key = normalize(subjectName)
    const nextTeachers = teachers.map((teacher) => {
      if (teacher.id !== teacherId) return teacher
      const hasSubject = teacher.subjects.some((subject) => normalize(subject) === key)
      const nextSubjects = hasSubject
        ? teacher.subjects.filter((subject) => normalize(subject) !== key)
        : [...teacher.subjects, subjectName]
      return {
        ...teacher,
        subjects: uniqueByNormalized(nextSubjects),
      }
    })

    setTeachers(nextTeachers)

    const after = nextTeachers.find((teacher) => teacher.id === teacherId)
    const stillHasSubject = after?.subjects.some((subject) => normalize(subject) === key)

    if (!stillHasSubject) {
      setTeacherSubjectAllocations(
        removeSubjectFromTeacherAllocations(teacherSubjectAllocations, teacherId, subjectName)
      )
    }
  }

  const handleToggleDepartmentClass = (
    teacher: TimetableTeacher,
    subjectName: string,
    classRow: TimetableClass
  ) => {
    const key = normalize(subjectName)
    const next = cloneAllocations(teacherSubjectAllocations)
    let allocationIndex = next.findIndex((allocation) => allocation.teacherId === teacher.id)

    if (allocationIndex < 0) {
      next.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        assignments: [],
      })
      allocationIndex = next.length - 1
    }

    const allocation = next[allocationIndex]
    allocation.teacherName = teacher.name
    let assignmentIndex = allocation.assignments.findIndex((assignment) => assignment.classId === classRow.id)

    if (assignmentIndex < 0) {
      allocation.assignments.push({
        classId: classRow.id,
        className: classRow.className,
        section: classRow.section,
        subjects: [],
      })
      assignmentIndex = allocation.assignments.length - 1
    }

    const assignment = allocation.assignments[assignmentIndex]
    const alreadyAssigned = assignment.subjects.some((subject) => normalize(subject) === key)

    if (alreadyAssigned) {
      assignment.subjects = assignment.subjects.filter((subject) => normalize(subject) !== key)
    } else {
      assignment.subjects = uniqueByNormalized([...assignment.subjects, subjectName])
    }

    allocation.assignments = allocation.assignments.filter((item) => item.subjects.length > 0)
    if (allocation.assignments.length === 0) {
      next.splice(allocationIndex, 1)
    } else {
      next[allocationIndex] = allocation
    }

    setTeacherSubjectAllocations(next)
  }

  const matrixLinkCount = useMemo(
    () => matrixTeachers.reduce((acc, teacher) => acc + teacher.subjects.length, 0),
    [matrixTeachers]
  )

  const departmentCards = useMemo(() => {
    return subjectNames.map((subjectName) => {
      const key = normalize(subjectName)
      const members = matrixTeachers.filter((teacher) =>
        teacher.subjects.some((subject) => normalize(subject) === key)
      )
      return {
        subjectName,
        members,
        classRows: classesBySubject.get(subjectName) || [],
      }
    })
  }, [subjectNames, matrixTeachers, classesBySubject])

  const navigate = useNavigate()
  const activeDepartments = departmentCards.filter((card) => card.members.length > 0).length
  const subjectsWithoutTeachers = departmentCards.length - activeDepartments

  if (!isHydrated) {
    return (
      <Page width="full">
        <Card flush>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading departments …
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page width="full">
      <div className="cb-stack">
        <div className="cb-stats">
          <StatCard label="Teachers" value={matrixTeachers.length} icon={Users} />
          <StatCard label="Subject links" value={matrixLinkCount} hint="Teacher and subject pairs" icon={Link2} />
          <StatCard
            label="Departments"
            value={activeDepartments}
            hint={`of ${plural(subjectNames.length, 'subject', 'subjects')}`}
            icon={Layers}
          />
          <StatCard
            label="Subjects without teachers"
            value={subjectsWithoutTeachers}
            hint={subjectsWithoutTeachers > 0 ? 'Tick teachers in the matrix' : 'Every subject has a teacher'}
            icon={BookOpen}
          />
        </div>

        <Card
          flush
          className="tpd-card"
          title="Teacher subject matrix"
          subtitle="Teachers in rows, timetable subjects in columns. Tick the subjects each teacher can teach to build departments."
        >
          {subjectNames.length > 0 && matrixTeachers.length > 0 ? (
            <div className="tpd-toolbar">
              <FilterBar
                search={{
                  placeholder: 'Search teachers',
                  value: searchText,
                  onChange: setSearchText,
                  label: 'Search teachers by name or short name',
                }}
              />
            </div>
          ) : null}

          {subjectNames.length === 0 ? (
            <EmptyState
              compact
              icon={BookOpen}
              title="There are no timetable subjects yet"
              body="Add subjects first, then tick which teachers teach them."
              action={
                <Button icon={ArrowRight} onClick={() => navigate('/time-table/subjects')}>
                  Go to subjects
                </Button>
              }
            />
          ) : matrixTeachers.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title="There are no timetable teachers yet"
              body="Add teachers first, then tick the subjects each one teaches."
              action={
                <Button icon={ArrowRight} onClick={() => navigate('/time-table/teachers')}>
                  Go to teachers
                </Button>
              }
            />
          ) : searchableTeachers.length === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title={`No teachers match “${searchText.trim()}”`}
              body="Check the spelling or search by short name."
              action={
                <Button variant="tertiary" onClick={() => setSearchText('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <div className="tpd-scroll tpd-scroll--tall">
              <table className="tpd-grid">
                <caption className="cb-visually-hidden">Teacher subject matrix</caption>
                <thead>
                  <tr>
                    <th scope="col" className="tpd-sticky">Teacher</th>
                    {subjectNames.map((subjectName, index) => (
                      <th
                        key={subjectName}
                        scope="col"
                        className={index === subjectNames.length - 1 ? 'tpd-end' : undefined}
                      >
                        {subjectName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchableTeachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <th scope="row" className="tpd-sticky">
                        <span className="tpd-rowlabel">
                          <Avatar name={toTitleCase(teacher.name)} size="sm" />
                          <span className="tpd-rowlabel__text">
                            <span className="tpd-rowlabel__name">{toTitleCase(teacher.name)}</span>
                            <span className="tpd-rowlabel__meta">{teacher.shortName || 'Functionary'}</span>
                          </span>
                        </span>
                      </th>
                      {subjectNames.map((subjectName, index) => {
                        const checked = teacher.subjects.some(
                          (subject) => normalize(subject) === normalize(subjectName)
                        )
                        return (
                          <td
                            key={`${teacher.id}-${subjectName}`}
                            className={cx('tpd-cell', index === subjectNames.length - 1 && 'tpd-end')}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={() => handleToggleMatrix(teacher.id, subjectName)}
                              aria-label={`${toTitleCase(teacher.name)} teaches ${subjectName}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="tpd-dept-list">
          {departmentCards.map((card) => (
            <Card
              key={card.subjectName}
              flush
              className="tpd-card"
              title={`${card.subjectName} department`}
              subtitle={`${plural(card.members.length, 'teacher', 'teachers')} · ${plural(card.classRows.length, 'class-section', 'class-sections')}`}
              action={
                card.members.length === 0 ? (
                  <Badge tone="warning">No teachers</Badge>
                ) : card.classRows.length === 0 ? (
                  <Badge tone="neutral">Not taught in any class</Badge>
                ) : null
              }
            >
              {card.members.length === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title={`No teacher is linked to ${card.subjectName}`}
                  body="Tick this subject for one or more teachers in the matrix above."
                />
              ) : card.classRows.length === 0 ? (
                <EmptyState
                  compact
                  icon={LayoutGrid}
                  title={`No class-section teaches ${card.subjectName}`}
                  body="Add this subject to a class on the Classes page to assign teachers to it."
                />
              ) : (
                <div className="tpd-scroll">
                  <table className="tpd-grid">
                    <caption className="cb-visually-hidden">
                      {card.subjectName} teachers by class-section
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="tpd-sticky">Teacher</th>
                        {card.classRows.map((row) => (
                          <th key={row.id} scope="col">
                            <span className="tpd-colhead">
                              <span className="tpd-colhead__name">
                                {row.className}-{row.section}
                              </span>
                              <span className="tpd-colhead__meta is-num">
                                {plural(getClassPeriodCount(row.id, card.subjectName), 'period', 'periods')}
                              </span>
                            </span>
                          </th>
                        ))}
                        <th scope="col" className="tpd-end">Workload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.members.map((teacher) => {
                        const assignedClassIds = getTeacherSubjectAssignments(teacher.id, card.subjectName)
                        const workload = getTeacherWorkload(teacher.id, card.subjectName)

                        return (
                          <tr key={`${card.subjectName}-${teacher.id}`}>
                            <th scope="row" className="tpd-sticky">
                              <span className="tpd-rowlabel">
                                <Avatar name={toTitleCase(teacher.name)} size="sm" />
                                <span className="tpd-rowlabel__text">
                                  <span className="tpd-rowlabel__name">{toTitleCase(teacher.name)}</span>
                                  <span className="tpd-rowlabel__meta">
                                    {plural(assignedClassIds.size, 'class', 'classes')} assigned
                                  </span>
                                </span>
                              </span>
                            </th>
                            {card.classRows.map((classRow) => (
                              <td key={`${teacher.id}-${classRow.id}`} className="tpd-cell">
                                <Checkbox
                                  checked={assignedClassIds.has(classRow.id)}
                                  onChange={() => handleToggleDepartmentClass(teacher, card.subjectName, classRow)}
                                  aria-label={`${toTitleCase(teacher.name)} teaches ${card.subjectName} to ${classRow.className}-${classRow.section}`}
                                />
                              </td>
                            ))}
                            <td className="tpd-end">
                              <span className="tpd-workload is-num">
                                {workload} <span>{workload === 1 ? 'period' : 'periods'}</span>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </Page>
  )
}

export default Departments
