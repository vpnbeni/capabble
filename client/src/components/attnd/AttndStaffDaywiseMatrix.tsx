import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarCheck, CalendarOff, Save, SearchX, Users } from 'lucide-react'
import { DateSwitcher } from '@/components/attnd/DateSwitcher'
import { AttndDayMatrix, AttndSummary, pluralize, type DayColumn } from '@/components/attnd/AttndMatrix'
import { Button, Card, FilterBar, Page } from '@/components/ui'
import attndService, { type StaffDirectoryItem } from '@/services/attndService'
import { getStaffTypeId, STAFF_TYPE_OPTIONS, type StaffTypeId } from '@/utils/attndStaffTypes'

const todayDateKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const isSundayDate = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getDay() === 0

export const AttndStaffDaywiseMatrix = () => {
  const [selectedDate, setSelectedDate] = useState(todayDateKey)
  const [staffRows, setStaffRows] = useState<StaffDirectoryItem[]>([])
  const [absenceMap, setAbsenceMap] = useState<Record<string, boolean>>({})
  const [holiday, setHoliday] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const columns = useMemo(() => {
    const present = new Set(staffRows.map((item) => getStaffTypeId(item)))
    return STAFF_TYPE_OPTIONS.filter((item) => present.has(item.id))
  }, [staffRows])

  const staffByType = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const grouped: Record<StaffTypeId, StaffDirectoryItem[]> = {
      teaching: [],
      'sports-coach': [],
      admin: [],
      'class-iv': [],
      drivers: [],
      conductors: [],
      security: [],
      other: [],
    }
    staffRows.forEach((item) => {
      if (query) {
        const name = String(item.name || '').toLowerCase()
        const employeeId = String(item.employeeId || '').toLowerCase()
        if (!name.includes(query) && !employeeId.includes(query)) return
      }
      grouped[getStaffTypeId(item)].push(item)
    })
    Object.values(grouped).forEach((rows) => {
      rows.sort((left, right) =>
        String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
      )
    })
    return grouped
  }, [staffRows, searchQuery])

  const rowCount = Math.max(0, ...columns.map((column) => staffByType[column.id]?.length || 0))
  const visibleStaff = columns.flatMap((column) => staffByType[column.id] || [])
  const absentCount = holiday ? 0 : visibleStaff.filter((item) => absenceMap[item._id]).length
  const presentCount = holiday ? 0 : visibleStaff.length - absentCount

  useEffect(() => {
    setHoliday(isSundayDate(selectedDate))
  }, [selectedDate])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [staff, attendance] = await Promise.all([
          attndService.getStaffDirectory(),
          attndService.getStaffAttendance({ date: selectedDate }),
        ])
        setStaffRows(staff)
        const nextAbsence: Record<string, boolean> = {}
        attendance.forEach((item) => {
          if (item.staffId && item.status === 'A') nextAbsence[item.staffId] = true
        })
        setAbsenceMap(nextAbsence)
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load staff attendance.'))
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [selectedDate])

  const toggleAbsent = (staffId: string) => {
    if (holiday) return
    setAbsenceMap((prev) => ({ ...prev, [staffId]: !prev[staffId] }))
  }

  const handleSave = async () => {
    if (staffRows.length === 0) {
      toast.error('No staff records available to save.')
      return
    }
    setSaving(true)
    try {
      await attndService.saveStaffAttendance({
        date: selectedDate,
        staffIds: staffRows.map((item) => item._id),
        absences: holiday
          ? []
          : staffRows
              .filter((item) => absenceMap[item._id])
              .map((item) => ({ staffId: item._id, attendanceDate: selectedDate })),
      })
      toast.success('Staff attendance saved.')
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save staff attendance.'))
    } finally {
      setSaving(false)
    }
  }

  const matrixColumns: DayColumn[] = columns.map((column) => ({
    key: column.id,
    name: column.label,
    meta: holiday ? 'Holiday' : pluralize(staffByType[column.id]?.length || 0, 'member'),
    holiday,
  }))
  const empty =
    columns.length === 0
      ? { icon: Users, title: 'No staff found', body: 'Add staff in the Staff module, then mark attendance here.' }
      : rowCount === 0
        ? { icon: SearchX, title: 'No staff match your search', body: 'Try a different name or employee ID.' }
        : null

  return (
    <Page width="full">
      <Card
        flush
        className="attnd-matrix-card"
        footer={
          loading
            ? undefined
            : `${pluralize(visibleStaff.length, 'staff member')} across ${pluralize(columns.length, 'staff type')}. Save to keep changes.`
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
                <DateSwitcher value={selectedDate} onChange={setSelectedDate} />
                <Button
                  size="sm"
                  icon={holiday ? CalendarOff : CalendarCheck}
                  className={holiday ? 'attnd-daytoggle is-holiday' : 'attnd-daytoggle'}
                  aria-pressed={holiday}
                  onClick={() => setHoliday((prev) => !prev)}
                  title={holiday ? 'Holiday. Click to make it a working day.' : 'Working day. Click to make it a holiday.'}
                >
                  {holiday ? 'Holiday' : 'Working day'}
                </Button>
              </>
            }
            actions={
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
            }
          />
          <AttndSummary
            working={holiday ? 0 : 1}
            workingLabel="working day"
            present={presentCount}
            absent={absentCount}
            holidayHint="Use the Working day button to mark this date a holiday."
          />
        </div>
        <AttndDayMatrix
          columns={matrixColumns}
          peopleByColumn={staffByType}
          isAbsent={(id) => Boolean(absenceMap[id])}
          onToggleAbsent={(id) => toggleAbsent(id)}
          loading={loading}
          loadingLabel="Loading staff"
          empty={empty}
        />
      </Card>
    </Page>
  )
}
