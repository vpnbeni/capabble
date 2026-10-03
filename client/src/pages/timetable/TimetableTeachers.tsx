import React, { useCallback, useEffect, useMemo } from 'react'
import { useTimetable } from '@/contexts/TimetableContext'
import teacherService, { type FetchTeachersParams } from '@/services/teacherService'
import type { Teacher } from '@/services/teacherService'
import Teachers from '../Teachers'

const TimetableTeachers: React.FC = () => {
  const { teachers, setTeachers, deleteTeachers, teacherSubjectAllocations, setTeacherSubjectAllocations } =
    useTimetable()

  useEffect(() => {
    const syncTeacherTypeStaffMembers = async () => {
      try {
        const baseParams: FetchTeachersParams = {
          includeAllRecords: true,
          dutyType: 'Teacher',
          sort: 'name',
          limit: 100,
        }

        const allItems: Teacher[] = []
        let page = 1
        let totalPages = 1

        do {
          const response = await teacherService.getAll({ ...baseParams, page })
          allItems.push(...response.items)
          totalPages = response.totalPages || 1
          page += 1
        } while (page <= totalPages)

        const mappedTeachers = allItems.map((item) => ({
          id: item._id,
          name: item.name || '',
          shortName: (item.subjectCode || '').trim(),
          subjects: (item.subjects || [])
            .map((subject) => (typeof subject === 'string' ? subject : subject?.name || ''))
            .filter(Boolean),
        }))

        setTeachers(mappedTeachers)
      } catch {
        // Keep existing timetable state if staff-member sync fails.
      }
    }

    void syncTeacherTypeStaffMembers()
  }, [setTeachers])

  const timetableTeacherRows = useMemo<Teacher[]>(() => {
    return teachers.map((teacher) => ({
      _id: teacher.id,
      id: teacher.id,
      name: teacher.name,
      oasisId: '',
      employeeId: '',
      designation: '',
      subjects: teacher.subjects,
      subjectCode: teacher.shortName || '',
      schoolName: '',
      schoolCode: '',
      isActive: true,
    }))
  }, [teachers])

  const handleDeleteSelected = useCallback(
    (ids: string[]) => {
      // Local-only delete for timetable teachers.
      // Do not call exam functionary APIs to keep both modules independent.
      const idSet = new Set(ids)
      deleteTeachers(ids)
      setTeacherSubjectAllocations(
        teacherSubjectAllocations.filter((allocation) => !idSet.has(allocation.teacherId))
      )
      return ids
    },
    [deleteTeachers, teacherSubjectAllocations, setTeacherSubjectAllocations]
  )

  return (
    <div className="h-full min-h-0">
      <Teachers
        hideStats
        hideDutyType
        hideSchoolCode
        hideSchoolName
        hidePagination
        disableApiMutations
        disableRowEdit
        sourceTeachers={timetableTeacherRows}
        onDeleteSelected={handleDeleteSelected}
        entityLabelSingular="teacher"
      />
    </div>
  )
}

export default TimetableTeachers
