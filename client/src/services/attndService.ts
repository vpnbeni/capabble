import api from './api'

export type AttendanceStatus = 'P' | 'A' | 'HD'

export type StaffDirectoryItem = {
  _id: string
  name: string
  employeeId?: string
  designation?: string
  dutyType?: string
  isActive?: boolean
}

export type StudentDirectoryItem = {
  _id: string
  name: string
  rollNumber?: string
  class: string
  section: string
  isActive?: boolean
}

export type StaffAttendanceRecord = {
  staffId: string
  attendanceDate: string
}

export type StudentAttendanceRecord = {
  studentId: string
  attendanceDate: string
  status?: AttendanceStatus
  category?: 'academic' | 'non-academic'
}

export type StudentClassOption = {
  className: string
  sections: string[]
}

export type AttndDashboardGroupStats = {
  strength: number
  todayPresent: number
  todayAbsent: number
  todayHalfDay: number
  monthAbsent: number
  monthHalfDay: number
  attendancePercent: number
}

export type AttndClassMatrixCell = {
  section: string
  strength: number
  todayAbsent: number
  todayHalfDay: number
  monthAbsent: number
  monthHalfDay: number
}

export type AttndAbsentStudent = {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  halfDay: boolean
}

export type AttndDashboardData = {
  month: string
  date: string
  workingDays: number
  staff: AttndDashboardGroupStats
  students: AttndDashboardGroupStats
  classMatrix: Array<{ className: string; sections: AttndClassMatrixCell[] }>
  /** Absent and half-day students on `date`; empty when the user can't read student attendance. */
  studentsAbsentToday?: AttndAbsentStudent[]
  sections: string[]
  staffMatrix: Array<{
    group: string
    strength: number
    todayAbsent: number
    todayHalfDay: number
    monthAbsent: number
    monthHalfDay: number
  }>
  dailyTrend: Array<{
    date: string
    weekday: string
    isSunday: boolean
    staffAbsent: number
    staffHalfDay: number
    studentAbsent: number
    studentHalfDay: number
  }>
}

const getStaffDirectory = async (): Promise<StaffDirectoryItem[]> => {
  const response = await api.get('/attnd/staff-directory')
  return Array.isArray(response?.data?.data) ? response.data.data : []
}

const getStudentFilters = async (): Promise<StudentClassOption[]> => {
  const response = await api.get('/attnd/student-filters')
  return Array.isArray(response?.data?.data?.classOptions) ? response.data.data.classOptions : []
}

const getStudentDirectory = async (className?: string, section?: string): Promise<StudentDirectoryItem[]> => {
  const response = await api.get('/attnd/student-directory', {
    params: {
      ...(className ? { className } : {}),
      ...(section ? { section } : {}),
    },
  })
  return Array.isArray(response?.data?.data) ? response.data.data : []
}

/** Staff absences for a month plus the school calendar's days off for it. */
const getStaffMonth = async (month: string): Promise<{
  records: Array<{ staffId: string; attendanceDate: string; status: AttendanceStatus; remarks?: string }>
  schoolDays: SchoolDayMap
}> => {
  const response = await api.get('/attnd/staff', { params: { month } })
  return {
    records: Array.isArray(response?.data?.data) ? response.data.data : [],
    schoolDays: response?.data?.schoolDays || {},
  }
}

const getStaffAttendance = async (
  options: { month?: string; date?: string }
): Promise<Array<{ staffId: string; attendanceDate: string; status: AttendanceStatus; remarks?: string }>> => {
  const response = await api.get('/attnd/staff', { params: options })
  return Array.isArray(response?.data?.data) ? response.data.data : []
}

const saveStaffAttendance = async (payload: {
  month?: string
  date?: string
  staffIds: string[]
  absences: StaffAttendanceRecord[]
}) => {
  return api.put('/attnd/staff', payload)
}

const getStudentAttendance = async (
  className: string,
  section: string,
  options: { date?: string; month?: string }
): Promise<{
  records: Array<{ studentId: string; attendanceDate: string; status: AttendanceStatus; remarks?: string; className?: string; section?: string }>
  daySettings: Array<{ attendanceDate: string; category?: 'academic' | 'non-academic'; className?: string; section?: string }>
  schoolDays: SchoolDayMap
}> => {
  const response = await api.get('/attnd/students', {
    params: { className, section, date: options.date, month: options.month },
  })
  const payload = response?.data?.data
  if (Array.isArray(payload)) {
    return { records: payload, daySettings: [], schoolDays: {} }
  }
  return {
    records: Array.isArray(payload?.records) ? payload.records : [],
    daySettings: Array.isArray(payload?.daySettings) ? payload.daySettings : [],
    schoolDays: payload?.schoolDays || {},
  }
}

/** Days off or shortened by the school calendar: { 'YYYY-MM-DD': { working, kind, label, implicit } }. */
export type SchoolDayMap = Record<string, { working: boolean; kind: string; label: string; halfDayEndTime?: string; implicit?: boolean }>

/** Days the school set as closed (holidays, closures, weekly offs it chose) — not the default Sunday. */
export const isSchoolClosed = (map: SchoolDayMap, dateKey: string) => Boolean(map[dateKey] && !map[dateKey].working && !map[dateKey].implicit)

const saveStudentAttendance = async (
  className: string,
  section: string,
  payload: {
    date?: string
    month?: string
    records?: Array<{ studentId: string; status?: AttendanceStatus }>
    absences?: StudentAttendanceRecord[]
    daySettings?: Array<{ attendanceDate: string; category: 'academic' | 'non-academic' }>
  }
) => {
  return api.put('/attnd/students', { className, section, ...payload })
}

const getStudentAttendanceByDate = async (date: string): Promise<{
  records: Array<{ studentId: string; attendanceDate: string; status: AttendanceStatus; remarks?: string; className?: string; section?: string }>
  daySettings: Array<{ attendanceDate: string; category?: 'academic' | 'non-academic'; className?: string; section?: string }>
}> => {
  const response = await api.get('/attnd/students', { params: { date } })
  const payload = response?.data?.data
  if (Array.isArray(payload)) {
    return { records: payload, daySettings: [] }
  }
  return {
    records: Array.isArray(payload?.records) ? payload.records : [],
    daySettings: Array.isArray(payload?.daySettings) ? payload.daySettings : [],
  }
}

const saveStudentAttendanceByDate = async (
  date: string,
  payload: {
    absences: Array<{ studentId: string; className: string; section: string; attendanceDate?: string }>
    daySettings: Array<{ attendanceDate: string; className: string; section: string; category: 'academic' | 'non-academic' }>
  }
) => {
  return api.put('/attnd/students', { date, ...payload })
}

const getDashboard = async (month: string, date?: string): Promise<AttndDashboardData> => {
  const response = await api.get('/attnd/dashboard', { params: { month, date } })
  return response?.data?.data as AttndDashboardData
}

const attndService = {
  getStaffDirectory,
  getStudentFilters,
  getStudentDirectory,
  getStaffAttendance,
  getStaffMonth,
  saveStaffAttendance,
  getStudentAttendance,
  saveStudentAttendance,
  getStudentAttendanceByDate,
  saveStudentAttendanceByDate,
  getDashboard,
}

export default attndService
