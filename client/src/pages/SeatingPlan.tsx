import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Document, Page as PdfPage, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import toast from 'react-hot-toast'
import {
  useCentreDatesheetEntries,
  useGenerateSeatingPlanPDFMutation,
  useSeatingPlanTemplateSettings,
  useUpdateSeatingPlanTemplateSettingsMutation,
  type SeatingPlanFormat,
} from '../hooks/useSeatingPlan'
import type { CentreDatesheetEntry } from '../services/centreDatesheetService'
import {
  seatingPlanService,
  type CBSECopyTemplateSettings,
  type MainGateTemplateSettings,
  type RoomDoorSlipTemplateSettings,
  type RoomFolderSlipTemplateSettings,
  type SeatingPlanMode,
  type SeatingPlanTemplateSettings,
} from '../services/seatingPlanService'
import { AlertCircle, CalendarDays, Download, ExternalLink, FileText } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Page,
  RadioGroup,
  Sheet,
  Tabs,
  type DataTableColumn,
} from '@/components/ui'
import { PAPER_PAGES_CLASS, Paper, PaperStage } from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-seating.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const DEFAULT_CBSE_LAYOUT_SETTINGS: CBSECopyTemplateSettings = {
  infoCol1Width: 20,
  infoCol2Width: 26,
  infoCol3Width: 26,
  infoCol4Width: 14,
  infoCol5Width: 14,
  col1Width: 23,
  col2Width: 10,
  col3Width: 23,
  col4Width: 10,
  col5Width: 23,
  col6Width: 11,
  rowHeight: 28,
  cellPaddingY: 6,
  cellPaddingX: 8,
  headerFontSize: 12,
  subHeaderFontSize: 11,
  bodyFontSize: 11,
}

const DEFAULT_MAIN_GATE_LAYOUT_SETTINGS: MainGateTemplateSettings = {
  col1Width: 16,
  col2Width: 28,
  col3Width: 28,
  col4Width: 28,
  rowHeight: 22,
}

const DEFAULT_ROOM_FOLDER_LAYOUT_SETTINGS: RoomFolderSlipTemplateSettings = {
  infoCol1Width: 14.3,
  infoCol2Width: 19.05,
  infoCol3Width: 19.05,
  infoCol4Width: 14.3,
  infoCol5Width: 9.5,
  infoCol6Width: 9.5,
  infoCol7Width: 14.3,
  col1Width: 14.14,
  col2Width: 8.08,
  col3Width: 11.11,
  col4Width: 14.14,
  col5Width: 8.08,
  col6Width: 11.11,
  col7Width: 14.14,
  col8Width: 8.08,
  col9Width: 11.12,
  rowHeight: 24,
}

const DEFAULT_ROOM_DOOR_LAYOUT_SETTINGS: RoomDoorSlipTemplateSettings = {
  infoCol1Width: 16.67,
  infoCol2Width: 20.83,
  infoCol3Width: 20.83,
  infoCol4Width: 16.67,
  infoCol5Width: 12.5,
  infoCol6Width: 12.5,
  col1Width: 33.33,
  col2Width: 33.33,
  col3Width: 33.34,
  rowHeight: 30,
}

const CBSE_COLUMN_KEYS: Array<
  'col1Width' | 'col2Width' | 'col3Width' | 'col4Width' | 'col5Width' | 'col6Width'
> = ['col1Width', 'col2Width', 'col3Width', 'col4Width', 'col5Width', 'col6Width']

const CBSE_INFO_COLUMN_KEYS: Array<
  'infoCol1Width' | 'infoCol2Width' | 'infoCol3Width' | 'infoCol4Width' | 'infoCol5Width'
> = ['infoCol1Width', 'infoCol2Width', 'infoCol3Width', 'infoCol4Width', 'infoCol5Width']

const ROOM_FOLDER_COLUMN_KEYS: Array<
  'col1Width' | 'col2Width' | 'col3Width' | 'col4Width' | 'col5Width' | 'col6Width' | 'col7Width' | 'col8Width' | 'col9Width'
> = ['col1Width', 'col2Width', 'col3Width', 'col4Width', 'col5Width', 'col6Width', 'col7Width', 'col8Width', 'col9Width']

const ROOM_DOOR_COLUMN_KEYS: Array<'col1Width' | 'col2Width' | 'col3Width'> = ['col1Width', 'col2Width', 'col3Width']
const MAIN_GATE_COLUMN_KEYS: Array<'col1Width' | 'col2Width' | 'col3Width' | 'col4Width'> = ['col1Width', 'col2Width', 'col3Width', 'col4Width']
const ROOM_FOLDER_INFO_COLUMN_KEYS: Array<
  'infoCol1Width' | 'infoCol2Width' | 'infoCol3Width' | 'infoCol4Width' | 'infoCol5Width' | 'infoCol6Width' | 'infoCol7Width'
> = ['infoCol1Width', 'infoCol2Width', 'infoCol3Width', 'infoCol4Width', 'infoCol5Width', 'infoCol6Width', 'infoCol7Width']
const ROOM_DOOR_INFO_COLUMN_KEYS: Array<
  'infoCol1Width' | 'infoCol2Width' | 'infoCol3Width' | 'infoCol4Width' | 'infoCol5Width' | 'infoCol6Width'
> = ['infoCol1Width', 'infoCol2Width', 'infoCol3Width', 'infoCol4Width', 'infoCol5Width', 'infoCol6Width']
const APP_MAIN_SCROLL_ID = 'app-main-scroll'

const FORMAT_ORDER: SeatingPlanFormat[] = ['mainGate', 'roomFolderSlip', 'roomDoorSlip', 'cbseCopy']
const FORMAT_LABELS: Record<SeatingPlanFormat, string> = {
  mainGate: 'Main gate',
  roomFolderSlip: 'Invigilator slip',
  roomDoorSlip: 'Room door slip',
  cbseCopy: 'CBSE format',
}

/** PDF pages fill the preview sheet (760px wide) without spilling past a phone screen. */
const previewPageWidth = () =>
  typeof window !== 'undefined' ? Math.max(260, Math.min(680, window.innerWidth - 72)) : 680

const SeatingPlan: React.FC = () => {
  const routerLocation = useLocation()
  const isExmclRoute = routerLocation.pathname.includes('/exmcl/')
  const [activeTab, setActiveTab] = useState<SeatingPlanFormat>('mainGate')
  const [seatingPlanMode, setSeatingPlanMode] = useState<SeatingPlanMode>('different_per_day')
  const [loadingSeatingPlanMode, setLoadingSeatingPlanMode] = useState(false)
  const [savingSeatingPlanMode, setSavingSeatingPlanMode] = useState(false)
  const [mainGateLayoutDraft, setMainGateLayoutDraft] = useState<MainGateTemplateSettings>(DEFAULT_MAIN_GATE_LAYOUT_SETTINGS)
  const [cbseLayoutDraft, setCbseLayoutDraft] = useState<CBSECopyTemplateSettings>(DEFAULT_CBSE_LAYOUT_SETTINGS)
  const [roomFolderLayoutDraft, setRoomFolderLayoutDraft] = useState<RoomFolderSlipTemplateSettings>(DEFAULT_ROOM_FOLDER_LAYOUT_SETTINGS)
  const [roomDoorLayoutDraft, setRoomDoorLayoutDraft] = useState<RoomDoorSlipTemplateSettings>(DEFAULT_ROOM_DOOR_LAYOUT_SETTINGS)
  const [templateDraftReady, setTemplateDraftReady] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewPageCount, setPreviewPageCount] = useState(0)
  const [previewRenderError, setPreviewRenderError] = useState<string | null>(null)
  const scheduleTableRef = useRef<HTMLDivElement | null>(null)
  const mainGateTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const cbseInfoTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const cbseTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const roomFolderInfoTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const roomFolderTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const roomDoorInfoTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const roomDoorTableWrapperRef = useRef<HTMLDivElement | null>(null)
  const restoredScrollRef = useRef(false)
  const autoScrolledRef = useRef(false)
  const scrollStorageKey = useMemo(
    () => `seatingPlan:scrollTop:${window.location.search}:${window.location.hash}`,
    []
  )

  const { data: datesheetEntries = [], isLoading: loading, error: queryError, refetch } = useCentreDatesheetEntries()
  const { data: templateSettings } = useSeatingPlanTemplateSettings()
  const updateTemplateSettingsMutation = useUpdateSeatingPlanTemplateSettingsMutation()
  const saveTemplateSettings = updateTemplateSettingsMutation.mutate
  const pdfMutation = useGenerateSeatingPlanPDFMutation({
    autoDownload: false,
    onSuccess: (blob, variables) => {
      const blobUrl = URL.createObjectURL(blob)
      setPreviewPdfUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return blobUrl
      })
      setPreviewFilename(variables.filename || 'seating-plan.pdf')
      setPreviewPageCount(0)
      setPreviewRenderError(null)
      setShowPreviewDialog(true)
    },
    onError: (err) => {
      const text = String(err?.message || '')
      if (text.includes('status code 400')) {
        toast.error('Rooms are not allocated for this exam date. Please allocate rooms first in Exam Room/Hall or switch room allocation mode to Auto.')
        return
      }
      toast.error(text || 'Failed to generate PDF. Please try again.')
    },
  })

  const error = queryError?.message ?? null
  const downloadingId = pdfMutation.isPending ? pdfMutation.variables?.datesheetId ?? null : null
  useEffect(() => {
    const mainScrollContainer = document.getElementById(APP_MAIN_SCROLL_ID)
    if (!mainScrollContainer) return

    const savedScrollTop = Number(sessionStorage.getItem(scrollStorageKey) || 0)
    if (Number.isFinite(savedScrollTop) && savedScrollTop > 0) {
      restoredScrollRef.current = true
      requestAnimationFrame(() => {
        mainScrollContainer.scrollTop = savedScrollTop
      })
    }

    let rafId: number | null = null
    const persistScroll = () => {
      sessionStorage.setItem(scrollStorageKey, String(mainScrollContainer.scrollTop))
    }
    const onScroll = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(persistScroll)
    }

    mainScrollContainer.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      persistScroll()
      mainScrollContainer.removeEventListener('scroll', onScroll)
    }
  }, [scrollStorageKey])

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
    }
  }, [previewPdfUrl])

  const closePreviewDialog = () => {
    setShowPreviewDialog(false)
    setPreviewPageCount(0)
    setPreviewRenderError(null)
    setPreviewFilename('')
    setPreviewPdfUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })
  }

  useEffect(() => {
    if (!isExmclRoute) return
    setLoadingSeatingPlanMode(true)
    void seatingPlanService.getSeatingPlanMode()
      .then(setSeatingPlanMode)
      .catch(() => toast.error('Failed to load seating plan mode.'))
      .finally(() => setLoadingSeatingPlanMode(false))
  }, [isExmclRoute])

  useEffect(() => {
    if (templateSettings?.seatingPlanMode) {
      setSeatingPlanMode(templateSettings.seatingPlanMode)
    }
  }, [templateSettings?.seatingPlanMode])

  const handleSeatingPlanModeChange = async (mode: SeatingPlanMode) => {
    setSavingSeatingPlanMode(true)
    try {
      const saved = await seatingPlanService.updateSeatingPlanMode(mode)
      setSeatingPlanMode(saved)
      toast.success(
        saved === 'same_across_days'
          ? 'Seating plan mode: same room across all exam days.'
          : 'Seating plan mode: different seating across exam days.'
      )
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update seating plan mode.')
    } finally {
      setSavingSeatingPlanMode(false)
    }
  }

  useEffect(() => {
    if (!templateSettings?.cbseCopy) return
    setMainGateLayoutDraft(templateSettings.mainGate || DEFAULT_MAIN_GATE_LAYOUT_SETTINGS)
    setCbseLayoutDraft(templateSettings.cbseCopy)
    setRoomFolderLayoutDraft(templateSettings.roomFolderSlip || DEFAULT_ROOM_FOLDER_LAYOUT_SETTINGS)
    setRoomDoorLayoutDraft(templateSettings.roomDoorSlip || DEFAULT_ROOM_DOOR_LAYOUT_SETTINGS)
    setTemplateDraftReady(true)
  }, [templateSettings])

  useEffect(() => {
    if (!templateSettings || !templateDraftReady) return
    const currentSettings: SeatingPlanTemplateSettings = {
      mainGate: mainGateLayoutDraft,
      cbseCopy: cbseLayoutDraft,
      roomFolderSlip: roomFolderLayoutDraft,
      roomDoorSlip: roomDoorLayoutDraft,
    }
    const persisted = JSON.stringify(templateSettings)
    const current = JSON.stringify(currentSettings)
    if (persisted === current) return

    const timer = window.setTimeout(() => {
      saveTemplateSettings(currentSettings)
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    mainGateLayoutDraft,
    cbseLayoutDraft,
    roomFolderLayoutDraft,
    roomDoorLayoutDraft,
    templateSettings,
    templateDraftReady,
    saveTemplateSettings,
  ])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // Format time from 24-hour (HH:MM) to 12-hour format with AM/PM
  const formatTime = (time: string) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const getCalendarDateKey = (value: string | Date) => {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const todayDateKey = useMemo(() => getCalendarDateKey(new Date()), [])
  const nextExamDateKey = useMemo(() => {
    const futureExamDateKeys = datesheetEntries
      .map((entry) => getCalendarDateKey(entry.examDate))
      .filter((key) => key && key > todayDateKey)
      .sort()

    return futureExamDateKeys[0] || null
  }, [datesheetEntries, todayDateKey])

  /* ── Auto-scroll examination schedule table to today's (or next) exam row inside the vertical scroll container ── */
  useEffect(() => {
    if (loading || datesheetEntries.length === 0) return
    if (autoScrolledRef.current) return
    const timer = setTimeout(() => {
      const root = scheduleTableRef.current
      if (!root) return

      // The kit DataTable owns the scroll box; its rows render in datesheet order.
      const scrollContainer = root.querySelector<HTMLElement>('.cb-table-scroll')
      if (!scrollContainer || scrollContainer.clientHeight === 0) return

      const indexForDate = (dateKey: string | null) =>
        dateKey ? datesheetEntries.findIndex((entry) => getCalendarDateKey(entry.examDate) === dateKey) : -1
      let targetIndex = indexForDate(todayDateKey)
      if (targetIndex < 0) targetIndex = indexForDate(nextExamDateKey)
      if (targetIndex < 0) targetIndex = 0
      const targetRow = scrollContainer.querySelectorAll<HTMLElement>('tbody tr')[targetIndex]

      if (!targetRow) return
      autoScrolledRef.current = true
      const containerRect = scrollContainer.getBoundingClientRect()
      const rowRect = targetRow.getBoundingClientRect()
      const offset =
        rowRect.top + rowRect.height / 2 - (containerRect.top + containerRect.height / 2)
      scrollContainer.scrollTop += offset
    }, 200)
    return () => clearTimeout(timer)
  }, [loading, datesheetEntries, todayDateKey, nextExamDateKey])

  const handleDownloadPDF = (datesheetId: string, format: SeatingPlanFormat) => {
    const entry = datesheetEntries.find((item) => item._id === datesheetId)
    const formatLabel = format === 'mainGate'
      ? 'Main Gate'
      : format === 'roomFolderSlip'
        ? 'Invigilator Slip'
        : format === 'roomDoorSlip'
          ? 'Room Door Slip'
          : 'CBSE Format'

    const examDate = entry
      ? (() => {
        const date = new Date(entry.examDate)
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${day}-${month}-${year}`
      })()
      : 'Unknown Date'

    const classLabel = entry ? `Class ${entry.class}` : 'Class Unknown'
    const subjectLabel = entry
      ? entry.subjectName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim()
      : 'Subject Unknown'

    const filename = `Seating Plan - ${formatLabel} - ${examDate} - ${classLabel} - ${subjectLabel}.pdf`
    pdfMutation.mutate({ datesheetId, format, filename })
  }

  const cbseColumnWidths = useMemo(
    () => [
      cbseLayoutDraft.col1Width,
      cbseLayoutDraft.col2Width,
      cbseLayoutDraft.col3Width,
      cbseLayoutDraft.col4Width,
      cbseLayoutDraft.col5Width,
      cbseLayoutDraft.col6Width,
    ],
    [cbseLayoutDraft]
  )

  const cbseColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return cbseColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [cbseColumnWidths])

  const mainGateColumnWidths = useMemo(
    () => [
      mainGateLayoutDraft.col1Width,
      mainGateLayoutDraft.col2Width,
      mainGateLayoutDraft.col3Width,
      mainGateLayoutDraft.col4Width,
    ],
    [mainGateLayoutDraft]
  )

  const mainGateColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return mainGateColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [mainGateColumnWidths])

  const cbseInfoColumnWidths = useMemo(
    () => [
      cbseLayoutDraft.infoCol1Width,
      cbseLayoutDraft.infoCol2Width,
      cbseLayoutDraft.infoCol3Width,
      cbseLayoutDraft.infoCol4Width,
      cbseLayoutDraft.infoCol5Width,
    ],
    [cbseLayoutDraft]
  )

  const cbseInfoColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return cbseInfoColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [cbseInfoColumnWidths])

  const roomFolderColumnWidths = useMemo(
    () => [
      roomFolderLayoutDraft.col1Width,
      roomFolderLayoutDraft.col2Width,
      roomFolderLayoutDraft.col3Width,
      roomFolderLayoutDraft.col4Width,
      roomFolderLayoutDraft.col5Width,
      roomFolderLayoutDraft.col6Width,
      roomFolderLayoutDraft.col7Width,
      roomFolderLayoutDraft.col8Width,
      roomFolderLayoutDraft.col9Width,
    ],
    [roomFolderLayoutDraft]
  )

  const roomFolderColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return roomFolderColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [roomFolderColumnWidths])

  const roomFolderInfoColumnWidths = useMemo(
    () => [
      roomFolderLayoutDraft.infoCol1Width,
      roomFolderLayoutDraft.infoCol2Width,
      roomFolderLayoutDraft.infoCol3Width,
      roomFolderLayoutDraft.infoCol4Width,
      roomFolderLayoutDraft.infoCol5Width,
      roomFolderLayoutDraft.infoCol6Width,
      roomFolderLayoutDraft.infoCol7Width,
    ],
    [roomFolderLayoutDraft]
  )

  const roomFolderInfoColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return roomFolderInfoColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [roomFolderInfoColumnWidths])

  const roomDoorColumnWidths = useMemo(
    () => [roomDoorLayoutDraft.col1Width, roomDoorLayoutDraft.col2Width, roomDoorLayoutDraft.col3Width],
    [roomDoorLayoutDraft]
  )

  const roomDoorColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return roomDoorColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [roomDoorColumnWidths])

  const roomDoorInfoColumnWidths = useMemo(
    () => [
      roomDoorLayoutDraft.infoCol1Width,
      roomDoorLayoutDraft.infoCol2Width,
      roomDoorLayoutDraft.infoCol3Width,
      roomDoorLayoutDraft.infoCol4Width,
      roomDoorLayoutDraft.infoCol5Width,
      roomDoorLayoutDraft.infoCol6Width,
    ],
    [roomDoorLayoutDraft]
  )

  const roomDoorInfoColumnBoundaries = useMemo(() => {
    let cumulative = 0
    return roomDoorInfoColumnWidths.slice(0, -1).map((width) => {
      cumulative += width
      return cumulative
    })
  }, [roomDoorInfoColumnWidths])

  const startColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = cbseTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = CBSE_COLUMN_KEYS[boundaryIndex]
    const rightKey = CBSE_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = cbseLayoutDraft[leftKey]
    const initialRight = cbseLayoutDraft[rightKey]
    const minWidth = 4

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setCbseLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startMainGateColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = mainGateTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = MAIN_GATE_COLUMN_KEYS[boundaryIndex]
    const rightKey = MAIN_GATE_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = mainGateLayoutDraft[leftKey]
    const initialRight = mainGateLayoutDraft[rightKey]
    const minWidth = 8

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setMainGateLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startMainGateRowHeightResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const initialY = event.clientY
    const initialHeight = mainGateLayoutDraft.rowHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - initialY
      const nextHeight = Math.max(16, Math.min(50, Math.round(initialHeight + deltaY)))
      setMainGateLayoutDraft((prev) => ({
        ...prev,
        rowHeight: nextHeight,
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startInfoColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = cbseInfoTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = CBSE_INFO_COLUMN_KEYS[boundaryIndex]
    const rightKey = CBSE_INFO_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = cbseLayoutDraft[leftKey]
    const initialRight = cbseLayoutDraft[rightKey]
    const minWidth = 6

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setCbseLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRowHeightResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const initialY = event.clientY
    const initialHeight = cbseLayoutDraft.rowHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - initialY
      const nextHeight = Math.max(18, Math.min(60, Math.round(initialHeight + deltaY)))
      setCbseLayoutDraft((prev) => ({
        ...prev,
        rowHeight: nextHeight,
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomFolderColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = roomFolderTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = ROOM_FOLDER_COLUMN_KEYS[boundaryIndex]
    const rightKey = ROOM_FOLDER_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = roomFolderLayoutDraft[leftKey]
    const initialRight = roomFolderLayoutDraft[rightKey]
    const minWidth = 4

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setRoomFolderLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomFolderInfoColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = roomFolderInfoTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = ROOM_FOLDER_INFO_COLUMN_KEYS[boundaryIndex]
    const rightKey = ROOM_FOLDER_INFO_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = roomFolderLayoutDraft[leftKey]
    const initialRight = roomFolderLayoutDraft[rightKey]
    const minWidth = 4

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setRoomFolderLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomFolderRowHeightResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const initialY = event.clientY
    const initialHeight = roomFolderLayoutDraft.rowHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - initialY
      const nextHeight = Math.max(18, Math.min(60, Math.round(initialHeight + deltaY)))
      setRoomFolderLayoutDraft((prev) => ({
        ...prev,
        rowHeight: nextHeight,
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomDoorColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = roomDoorTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = ROOM_DOOR_COLUMN_KEYS[boundaryIndex]
    const rightKey = ROOM_DOOR_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = roomDoorLayoutDraft[leftKey]
    const initialRight = roomDoorLayoutDraft[rightKey]
    const minWidth = 8

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setRoomDoorLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomDoorInfoColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const wrapperWidth = roomDoorInfoTableWrapperRef.current?.getBoundingClientRect().width || 0
    if (!wrapperWidth) return

    const leftKey = ROOM_DOOR_INFO_COLUMN_KEYS[boundaryIndex]
    const rightKey = ROOM_DOOR_INFO_COLUMN_KEYS[boundaryIndex + 1]
    const initialX = event.clientX
    const initialLeft = roomDoorLayoutDraft[leftKey]
    const initialRight = roomDoorLayoutDraft[rightKey]
    const minWidth = 5

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - initialX
      const deltaPercent = (deltaPx / wrapperWidth) * 100
      const maxIncrease = initialRight - minWidth
      const maxDecrease = initialLeft - minWidth
      const boundedDelta = Math.max(-maxDecrease, Math.min(maxIncrease, deltaPercent))

      setRoomDoorLayoutDraft((prev) => ({
        ...prev,
        [leftKey]: Number((initialLeft + boundedDelta).toFixed(2)),
        [rightKey]: Number((initialRight - boundedDelta).toFixed(2)),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const startRoomDoorRowHeightResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const initialY = event.clientY
    const initialHeight = roomDoorLayoutDraft.rowHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - initialY
      const nextHeight = Math.max(18, Math.min(80, Math.round(initialHeight + deltaY)))
      setRoomDoorLayoutDraft((prev) => ({
        ...prev,
        rowHeight: nextHeight,
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const formatLabel = FORMAT_LABELS[activeTab]

  const handleFormatChange = (id: string) => {
    // A plan is being generated for the current format; keep the format until it finishes.
    if (pdfMutation.isPending && id !== activeTab) return
    setActiveTab(id as SeatingPlanFormat)
  }

  const openPreviewInNewTab = () => {
    if (previewPdfUrl) window.open(previewPdfUrl, '_blank', 'noopener,noreferrer')
  }

  const downloadPreview = () => {
    if (!previewPdfUrl) return
    const link = document.createElement('a')
    link.href = previewPdfUrl
    link.download = previewFilename || 'seating-plan.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const columns: DataTableColumn<CentreDatesheetEntry>[] = [
    {
      key: 'sr',
      header: '#',
      width: 48,
      numeric: true,
      mobile: 'hidden',
      render: (entry) => String(datesheetEntries.indexOf(entry) + 1).padStart(2, '0'),
    },
    {
      key: 'date',
      header: 'Date',
      mobile: 'title',
      render: (entry) => {
        const examDateKey = getCalendarDateKey(entry.examDate)
        const isTodayExam = examDateKey === todayDateKey
        const isNextExam = !isTodayExam && !!nextExamDateKey && examDateKey === nextExamDateKey
        return (
          <span className="cx-seat-date">
            <span className="cb-strong">{formatDate(entry.examDate)}</span>
            {isTodayExam ? <Badge tone="accent">Today</Badge> : null}
            {isNextExam ? <Badge tone="info">Next exam</Badge> : null}
          </span>
        )
      },
    },
    { key: 'day', header: 'Day', render: (entry) => entry.dayName || '—' },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'subtitle',
      render: (entry) => (
        <span className="cx-seat-subject">
          <span className="cb-strong">{entry.subjectName}</span>
          <span className="cb-muted">{entry.subjectCode}</span>
        </span>
      ),
    },
    { key: 'class', header: 'Class', render: (entry) => `Class ${entry.class}` },
    {
      key: 'time',
      header: 'Time',
      render: (entry) =>
        entry.timeSlot?.start ? `${formatTime(entry.timeSlot.start)} – ${formatTime(entry.timeSlot.end)}` : '—',
    },
    { key: 'candidates', header: 'Candidates', numeric: true, align: 'right', render: (entry) => entry.candidateCount },
    {
      key: 'rooms',
      header: 'Rooms',
      numeric: true,
      align: 'right',
      render: (entry) => (entry.roomsNeeded === 0 ? <span className="cb-muted">Shared</span> : entry.roomsNeeded),
    },
    {
      key: 'generate',
      header: '',
      headerLabel: 'Seating plan',
      align: 'right',
      interactive: true,
      mobile: 'aside',
      render: (entry) => (
        <Button
          size="sm"
          icon={FileText}
          loading={downloadingId === entry._id}
          disabled={pdfMutation.isPending && downloadingId !== entry._id}
          onClick={() => handleDownloadPDF(entry._id, activeTab)}
          title={`Generate the ${formatLabel.toLowerCase()} for ${entry.subjectName}`}
        >
          Generate
        </Button>
      ),
    },
  ]

  const colWidths = (widths: number[]) => (
    <colgroup>
      {widths.map((width, index) => (
        <col key={index} style={{ width: `${width}%` }} />
      ))}
    </colgroup>
  )

  const colHandles = (
    boundaries: number[],
    onStart: (index: number, event: React.MouseEvent<HTMLDivElement>) => void,
    title: string
  ) =>
    boundaries.map((boundary, index) => (
      <div
        key={`handle-${index}`}
        className="cx-seat-col-handle"
        style={{ left: `${boundary}%` }}
        onMouseDown={(event) => onStart(index, event)}
        title={title}
        aria-hidden="true"
      />
    ))

  const rowHandle = (onStart: (event: React.MouseEvent<HTMLDivElement>) => void, height: number) => (
    <div className="cx-seat-row-handle">
      <div className="cx-seat-row-handle__bar" onMouseDown={onStart} title="Drag up or down to change the row height" aria-hidden="true" />
      <span className="cx-seat-row-handle__label">Row height {height}px</span>
    </div>
  )

  const rowHeightStyle = (height: number) => ({ '--cx-row-h': `${height}px` }) as React.CSSProperties

  const mainGateRoomTable = (caption: string, firstRoll: number) => (
    <table className="cx-seat-table" style={rowHeightStyle(mainGateLayoutDraft.rowHeight)}>
      {colWidths(mainGateColumnWidths)}
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Row</th>
          <th>Row 1</th>
          <th>Row 2</th>
          <th>Row 3</th>
        </tr>
      </thead>
      <tbody>
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <th scope="row" className="cx-seat-cell">Roll No</th>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + i}</td>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + 8 + i}</td>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + 16 + i}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const roomFolderInfoTable = (roomLabel: string) => (
    <table className="cx-seat-table cx-seat-table--info">
      {colWidths(roomFolderInfoColumnWidths)}
      <tbody>
        <tr>
          <th scope="row">Name Of Centre</th>
          <td colSpan={3}>Centre Name</td>
          <th scope="row">Centre No</th>
          <td className="cx-seat-strong">202601</td>
          <th scope="row">Class: XII</th>
        </tr>
        <tr>
          <th scope="row">Name Of Examination</th>
          <td colSpan={3}>Senior School Certificate Examinations - 2026</td>
          <th scope="row">Subject</th>
          <td colSpan={2}>048 ; PHYSICAL EDUCATION</td>
        </tr>
        <tr>
          <th scope="row">Date</th>
          <td colSpan={3}>18.02.2026 (Wednesday)</td>
          <th scope="row">Room No.</th>
          <td colSpan={2} className="cx-seat-strong">{roomLabel}</td>
        </tr>
      </tbody>
    </table>
  )

  const roomFolderDataTable = (firstRoll: number, sheetPrefix: string, withTotals: boolean) => (
    <table className="cx-seat-table cx-seat-table--small" style={rowHeightStyle(roomFolderLayoutDraft.rowHeight)}>
      {colWidths(roomFolderColumnWidths)}
      <thead>
        <tr>
          <th colSpan={3}>Row 1</th>
          <th colSpan={3}>Row 2</th>
          <th colSpan={3}>Row 3</th>
        </tr>
        <tr>
          {[0, 1, 2].map((group) => (
            <React.Fragment key={group}>
              <th>Roll No</th>
              <th>QP Code</th>
              <th>Sheet No</th>
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            {[0, 1, 2].map((group) => (
              <React.Fragment key={group}>
                <td className="cx-seat-cell cx-seat-num">{firstRoll + group * 8 + i}</td>
                <td className="cx-seat-cell cx-seat-num">{((i + group) % 3) + 1}</td>
                <td className="cx-seat-cell cx-seat-num">{sheetPrefix}{41 + group * 8 + i}</td>
              </React.Fragment>
            ))}
          </tr>
        ))}
      </tbody>
      {withTotals ? (
        <tfoot>
          <tr>
            <th colSpan={2}>Registered:</th>
            <td className="cx-seat-num">24</td>
            <th colSpan={2}>Present:</th>
            <td />
            <th colSpan={2}>Absent:</th>
            <td />
          </tr>
        </tfoot>
      ) : null}
    </table>
  )

  const roomDoorInfoTable = (roomLabel: string) => (
    <table className="cx-seat-table cx-seat-table--info">
      {colWidths(roomDoorInfoColumnWidths)}
      <tbody>
        <tr>
          <th scope="row">Name Of Centre</th>
          <td colSpan={2}>Centre Name</td>
          <th scope="row">Centre No</th>
          <td className="cx-seat-strong">202601</td>
          <th scope="row">Class: XII</th>
        </tr>
        <tr>
          <th scope="row">Name Of Examination</th>
          <td colSpan={2}>Senior School Certificate Examinations - 2026</td>
          <th scope="row">Subject</th>
          <td colSpan={2}>048 ; PHYSICAL EDUCATION</td>
        </tr>
        <tr>
          <th scope="row">Date</th>
          <td colSpan={2}>18.02.2026 (Wednesday)</td>
          <th scope="row">Room No.</th>
          <td colSpan={2} className="cx-seat-strong">{roomLabel}</td>
        </tr>
      </tbody>
    </table>
  )

  const roomDoorDataTable = (firstRoll: number) => (
    <table className="cx-seat-table cx-seat-table--info" style={rowHeightStyle(roomDoorLayoutDraft.rowHeight)}>
      {colWidths(roomDoorColumnWidths)}
      <thead>
        <tr>
          <th>Row 1</th>
          <th>Row 2</th>
          <th>Row 3</th>
        </tr>
        <tr>
          <th>Roll No</th>
          <th>Roll No</th>
          <th>Roll No</th>
        </tr>
      </thead>
      <tbody>
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + i}</td>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + 8 + i}</td>
            <td className="cx-seat-cell cx-seat-num">{firstRoll + 16 + i}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const cbseStyle = {
    '--cx-cbse-head': `${cbseLayoutDraft.headerFontSize}pt`,
    '--cx-cbse-subhead': `${cbseLayoutDraft.subHeaderFontSize}pt`,
    '--cx-cbse-body': `${cbseLayoutDraft.bodyFontSize}pt`,
    '--cx-row-h': `${cbseLayoutDraft.rowHeight}px`,
    '--cx-cbse-pad-y': `${cbseLayoutDraft.cellPaddingY}px`,
    '--cx-cbse-pad-x': `${cbseLayoutDraft.cellPaddingX}px`,
  } as React.CSSProperties

  const renderTemplate = () => {
    if (activeTab === 'mainGate') {
      return (
        <>
          <div className="cx-seat-title">
            <strong>Centre Name</strong>
            <span>Seating Plan CBSE Board Exam</span>
            <span>Centre No: 202601</span>
          </div>
          <div className="cx-seat-meta">
            <div>
              <p>Date: 15.02.2026 (Saturday)</p>
              <p>Subject: English (Lang. &amp; Lit.)</p>
            </div>
            <div className="cx-seat-meta__end">
              <p>Class: X</p>
              <p>Subject Code: 184</p>
            </div>
          </div>
          <div className="cx-seat-resize" ref={mainGateTableWrapperRef}>
            {mainGateRoomTable('Room No. 01 - X Rose (First Floor)', 20261001)}
            {colHandles(mainGateColumnBoundaries, startMainGateColumnResize, 'Drag to resize column')}
          </div>
          {mainGateRoomTable('Room No. 02 - X Tulip (First Floor)', 20261025)}
          {mainGateRoomTable('Room No. 03 - X Lotus (First Floor)', 20261049)}
          {rowHandle(startMainGateRowHeightResize, mainGateLayoutDraft.rowHeight)}
          <p className="cx-seat-sign">CENTRE SUPERINTENDENT</p>
        </>
      )
    }

    if (activeTab === 'roomFolderSlip') {
      return (
        <>
          <p className="cx-seat-heading">SEATING PLAN</p>
          <div className="cx-seat-resize" ref={roomFolderInfoTableWrapperRef}>
            {roomFolderInfoTable('02 - XII A')}
            {colHandles(roomFolderInfoColumnBoundaries, startRoomFolderInfoColumnResize, 'Drag to resize info table columns')}
          </div>
          <div className="cx-seat-resize" ref={roomFolderTableWrapperRef}>
            {roomFolderDataTable(20261025, 'A00', true)}
            {colHandles(roomFolderColumnBoundaries, startRoomFolderColumnResize, 'Drag to resize column')}
          </div>
          {rowHandle(startRoomFolderRowHeightResize, roomFolderLayoutDraft.rowHeight)}
          <div className="cx-seat-cut" />
          {roomFolderInfoTable('03 - XII B')}
          {roomFolderDataTable(20261049, 'A10', false)}
        </>
      )
    }

    if (activeTab === 'roomDoorSlip') {
      return (
        <>
          <p className="cx-seat-heading">SEATING PLAN</p>
          <div className="cx-seat-resize" ref={roomDoorInfoTableWrapperRef}>
            {roomDoorInfoTable('02 - XII A')}
            {colHandles(roomDoorInfoColumnBoundaries, startRoomDoorInfoColumnResize, 'Drag to resize info table columns')}
          </div>
          <div className="cx-seat-resize" ref={roomDoorTableWrapperRef}>
            {roomDoorDataTable(20261025)}
            {colHandles(roomDoorColumnBoundaries, startRoomDoorColumnResize, 'Drag to resize column')}
          </div>
          {rowHandle(startRoomDoorRowHeightResize, roomDoorLayoutDraft.rowHeight)}
          <div className="cx-seat-cut" />
          {roomDoorInfoTable('03 - XII B')}
          {roomDoorDataTable(20261049)}
        </>
      )
    }

    return (
      <div className="cx-seat-cbse" style={cbseStyle}>
        <p className="cx-seat-heading">SEATING PLAN</p>
        <div className="cx-seat-resize" ref={cbseInfoTableWrapperRef}>
          <table className="cx-seat-table cx-seat-table--info">
            {colWidths(cbseInfoColumnWidths)}
            <tbody>
              <tr>
                <th scope="row">Name Of Centre</th>
                <td colSpan={2}>Centre Name</td>
                <th scope="row">Centre No</th>
                <td className="cx-seat-strong">202601</td>
              </tr>
              <tr>
                <th scope="row">
                  Name Of
                  <br />
                  Examination
                </th>
                <td colSpan={2}>Senior School Certificate Examinations - 2026</td>
                <th scope="row">Subject</th>
                <td className="cx-seat-strong">184 ; ENGLISH (LANG. &amp; LIT.)</td>
              </tr>
              <tr>
                <th scope="row">Date</th>
                <td colSpan={2}>15.02.2026</td>
                <th scope="row">Room No.</th>
                <td className="cx-seat-strong">01</td>
              </tr>
            </tbody>
          </table>
          {colHandles(cbseInfoColumnBoundaries, startInfoColumnResize, 'Drag to resize info table columns')}
        </div>

        <div className="cx-seat-resize" ref={cbseTableWrapperRef}>
          <table className="cx-seat-table cx-seat-table--info">
            {colWidths(cbseColumnWidths)}
            <thead>
              <tr>
                <th colSpan={2} className="cx-seat-cbse__head">Row 1</th>
                <th colSpan={2} className="cx-seat-cbse__head">Row 2</th>
                <th colSpan={2} className="cx-seat-cbse__head">Row 3</th>
              </tr>
              <tr>
                {[0, 1, 2].map((group) => (
                  <React.Fragment key={group}>
                    <th className="cx-seat-cbse__subhead">Roll No</th>
                    <th className="cx-seat-cbse__subhead">Q.P. Code</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[0, 1, 2].map((group) => (
                    <React.Fragment key={group}>
                      <td className="cx-seat-cbse__cell cx-seat-num">{20261001 + group * 8 + i}</td>
                      <td className="cx-seat-cbse__cell" />
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {colHandles(cbseColumnBoundaries, startColumnResize, 'Drag to resize column')}
        </div>

        {rowHandle(startRowHeightResize, cbseLayoutDraft.rowHeight)}

        <div className="cx-seat-cbse__foot">
          <div>
            <p className="cx-seat-strong">Signature of Assistant</p>
            <p className="cx-seat-strong">Superintendent</p>
            <p>1. ______________</p>
            <p>2. ______________</p>
          </div>
          <div>
            <p className="cx-seat-strong">Total Students</p>
            <p>
              <span className="cx-seat-strong">Registered:</span> 24
            </p>
            <p>
              <span className="cx-seat-strong">Present:</span> ________
            </p>
            <p>
              <span className="cx-seat-strong">Absent:</span> ________
            </p>
          </div>
        </div>
        <p className="cx-seat-sign">Signature of Centre Superintendent</p>
      </div>
    )
  }

  return (
    <Page>
      {isExmclRoute ? (
        <Card title="Seating plan mode" subtitle="Applies to every exam in this session's datesheet.">
          <RadioGroup
            label="Seating plan mode"
            orientation="horizontal"
            variant="cards"
            value={seatingPlanMode}
            onChange={(mode) => void handleSeatingPlanModeChange(mode as SeatingPlanMode)}
            options={[
              {
                value: 'same_across_days',
                label: 'Same room every day',
                description: 'Each student keeps the same room on every exam day.',
                disabled: loadingSeatingPlanMode || savingSeatingPlanMode,
              },
              {
                value: 'different_per_day',
                label: 'Different each day',
                description: 'Students are seated in different rooms across exam days.',
                disabled: loadingSeatingPlanMode || savingSeatingPlanMode,
              },
            ]}
          />
        </Card>
      ) : null}

      <div ref={scheduleTableRef}>
        <Card flush title="Examination schedule" subtitle="Pick a format, then generate the seating plan for an exam to preview and download it.">
          <CardToolbar>
            <Tabs
              variant="segmented"
              label="Seating plan format"
              value={activeTab}
              onChange={handleFormatChange}
              items={FORMAT_ORDER.map((id) => ({ id, label: FORMAT_LABELS[id] }))}
            />
          </CardToolbar>
          <DataTable
            caption="Examination schedule"
            columns={columns}
            rows={error ? [] : datesheetEntries}
            getRowKey={(entry) => entry._id}
            loading={loading}
            loadingLabel="Loading the examination schedule…"
            maxHeight="max(360px, calc(100vh - 320px))"
            empty={
              error ? (
                <EmptyState
                  icon={AlertCircle}
                  title="The examination schedule didn’t load"
                  body={error}
                  action={
                    <Button size="sm" onClick={() => void refetch()}>
                      Try again
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No exams in the datesheet yet"
                  body="Import a datesheet first. Each exam then gets its own seating plan here."
                />
              )
            }
          />
        </Card>
      </div>

      <Card
        flush
        title={`${formatLabel} layout`}
        subtitle="Sample data. Drag a column edge or the row-height bar to adjust the printed layout; changes save automatically."
      >
        <PaperStage flush>
          <Paper pageSize="A4" width={794}>
            <div className="cx-seat-sheet">{renderTemplate()}</div>
          </Paper>
        </PaperStage>
      </Card>

      <Sheet
        open={showPreviewDialog && !!previewPdfUrl}
        onClose={closePreviewDialog}
        size="xl"
        icon={FileText}
        title="Seating plan preview"
        description={previewFilename ? previewFilename.replace(/\.pdf$/i, '') : undefined}
        footer={
          <>
            <Button onClick={closePreviewDialog}>Close</Button>
            <Button icon={ExternalLink} onClick={openPreviewInNewTab}>
              Open in new tab
            </Button>
            <Button variant="primary" icon={Download} onClick={downloadPreview}>
              Download PDF
            </Button>
          </>
        }
      >
        <PaperStage
          state={
            previewRenderError ? (
              <EmptyState
                icon={AlertCircle}
                title="The preview couldn’t be shown"
                body={previewRenderError}
              />
            ) : undefined
          }
        >
          {previewPdfUrl ? (
            <Document
              file={previewPdfUrl}
              className={PAPER_PAGES_CLASS}
              loading={<CardLoading label="Rendering preview…" />}
              onLoadSuccess={({ numPages }) => {
                setPreviewPageCount(numPages)
                setPreviewRenderError(null)
              }}
              onLoadError={(error) => {
                console.error('Failed to render seating plan preview:', error)
                const message = (error as Error)?.message || 'Unknown PDF render error'
                setPreviewRenderError(`The PDF didn’t render here (${message}). Open it in a new tab or download it instead.`)
              }}
            >
              {Array.from({ length: previewPageCount }).map((_, index) => (
                <Paper key={`seating-preview-page-${index + 1}`}>
                  <PdfPage
                    pageNumber={index + 1}
                    width={previewPageWidth()}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Paper>
              ))}
            </Document>
          ) : null}
        </PaperStage>
      </Sheet>
    </Page>
  )
}

export default SeatingPlan
