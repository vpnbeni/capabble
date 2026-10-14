import React, { useState, useMemo, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Download, ExternalLink, FileText, FileWarning } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Page,
  Sheet,
  StatCard,
  Tabs,
  formatDate,
  formatTime,
  orDash,
  type DataTableColumn,
  Pagination,
  PdfFrame,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import DatesheetImportModal from '../components/datesheets/ImportModal'
import CreateDatesheetModal, { DatesheetFormData } from '../components/datesheets/CreateModal'
import ScheduleModal, { ScheduleRow } from '../components/datesheets/ScheduleModal'
import './DateSheets.css'
import calendarService from '../services/calendarService'
import datesheetService from '../services/datesheetService'
import {
  useDatesheets,
  useCBSEDatesheet,
  useCentreDatesheet,
  useSubjects,
  useDatesheetStats,
  useImportDatesheetMutation,
  useCreateDatesheetMutation,
  useUpdateDatesheetMutation,
} from '../hooks/useDatesheets'

type DateSheetTabId = 'all' | 'centre' | 'centre10th' | 'centre12th'

const limit = 50

const DateSheets: React.FC = () => {
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [importErrorMsg, setImportErrorMsg] = useState<string | undefined>()
  const [importErrorSample, setImportErrorSample] = useState<string[] | undefined>()
  const [importDebug, setImportDebug] = useState<any>(undefined)
  const [editing, setEditing] = useState<boolean>(false)
  const [editingData, setEditingData] = useState<any | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [activeTab, setActiveTab] = useState<DateSheetTabId>('centre')
  const [sortField, setSortField] = useState<'date' | 'class' | 'subjectName' | 'subjectCode' | 'duration' | null>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [isDownloadingCentrePDF, setIsDownloadingCentrePDF] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [centrePdfPreviewOpen, setCentrePdfPreviewOpen] = useState(false)
  const [centrePdfPreviewUrl, setCentrePdfPreviewUrl] = useState<string | null>(null)
  const [centrePdfPreviewError, setCentrePdfPreviewError] = useState<string | null>(null)

  const cbseParams = useMemo(() => ({
    page,
    limit,
    ...(sortField && { sortField, sortOrder }),
  }), [page, sortField, sortOrder])
  const centreParams = useMemo(() => ({
    page,
    limit,
    ...(sortField && { sortField, sortOrder }),
  }), [page, sortField, sortOrder])
  const subjectParams = useMemo(() => ({ page, limit }), [page])

  const { data: datesheets = [], isLoading: loading } = useDatesheets()
  const { data: cbseData, isLoading: cbseLoading } = useCBSEDatesheet(
    cbseParams,
    { enabled: activeTab === 'all' }
  )
  const { data: centreData, isLoading: centreLoading } = useCentreDatesheet(
    centreParams,
    { enabled: activeTab === 'centre' || activeTab === 'centre10th' || activeTab === 'centre12th' }
  )
  const { data: subjectsData } = useSubjects(
    subjectParams,
    { enabled: activeTab === 'all' }
  )
  const { data: stats = {
    fullDatesheet: 0,
    fullDatesheetDays: 0,
    centre: 0,
    centreDays: 0,
    centreCandidates: 0,
    centre10th: 0,
    centre10thDays: 0,
    centre10thCandidates: 0,
    centre12th: 0,
    centre12thDays: 0,
    centre12thCandidates: 0,
  } } = useDatesheetStats()

  const importMutation = useImportDatesheetMutation()
  const createMutation = useCreateDatesheetMutation()
  const updateMutation = useUpdateDatesheetMutation()

  const cbseDatesheet = cbseData?.entries ?? []
  const centreDatesheet = centreData?.entries ?? []
  const subjects = subjectsData?.subjects ?? []

  const pagination = useMemo(() => {
    if (activeTab === 'all') {
      const meta = cbseData?.meta ?? subjectsData?.meta
      return {
        page,
        pages: meta?.totalPages ?? 1,
        total: meta?.totalCount ?? 0,
        limit,
      }
    }
    if (activeTab === 'centre' || activeTab === 'centre10th' || activeTab === 'centre12th') {
      const meta = centreData?.meta
      return {
        page,
        pages: meta?.totalPages ?? 1,
        total: meta?.totalCount ?? 0,
        limit,
      }
    }
    return { page, pages: 1, total: 0, limit }
  }, [activeTab, page, cbseData?.meta, subjectsData?.meta, centreData?.meta])

  const handleTabChange = (id: DateSheetTabId) => {
    setActiveTab(id)
    setPage(1)
    setSortField('date')
    setSortOrder('asc')
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handleImport = async (file: File) => {
    setImportErrorMsg(undefined)
    setImportErrorSample(undefined)
    importMutation.mutate(file, {
      onSuccess: (response) => {
        if (response?.data?.success) {
          const count = response.data?.data?.count || 0
          toast.success(`Datesheet imported with ${count} entries`)
          setShowImportModal(false)
          setImportErrorMsg(undefined)
          setImportErrorSample(undefined)
          setImportDebug(undefined)
        } else {
          throw new Error(response?.data?.message || 'Import failed')
        }
      },
      onError: (error: any) => {
        const msg = error.response?.data?.message || error.message || 'Failed to import datesheet'
        const sample = error.response?.data?.sample as string[] | undefined
        const debug = error.response?.data?.debug
        setImportErrorMsg(msg)
        setImportErrorSample(sample)
        setImportDebug(debug)
        if (!sample) toast.error(msg)
      },
    })
  }

  const handleCreate = async (data: DatesheetFormData) => {
    try {
      if (editing && editingData) {
        await updateMutation.mutateAsync({
          id: editingData._id,
          data: {
            title: data.title,
            examType: data.examType,
            class: data.class,
            academicYear: data.academicYear,
            startDate: data.startDate,
            endDate: data.endDate,
            generalInstructions: data.generalInstructions,
          },
        })
        toast.success('Datesheet updated')
      } else {
        await createMutation.mutateAsync(data)
        toast.success('Datesheet created')
      }
      setShowCreateModal(false)
      setEditing(false)
      setEditingData(null)
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Failed to save date sheet'
      toast.error(msg)
    }
  }

  const getCentreDatesheetPdfFilename = () =>
    `centre-datesheet-datewise-${new Date().toISOString().slice(0, 10)}.pdf`

  const closeCentrePdfPreview = useCallback(() => {
    setCentrePdfPreviewOpen(false)
    setCentrePdfPreviewError(null)
    setCentrePdfPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (centrePdfPreviewUrl) URL.revokeObjectURL(centrePdfPreviewUrl)
    }
  }, [centrePdfPreviewUrl])

  const downloadCentreDatesheetPDF = async () => {
    if (isDownloadingCentrePDF) return

    try {
      setIsDownloadingCentrePDF(true)
      setCentrePdfPreviewOpen(true)
      setCentrePdfPreviewError(null)
      setCentrePdfPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return null
      })
      const response = await datesheetService.getCentreDatesheet({
        page: 1,
        limit: 10000,
        sortField: 'date',
        sortOrder: 'asc',
      })

      const entries = response?.data?.data ?? []
      if (!Array.isArray(entries) || entries.length === 0) {
        toast.error('No centre datesheet entries found to download.')
        return
      }

      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageHeight = doc.internal.pageSize.getHeight()
      const leftMargin = 10
      const topMargin = 15
      const bottomMargin = 12
      const headerHeight = 10
      let y = topMargin

      const formatPdfDate = (value: string | Date) => {
        const date = new Date(value)
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${day}.${month}.${year}`
      }

      const formatPdfDay = (value: string | Date, fallbackDayName?: string) => {
        if (fallbackDayName && String(fallbackDayName).trim()) {
          return String(fallbackDayName).toUpperCase()
        }
        return String(getDayName(String(value))).toUpperCase()
      }

      const formatPdfClass = (value: string) => {
        const normalized = String(value || '').trim().toLowerCase()
        if (normalized === '10' || normalized === '10th' || normalized === 'x') return 'X'
        if (normalized === '12' || normalized === '12th' || normalized === 'xii') return 'XII'
        return String(value || '').toUpperCase()
      }

      const formatAnswerSheetForPdf = (value: string) => {
        const answerSheetConfig: Record<string, string> = {
          '32_pages': '32 Pages',
          '20_pages': '20 Pages',
          '40_graph': '40 Pages (Graph)',
          none: 'Not specified',
        }
        return answerSheetConfig[value] || answerSheetConfig.none
      }

      const grouped = entries.reduce((acc: Record<string, any[]>, entry: any) => {
        const key = new Date(entry.examDate).toISOString().slice(0, 10)
        if (!acc[key]) acc[key] = []
        acc[key].push(entry)
        return acc
      }, {})

      const sortedDates = Object.keys(grouped).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      const colWidths = {
        srNo: 10,
        date: 22,
        day: 22,
        class: 14,
        subject: 58,
        code: 14,
        duration: 18,
        answerSheetType: 34,
        candidates: 24,
        rooms: 20,
        invigilators: 21,
      }
      const colX = {
        srNo: leftMargin,
        date: leftMargin + colWidths.srNo,
        day: leftMargin + colWidths.srNo + colWidths.date,
        class: leftMargin + colWidths.srNo + colWidths.date + colWidths.day,
        subject: leftMargin + colWidths.srNo + colWidths.date + colWidths.day + colWidths.class,
        code:
          leftMargin + colWidths.srNo + colWidths.date + colWidths.day + colWidths.class + colWidths.subject,
        duration:
          leftMargin +
          colWidths.srNo +
          colWidths.date +
          colWidths.day +
          colWidths.class +
          colWidths.subject +
          colWidths.code,
        answerSheetType:
          leftMargin +
          colWidths.srNo +
          colWidths.date +
          colWidths.day +
          colWidths.class +
          colWidths.subject +
          colWidths.code +
          colWidths.duration,
        candidates:
          leftMargin +
          colWidths.srNo +
          colWidths.date +
          colWidths.day +
          colWidths.class +
          colWidths.subject +
          colWidths.code +
          colWidths.duration +
          colWidths.answerSheetType,
        rooms:
          leftMargin +
          colWidths.srNo +
          colWidths.date +
          colWidths.day +
          colWidths.class +
          colWidths.subject +
          colWidths.code +
          colWidths.duration +
          colWidths.answerSheetType +
          colWidths.candidates,
        invigilators:
          leftMargin +
          colWidths.srNo +
          colWidths.date +
          colWidths.day +
          colWidths.class +
          colWidths.subject +
          colWidths.code +
          colWidths.duration +
          colWidths.answerSheetType +
          colWidths.candidates +
          colWidths.rooms,
      }

      const drawHeaderRow = () => {
        doc.setLineWidth(0.3)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.4)

        const headerCells = [
          { x: colX.srNo, w: colWidths.srNo, label: 'Sr No' },
          { x: colX.date, w: colWidths.date, label: 'DATE' },
          { x: colX.day, w: colWidths.day, label: 'DAY' },
          { x: colX.class, w: colWidths.class, label: 'CLASS' },
          { x: colX.subject, w: colWidths.subject, label: 'SUBJECT' },
          { x: colX.code, w: colWidths.code, label: 'CODE' },
          { x: colX.duration, w: colWidths.duration, label: 'DURATION' },
          { x: colX.answerSheetType, w: colWidths.answerSheetType, label: 'ANSWERSHEET TYPE' },
          { x: colX.candidates, w: colWidths.candidates, label: 'CANDIDATES' },
          { x: colX.rooms, w: colWidths.rooms, label: 'ROOMS' },
          { x: colX.invigilators, w: colWidths.invigilators, label: 'INVIGILATORS' },
        ]

        for (const cell of headerCells) {
          doc.rect(cell.x, y, cell.w, headerHeight)
          doc.text(cell.label, cell.x + cell.w / 2, y + headerHeight / 2 + 0.9, { align: 'center' })
        }

        y += headerHeight
      }

      const drawCell = (
        x: number,
        width: number,
        rowHeight: number,
        text: string | string[],
        align: 'left' | 'center' = 'center'
      ) => {
        doc.rect(x, y, width, rowHeight)
        const textArray = Array.isArray(text) ? text : [text]
        const lineHeight = 3.5
        const textBlockHeight = textArray.length * lineHeight
        const textY = y + (rowHeight - textBlockHeight) / 2 + 3

        if (align === 'left') {
          doc.text(textArray, x + 1.5, textY)
        } else {
          doc.text(textArray, x + width / 2, textY, { align: 'center' })
        }
      }

      drawHeaderRow()

      let srNo = 1
      for (const dateKey of sortedDates) {
        const dateEntries = [...grouped[dateKey]].sort((a: any, b: any) => {
          const classA = formatPdfClass(a.subject?.class || '')
          const classB = formatPdfClass(b.subject?.class || '')
          if (classA !== classB) return classA.localeCompare(classB)
          return String(a.subject?.code || '').localeCompare(String(b.subject?.code || ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        })

        for (let index = 0; index < dateEntries.length; index += 1) {
          const row = dateEntries[index]
          const subjectText = String(row.subject?.name || 'N/A').toUpperCase()
          const answerSheetText = formatAnswerSheetForPdf(String(row.answerSheet || row.answerSheetType || 'none'))
          const durationText = row.subject?.duration ? `${row.subject.duration} Hours` : 'N/A'
          const candidatesText = String(row.candidateCount || 0)
          const roomsNeeded = Number(row.roomsNeeded || 0)
          const roomsText = roomsNeeded === 0 ? 'Shared' : String(roomsNeeded)
          const invigilatorsText = roomsNeeded === 0 ? '-' : String(row.invigilatorsNeeded ?? roomsNeeded * 2)

          const subjectLines = doc.splitTextToSize(subjectText, colWidths.subject - 3)
          const answerSheetLines = doc.splitTextToSize(answerSheetText, colWidths.answerSheetType - 3)
          const rowLineCount = Math.max(subjectLines.length, answerSheetLines.length, 1)
          const rowHeight = Math.max(8, rowLineCount * 3.5 + 2.4)

          if (y + rowHeight > pageHeight - bottomMargin) {
            doc.addPage()
            y = topMargin
            drawHeaderRow()
          }

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.2)

          const showDateColumns = index === 0
          drawCell(colX.srNo, colWidths.srNo, rowHeight, showDateColumns ? String(srNo) : '')
          drawCell(colX.date, colWidths.date, rowHeight, showDateColumns ? formatPdfDate(dateKey) : '')
          drawCell(
            colX.day,
            colWidths.day,
            rowHeight,
            showDateColumns ? formatPdfDay(dateKey, row.dayName) : ''
          )
          drawCell(colX.class, colWidths.class, rowHeight, formatPdfClass(row.subject?.class || ''))
          drawCell(colX.subject, colWidths.subject, rowHeight, subjectLines, 'left')
          drawCell(colX.code, colWidths.code, rowHeight, String(row.subject?.code || ''))
          drawCell(colX.duration, colWidths.duration, rowHeight, durationText)
          drawCell(colX.answerSheetType, colWidths.answerSheetType, rowHeight, answerSheetLines, 'left')
          drawCell(colX.candidates, colWidths.candidates, rowHeight, candidatesText)
          drawCell(colX.rooms, colWidths.rooms, rowHeight, roomsText)
          drawCell(colX.invigilators, colWidths.invigilators, rowHeight, invigilatorsText)

          y += rowHeight
        }

        srNo += 1
      }

      const pdfBlob = doc.output('blob')
      const blobUrl = URL.createObjectURL(pdfBlob)
      setCentrePdfPreviewUrl(blobUrl)
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to download centre datesheet PDF.'
      setCentrePdfPreviewError(message)
      toast.error(message)
    } finally {
      setIsDownloadingCentrePDF(false)
    }
  }

  // Filter datesheets based on active tab
  const filteredDatesheets = datesheets.filter((ds) => {
    if (activeTab === 'all') return true
    if (activeTab === 'centre') return ds.centre
    if (activeTab === 'centre10th') return ds.centre && ds.class === '10th'
    if (activeTab === 'centre12th') return ds.centre && ds.class === '12th'
    return true
  })

  // Generate table rows based on active tab
  let tableRows: any[] = []

  if (activeTab === 'all') {
    // For "Full Datesheet" tab, show CBSE datesheet data if available, otherwise subjects
    if (cbseDatesheet.length > 0) {
      tableRows = cbseDatesheet.map((entry: any) => ({
        datesheetId: 'cbse-datesheet',
        datesheetTitle: 'CBSE Full Datesheet',
        class: entry.subject.class,
        examDate: entry.examDate,
        subjectName: entry.subject.name,
        subjectCode: entry.subject.code,
        duration: entry.subject.duration || 0,
        timeSlot: entry.timeSlot,
        dayName: entry.dayName,
        answerSheet: entry.answerSheet || 'none'
      }))
    } else {
      // Fallback to subjects if no CBSE datesheet available
      tableRows = subjects.map((subject: any) => ({
        datesheetId: 'all-subjects',
        datesheetTitle: 'Full Datesheet',
        class: subject.class,
        examDate: null,
        subjectName: subject.name,
        subjectCode: subject.code,
        duration: subject.duration || 0,
        timeSlot: null,
        dayName: null,
        answerSheet: subject.answerSheet || 'none'
      }))
    }
  } else if (activeTab === 'centre') {
    // For "Centre Datesheet" tab, show centre-specific datesheet based on candidate subject choices
    tableRows = centreDatesheet.map((entry: any) => ({
      datesheetId: 'centre-datesheet',
      datesheetTitle: 'Centre Datesheet',
      class: entry.subject.class,
      examDate: entry.examDate,
      subjectName: entry.subject.name,
      subjectCode: entry.subject.code,
      duration: entry.subject.duration || 0,
      timeSlot: entry.timeSlot,
      dayName: entry.dayName,
      candidateCount: entry.candidateCount || 0,
      roomsNeeded: entry.roomsNeeded || 0,
      answerSheet: entry.answerSheet || entry.answerSheetType || 'none'
    }))
  } else if (activeTab === 'centre10th') {
    // For "Centre 10th Datesheet" tab, show only 10th class entries from centre datesheet
    tableRows = centreDatesheet
      .filter((entry: any) => entry.subject.class === '10th')
      .map((entry: any) => ({
        datesheetId: 'centre-datesheet-10th',
        datesheetTitle: 'Centre Datesheet - 10th',
        class: entry.subject.class,
        examDate: entry.examDate,
        subjectName: entry.subject.name,
        subjectCode: entry.subject.code,
        duration: entry.subject.duration || 0,
        timeSlot: entry.timeSlot,
        dayName: entry.dayName,
        candidateCount: entry.candidateCount || 0,
        roomsNeeded: entry.roomsNeeded || 0,
        answerSheet: entry.answerSheet || entry.answerSheetType || 'none'
      }))
  } else if (activeTab === 'centre12th') {
    // For "Centre 12th Datesheet" tab, show only 12th class entries from centre datesheet
    tableRows = centreDatesheet
      .filter((entry: any) => entry.subject.class === '12th')
      .map((entry: any) => ({
        datesheetId: 'centre-datesheet-12th',
        datesheetTitle: 'Centre Datesheet - 12th',
        class: entry.subject.class,
        examDate: entry.examDate,
        subjectName: entry.subject.name,
        subjectCode: entry.subject.code,
        duration: entry.subject.duration || 0,
        timeSlot: entry.timeSlot,
        dayName: entry.dayName,
        candidateCount: entry.candidateCount || 0,
        roomsNeeded: entry.roomsNeeded || 0,
        answerSheet: entry.answerSheet || entry.answerSheetType || 'none'
      }))
  } else {
    // For other tabs, show datesheet subjects as before
    tableRows = filteredDatesheets.flatMap((ds) => {
      if (!ds.subjects || ds.subjects.length === 0) return []
      return ds.subjects.map((subject: any) => ({
        datesheetId: ds._id,
        datesheetTitle: ds.title,
        class: ds.class,
        examDate: subject.examDate,
        subjectName: subject.subject?.name || 'N/A',
        subjectCode: subject.subject?.code || 'N/A',
        duration: subject.duration || subject.subject?.duration || 0,
        timeSlot: subject.timeSlot
      }))
    })
  }

  // Apply sorting (only for non-Full Datesheet tabs, as Full Datesheet uses server-side sorting)
  if (activeTab !== 'all' && sortField) {
    tableRows = [...tableRows].sort((a, b) => {
      let comparison = 0

      if (sortField === 'date') {
        // Handle null dates
        if (!a.examDate && !b.examDate) return 0
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        comparison = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
      } else if (sortField === 'class') {
        comparison = a.class.localeCompare(b.class)
      } else if (sortField === 'subjectName') {
        comparison = a.subjectName.toLowerCase().localeCompare(b.subjectName.toLowerCase())
      } else if (sortField === 'subjectCode') {
        comparison = a.subjectCode.localeCompare(b.subjectCode)
      } else if (sortField === 'duration') {
        comparison = a.duration - b.duration
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }
  // Note: Full Datesheet tab (activeTab === 'all') uses server-side sorting, so no client-side sorting needed

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const visibleTableRows = useMemo(() => {
    if (!normalizedSearchTerm) return tableRows

    return tableRows.filter((row) => {
      const subjectName = String(row.subjectName || '').toLowerCase()
      const subjectCode = String(row.subjectCode || '').toLowerCase()
      return subjectName.includes(normalizedSearchTerm) || subjectCode.includes(normalizedSearchTerm)
    })
  }, [normalizedSearchTerm, tableRows])

  // Handle sort
  const handleSort = (field: 'date' | 'class' | 'subjectName' | 'subjectCode' | 'duration') => {
    if (sortField === field) {
      // Toggle sort order or reset to default (date)
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else {
        setSortField('date')
        setSortOrder('asc')
      }
    } else {
      setSortField(field)
      setSortOrder('asc')
    }

    setPage(1)
  }

  // Helper function to get day name (with fallback to calendar service)
  const getDayName = (dateString: string) => {
    // Use calendar service for client-side calculation as fallback
    // In production, this could be enhanced to use the backend calendar API
    return calendarService.getDayNameFromDate(dateString)
  }

  // Helper function to format duration
  const formatDuration = (duration: number) => {
    // Duration is always stored in hours in the Subject model (2 or 3)
    if (!duration || duration === 0) return '—'
    return `${duration} ${duration === 1 ? 'hour' : 'hours'}`
  }

  // Helper function to format time from 24-hour to 12-hour format
  const formatTimeTo12Hour = (time: string) => {
    if (!time) return ''
    return formatTime(time)
  }

  // Helper function to calculate end time based on start time and duration
  const calculateTimeRange = (timeSlot: any, duration: number) => {
    // If timeSlot is a string, return as is
    if (typeof timeSlot === 'string') {
      return timeSlot
    }

    // If timeSlot is an object with start and end, calculate end time based on duration
    if (timeSlot && typeof timeSlot === 'object' && timeSlot.start) {
      const startTime = timeSlot.start

      // Parse start time (format: HH:MM)
      const [hours, minutes] = startTime.split(':').map(Number)

      // Calculate end time by adding duration hours
      const endHours = hours + duration
      const endMinutes = minutes

      // Format end time
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`

      // Return formatted times in 12-hour format
      return `${formatTimeTo12Hour(startTime)} – ${formatTimeTo12Hour(endTime)}`
    }

    return null
  }

  const answerSheetLabels: Record<string, string> = {
    '32_pages': '32 pages',
    '20_pages': '20 pages',
    '40_graph': '40 pages (graph)',
  }

  const formatAnswerSheet = (answerSheet: string) => {
    const label = answerSheetLabels[answerSheet]
    return label ? label : <span className="cb-muted">Not specified</span>
  }

  const tabItems = useMemo(
    () => [
      { id: 'all', label: 'Full datesheet' },
      { id: 'centre', label: 'Centre datesheet' },
      { id: 'centre10th', label: 'Class 10' },
      { id: 'centre12th', label: 'Class 12' },
    ],
    []
  )

  const cardCopy: Record<DateSheetTabId, { title: string; subtitle: string }> = {
    all: { title: 'Full datesheet', subtitle: 'Every subject in the CBSE datesheet' },
    centre: { title: 'Centre datesheet', subtitle: 'Subjects your candidates appear for, with rooms needed' },
    centre10th: { title: 'Class 10', subtitle: 'Centre datesheet for Class 10 candidates' },
    centre12th: { title: 'Class 12', subtitle: 'Centre datesheet for Class 12 candidates' },
  }

  const isCentreTab = activeTab === 'centre' || activeTab === 'centre10th' || activeTab === 'centre12th'
  const isTableLoading =
    loading || (activeTab === 'all' && cbseLoading) || (isCentreTab && centreLoading)

  // Today's date and the next exam date are flagged on the centre tabs.
  const todayStr = new Date().toDateString()
  let centreNextExamDateStr: string | null = null
  if (isCentreTab) {
    const futureDates = visibleTableRows
      .map((r: any) => (r.examDate ? new Date(r.examDate) : null))
      .filter(
        (d: Date | null): d is Date =>
          d !== null && d.toDateString() !== todayStr && d >= new Date(new Date().toDateString())
      )
    if (futureDates.length > 0) {
      const minDate = futureDates.reduce((a: Date, b: Date) => (a < b ? a : b))
      centreNextExamDateStr = minDate.toDateString()
    }
  }

  // Sr no counts exam days: rows on the same date share a number.
  const displayRows: any[] = []
  {
    const seenDates = new Set<string>()
    const srNoByDate = new Map<string, number>()
    visibleTableRows.forEach((row: any, index: number) => {
      const dateStr: string | null = row.examDate ? new Date(row.examDate).toDateString() : null
      let srNo: number
      if (dateStr && srNoByDate.has(dateStr)) {
        srNo = srNoByDate.get(dateStr) as number
      } else {
        srNo = seenDates.size + 1
        if (dateStr) {
          srNoByDate.set(dateStr, srNo)
          seenDates.add(dateStr)
        }
      }
      displayRows.push({ ...row, _key: `${row.datesheetId}-${index}`, _srNo: srNo, _dateStr: dateStr })
    })
  }

  const columns: DataTableColumn<any>[] = [
    {
      key: 'srNo',
      header: 'Sr no',
      numeric: true,
      width: 64,
      mobile: 'hidden',
      render: (row) => <span className="cb-muted">{String(row._srNo).padStart(2, '0')}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      headerLabel: 'Date',
      sortable: activeTab === 'all',
      mobile: 'subtitle',
      render: (row) => (
        <span className="cx-ds-date">
          {formatDate(row.examDate)}
          {isCentreTab && row._dateStr === todayStr ? <Badge tone="success">Today</Badge> : null}
          {isCentreTab && centreNextExamDateStr && row._dateStr === centreNextExamDateStr ? (
            <Badge tone="warning">Next</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'day',
      header: 'Day',
      mobile: 'hidden',
      render: (row) =>
        row.examDate ? (row.dayName && row.dayName !== 'Unknown' ? row.dayName : getDayName(row.examDate)) : '—',
    },
    {
      key: 'class',
      header: 'Class',
      headerLabel: 'Class',
      sortable: activeTab === 'all',
      mobile: 'aside',
      render: (row) => (
        <Badge tone="neutral" dot={false}>
          {row.class}
        </Badge>
      ),
    },
    {
      key: 'subjectCode',
      header: 'Code',
      headerLabel: 'Code',
      sortable: activeTab === 'all',
      render: (row) => orDash(row.subjectCode),
    },
    {
      key: 'subjectName',
      header: 'Subject',
      headerLabel: 'Subject',
      sortable: activeTab === 'all',
      mobile: 'title',
      wrap: true,
      render: (row) => (
        <Entity primary={row.subjectName} secondary={calculateTimeRange(row.timeSlot, row.duration) || undefined} />
      ),
    },
    {
      key: 'answerSheet',
      header: 'Answer sheet',
      mobile: 'hidden',
      render: (row) => formatAnswerSheet(row.answerSheet || 'none'),
    },
    {
      key: 'duration',
      header: 'Duration',
      headerLabel: 'Duration',
      sortable: activeTab === 'all',
      render: (row) => formatDuration(row.duration),
    },
    ...(isCentreTab
      ? ([
          {
            key: 'candidateCount',
            header: 'Candidates',
            numeric: true,
            align: 'right',
            render: (row: any) => row.candidateCount || 0,
          },
          {
            key: 'roomsNeeded',
            header: 'Rooms',
            numeric: true,
            align: 'right',
            render: (row: any) => (row.roomsNeeded === 0 ? <span className="cb-muted">Shared</span> : row.roomsNeeded),
          },
        ] as DataTableColumn<any>[])
      : []),
  ]

  const showPagination =
    !loading && !cbseLoading && !centreLoading && !normalizedSearchTerm && pagination.pages > 1

  const paginationFooter = showPagination ? (
    <Pagination
      page={pagination.page}
      pages={pagination.pages}
      total={pagination.total}
      limit={pagination.limit}
      onPageChange={handlePageChange}
    />
  ) : undefined

  const emptyTitle = normalizedSearchTerm ? 'No matching datesheet entries' : 'No exam schedule yet'
  const emptyBody = normalizedSearchTerm
    ? `No subject name or code matches "${searchTerm.trim()}".`
    : activeTab === 'all'
      ? 'No exam dates are available. Import the CBSE full datesheet PDF to see exam dates, or add subjects.'
      : activeTab === 'centre'
        ? 'The centre datesheet is built from candidates’ subject choices. Import candidates to generate it.'
        : `No exam schedule found for Class ${activeTab === 'centre10th' ? '10' : '12'} at this centre.`

  const downloadCentrePdfLink = () => {
    if (!centrePdfPreviewUrl) return
    const link = document.createElement('a')
    link.href = centrePdfPreviewUrl
    link.download = getCentreDatesheetPdfFilename()
    link.click()
  }

  return (
    <Page>
      <section className="cb-stats" aria-label="Datesheet totals">
        <StatCard
          label="Full datesheet"
          value={stats.fullDatesheetDays}
          unit="days"
          hint={`${stats.fullDatesheet} subjects`}
        />
        <StatCard label="Centre datesheet" value={stats.centreDays} unit="days" hint={`${stats.centre} subjects`} />
        <StatCard
          label="Class 10 at centre"
          value={stats.centre10thDays}
          unit="days"
          hint={`${stats.centre10thCandidates} candidates`}
        />
        <StatCard
          label="Class 12 at centre"
          value={stats.centre12thDays}
          unit="days"
          hint={`${stats.centre12thCandidates} candidates`}
        />
      </section>

      {activeTab === 'all' && cbseDatesheet.length === 0 && subjects.length > 0 && (
        <Banner tone="info" title="Showing subjects without exam dates">
          Import the CBSE full datesheet PDF to add exam dates and days. Dates are read from the PDF and filled in for
          each subject.
        </Banner>
      )}

      <Tabs
        label="Datesheet views"
        items={tabItems}
        value={activeTab}
        onChange={(id) => handleTabChange(id as DateSheetTabId)}
      />

      <Card flush title={cardCopy[activeTab].title} subtitle={cardCopy[activeTab].subtitle}>
        <CardToolbar>
          <FilterBar
            search={{
              placeholder: 'Search subject name or code',
              label: 'Search datesheet',
              value: searchTerm,
              onChange: (value) => {
                setSearchTerm(value)
                setPage(1)
              },
            }}
            actions={
              activeTab === 'centre' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={Download}
                  onClick={downloadCentreDatesheetPDF}
                  loading={isDownloadingCentrePDF}
                >
                  Download PDF
                </Button>
              ) : undefined
            }
          />
        </CardToolbar>
        <DataTable
          caption={cardCopy[activeTab].title}
          columns={columns}
          rows={isTableLoading ? [] : displayRows}
          getRowKey={(row) => row._key}
          loading={isTableLoading}
          loadingLabel="Loading datesheet…"
          sort={activeTab === 'all' && sortField ? { key: sortField, direction: sortOrder } : null}
          onSort={
            activeTab === 'all'
              ? (key) => handleSort(key as 'date' | 'class' | 'subjectName' | 'subjectCode' | 'duration')
              : undefined
          }
          footer={paginationFooter}
          empty={<EmptyState icon={CalendarDays} title={emptyTitle} body={emptyBody} />}
        />
      </Card>

      <Sheet
        open={centrePdfPreviewOpen && Boolean(centrePdfPreviewUrl || isDownloadingCentrePDF || centrePdfPreviewError)}
        onClose={closeCentrePdfPreview}
        size="xl"
        icon={FileText}
        title="Centre datesheet PDF"
        description="Date-wise schedule with candidates, rooms and invigilators"
        footer={
          <>
            <Button onClick={closeCentrePdfPreview}>Close</Button>
            {centrePdfPreviewUrl ? (
              <>
                <Button
                  icon={ExternalLink}
                  onClick={() => window.open(centrePdfPreviewUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open in new tab
                </Button>
                <Button variant="primary" icon={Download} onClick={downloadCentrePdfLink}>
                  Download PDF
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {isDownloadingCentrePDF ? (
          <CardLoading label="Generating preview…" />
        ) : centrePdfPreviewError ? (
          <EmptyState icon={FileWarning} title="The preview couldn’t be generated" body={centrePdfPreviewError} />
        ) : centrePdfPreviewUrl ? (
          <PdfFrame src={centrePdfPreviewUrl} title="Centre datesheet PDF preview" />
        ) : null}
      </Sheet>

      {/* Import Modal */}
      {showImportModal && (
        <DatesheetImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          importing={importMutation.isPending}
          errorMessage={importErrorMsg}
          errorSample={importErrorSample}
          debug={importDebug}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateDatesheetModal
          isOpen={showCreateModal}
          onClose={() => { setShowCreateModal(false); setEditing(false); setEditingData(null) }}
          onCreate={handleCreate}
          creating={createMutation.isPending}
          initialData={editingData ? {
            title: editingData.title,
            examType: editingData.examType,
            class: editingData.class,
            academicYear: editingData.academicYear,
            startDate: editingData.startDate?.slice(0, 10),
            endDate: editingData.endDate?.slice(0, 10),
            generalInstructions: editingData.generalInstructions || []
          } : undefined}
          titleText={editing ? 'Edit Date Sheet' : 'Create Date Sheet'}
          submitText={editing ? 'Update Date Sheet' : 'Create Date Sheet'}
        />
      )}

      {/* Schedule Modal */}
      {showScheduleModal && editingData && (
        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          initialRows={(editingData.subjects || []).map((s: any) => ({
            subject: s.subject?._id || s.subject,
            examDate: s.examDate?.slice(0, 10),
            start: s.timeSlot?.start,
            end: s.timeSlot?.end,
            duration: s.duration || 180,
            instructions: s.instructions,
            isOptional: s.isOptional,
          }))}
          onSave={async (rows: ScheduleRow[]) => {
            updateMutation.mutate(
              {
                id: editingData._id,
                data: {
                  subjects: rows.map(r => ({
                    subject: r.subject,
                    examDate: r.examDate,
                    timeSlot: { start: r.start, end: r.end },
                    duration: r.duration,
                    instructions: r.instructions,
                    isOptional: r.isOptional,
                  })),
                },
              },
              {
                onSuccess: () => setShowScheduleModal(false),
              }
            )
          }}
        />
      )}
    </Page>
  )
}

export default DateSheets
