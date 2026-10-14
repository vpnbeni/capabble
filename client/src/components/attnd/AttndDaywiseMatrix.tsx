import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarX, Save, SearchX } from 'lucide-react'
import { DateSwitcher } from '@/components/attnd/DateSwitcher'
import { AttndDayMatrix, AttndSummary, pluralize, type DayColumn } from '@/components/attnd/AttndMatrix'
import { Button, Card, FilterBar, Page } from '@/components/ui'
import { sortClassNames, sortSectionNames } from '@/constants/studentClasses'
import attndService, {
  type StudentClassOption,
  type StudentDirectoryItem,
} from '@/services/attndService'

type DayCategory = 'academic' | 'non-academic'
type ClassSectionColumn = { className: string; section: string; key: string }

const todayDateKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const isSundayDate = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getDay() === 0

const defaultDayCategory = (dateKey: string): DayCategory => (isSundayDate(dateKey) ? 'non-academic' : 'academic')

const isNonAcademicCategory = (category?: string) => {
  const value = String(category || '').toLowerCase()
  return value === 'non-academic' || value === 'non-academic'
}

const classNameOf = (item: StudentDirectoryItem) => String((item as StudentDirectoryItem & { className?: string }).className || item.class || '')

const studentMatchesQuery = (item: StudentDirectoryItem, query: string) => {
  if (!query) return true
  const name = String(item.name || '').toLowerCase()
  const rollNo = String(item.rollNumber || '').toLowerCase()
  return name.includes(query) || rollNo.includes(query)
}

export const AttndDaywiseMatrix = () => {
  const [selectedDate, setSelectedDate] = useState(todayDateKey)
  const [classOptions, setClassOptions] = useState<StudentClassOption[]>([])
  const [studentRows, setStudentRows] = useState<StudentDirectoryItem[]>([])
  const [absenceMap, setAbsenceMap] = useState<Record<string, boolean>>({})
  const [holidayMap, setHolidayMap] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const columns = useMemo<ClassSectionColumn[]>(() => {
    const next = classOptions.flatMap((item) =>
      [...(item.sections || [])]
        .sort((left, right) => sortSectionNames(left, right, item.className))
        .map((section) => ({
          className: item.className,
          section,
          key: `${item.className}||${section}`,
        }))
    )
    return next.sort((left, right) => {
      const classDiff = sortClassNames(left.className, right.className)
      if (classDiff !== 0) return classDiff
      return sortSectionNames(left.section, right.section, left.className)
    })
  }, [classOptions])

  const studentsByColumn = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const grouped: Record<string, StudentDirectoryItem[]> = {}
    columns.forEach((column) => {
      grouped[column.key] = studentRows
        .filter((item) => classNameOf(item) === column.className && String(item.section || '') === column.section)
        .filter((item) => studentMatchesQuery(item, query))
        .sort((left, right) =>
          String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
        )
    })
    return grouped
  }, [columns, studentRows, searchQuery])

  const rowCount = useMemo(
    () => Math.max(0, ...columns.map((column) => studentsByColumn[column.key]?.length || 0)),
    [columns, studentsByColumn]
  )

  const isHoliday = (columnKey: string) =>
    Object.prototype.hasOwnProperty.call(holidayMap, columnKey)
      ? Boolean(holidayMap[columnKey])
      : defaultDayCategory(selectedDate) === 'non-academic'

  const workingColumns = columns.filter((column) => !isHoliday(column.key))
  const visibleStudents = workingColumns.flatMap((column) => studentsByColumn[column.key] || [])
  const absentCount = visibleStudents.filter((item) => Boolean(absenceMap[item._id])).length
  const presentCount = visibleStudents.length - absentCount

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const options = await attndService.getStudentFilters()
        setClassOptions([...options].sort((left, right) => sortClassNames(left.className, right.className)))
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load class and section options.'))
      }
    }
    void loadFilters()
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [students, attendance] = await Promise.all([
          attndService.getStudentDirectory(),
          attndService.getStudentAttendanceByDate(selectedDate),
        ])
        setStudentRows(students)
        const nextAbsence: Record<string, boolean> = {}
        attendance.records.forEach((item) => {
          const id = String(item.studentId || '')
          if (id && item.status === 'A') nextAbsence[id] = true
        })
        setAbsenceMap(nextAbsence)

        const nextHoliday: Record<string, boolean> = {}
        attendance.daySettings.forEach((item) => {
          const className = String(item.className || '')
          const section = String(item.section || '')
          if (!className || !section) return
          nextHoliday[`${className}||${section}`] = isNonAcademicCategory(item.category)
        })
        setHolidayMap(nextHoliday)
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load daywise attendance.'))
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [selectedDate])

  const toggleAbsent = (studentId: string, columnKey: string) => {
    if (isHoliday(columnKey)) return
    setAbsenceMap((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  const toggleColumnHoliday = (columnKey: string) => {
    const currentlyHoliday = isHoliday(columnKey)
    setHolidayMap((prev) => ({ ...prev, [columnKey]: !currentlyHoliday }))
    if (currentlyHoliday) return
    const students = studentsByColumn[columnKey] || []
    setAbsenceMap((prev) => {
      const next = { ...prev }
      students.forEach((item) => {
        next[item._id] = false
      })
      return next
    })
  }

  const handleSave = async () => {
    if (columns.length === 0) {
      toast.error('No classes found to save attendance.')
      return
    }

    setSaving(true)
    try {
      await attndService.saveStudentAttendanceByDate(selectedDate, {
        absences: columns.flatMap((column) => {
          if (isHoliday(column.key)) return []
          return (studentsByColumn[column.key] || [])
            .filter((item) => Boolean(absenceMap[item._id]))
            .map((item) => ({
              studentId: item._id,
              className: column.className,
              section: column.section,
              attendanceDate: selectedDate,
            }))
        }),
        daySettings: columns.map((column) => ({
          attendanceDate: selectedDate,
          className: column.className,
          section: column.section,
          category: isHoliday(column.key) ? 'non-academic' : 'academic',
        })),
      })
      toast.success('Daywise attendance saved.')
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save daywise attendance.'))
    } finally {
      setSaving(false)
    }
  }

  const matrixColumns: DayColumn[] = columns.map((column) => {
    const holiday = isHoliday(column.key)
    const count = studentsByColumn[column.key]?.length || 0
    return {
      key: column.key,
      name: `${column.className} ${column.section}`,
      meta: holiday ? 'Holiday' : pluralize(count, 'student'),
      holiday,
      onToggleHoliday: () => toggleColumnHoliday(column.key),
      toggleLabel: `${column.className} ${column.section}, ${holiday ? 'holiday' : 'working day'}. Toggle.`,
    }
  })
  const empty =
    columns.length === 0
      ? { icon: CalendarX, title: 'No classes found', body: 'Add students with a class and section in the Students module.' }
      : rowCount === 0
        ? searchQuery.trim()
          ? { icon: SearchX, title: 'No students match your search', body: 'Try a different name or admission number.' }
          : { icon: CalendarX, title: 'No students found', body: 'Students appear here once they are added to a class.' }
        : null

  return (
    <Page width="full">
      <Card
        flush
        className="attnd-matrix-card"
        footer={
          loading
            ? undefined
            : `${pluralize(visibleStudents.length, 'student')} across ${pluralize(workingColumns.length, 'working class')}. Save to keep changes.`
        }
      >
        <div className="attnd-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search name or admission no.',
              value: searchQuery,
              onChange: setSearchQuery,
              label: 'Search students',
            }}
            filters={<DateSwitcher value={selectedDate} onChange={setSelectedDate} />}
            actions={
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                onClick={handleSave}
                loading={saving}
                disabled={loading || columns.length === 0}
              >
                Save attendance
              </Button>
            }
          />
          <AttndSummary
            working={workingColumns.length}
            workingLabel="working class"
            present={presentCount}
            absent={absentCount}
            holidayHint="Click a class to switch working day or holiday."
          />
        </div>
        <AttndDayMatrix
          columns={matrixColumns}
          peopleByColumn={studentsByColumn}
          isAbsent={(id) => Boolean(absenceMap[id])}
          onToggleAbsent={toggleAbsent}
          loading={loading}
          loadingLabel="Loading students"
          empty={empty}
        />
      </Card>
    </Page>
  )
}
