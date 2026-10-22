import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Save, SearchX, Users } from 'lucide-react'
import { MonthSwitcher, formatMonthLabel } from '@/components/attnd/MonthSwitcher'
import { AttndStaffDaywiseMatrix } from '@/components/attnd/AttndStaffDaywiseMatrix'
import { AttndMonthMatrix, AttndSummary, pluralize } from '@/components/attnd/AttndMatrix'
import { Button, Card, FilterBar, Page, Select } from '@/components/ui'
import { addMark, emptyCounts, isSundayDate, markState, useAttndSettings } from '@/components/attnd/attndSettings'
import { AttndSettingsButton } from '@/components/attnd/AttndSettingsDialog'
import { useAttndMatrixMode } from '@/contexts/AttndMatrixModeContext'
import attndService, { isSchoolClosed, type SchoolDayMap, type StaffDirectoryItem } from '@/services/attndService'
import {
  designationOf,
  getStaffTypeId,
  STAFF_TYPE_OPTIONS,
  type StaffTypeId,
} from '@/utils/attndStaffTypes'

type AbsenceMap = Record<string, Record<string, boolean>>
type DayCategory = 'academic' | 'non-academic'
type DayCategoryMap = Record<string, DayCategory>

const currentMonthKey = () => new Date().toISOString().slice(0, 7)
const defaultDayCategory = (dateKey: string, sundayHoliday: boolean): DayCategory =>
  sundayHoliday && isSundayDate(dateKey) ? 'non-academic' : 'academic'

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

const AttndStaffAttendance: React.FC = () => {
  const { mode } = useAttndMatrixMode()
  const settings = useAttndSettings()
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [allStaff, setAllStaff] = useState<StaffDirectoryItem[]>([])
  const [selectedType, setSelectedType] = useState<StaffTypeId | ''>('')
  const [selectedDesignation, setSelectedDesignation] = useState('All')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [absenceMap, setAbsenceMap] = useState<AbsenceMap>({})
  const [dayCategoryMap, setDayCategoryMap] = useState<DayCategoryMap>({})
  // Holidays and closures from the school calendar (Settings → School days).
  const [schoolDays, setSchoolDays] = useState<SchoolDayMap>({})
  const todayKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])

  const typeOptions = useMemo(() => {
    const present = new Set(allStaff.map((item) => getStaffTypeId(item)))
    return STAFF_TYPE_OPTIONS.filter((item) => present.has(item.id))
  }, [allStaff])

  const designationOptions = useMemo(() => {
    if (!selectedType) return []
    const values = Array.from(
      new Set(
        allStaff.filter((item) => getStaffTypeId(item) === selectedType).map((item) => designationOf(item))
      )
    ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    return ['All', ...values]
  }, [allStaff, selectedType])

  const staffRows = useMemo(() => {
    if (!selectedType) return []
    return allStaff.filter((item) => {
      if (getStaffTypeId(item) !== selectedType) return false
      if (selectedDesignation && selectedDesignation !== 'All' && designationOf(item) !== selectedDesignation) {
        return false
      }
      return true
    })
  }, [allStaff, selectedType, selectedDesignation])

  const days = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth])

  useEffect(() => {
    if (!selectedType && typeOptions.length > 0) {
      setSelectedType(typeOptions[0].id)
    }
    if (selectedType && !typeOptions.some((item) => item.id === selectedType)) {
      setSelectedType(typeOptions[0]?.id || '')
    }
  }, [typeOptions, selectedType])

  useEffect(() => {
    if (!designationOptions.includes(selectedDesignation)) {
      setSelectedDesignation(designationOptions[0] || 'All')
    }
  }, [designationOptions, selectedDesignation])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [staff, month] = await Promise.all([
          attndService.getStaffDirectory(),
          attndService.getStaffMonth(selectedMonth),
        ])
        setAllStaff(staff)
        setSchoolDays(month.schoolDays)
        const nextAbsence: AbsenceMap = {}
        month.records.forEach((item) => {
          const id = String(item.staffId || '')
          if (!id || !item.attendanceDate || item.status !== 'A') return
          if (!nextAbsence[id]) nextAbsence[id] = {}
          nextAbsence[id][item.attendanceDate] = true
        })
        setAbsenceMap(nextAbsence)
        const nextDays: DayCategoryMap = {}
        setDayCategoryMap(nextDays)
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load staff attendance data.'))
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [selectedMonth])

  const filteredStaff = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const rows = query
      ? staffRows.filter((item) => {
          const name = String(item.name || '').toLowerCase()
          const employeeId = String(item.employeeId || '').toLowerCase()
          return name.includes(query) || employeeId.includes(query)
        })
      : staffRows
    return [...rows].sort((left, right) =>
      String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
    )
  }, [staffRows, searchQuery])

  const isHoliday = (dateKey: string) => isSchoolClosed(schoolDays, dateKey)
    || (dayCategoryMap[dateKey] || defaultDayCategory(dateKey, settings.sundayHoliday)) === 'non-academic'
  const workingDays = useMemo(() => days.filter((day) => !isHoliday(day.dateKey)), [days, dayCategoryMap, schoolDays, settings.sundayHoliday])

  const counts = useMemo(() => {
    const next = emptyCounts()
    filteredStaff.forEach((person) =>
      workingDays.forEach((day) =>
        addMark(
          next,
          markState(settings, {
            holiday: false,
            future: day.dateKey > todayKey,
            absent: Boolean(absenceMap[person._id]?.[day.dateKey]),
          })
        )
      )
    )
    return next
  }, [filteredStaff, workingDays, absenceMap, settings, todayKey])

  const toggleAbsent = (staffId: string, dateKey: string) => {
    if (isHoliday(dateKey)) return
    setAbsenceMap((prev) => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        [dateKey]: !prev[staffId]?.[dateKey],
      },
    }))
  }

  const toggleDayCategory = (dateKey: string) => {
    if (isSchoolClosed(schoolDays, dateKey)) {
      toast(`${schoolDays[dateKey].label || 'This day'} is set in School days. Change it there.`)
      return
    }
    const currentlyHoliday = isHoliday(dateKey)
    setDayCategoryMap((prev) => ({
      ...prev,
      [dateKey]: currentlyHoliday ? 'academic' : 'non-academic',
    }))
    setAbsenceMap((prev) => {
      if (currentlyHoliday) return prev
      const next = { ...prev }
      Object.keys(next).forEach((staffId) => {
        if (next[staffId]?.[dateKey]) next[staffId] = { ...next[staffId], [dateKey]: false }
      })
      return next
    })
  }

  const handleSave = async () => {
    if (!selectedType) {
      toast.error('Select a staff type.')
      return
    }
    if (staffRows.length === 0) {
      toast.error('No staff found for the selected type.')
      return
    }
    setSaving(true)
    try {
      await attndService.saveStaffAttendance({
        month: selectedMonth,
        staffIds: staffRows.map((item) => item._id),
        absences: staffRows.flatMap((staff) =>
          workingDays
            .filter((day) => Boolean(absenceMap[staff._id]?.[day.dateKey]))
            .map((day) => ({
              staffId: staff._id,
              attendanceDate: day.dateKey,
            }))
        ),
      })
      toast.success('Staff attendance saved.')
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save staff attendance.'))
    } finally {
      setSaving(false)
    }
  }

  const people = useMemo(
    () => filteredStaff.map((item) => ({ _id: item._id, code: item.employeeId, name: item.name })),
    [filteredStaff]
  )
  const typeLabel = typeOptions.find((item) => item.id === selectedType)?.label || 'staff'
  const empty = !selectedType
    ? { icon: Users, title: 'Choose a staff type', body: 'Pick a staff type above to list its staff for the month.' }
    : filteredStaff.length === 0
      ? searchQuery.trim()
        ? { icon: SearchX, title: 'No staff match your search', body: 'Try a different name or employee ID.' }
        : { icon: Users, title: `No ${typeLabel.toLowerCase()} staff found`, body: 'Add staff in the Staff module, then mark attendance here.' }
      : null

  if (mode === 'daywise') {
    return <AttndStaffDaywiseMatrix />
  }

  return (
    <Page width="full">
      <Card
        flush
        className="attnd-matrix-card"
        footer={
          selectedType && !loading
            ? `${pluralize(filteredStaff.length, 'staff member')} · ${formatMonthLabel(selectedMonth)}. Save to keep changes.`
            : undefined
        }
      >
        <div className="attnd-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search name or employee ID',
              value: searchQuery,
              onChange: setSearchQuery,
              label: 'Search staff',
            }}
            filters={
              <>
                <Select
                  aria-label="Staff type"
                  size="sm"
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value as StaffTypeId | '')}
                  placeholder={typeOptions.length ? undefined : 'No staff types'}
                  options={typeOptions.map((item) => ({ value: item.id, label: item.label }))}
                />
                <Select
                  aria-label="Designation"
                  size="sm"
                  value={selectedDesignation}
                  onChange={(event) => setSelectedDesignation(event.target.value)}
                  disabled={!selectedType}
                  options={designationOptions.map((item) => ({
                    value: item,
                    label: item === 'All' ? 'All designations' : item,
                  }))}
                />
                <MonthSwitcher value={selectedMonth} onChange={setSelectedMonth} />
              </>
            }
            actions={
              <>
                <AttndSettingsButton />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  onClick={handleSave}
                  loading={saving}
                  disabled={loading || staffRows.length === 0}
                >
                  Save attendance
                </Button>
              </>
            }
          />
          <AttndSummary
            working={workingDays.length}
            workingLabel="working day"
            counts={counts}
            holidayHint="Click a date to switch working day or holiday."
          />
        </div>
        <AttndMonthMatrix
          people={people}
          days={days}
          todayKey={todayKey}
          codeLabel="Emp. ID"
          nameLabel="Staff name"
          isHoliday={isHoliday}
          isAbsent={(id, dateKey) => Boolean(absenceMap[id]?.[dateKey])}
          onToggleAbsent={toggleAbsent}
          onToggleDay={toggleDayCategory}
          loading={loading}
          loadingLabel="Loading staff"
          empty={empty}
        />
      </Card>
    </Page>
  )
}

export default AttndStaffAttendance
