import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarDays, Check, FileSpreadsheet, FileText, FileWarning, Layers, Link2, Paperclip, Pencil, Plus, Trash2, X, Download, ExternalLink } from 'lucide-react'
import type { AnswerSheetEntry, AnswerSheetSerialRange } from '../services/answerSheetService'
import type { CentreDatesheetEntry } from '../services/centreDatesheetService'
import api from '../services/api'
import {
  useAnswerSheets as useAnswerSheetsQuery,
  useCreateAnswerSheetMutation,
  useUploadExcelMutation,
  useUseSheetsMutation,
  useUpdateAnswerSheetMutation,
  useDiscardSheetsMutation,
  useSeries,
  useUpdateSeriesMutation,
} from '../hooks/useAnswerSheets'
import { useCentreDatesheetEntries } from '../hooks/useSeatingPlan'
import { useAttendanceAbsentees } from '../hooks/useAttendance'
import {
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  Tabs,
  TextField,
  type DataTableColumn,
  PdfFrame,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'
import '@/components/exmcl/centre-answersheets.css'
import {
  createEmptySerialRange,
  getAnswerSheetSerialRanges,
  validateSerialRangeInputs,
} from '../utils/answerSheetSerialRanges'

const DEFAULT_SEQUENCE_ORDER = 999

const ANSWER_SHEET_SEQUENCE: Record<string, number> = {
  'Main-20-10': 1,
  'Main-32-10': 2,
  'Graph-40-10': 3,
  'Main-20-12': 4,
  'Main-32-12': 5,
  'Graph-40-12': 6,
  'Supplementary-16-10': 7,
  'Supplementary-16-12': 8,
  'For Blind-32-10': 9,
  'For Blind-32-12': 10,
  'Drawing Sheets-21-12': 11
}

const normalizeClassLevel = (value?: string) => String(value ?? '').replace(/\D/g, '')

const getAnswerSheetSequenceOrder = (
  entry: Pick<AnswerSheetEntry, 'answerSheetType' | 'pages' | 'class' | 'sortOrder'>
) => {
  const key = `${entry.answerSheetType}-${entry.pages}-${normalizeClassLevel(entry.class)}`
  return ANSWER_SHEET_SEQUENCE[key] ?? entry.sortOrder ?? DEFAULT_SEQUENCE_ORDER
}

const sortByAnswerSheetSequence = (a: AnswerSheetEntry, b: AnswerSheetEntry) => {
  const orderDiff = getAnswerSheetSequenceOrder(a) - getAnswerSheetSequenceOrder(b)
  if (orderDiff !== 0) return orderDiff

  const receivedDateDiff =
    new Date(b.receivedDate || 0).getTime() - new Date(a.receivedDate || 0).getTime()
  if (receivedDateDiff !== 0) return receivedDateDiff

  return (a.sortOrder ?? DEFAULT_SEQUENCE_ORDER) - (b.sortOrder ?? DEFAULT_SEQUENCE_ORDER)
}

const getEntryEditingKey = (entry: AnswerSheetEntry) => {
  if (entry._id) return entry._id
  return `${entry.answerSheetType}-${entry.pages}-${entry.colour}-${entry.class}-${entry.sortOrder ?? 'template'}`
}

const isSupplementaryEntry = (answerSheetType?: string) => answerSheetType === 'Supplementary'

const normalizeUsageDateKey = (examDate?: string) => {
  if (!examDate) return ''
  const date = new Date(examDate)
  return Number.isNaN(date.getTime()) ? '' : date.toDateString()
}

const buildSupplementaryUsageSubjectKey = (
  examDate?: string,
  subjectCode?: string,
  classLevel?: string | number
) => {
  const dateKey = normalizeUsageDateKey(examDate)
  const normalizedSubjectCode = String(subjectCode || '').trim().toUpperCase()
  const normalizedClass = String(classLevel ?? '').trim()
  if (!dateKey || !normalizedSubjectCode || !normalizedClass) return ''
  return `${dateKey}::${normalizedClass}::${normalizedSubjectCode}`
}

const buildSerialRangePayload = (
  answerSheetType: string,
  ranges: Array<{ serialFrom: string; serialTo: string }>
): { serialRanges?: AnswerSheetSerialRange[]; serialFrom?: string; serialTo?: string; error?: string } => {
  const validation = validateSerialRangeInputs(ranges, {
    allowMultiple: isSupplementaryEntry(answerSheetType),
  })

  if (!validation.serialRanges) {
    return { error: validation.error || 'Please enter valid serial numbers' }
  }

  const serialRanges = validation.serialRanges

  return {
    serialRanges,
    serialFrom: serialRanges[0]?.serialFrom,
    serialTo: serialRanges[serialRanges.length - 1]?.serialTo,
  }
}

const AnswerSheets: React.FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'received' | 'used' | 'balance' | 'discarded'>('received')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ serialRanges: AnswerSheetSerialRange[] }>({
    serialRanges: [createEmptySerialRange()],
  })
  const [linkingEntry, setLinkingEntry] = useState<{ id: string; quantity: number } | null>(null)
  const [selectedDatesheetEntry, setSelectedDatesheetEntry] = useState<string>('')
  const [editingUsedEntry, setEditingUsedEntry] = useState<string | null>(null)
  const [editUsedValue, setEditUsedValue] = useState<string>('')
  const [formData, setFormData] = useState({
    answerSheetType: '',
    pages: '',
    colour: '',
    class: '',
    serialRanges: [createEmptySerialRange()],
    exam: '',
    subject: ''
  })
  const [selectedClass, setSelectedClass] = useState<string | number>('')
  const [consolidatedPreviewUrl, setConsolidatedPreviewUrl] = useState<string | null>(null)
  const [showConsolidatedPreview, setShowConsolidatedPreview] = useState(false)
  const [consolidatedPreviewLoading, setConsolidatedPreviewLoading] = useState(false)
  const [consolidatedPreviewError, setConsolidatedPreviewError] = useState<string | null>(null)
  const [consolidatedPreviewEntry, setConsolidatedPreviewEntry] = useState<AnswerSheetEntry | null>(null)

  const { data: entries = [], isLoading: loadingList, isFetching, error: listError } = useAnswerSheetsQuery(
    { class: selectedClass || undefined }
  )
  const { data: centreDatesheetEntries = [] } = useCentreDatesheetEntries()
  const { data: absenteeRecords = [] } = useAttendanceAbsentees()
  const { data: savedSeries } = useSeries()
  const createMutation = useCreateAnswerSheetMutation()
  const uploadMutation = useUploadExcelMutation()
  const useSheetsMutation = useUseSheetsMutation()
  const updateMutation = useUpdateAnswerSheetMutation()
  const discardMutation = useDiscardSheetsMutation()
  const updateSeriesMutation = useUpdateSeriesMutation()

  const [seriesInput, setSeriesInput] = useState<string>('')
  const [seriesInitialized, setSeriesInitialized] = useState(false)

  // Sync saved series from server into input state (once on load)
  useEffect(() => {
    if (!seriesInitialized && savedSeries !== undefined) {
      setSeriesInput(savedSeries || '')
      setSeriesInitialized(true)
    }
  }, [savedSeries, seriesInitialized])

  const getDiscardedCount = (entry: AnswerSheetEntry) =>
    Math.max(Number(entry.discarded || 0), Number(entry.discardedSerials?.length || 0))

  const loading =
    loadingList ||
    isFetching ||
    createMutation.isPending ||
    uploadMutation.isPending ||
    useSheetsMutation.isPending ||
    updateMutation.isPending ||
    discardMutation.isPending
  const error = listError?.message ?? null

  const classOptions = [
    { value: '', label: 'All classes' },
    { value: '10', label: 'Class 10' },
    { value: '12', label: 'Class 12' }
  ]

  // Format time from 24-hour (HH:MM) to 12-hour format with AM/PM
  const formatTime = (time: string) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const getConsolidatedRecordFilename = (entry: AnswerSheetEntry) => {
    const type = String(entry.answerSheetType || 'answer-sheet')
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase()
    const classLabel = String(entry.class || '')
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase()
    const colour = String(entry.colour || '')
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase()
    return `answer-sheet-consolidated-record-${type}-${classLabel}-${colour}.pdf`
  }

  const closeConsolidatedPreview = () => {
    setShowConsolidatedPreview(false)
    setConsolidatedPreviewEntry(null)
    setConsolidatedPreviewError(null)
    setConsolidatedPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      return null
    })
  }

  const openConsolidatedPreview = async (entry: AnswerSheetEntry) => {
    if (!entry._id || entry.isTemplate) return

    setConsolidatedPreviewEntry(entry)
    setConsolidatedPreviewError(null)
    setConsolidatedPreviewLoading(true)
    setShowConsolidatedPreview(true)
    setConsolidatedPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      return null
    })

    try {
      const response = await api.get<Blob>(
        `/answersheets/${entry._id}/consolidated-record/download`,
        { responseType: 'blob' }
      )
      const blob = response.data
      const contentType = String(response.headers['content-type'] || '')

      if (typeof blob === 'object' && blob !== null && contentType.toLowerCase().includes('application/pdf')) {
        const objectUrl = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
        setConsolidatedPreviewUrl(objectUrl)
      } else {
        const text = await (blob instanceof Blob ? blob.text() : Promise.resolve(String(blob)))
        let message = 'Failed to generate preview'

        try {
          const json = JSON.parse(text)
          if (typeof json?.error === 'string') {
            message = json.error
          }
        } catch (_) {
          // Ignore invalid JSON response bodies here.
        }

        setConsolidatedPreviewError(message)
      }
    } catch (error: any) {
      console.error('Failed to load consolidated answer-sheet preview:', error)
      if (error?.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text()
          const json = JSON.parse(text)
          if (typeof json?.error === 'string') {
            setConsolidatedPreviewError(json.error)
            return
          }
        } catch (_) {
          // Ignore invalid JSON response bodies here.
        }
      }

      setConsolidatedPreviewError(
        error?.serverMessage ?? error?.message ?? 'Failed to load consolidated answer-sheet preview'
      )
    } finally {
      setConsolidatedPreviewLoading(false)
    }
  }

  // Download Excel template (commented out - not currently used in UI)
  // const downloadTemplate = async () => {
  //   try {
  //     setLoading(true)
  //     const blob = await answerSheetService.downloadTemplate()

  //     // Generate filename with timestamp
  //     const now = new Date()
  //     const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-')
  //     const filename = `Answer_Sheets_Template_${timestamp}.xlsx`

  //     // Create download link
  //     const url = window.URL.createObjectURL(blob)
  //     const link = document.createElement('a')
  //     link.href = url
  //     link.download = filename
  //     document.body.appendChild(link)
  //     link.click()
  //     document.body.removeChild(link)
  //     window.URL.revokeObjectURL(url)

  //     alert(`Template downloaded as "${filename}".\n\nPlease:\n1. Open the file in Excel\n2. Fill in the "From" and "To" serial numbers\n3. Save the file\n4. Upload it back here`)
  //   } catch (err: any) {
  //     console.error('Error downloading template:', err)
  //     alert(err.response?.data?.error || 'Failed to download template')
  //   } finally {
  //     setLoading(false)
  //   }
  // }

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setUploadFile(file)
    }
  }

  // Upload Excel file
  const handleUploadExcel = async () => {
    if (!uploadFile) {
      alert('Please select a file to upload')
      return
    }

    try {
      const response = await uploadMutation.mutateAsync(uploadFile)
      if (response?.success && response?.data) {
        let message = `Successfully added ${response.data.created} answer sheet entries!`
        if (response.data.skipped > 0) {
          message += `\n\nSkipped ${response.data.skipped} entries with no serial numbers (not received at centre).`
        }
        if (response.data.failed > 0) {
          message += `\n\n${response.data.failed} entries failed to import.`
        }
        alert(message)
        setShowUploadModal(false)
        setUploadFile(null)
      }
    } catch (err: any) {
      console.error('Error uploading Excel:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to upload Excel file')
    }
  }

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  // Calculate totals
  const totals = entries.reduce((acc, entry) => {
    acc.received += entry.total
    acc.used += entry.used
    acc.discarded += getDiscardedCount(entry)
    return acc
  }, { received: 0, used: 0, discarded: 0 })

  const balance = totals.received - totals.used - totals.discarded

  const supplementaryUsageCounts = React.useMemo(() => {
    const byEntryId = new Map<string, number>()
    const bySubjectKey = new Map<string, number>()

    entries.forEach((entry) => {
      if (entry.answerSheetType !== 'Supplementary') return
      const usages = entry.supplementaryUsages
      if (!Array.isArray(usages) || usages.length === 0) return

      usages.forEach((usage) => {
        const usageEntry = usage as {
          centreDatesheetEntryId?: string
          centreDatesheetEntry?: string
          examDate?: string
          subjectCode?: string
          serials?: string[]
        }
        const increment = Array.isArray(usage.serials) && usage.serials.length > 0 ? usage.serials.length : 1

        const entryId = String(usageEntry.centreDatesheetEntryId || usageEntry.centreDatesheetEntry || '').trim()
        if (entryId) {
          byEntryId.set(entryId, (byEntryId.get(entryId) ?? 0) + increment)
        }

        // Legacy fallback for old rows that may not have centreDatesheetEntryId in list payload.
        const subjectKey = buildSupplementaryUsageSubjectKey(usageEntry.examDate, usageEntry.subjectCode, entry.class)
        if (subjectKey) {
          bySubjectKey.set(subjectKey, (bySubjectKey.get(subjectKey) ?? 0) + increment)
        }
      })
    })

    return { byEntryId, bySubjectKey }
  }, [entries])

  const absenteesByDateAndSubject = React.useMemo(() => {
    const map = new Map<string, number>()

    absenteeRecords.forEach((record) => {
      if (!record.examDate || !record.subjectCode) return
      const dateKey = new Date(record.examDate).toDateString()
      const key = `${dateKey}|${record.subjectCode}`
      map.set(key, (map.get(key) ?? 0) + 1)
    })

    return map
  }, [absenteeRecords])

  const updateFormSerialRange = (index: number, field: 'serialFrom' | 'serialTo', value: string) => {
    setFormData((current) => ({
      ...current,
      serialRanges: current.serialRanges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range
      ),
    }))
  }

  const addFormSerialRange = () => {
    setFormData((current) => ({
      ...current,
      serialRanges: [...current.serialRanges, createEmptySerialRange()],
    }))
  }

  const removeFormSerialRange = (index: number) => {
    setFormData((current) => ({
      ...current,
      serialRanges: current.serialRanges.length === 1
        ? [createEmptySerialRange()]
        : current.serialRanges.filter((_, rangeIndex) => rangeIndex !== index),
    }))
  }

  const updateEditSerialRange = (index: number, field: 'serialFrom' | 'serialTo', value: string) => {
    setEditValues((current) => ({
      serialRanges: current.serialRanges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range
      ),
    }))
  }

  const addEditSerialRange = () => {
    setEditValues((current) => ({
      serialRanges: [...current.serialRanges, createEmptySerialRange()],
    }))
  }

  const removeEditSerialRange = (index: number) => {
    setEditValues((current) => ({
      serialRanges: current.serialRanges.length === 1
        ? [createEmptySerialRange()]
        : current.serialRanges.filter((_, rangeIndex) => rangeIndex !== index),
    }))
  }

  const handleAddQuantity = async () => {
    if (!formData.answerSheetType || !formData.pages || !formData.colour || !formData.class) {
      alert('Please fill all required fields')
      return
    }

    const serialPayload = buildSerialRangePayload(formData.answerSheetType, formData.serialRanges)
    if (serialPayload.error || !serialPayload.serialRanges || !serialPayload.serialFrom || !serialPayload.serialTo) {
      alert(serialPayload.error || 'Please enter valid serial numbers')
      return
    }

    try {
      await createMutation.mutateAsync({
        answerSheetType: formData.answerSheetType,
        pages: parseInt(formData.pages),
        colour: formData.colour,
        class: formData.class,
        serialRanges: serialPayload.serialRanges,
        serialFrom: serialPayload.serialFrom,
        serialTo: serialPayload.serialTo,
        exam: formData.exam,
        subject: formData.subject,
        used: 0,
        discarded: 0
      })
      setFormData({
        answerSheetType: '',
        pages: '',
        colour: '',
        class: '',
        serialRanges: [createEmptySerialRange()],
        exam: '',
        subject: ''
      })
      setShowAddModal(false)
    } catch (err: any) {
      console.error('Error adding answer sheet:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to add answer sheet')
    }
  }



  const handleSaveSeries = () => {
    updateSeriesMutation.mutate(seriesInput, {
      onError: (err: any) => {
        alert(err?.response?.data?.error || err?.message || 'Failed to save series')
      }
    })
  }

  const handleUseSheets = async (id: string, quantity: number) => {
    // Show link modal if centre datesheet entries are available
    if (centreDatesheetEntries.length > 0) {
      setLinkingEntry({ id, quantity })
      setShowLinkModal(true)
    } else {
      try {
        await useSheetsMutation.mutateAsync({ id, quantity })
      } catch (err: any) {
        console.error('Error using sheets:', err)
        alert(err.response?.data?.error || err?.message || 'Failed to mark sheets as used')
      }
    }
  }

  const handleConfirmUseSheets = async () => {
    if (!linkingEntry) return

    try {
      const datesheetEntry = centreDatesheetEntries.find(e => e._id === selectedDatesheetEntry)
      const linkData = datesheetEntry ? {
        centreDatesheetEntryId: datesheetEntry._id,
        examDate: datesheetEntry.examDate,
        subjectCode: datesheetEntry.subjectCode,
        subjectName: datesheetEntry.subjectName,
        candidateCount: datesheetEntry.candidateCount
      } : undefined

      await useSheetsMutation.mutateAsync({
        id: linkingEntry.id,
        quantity: linkingEntry.quantity,
        linkData
      })
      setShowLinkModal(false)
      setLinkingEntry(null)
      setSelectedDatesheetEntry('')
    } catch (err: any) {
      console.error('Error using sheets:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to mark sheets as used')
    }
  }

  const handleSaveUsed = async (datesheetEntry: CentreDatesheetEntry) => {
    let newValue = parseInt(editUsedValue)

    if (isNaN(newValue) || newValue < 0) {
      alert('Please enter a valid number')
      return
    }

    const maxAllowed = datesheetEntry.candidateCount ?? 0
    if (maxAllowed > 0 && newValue > maxAllowed) {
      newValue = maxAllowed
      alert(`Used quantity cannot exceed the number of candidates (${maxAllowed}). Value capped to ${maxAllowed}.`)
    }

    try {
      const existingSheets = entries.filter(e =>
        e.linkedExamDate &&
        new Date(e.linkedExamDate).toDateString() === new Date(datesheetEntry.examDate).toDateString() &&
        e.linkedSubjectCode === datesheetEntry.subjectCode
      )

      const currentTotal = existingSheets.reduce((sum, e) => sum + e.used, 0)
      const difference = newValue - currentTotal

      if (difference === 0) {
        setEditingUsedEntry(null)
        setEditUsedValue('')
        return
      }

      const answerSheetType = datesheetEntry.answerSheetType
      const targetSheet = entries.find(e => {
        const bal = e.total - e.used - e.discarded
        return bal > 0 &&
          e.class === datesheetEntry.class &&
          matchesAnswerSheetType(e.answerSheetType, answerSheetType)
      })

      if (!targetSheet) {
        alert(`No available answer sheets found for ${formatAnswerSheetType(answerSheetType)} in Class ${datesheetEntry.class}`)
        return
      }

      const balance = targetSheet.total - targetSheet.used - targetSheet.discarded

      if (difference > 0) {
        if (difference > balance) {
          alert(`Not enough answer sheets available. Only ${balance} sheets remaining.`)
          return
        }

        await useSheetsMutation.mutateAsync({
          id: targetSheet._id!,
          quantity: difference,
          linkData: {
            centreDatesheetEntryId: datesheetEntry._id,
            examDate: datesheetEntry.examDate,
            subjectCode: datesheetEntry.subjectCode,
            subjectName: datesheetEntry.subjectName,
            candidateCount: datesheetEntry.candidateCount
          }
        })
      } else {
        const sorted = [...existingSheets].sort((a, b) =>
          new Date(b.receivedDate || 0).getTime() - new Date(a.receivedDate || 0).getTime()
        )
        const mostRecentSheet = sorted[0]

        if (mostRecentSheet?._id) {
          const decreaseAmount = Math.abs(difference)
          const newUsed = Math.max(0, mostRecentSheet.used - decreaseAmount)
          await updateMutation.mutateAsync({ id: mostRecentSheet._id, data: { used: newUsed } })
        }
      }

      setEditingUsedEntry(null)
      setEditUsedValue('')
    } catch (err: any) {
      console.error('Error updating used sheets:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to update used sheets')
    }
  }

  // Helper function to match answer sheet types
  const matchesAnswerSheetType = (sheetType: string, requiredType: string) => {
    // Map answer sheet types to their database equivalents
    const typeMap: Record<string, string[]> = {
      '32_pages': ['Main'],
      '20_pages': ['Main'],
      '40_graph': ['Graph'],
      'none': ['Main', 'Graph', 'Supplementary']
    }

    const acceptableTypes = typeMap[requiredType] || []
    return acceptableTypes.includes(sheetType)
  }

  const handleDiscardSheets = async (id: string, quantity: number) => {
    try {
      await discardMutation.mutateAsync({ id, quantity })
    } catch (err: any) {
      console.error('Error discarding sheets:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to discard sheets')
    }
  }

  // Delete entry (commented out - not currently used in UI)
  // const handleDeleteEntry = async (id: string) => {
  //   if (!confirm('Are you sure you want to delete this entry?')) {
  //     return
  //   }

  //   try {
  //     setLoading(true)
  //     await answerSheetService.deleteAnswerSheet(id)
  //     await fetchAnswerSheets()
  //   } catch (err: any) {
  //     console.error('Error deleting entry:', err)
  //     alert(err.response?.data?.error || 'Failed to delete entry')
  //   } finally {
  //     setLoading(false)
  //   }
  // }

  const handleEditClick = (entry: AnswerSheetEntry) => {
    const key = getEntryEditingKey(entry)
    setEditingEntry(key)
    setEditValues({ serialRanges: getAnswerSheetSerialRanges(entry) })
  }

  const handleCancelEdit = () => {
    setEditingEntry(null)
    setEditValues({ serialRanges: [createEmptySerialRange()] })
  }

  const handleSaveEdit = async (entry: AnswerSheetEntry) => {
    try {
      const serialPayload = buildSerialRangePayload(entry.answerSheetType, editValues.serialRanges)
      if (serialPayload.error || !serialPayload.serialRanges || !serialPayload.serialFrom || !serialPayload.serialTo) {
        alert(serialPayload.error || 'Please enter valid serial numbers')
        return
      }

      if (entry._id && !entry.isTemplate) {
        await updateMutation.mutateAsync({
          id: entry._id,
          data: {
            serialRanges: serialPayload.serialRanges,
            serialFrom: serialPayload.serialFrom,
            serialTo: serialPayload.serialTo,
          }
        })
      } else {
        const sequenceOrder = getAnswerSheetSequenceOrder(entry)
        await createMutation.mutateAsync({
          answerSheetType: entry.answerSheetType,
          pages: entry.pages,
          colour: entry.colour,
          class: entry.class,
          suffix: entry.suffix,
          sortOrder: sequenceOrder,
          serialRanges: serialPayload.serialRanges,
          serialFrom: serialPayload.serialFrom,
          serialTo: serialPayload.serialTo,
          used: 0,
          discarded: 0
        })
      }

      setEditingEntry(null)
      setEditValues({ serialRanges: [createEmptySerialRange()] })
    } catch (err: any) {
      console.error('Error saving entry:', err)
      alert(err.response?.data?.error || err?.message || 'Failed to save entry')
    }
  }

  const classFilter = (e: { class?: string }) =>
    !selectedClass || String(e.class) === String(selectedClass)

  const getDisplaySequenceNo = (entry: AnswerSheetEntry, index: number) => {
    const sequenceOrder = getAnswerSheetSequenceOrder(entry)
    if (sequenceOrder !== DEFAULT_SEQUENCE_ORDER) {
      return sequenceOrder
    }
    return entry.sortOrder || index + 1
  }

  const getFilteredEntries = () => {
    const byClass = entries.filter(classFilter).sort(sortByAnswerSheetSequence)
    switch (activeTab) {
      case 'received':
        return byClass
      case 'used':
        return []
      case 'discarded':
        return byClass.filter(e => getDiscardedCount(e) > 0)
      default:
        return byClass
    }
  }

  const balanceRows = React.useMemo(() => {
    const byClass = entries.filter(classFilter)
    type BalanceGroup = {
      answerSheetType: string
      classLabel: string
      received: number
      used: number
      discarded: number
    }

    const groups = new Map<string, BalanceGroup>()

    byClass.forEach((entry) => {
      const classLabel = String(entry.class || '').trim()
      const key = `${entry.answerSheetType}|${classLabel}`
      const existing = groups.get(key) ?? {
        answerSheetType: entry.answerSheetType,
        classLabel,
        received: 0,
        used: 0,
        discarded: 0,
      }

      existing.received += entry.total || 0
      existing.used += entry.used || 0
      existing.discarded += getDiscardedCount(entry)

      groups.set(key, existing)
    })

    const rows = Array.from(groups.values())
      .map((group, index) => {
        const balanceValue = group.received - group.used - group.discarded
        return {
          srNo: index + 1,
          answerSheetType: group.answerSheetType,
          classLabel: group.classLabel,
          received: group.received,
          used: group.used,
          discarded: group.discarded,
          balance: balanceValue,
        }
      })
      .filter((row) => row.balance > 0)
      .sort((a, b) => {
        const classDiff = String(a.classLabel).localeCompare(String(b.classLabel))
        if (classDiff !== 0) return classDiff
        return a.answerSheetType.localeCompare(b.answerSheetType)
      })

    return rows
  }, [entries, selectedClass])

  const getDiscardedRows = () => {
    const byClass = entries.filter(classFilter).sort(sortByAnswerSheetSequence)
    const rows: Array<{
      key: string
      serialNo: string
      date: string
      subject: string
      code: string
      roomNo: string
      reason: string
      entry: AnswerSheetEntry
    }> = []

    byClass.forEach((entry) => {
      const discardedSerials = entry.discardedSerials || []
      const linkedRoomNo = (entry as AnswerSheetEntry & { linkedRoomNo?: string | number }).linkedRoomNo

      discardedSerials.forEach((item, index) => {
        rows.push({
          key: `${entry._id || getEntryEditingKey(entry)}-${item.serial}-${index}`,
          serialNo: item.serial || '-',
          date: entry.linkedExamDate ? formatShortDate(entry.linkedExamDate) : '-',
          subject: entry.linkedSubjectName || entry.subject || '-',
          code: entry.linkedSubjectCode || '-',
          roomNo: linkedRoomNo ? String(linkedRoomNo) : '-',
          reason: item.reason || 'Damaged/Misprinted',
          entry,
        })
      })

      const remainingDiscarded = Math.max(0, Number(entry.discarded || 0) - discardedSerials.length)
      for (let i = 0; i < remainingDiscarded; i += 1) {
        rows.push({
          key: `${entry._id || getEntryEditingKey(entry)}-count-only-${i}`,
          serialNo: '-',
          date: entry.linkedExamDate ? formatShortDate(entry.linkedExamDate) : '-',
          subject: entry.linkedSubjectName || entry.subject || '-',
          code: entry.linkedSubjectCode || '-',
          roomNo: linkedRoomNo ? String(linkedRoomNo) : '-',
          reason: 'Quantity discard (serial not captured)',
          entry,
        })
      }
    })

    return rows
  }

  // Get centre datesheet entries for Used tab (optionally filtered by class)
  const getUsedTabEntries = () => {
    if (activeTab !== 'used') return []

    let list = [...centreDatesheetEntries]
    if (selectedClass) {
      list = list.filter(e => String(e.class) === String(selectedClass))
    }
    return list.sort((a, b) => {
      const dateDiff = new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
      if (dateDiff !== 0) return dateDiff
      return (b.candidateCount ?? 0) - (a.candidateCount ?? 0)
    })
  }

  // Format answer sheet type for display
  const formatAnswerSheetType = (type: string) => {
    const typeMap: Record<string, string> = {
      '32_pages': 'Main (32 Pages)',
      '20_pages': 'Main (20 Pages)',
      '40_graph': 'Graph (40 Pages)',
      'none': 'Not Specified'
    }
    return typeMap[type] || type
  }

  type TabId = 'received' | 'used' | 'balance' | 'discarded'

  const tabItems: Array<{ id: TabId; label: string; count: number }> = [
    { id: 'received', label: 'Received', count: totals.received },
    { id: 'used', label: 'Used', count: totals.used },
    { id: 'balance', label: 'Balance', count: balance },
    { id: 'discarded', label: 'Discarded', count: totals.discarded },
  ]

  const cardCopy: Record<TabId, { title: string; subtitle: string }> = {
    received: {
      title: 'Received stock',
      subtitle: 'Serial ranges recorded for each sheet type. Open a row to see its full record.',
    },
    used: {
      title: 'Used per exam',
      subtitle: 'Main sheets count one per candidate once the exam day has passed. Upcoming exams can be edited.',
    },
    balance: {
      title: 'Balance in hand',
      subtitle: 'Sheets still in stock, by type and class.',
    },
    discarded: {
      title: 'Discarded sheets',
      subtitle: 'Damaged or misprinted sheets taken out of stock.',
    },
  }

  const dash = (value: string | number | undefined | null) =>
    value === undefined || value === null || value === '' || value === '-' ? '—' : value

  const closeUploadSheet = () => {
    setShowUploadModal(false)
    setUploadFile(null)
  }

  const closeLinkDialog = () => {
    setShowLinkModal(false)
    setLinkingEntry(null)
    setSelectedDatesheetEntry('')
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------- Received ----------
  type ReceivedRow = { entry: AnswerSheetEntry; index: number }
  const receivedRows: ReceivedRow[] =
    activeTab === 'received' ? getFilteredEntries().map((entry, index) => ({ entry, index })) : []

  const renderSerialCell = (entry: AnswerSheetEntry, field: 'serialFrom' | 'serialTo') => {
    const isEditing = editingEntry === getEntryEditingKey(entry)
    if (isEditing) {
      const supplementary = isSupplementaryEntry(entry.answerSheetType)
      const editSerialRanges = editValues.serialRanges
      return (
        <div className="cx-as-serials">
          {editSerialRanges.map((range, rangeIndex) => (
            <div key={`edit-${field}-${rangeIndex}`} className="cx-as-serial-edit">
              <TextField
                size="sm"
                className="cx-as-serial-input"
                aria-label={`${field === 'serialFrom' ? 'From' : 'To'} serial, range ${rangeIndex + 1}`}
                placeholder={`${field === 'serialFrom' ? 'From' : 'To'} ${rangeIndex + 1}`}
                value={range[field]}
                onChange={(e) => updateEditSerialRange(rangeIndex, field, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {field === 'serialTo' && supplementary && editSerialRanges.length > 1 ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  icon={X}
                  aria-label={`Remove range ${rangeIndex + 1}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeEditSerialRange(rangeIndex)
                  }}
                />
              ) : null}
            </div>
          ))}
          {field === 'serialTo' && supplementary ? (
            <div>
              <Button
                variant="tertiary"
                size="sm"
                icon={Plus}
                onClick={(e) => {
                  e.stopPropagation()
                  addEditSerialRange()
                }}
              >
                Add range
              </Button>
            </div>
          ) : null}
        </div>
      )
    }
    return (
      <div className="cx-as-serials">
        {getAnswerSheetSerialRanges(entry).map((range, rangeIndex) => (
          <span
            key={`display-${field}-${range[field]}-${rangeIndex}`}
            className={range[field] ? 'is-num' : 'cb-subtle'}
          >
            {range[field] || '—'}
          </span>
        ))}
      </div>
    )
  }

  const receivedColumns: DataTableColumn<ReceivedRow>[] = [
    {
      key: 'seq',
      header: '#',
      width: 48,
      numeric: true,
      mobile: 'hidden',
      render: ({ entry, index }) => getDisplaySequenceNo(entry, index),
    },
    {
      key: 'type',
      header: 'Answer sheet',
      mobile: 'title',
      render: ({ entry }) => <span className="cb-strong">{entry.answerSheetType}</span>,
    },
    { key: 'pages', header: 'Pages', mobile: 'subtitle', render: ({ entry }) => `${entry.pages} pages` },
    { key: 'colour', header: 'Colour', render: ({ entry }) => dash(entry.colour) },
    { key: 'class', header: 'Class', render: ({ entry }) => dash(entry.class) },
    { key: 'from', header: 'Serial from', render: ({ entry }) => renderSerialCell(entry, 'serialFrom') },
    { key: 'to', header: 'Serial to', render: ({ entry }) => renderSerialCell(entry, 'serialTo') },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: ({ entry }) => <span className="cb-strong">{entry.total || 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: ({ entry }) => {
        const isEditing = editingEntry === getEntryEditingKey(entry)
        if (isEditing) {
          return (
            <div className="cx-as-actions">
              <Button size="sm" onClick={handleCancelEdit} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleSaveEdit(entry)} disabled={loading}>
                Save
              </Button>
            </div>
          )
        }
        const canPreview = Boolean(entry._id && !entry.isTemplate)
        return (
          <Menu
            label={`Actions for ${entry.answerSheetType} ${entry.pages} pages, class ${entry.class}`}
            items={[
              ...(canPreview
                ? [
                    {
                      label: 'Preview consolidated record',
                      icon: FileText,
                      disabled: loading,
                      onSelect: () => openConsolidatedPreview(entry),
                    },
                  ]
                : []),
              { label: 'Edit serial numbers', icon: Pencil, disabled: loading, onSelect: () => handleEditClick(entry) },
            ]}
          />
        )
      },
    },
  ]

  // ---------- Used ----------
  type UsedRow = {
    datesheetEntry: CentreDatesheetEntry
    srNo: number
    candidateCount: number
    isPastOrToday: boolean
    totalUsed: number
    supplementaryUsed: number
    absentCount: number
  }

  const usedRows: UsedRow[] = (() => {
    if (activeTab !== 'used') return []
    const srNoByDate = new Map<string, number>()
    let srCounter = 0

    return getUsedTabEntries().map((datesheetEntry, index) => {
      const candidateCount = datesheetEntry.candidateCount ?? 0

      // Determine if this exam date is today or in the past
      const examDayStart = new Date(datesheetEntry.examDate)
      examDayStart.setHours(0, 0, 0, 0)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const isPastOrToday = examDayStart.getTime() <= todayStart.getTime()

      // Used: for past/today exams, used = candidateCount (every candidate gets a sheet)
      // For future exams, show whatever has been manually linked
      let totalUsed = 0
      if (isPastOrToday) {
        totalUsed = candidateCount
      } else {
        const usedSheets = entries.filter(e =>
          e.linkedExamDate &&
          new Date(e.linkedExamDate).toDateString() === new Date(datesheetEntry.examDate).toDateString() &&
          e.linkedSubjectCode === datesheetEntry.subjectCode
        )
        const rawTotalUsed = usedSheets.reduce((sum, e) => sum + (e.used ?? 0), 0)
        totalUsed = candidateCount > 0 ? Math.min(rawTotalUsed, candidateCount) : rawTotalUsed
      }

      const dateKey = new Date(datesheetEntry.examDate).toDateString()
      if (!srNoByDate.has(dateKey)) {
        srCounter += 1
        srNoByDate.set(dateKey, srCounter)
      }
      const srNo = srNoByDate.get(dateKey) ?? index + 1
      const entryId = String(datesheetEntry._id || '').trim()
      const subjectKey = buildSupplementaryUsageSubjectKey(
        datesheetEntry.examDate,
        datesheetEntry.subjectCode,
        datesheetEntry.class
      )
      const supplementaryUsed = (
        (entryId ? supplementaryUsageCounts.byEntryId.get(entryId) : undefined)
        ?? (subjectKey ? supplementaryUsageCounts.bySubjectKey.get(subjectKey) : undefined)
        ?? 0
      )
      const absentKey = `${dateKey}|${datesheetEntry.subjectCode}`
      const absentCount = absenteesByDateAndSubject.get(absentKey) ?? 0

      return { datesheetEntry, srNo, candidateCount, isPastOrToday, totalUsed, supplementaryUsed, absentCount }
    })
  })()

  const cancelUsedEdit = () => {
    setEditingUsedEntry(null)
    setEditUsedValue('')
  }

  const usedColumns: DataTableColumn<UsedRow>[] = [
    { key: 'sr', header: '#', width: 48, numeric: true, mobile: 'hidden', render: (row) => row.srNo },
    {
      key: 'date',
      header: 'Date',
      mobile: 'aside',
      render: (row) => <span className="is-num">{formatShortDate(row.datesheetEntry.examDate)}</span>,
    },
    { key: 'class', header: 'Class', render: (row) => dash(row.datesheetEntry.class) },
    {
      key: 'code',
      header: 'Subject code',
      mobile: 'subtitle',
      render: (row) => <span className="ex-code">{row.datesheetEntry.subjectCode}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (row) => <span className="cb-strong">{dash(row.datesheetEntry.subjectName)}</span>,
    },
    {
      key: 'type',
      header: 'Answer sheet type',
      render: (row) => formatAnswerSheetType(row.datesheetEntry.answerSheetType),
    },
    {
      key: 'candidates',
      header: 'Candidates',
      numeric: true,
      align: 'right',
      render: (row) => dash(row.datesheetEntry.candidateCount),
    },
    {
      key: 'main',
      header: 'Main used',
      numeric: true,
      align: 'right',
      interactive: true,
      render: (row) => {
        const { datesheetEntry, candidateCount, totalUsed } = row
        if (row.isPastOrToday) {
          return (
            <span className="is-num" title="Auto-set to candidate count for completed exams">
              {totalUsed}
            </span>
          )
        }
        if (editingUsedEntry === datesheetEntry._id) {
          return (
            <div className="cx-as-used-edit">
              <TextField
                size="sm"
                type="number"
                min={0}
                max={candidateCount > 0 ? candidateCount : undefined}
                value={editUsedValue}
                aria-label={`Main sheets used for ${datesheetEntry.subjectCode}`}
                title="Used sheets (cannot exceed candidates)"
                autoFocus
                onChange={(e) => {
                  const v = e.target.value
                  const num = parseInt(v, 10)
                  if (candidateCount > 0 && !Number.isNaN(num) && num > candidateCount) {
                    setEditUsedValue(String(candidateCount))
                  } else {
                    setEditUsedValue(v)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveUsed(datesheetEntry)
                  } else if (e.key === 'Escape') {
                    cancelUsedEdit()
                  }
                }}
              />
              <Button
                variant="tertiary"
                size="sm"
                icon={Check}
                aria-label="Save used count"
                onClick={() => handleSaveUsed(datesheetEntry)}
                disabled={loading}
              />
              <Button
                variant="tertiary"
                size="sm"
                icon={X}
                aria-label="Cancel editing"
                onClick={cancelUsedEdit}
                disabled={loading}
              />
            </div>
          )
        }
        return (
          <Button
            variant="tertiary"
            size="sm"
            title="Edit used count"
            onClick={() => {
              setEditingUsedEntry(datesheetEntry._id)
              setEditUsedValue(String(totalUsed))
            }}
          >
            {totalUsed || 0}
          </Button>
        )
      },
    },
    {
      key: 'supp',
      header: 'Supplementary used',
      numeric: true,
      align: 'right',
      render: (row) => row.supplementaryUsed,
    },
    { key: 'absent', header: 'Absent', numeric: true, align: 'right', render: (row) => row.absentCount },
  ]

  // ---------- Balance ----------
  type BalanceRow = (typeof balanceRows)[number]
  const balanceColumns: DataTableColumn<BalanceRow>[] = [
    { key: 'sr', header: '#', width: 48, numeric: true, mobile: 'hidden', render: (row) => row.srNo },
    {
      key: 'type',
      header: 'Answer sheet',
      mobile: 'title',
      render: (row) => <span className="cb-strong">{row.answerSheetType}</span>,
    },
    { key: 'class', header: 'Class', mobile: 'subtitle', render: (row) => dash(row.classLabel) },
    { key: 'received', header: 'Received', numeric: true, align: 'right', render: (row) => row.received },
    { key: 'used', header: 'Used', numeric: true, align: 'right', render: (row) => row.used },
    {
      key: 'balance',
      header: 'Balance',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: (row) => <span className="cb-strong">{row.balance}</span>,
    },
    { key: 'discarded', header: 'Discarded', numeric: true, align: 'right', render: (row) => row.discarded },
  ]

  // ---------- Discarded ----------
  type DiscardedRow = ReturnType<typeof getDiscardedRows>[number] & { index: number }
  const discardedRows: DiscardedRow[] =
    activeTab === 'discarded' ? getDiscardedRows().map((row, index) => ({ ...row, index })) : []

  const discardedColumns: DataTableColumn<DiscardedRow>[] = [
    { key: 'sr', header: '#', width: 48, numeric: true, mobile: 'hidden', render: (row) => row.index + 1 },
    {
      key: 'serial',
      header: 'Serial no.',
      mobile: 'title',
      render: (row) => <span className="cb-strong is-num">{dash(row.serialNo)}</span>,
    },
    { key: 'date', header: 'Date', render: (row) => <span className="is-num">{dash(row.date)}</span> },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'subtitle',
      render: (row) => (
        <span className="cx-as-truncate" title={row.subject}>
          {dash(row.subject)}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      render: (row) => (row.code && row.code !== '-' ? <span className="ex-code">{row.code}</span> : '—'),
    },
    { key: 'room', header: 'Room', render: (row) => dash(row.roomNo) },
    { key: 'reason', header: 'Reason', mobile: 'hidden', render: (row) => <span className="cb-muted">{row.reason}</span> },
    { key: 'received', header: 'Received', numeric: true, align: 'right', render: (row) => row.entry.total },
    { key: 'used', header: 'Used', numeric: true, align: 'right', render: (row) => row.entry.used },
    {
      key: 'balance',
      header: 'Balance',
      numeric: true,
      align: 'right',
      render: (row) => row.entry.total - row.entry.used - getDiscardedCount(row.entry),
    },
    {
      key: 'discarded',
      header: 'Discarded',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: (row) => getDiscardedCount(row.entry),
    },
  ]

  // ---------- Per-entry stock (Use / Discard) ----------
  type StockRow = { entry: AnswerSheetEntry; index: number }
  const stockColumns: DataTableColumn<StockRow>[] = [
    {
      key: 'seq',
      header: '#',
      width: 48,
      numeric: true,
      mobile: 'hidden',
      render: ({ entry, index }) => getDisplaySequenceNo(entry, index),
    },
    {
      key: 'type',
      header: 'Answer sheet',
      mobile: 'title',
      render: ({ entry }) => <span className="cb-strong">{entry.answerSheetType}</span>,
    },
    { key: 'class', header: 'Class', mobile: 'subtitle', render: ({ entry }) => dash(entry.class) },
    { key: 'received', header: 'Received', numeric: true, align: 'right', render: ({ entry }) => entry.total },
    { key: 'used', header: 'Used', numeric: true, align: 'right', render: ({ entry }) => entry.used },
    {
      key: 'balance',
      header: 'Balance',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: ({ entry }) => entry.total - entry.used - getDiscardedCount(entry),
    },
    {
      key: 'discarded',
      header: 'Discarded',
      numeric: true,
      align: 'right',
      render: ({ entry }) => getDiscardedCount(entry),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: ({ entry }) =>
        entry.total - entry.used - getDiscardedCount(entry) > 0 ? (
          <Menu
            label={`Actions for ${entry.answerSheetType}, class ${entry.class}`}
            items={[
              {
                label: 'Mark sheets as used',
                icon: Check,
                disabled: loading,
                onSelect: () => {
                  const qty = prompt('Enter quantity to mark as used:')
                  if (qty && entry._id) handleUseSheets(entry._id, parseInt(qty))
                },
              },
              { divider: true },
              {
                label: 'Discard sheets',
                icon: Trash2,
                tone: 'danger',
                disabled: loading,
                onSelect: () => {
                  const qty = prompt('Enter quantity to discard:')
                  if (qty && entry._id) handleDiscardSheets(entry._id, parseInt(qty))
                },
              },
            ]}
          />
        ) : null,
    },
  ]

  const renderTable = () => {
    switch (activeTab) {
      case 'received':
        return (
          <DataTable
            caption="Received answer sheets"
            columns={receivedColumns}
            rows={receivedRows}
            getRowKey={({ entry, index }) => entry._id || `${getEntryEditingKey(entry)}-${index}`}
            onRowClick={({ entry }) => {
              const isEditing = editingEntry === getEntryEditingKey(entry)
              if (!isEditing && entry._id && !entry.isTemplate) {
                navigate(`/answersheets/${entry._id}`)
              }
            }}
            loading={loading}
            loadingLabel="Loading answer sheets…"
            empty={
              error ? (
                <EmptyState icon={AlertCircle} title="Answer sheets didn’t load" body={error} />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No answer sheets received yet"
                  body="Each sheet type appears here once its serial range is recorded."
                />
              )
            }
          />
        )
      case 'used':
        return (
          <DataTable
            caption="Answer sheets used per exam"
            columns={usedColumns}
            rows={usedRows}
            getRowKey={(row) => row.datesheetEntry._id}
            loading={loading}
            loadingLabel="Loading exam schedule…"
            empty={
              <EmptyState
                icon={CalendarDays}
                title="No exam schedule found"
                body="Usage is tracked per exam once the CBSE datesheet is imported and candidates have their subjects linked."
              />
            }
          />
        )
      case 'balance':
        return (
          <DataTable
            caption="Answer sheet balance"
            columns={balanceColumns}
            rows={balanceRows}
            getRowKey={(row) => `${row.answerSheetType}-${row.classLabel}`}
            loading={loading}
            loadingLabel="Loading balance…"
            empty={
              <EmptyState
                icon={Layers}
                title="No sheets in balance"
                body="Balance shows once received quantities are recorded."
              />
            }
          />
        )
      case 'discarded':
        return (
          <DataTable
            caption="Discarded answer sheets"
            columns={discardedColumns}
            rows={discardedRows}
            getRowKey={(row) => row.key}
            onRowClick={(row) => {
              if (row.entry._id) navigate(`/answersheets/${row.entry._id}`)
            }}
            loading={loading}
            loadingLabel="Loading discarded sheets…"
            empty={<EmptyState icon={Trash2} title="No discarded sheets" body="Sheets taken out of stock are listed here." />}
          />
        )
      default:
        return (
          <DataTable
            caption="Answer sheet stock"
            columns={stockColumns}
            rows={getFilteredEntries().map((entry, index) => ({ entry, index }))}
            getRowKey={({ entry, index }) => entry._id || `${getEntryEditingKey(entry)}-${index}`}
            loading={loading}
            empty={<EmptyState icon={FileText} title="No answer sheets found for this category" compact />}
          />
        )
    }
  }

  const selectedLinkEntry = selectedDatesheetEntry
    ? centreDatesheetEntries.find(e => e._id === selectedDatesheetEntry)
    : undefined

  const previewMeta = consolidatedPreviewEntry
    ? `${consolidatedPreviewEntry.answerSheetType} · ${consolidatedPreviewEntry.pages} pages · ${consolidatedPreviewEntry.colour} · Class ${consolidatedPreviewEntry.class}`
    : undefined

  const formIsSupplementary = isSupplementaryEntry(formData.answerSheetType)

  return (
    <Page>
      <Tabs
        label="Answer sheet status"
        items={tabItems}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
      />

      <Card flush title={cardCopy[activeTab].title} subtitle={cardCopy[activeTab].subtitle}>
        <CardToolbar>
          <FilterBar
            filters={
              <Select
                size="sm"
                className="cx-as-class"
                aria-label="Class"
                value={String(selectedClass)}
                onChange={(e) => setSelectedClass(e.target.value)}
                options={classOptions}
              />
            }
            actions={
              <form
                className="cx-as-series"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSaveSeries()
                }}
              >
                <TextField
                  size="sm"
                  className="cx-as-series__field"
                  prefix="Series"
                  aria-label="Answer sheet series"
                  placeholder="e.g. GGM - 31"
                  value={seriesInput}
                  onChange={(e) => setSeriesInput(e.target.value)}
                  maxLength={50}
                />
                <Button type="submit" size="sm" loading={updateSeriesMutation.isPending}>
                  Save series
                </Button>
              </form>
            }
          />
        </CardToolbar>
        {renderTable()}
      </Card>

      <Sheet
        open={showConsolidatedPreview && Boolean(consolidatedPreviewUrl || consolidatedPreviewLoading || consolidatedPreviewError)}
        onClose={closeConsolidatedPreview}
        size="xl"
        icon={FileText}
        title="Consolidated answer-sheet record"
        description={previewMeta}
        footer={
          <>
            <Button onClick={closeConsolidatedPreview}>Close</Button>
            {consolidatedPreviewUrl && consolidatedPreviewEntry ? (
              <>
                <Button icon={ExternalLink} onClick={() => window.open(consolidatedPreviewUrl, '_blank', 'noopener,noreferrer')}>
                  Open in new tab
                </Button>
                <Button
                  variant="primary"
                  icon={Download}
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = consolidatedPreviewUrl
                    link.download = getConsolidatedRecordFilename(consolidatedPreviewEntry)
                    link.click()
                  }}
                >
                  Download PDF
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {consolidatedPreviewLoading ? (
          <CardLoading label="Generating preview…" />
        ) : consolidatedPreviewError ? (
          <EmptyState icon={FileWarning} title="The preview couldn’t be generated" body={consolidatedPreviewError} />
        ) : consolidatedPreviewUrl ? (
          <PdfFrame src={consolidatedPreviewUrl} title="Consolidated answer sheet PDF preview" />
        ) : null}
      </Sheet>

      <Sheet
        open={showUploadModal}
        onClose={closeUploadSheet}
        icon={FileSpreadsheet}
        title="Import answer sheets from Excel"
        description="Fill the serial numbers in the template, then upload it here."
        footer={
          <>
            <Button onClick={closeUploadSheet} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUploadExcel} disabled={!uploadFile} loading={loading}>
              Upload and import
            </Button>
          </>
        }
      >
        <Banner tone="info" title="Before you upload">
          <ol className="cx-as-steps">
            <li>Download the template. Its file name carries a timestamp.</li>
            <li>Open it in Excel and fill the From and To columns with serial numbers.</li>
            <li>Save it under a new name, for example Filled_Answer_Sheets.xlsx.</li>
            <li>Upload the saved file here.</li>
          </ol>
        </Banner>
        <Banner tone="warning">The template starts empty. Rows without serial numbers are skipped.</Banner>
        <div className="cb-form-section">
          <span className="cb-form-section__title">Excel file</span>
          <div className="cx-as-file">
            <Button icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
              {uploadFile ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className={uploadFile ? 'cb-strong' : 'cb-muted'}>
              {uploadFile ? uploadFile.name : '.xlsx or .xls'}
            </span>
          </div>
          <input
            ref={fileInputRef}
            id="answer-sheet-excel-upload"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            aria-label="Select Excel file (.xlsx or .xls) to upload"
            hidden
          />
        </div>
      </Sheet>

      <Sheet
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        icon={FileText}
        title="Add received answer sheets"
        description="Record a sheet type and the serial range the centre received."
        onSubmit={(event) => {
          event.preventDefault()
          void handleAddQuantity()
        }}
        footer={
          <>
            <Button onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createMutation.isPending}>
              Add sheets
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <Select
            label="Answer sheet type"
            required
            placeholder="Select type"
            value={formData.answerSheetType}
            onChange={(e) => {
              const nextType = e.target.value
              setFormData((current) => ({
                ...current,
                answerSheetType: nextType,
                serialRanges: isSupplementaryEntry(nextType)
                  ? current.serialRanges
                  : [current.serialRanges[0] || createEmptySerialRange()],
              }))
            }}
            options={['Main', 'Graph', 'Supplementary', 'For Blind', 'Drawing Sheets']}
          />
          <TextField
            label="Pages"
            required
            type="number"
            inputMode="numeric"
            placeholder="e.g. 32"
            value={formData.pages}
            onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
          />
          <Select
            label="Colour"
            required
            placeholder="Select colour"
            value={formData.colour}
            onChange={(e) => setFormData({ ...formData, colour: e.target.value })}
            options={['Red', 'Blue', 'Yellow', 'Pink', 'White']}
          />
          <TextField
            label="Class"
            required
            placeholder="e.g. 10, 12, 10/12"
            value={formData.class}
            onChange={(e) => setFormData({ ...formData, class: e.target.value })}
          />
        </div>

        <div className="cb-form-section">
          <span className="cb-form-section__title">{formIsSupplementary ? 'Serial number ranges' : 'Serial number range'}</span>
          <p className="cb-muted cx-as-hint">
            Leading zeros are kept, so 001001 and A001001 both work. Supplementary bundles can take several ranges.
          </p>
          {formData.serialRanges.map((range, rangeIndex) => (
            <div key={`form-range-${rangeIndex}`} className="cx-as-range">
              <TextField
                label={`From${formData.serialRanges.length > 1 ? ` (range ${rangeIndex + 1})` : ''}`}
                required
                placeholder={`From ${rangeIndex + 1}`}
                title="Supports: 1001, 001001, A1001, A001001 (leading zeros preserved)"
                value={range.serialFrom}
                onChange={(e) => updateFormSerialRange(rangeIndex, 'serialFrom', e.target.value)}
              />
              <TextField
                label={`To${formData.serialRanges.length > 1 ? ` (range ${rangeIndex + 1})` : ''}`}
                required
                placeholder={`To ${rangeIndex + 1}`}
                title="Supports: 2000, 002000, A2000, A002000 (leading zeros preserved)"
                value={range.serialTo}
                onChange={(e) => updateFormSerialRange(rangeIndex, 'serialTo', e.target.value)}
              />
              {formIsSupplementary ? (
                <Button
                  variant="tertiary"
                  icon={X}
                  aria-label={`Remove range ${rangeIndex + 1}`}
                  onClick={() => removeFormSerialRange(rangeIndex)}
                  disabled={formData.serialRanges.length === 1}
                />
              ) : null}
            </div>
          ))}
          {formIsSupplementary ? (
            <div>
              <Button size="sm" icon={Plus} onClick={addFormSerialRange}>
                Add range
              </Button>
            </div>
          ) : null}
        </div>

        <div className="cb-form-grid">
          <TextField
            label="Exam"
            hint="Optional"
            placeholder="e.g. Term 1"
            value={formData.exam}
            onChange={(e) => setFormData({ ...formData, exam: e.target.value })}
          />
          <TextField
            label="Subject"
            hint="Optional"
            placeholder="e.g. Mathematics"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          />
        </div>
      </Sheet>

      <Dialog
        open={showLinkModal}
        onClose={closeLinkDialog}
        title="Link sheets to an exam"
        description="Pick the exam these sheets are used for, so usage is tracked per subject and date."
        footer={
          <>
            <Button onClick={closeLinkDialog} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" icon={Link2} onClick={handleConfirmUseSheets} loading={loading}>
              Mark as used
            </Button>
          </>
        }
      >
        <Select
          label="Exam"
          hint="Optional. Leave it on skip to mark the sheets as used without exam details."
          placeholder="Skip linking"
          value={selectedDatesheetEntry}
          onChange={(e) => setSelectedDatesheetEntry(e.target.value)}
          options={centreDatesheetEntries.map((entry) => ({
            value: entry._id,
            label: `${formatShortDate(entry.examDate)} · ${entry.dayName} · Class ${entry.class} · ${entry.subjectCode} ${entry.subjectName} (${entry.candidateCount} candidates)`,
          }))}
        />
        {selectedLinkEntry ? (
          <DetailList
            columns={2}
            items={[
              { label: 'Date', value: `${formatShortDate(selectedLinkEntry.examDate)} (${selectedLinkEntry.dayName})` },
              { label: 'Class', value: selectedLinkEntry.class },
              { label: 'Subject', value: `${selectedLinkEntry.subjectCode} · ${selectedLinkEntry.subjectName}`, wide: true },
              { label: 'Time', value: `${formatTime(selectedLinkEntry.timeSlot.start)} – ${formatTime(selectedLinkEntry.timeSlot.end)}` },
              { label: 'Candidates', value: selectedLinkEntry.candidateCount },
              { label: 'Rooms needed', value: selectedLinkEntry.roomsNeeded },
            ]}
          />
        ) : null}
      </Dialog>
    </Page>
  )
}

export default AnswerSheets
