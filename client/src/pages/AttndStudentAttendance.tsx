import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { GraduationCap, Save, SearchX, Users } from 'lucide-react'
import { MonthSwitcher, formatMonthLabel } from '@/components/attnd/MonthSwitcher'
import { AttndDaywiseMatrix } from '@/components/attnd/AttndDaywiseMatrix'
import { AttndMonthMatrix, AttndSummary, pluralize } from '@/components/attnd/AttndMatrix'
import { Button, Card, FilterBar, Page, Select } from '@/components/ui'
import { sortSectionNames } from '@/constants/studentClasses'
import { useAttndMatrixMode } from '@/contexts/AttndMatrixModeContext'
import attndService, {
  type StudentClassOption,
  type StudentDirectoryItem,
} from '@/services/attndService'

type DayCategory = 'academic' | 'non-academic'
type AbsenceMap = Record<string, Record<string, boolean>>
type DayCategoryMap = Record<string, DayCategory>

const currentMonthKey = () => new Date().toISOString().slice(0, 7)

const isSundayDate = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getDay() === 0

const defaultDayCategory = (dateKey: string): DayCategory => (isSundayDate(dateKey) ? 'non-academic' : 'academic')

const getDaysInMonth = (month: string) => {
  const [yearValue, monthValue] = month.split('-').map(Number)
  if (!yearValue || !monthValue) return []
  const count = new Date(yearValue, monthValue, 0).getDate()
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    const dateKey = `${month}-${day}`
    const weekday = new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    return { dayLabel: String(index + 1), dateKey, weekday }
  })
}

const AttndStudentAttendance: React.FC = () => {
  const { mode } = useAttndMatrixMode()
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [classOptions, setClassOptions] = useState<StudentClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [studentRows, setStudentRows] = useState<StudentDirectoryItem[]>([])
  const [absenceMap, setAbsenceMap] = useState<AbsenceMap>({})
  const [dayCategoryMap, setDayCategoryMap] = useState<DayCategoryMap>({})
  const todayKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])

  const sectionOptions = useMemo(() => {
    const row = classOptions.find((item) => item.className === selectedClass)
    return [...(row?.sections || [])].sort((a, b) => sortSectionNames(a, b, selectedClass))
  }, [classOptions, selectedClass])

  const days = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth])

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const options = await attndService.getStudentFilters()
        setClassOptions(options)
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load class and section options.'))
      }
    }
    void loadFilters()
  }, [])

  useEffect(() => {
    if (!selectedClass) {
      setSelectedSection('')
      return
    }
    if (sectionOptions.length === 0) {
      setSelectedSection('')
      return
    }
    if (!sectionOptions.includes(selectedSection)) {
      setSelectedSection(sectionOptions[0])
    }
  }, [selectedClass, sectionOptions, selectedSection])

  const loadData = async () => {
    if (!selectedClass || !selectedSection || !selectedMonth) {
      setStudentRows([])
      setAbsenceMap({})
      setDayCategoryMap({})
      return
    }

    setLoading(true)
    try {
      const [students, attendance] = await Promise.all([
        attndService.getStudentDirectory(selectedClass, selectedSection),
        attndService.getStudentAttendance(selectedClass, selectedSection, { month: selectedMonth }),
      ])

      setStudentRows(students)
      const nextAbsence: AbsenceMap = {}
      attendance.records.forEach((item) => {
        const id = String(item.studentId || '')
        if (!id || !item.attendanceDate || item.status !== 'A') return
        if (!nextAbsence[id]) nextAbsence[id] = {}
        nextAbsence[id][item.attendanceDate] = true
      })
      setAbsenceMap(nextAbsence)

      const nextDays: DayCategoryMap = {}
      days.forEach((day) => {
        nextDays[day.dateKey] = defaultDayCategory(day.dateKey)
      })
      attendance.daySettings.forEach((item) => {
        if (!item.attendanceDate) return
        nextDays[item.attendanceDate] = item.category === 'non-academic' ? 'non-academic' : 'academic'
      })
      setDayCategoryMap(nextDays)
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load student attendance data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [selectedMonth, selectedClass, selectedSection])

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const rows = query
      ? studentRows.filter((item) => {
          const name = String(item.name || '').toLowerCase()
          const rollNo = String(item.rollNumber || '').toLowerCase()
          return name.includes(query) || rollNo.includes(query)
        })
      : studentRows
    return [...rows].sort((left, right) =>
      String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
    )
  }, [studentRows, searchQuery])

  const isHoliday = (dateKey: string) =>
    (dayCategoryMap[dateKey] || defaultDayCategory(dateKey)) === 'non-academic'
  const workingDays = useMemo(() => days.filter((day) => !isHoliday(day.dateKey)), [days, dayCategoryMap])

  const absentCount = useMemo(
    () =>
      filteredStudents.reduce((sum, student) => {
        const absentDays = workingDays.reduce(
          (dayCount, day) => dayCount + (absenceMap[student._id]?.[day.dateKey] ? 1 : 0),
          0
        )
        return sum + absentDays
      }, 0),
    [filteredStudents, workingDays, absenceMap]
  )
  const presentCount = filteredStudents.length * workingDays.length - absentCount

  const toggleAbsent = (studentId: string, dateKey: string) => {
    if (isHoliday(dateKey)) return
    setAbsenceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [dateKey]: !prev[studentId]?.[dateKey],
      },
    }))
  }

  const toggleDayCategory = (dateKey: string) => {
    const currentlyHoliday = isHoliday(dateKey)
    setDayCategoryMap((prev) => ({
      ...prev,
      [dateKey]: currentlyHoliday ? 'academic' : 'non-academic',
    }))
    setAbsenceMap((prev) => {
      if (currentlyHoliday) return prev
      const next = { ...prev }
      Object.keys(next).forEach((studentId) => {
        if (next[studentId]?.[dateKey]) {
          next[studentId] = { ...next[studentId], [dateKey]: false }
        }
      })
      return next
    })
  }

  const handleSave = async () => {
    if (!selectedClass || !selectedSection) {
      toast.error('Select class and section.')
      return
    }
    if (studentRows.length === 0) {
      toast.error('No students found for the selected class and section.')
      return
    }

    setSaving(true)
    try {
      await attndService.saveStudentAttendance(selectedClass, selectedSection, {
        month: selectedMonth,
        absences: studentRows.flatMap((student) =>
          workingDays
            .filter((day) => Boolean(absenceMap[student._id]?.[day.dateKey]))
            .map((day) => ({
              studentId: student._id,
              attendanceDate: day.dateKey,
            }))
        ),
        daySettings: days.map((day) => ({
          attendanceDate: day.dateKey,
          category: isHoliday(day.dateKey) ? 'non-academic' : 'academic',
        })),
      })
      toast.success('Student attendance saved.')
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save student attendance.'))
    } finally {
      setSaving(false)
    }
  }

  const people = useMemo(
    () => filteredStudents.map((item) => ({ _id: item._id, code: item.rollNumber, name: item.name })),
    [filteredStudents]
  )
  const empty = !selectedClass || !selectedSection
    ? {
        icon: GraduationCap,
        title: 'Choose a class and section',
        body: 'Pick a class and section above to list its students for the month.',
      }
    : filteredStudents.length === 0
      ? searchQuery.trim()
        ? { icon: SearchX, title: 'No students match your search', body: 'Try a different name or admission number.' }
        : {
            icon: Users,
            title: `No students in ${selectedClass} ${selectedSection}`,
            body: 'Add students to this section in the Students module.',
          }
      : null

  if (mode === 'daywise') {
    return <AttndDaywiseMatrix />
  }

  return (
    <Page width="full">
      <Card
        flush
        className="attnd-matrix-card"
        footer={
          selectedClass && selectedSection && !loading
            ? `${pluralize(filteredStudents.length, 'student')} in ${selectedClass} ${selectedSection} · ${formatMonthLabel(selectedMonth)}. Save to keep changes.`
            : undefined
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
            filters={
              <>
                <Select
                  aria-label="Class"
                  size="sm"
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                  placeholder="Choose class"
                  options={classOptions.map((item) => item.className)}
                />
                <Select
                  aria-label="Section"
                  size="sm"
                  value={selectedSection}
                  onChange={(event) => setSelectedSection(event.target.value)}
                  disabled={!selectedClass}
                  placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
                  options={sectionOptions}
                />
                <MonthSwitcher value={selectedMonth} onChange={setSelectedMonth} />
              </>
            }
            actions={
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                onClick={handleSave}
                loading={saving}
                disabled={loading || studentRows.length === 0}
              >
                Save attendance
              </Button>
            }
          />
          <AttndSummary
            working={workingDays.length}
            workingLabel="working day"
            present={presentCount}
            absent={absentCount}
            holidayHint="Click a date to switch working day or holiday."
          />
        </div>
        <AttndMonthMatrix
          people={people}
          days={days}
          todayKey={todayKey}
          codeLabel="Adm. no."
          nameLabel="Student name"
          isHoliday={isHoliday}
          isAbsent={(id, dateKey) => Boolean(absenceMap[id]?.[dateKey])}
          onToggleAbsent={toggleAbsent}
          onToggleDay={toggleDayCategory}
          loading={loading}
          loadingLabel="Loading students"
          empty={empty}
        />
      </Card>
    </Page>
  )
}

export default AttndStudentAttendance
