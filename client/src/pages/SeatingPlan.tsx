import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import toast from 'react-hot-toast'
import {
  useCentreDatesheetEntries,
  useGenerateSeatingPlanPDFMutation,
  useSeatingPlanTemplateSettings,
  useUpdateSeatingPlanTemplateSettingsMutation,
  type SeatingPlanFormat,
} from '../hooks/useSeatingPlan'
import {
  seatingPlanService,
  type CBSECopyTemplateSettings,
  type MainGateTemplateSettings,
  type RoomDoorSlipTemplateSettings,
  type RoomFolderSlipTemplateSettings,
  type SeatingPlanMode,
  type SeatingPlanTemplateSettings,
} from '../services/seatingPlanService'
import Loader from '../components/common/Loader'
import { Tabs } from '../components/common/Tabs'
import './SeatingPlan.css'

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

      const scrollContainer =
        root.querySelector<HTMLElement>('.seating-table-wrapper') ?? root

      const targetRow =
        scrollContainer.querySelector<HTMLElement>(`tr[data-date="${todayDateKey}"]`) ||
        (nextExamDateKey
          ? scrollContainer.querySelector<HTMLElement>(`tr[data-date="${nextExamDateKey}"]`)
          : null) ||
        scrollContainer.querySelector<HTMLElement>('tbody tr')

      if (!targetRow) return
      autoScrolledRef.current = true
      const containerRect = scrollContainer.getBoundingClientRect()
      const rowRect = targetRow.getBoundingClientRect()
      const offset =
        rowRect.top + rowRect.height / 2 - (containerRect.top + containerRect.height / 2)
      scrollContainer.scrollTop += offset
    }, 200)
    return () => clearTimeout(timer)
  }, [loading, datesheetEntries.length, todayDateKey, nextExamDateKey])

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

  const formatTabs = useMemo(
    () =>
      [
        {
          id: 'mainGate' as const,
          label: 'Main Gate',
          color: 'blue' as const,
          disabled: pdfMutation.isPending && activeTab !== 'mainGate',
        },
        {
          id: 'roomFolderSlip' as const,
          label: 'Invigilator Slip',
          color: 'emerald' as const,
          disabled: pdfMutation.isPending && activeTab !== 'roomFolderSlip',
        },
        {
          id: 'roomDoorSlip' as const,
          label: 'Room Door Slip',
          color: 'yellow' as const,
          disabled: pdfMutation.isPending && activeTab !== 'roomDoorSlip',
        },
        {
          id: 'cbseCopy' as const,
          label: 'CBSE Format',
          color: 'purple' as const,
          disabled: pdfMutation.isPending && activeTab !== 'cbseCopy',
        },
      ] as const,
    [pdfMutation.isPending, activeTab]
  )

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900">
      {/* Examination schedule — Datesheets-style shell: format tabs + table */}
      <div
        ref={scheduleTableRef}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-8"
      >
        <div className="flex flex-col gap-3 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs<SeatingPlanFormat>
              tabs={[...formatTabs]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="pill"
              size="sm"
              ariaLabel="Seating plan format"
            />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 sm:text-right">
              Examination Schedule
            </h3>
          </div>
          {isExmclRoute ? (
            <div className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Seating plan mode</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {seatingPlanMode === 'same_across_days'
                    ? 'Each student keeps the same room on every exam day.'
                    : 'Students are seated in different rooms across exam days.'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={loadingSeatingPlanMode || savingSeatingPlanMode}
                  onClick={() => void handleSeatingPlanModeChange('same_across_days')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    seatingPlanMode === 'same_across_days'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
                  }`}
                >
                  Same across all days
                </button>
                <button
                  type="button"
                  disabled={loadingSeatingPlanMode || savingSeatingPlanMode}
                  onClick={() => void handleSeatingPlanModeChange('different_per_day')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    seatingPlanMode === 'different_per_day'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
                  }`}
                >
                  Different each day
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto sp-datesheet-scroll-container">
          <div className="seating-table-wrapper overflow-x-auto pb-4">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader size="lg" />
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            ) : datesheetEntries.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                No datesheet entries found. Please import a datesheet first.
              </div>
            ) : (
              <table className="min-w-[1100px] w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50/50 dark:bg-gray-900/50">
                  <tr>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Sr No
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Date
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Day
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Subject Code
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Subject Name
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Class
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Time
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Candidates
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      No Of Rooms
                    </th>
                    <th className="sticky top-0 z-20 px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
                      Download
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {datesheetEntries.map((entry, index) => {
                    const examDateKey = getCalendarDateKey(entry.examDate)
                    const isTodayExam = examDateKey === todayDateKey
                    const isNextExam = !isTodayExam && !!nextExamDateKey && examDateKey === nextExamDateKey

                    let rowClassName =
                      'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors'

                    if (isTodayExam) {
                      rowClassName =
                        'bg-green-50 dark:bg-green-900/20 hover:bg-green-100/60 dark:hover:bg-green-900/30 transition-colors'
                    } else if (isNextExam) {
                      rowClassName =
                        'bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100/60 dark:hover:bg-yellow-900/30 transition-colors'
                    } else if (entry.class === '10') {
                      rowClassName =
                        'bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors'
                    } else if (entry.class === '12') {
                      rowClassName =
                        'bg-violet-50/30 dark:bg-violet-900/10 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-colors'
                    }

                    const classBadgeClass =
                      entry.class === '10'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                        : entry.class === '12'
                          ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 ring-1 ring-violet-500/20'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'

                    return (
                      <tr key={entry._id} data-date={examDateKey} className={rowClassName}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                          {String(index + 1).padStart(2, '0')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          <div className="inline-flex items-center gap-2">
                            <span>{formatDate(entry.examDate)}</span>
                            {isTodayExam && (
                              <span className="inline-flex items-center rounded-full bg-green-200 dark:bg-green-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-900 dark:text-green-100">
                                Today
                              </span>
                            )}
                            {isNextExam && (
                              <span className="inline-flex items-center rounded-full bg-yellow-200 dark:bg-yellow-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-900 dark:text-yellow-100">
                                Next
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {entry.dayName || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                          {entry.subjectCode}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                          {entry.subjectName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classBadgeClass}`}
                          >
                            Class {entry.class}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatTime(entry.timeSlot.start)} - {formatTime(entry.timeSlot.end)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right text-gray-900 dark:text-white">
                          {entry.candidateCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                          {entry.roomsNeeded === 0 ? (
                            <span className="italic text-xs text-amber-600 dark:text-amber-400">Shared</span>
                          ) : (
                            entry.roomsNeeded
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => handleDownloadPDF(entry._id, activeTab)}
                            disabled={pdfMutation.isPending}
                            className={`text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 ${pdfMutation.isPending && downloadingId !== entry._id ? 'cursor-not-allowed' : ''}`}
                            title={`Download ${activeTab === 'mainGate' ? 'Main Gate' : activeTab === 'roomFolderSlip' ? 'Invigilator Slip' : activeTab === 'roomDoorSlip' ? 'Room Door Slip' : 'CBSE Format'}`}
                          >
                            {downloadingId === entry._id ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Template preview / layout editor */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {activeTab === 'mainGate' && 'Main Gate format preview'}
            {activeTab === 'roomFolderSlip' && 'Invigilator slip format preview'}
            {activeTab === 'roomDoorSlip' && 'Room door slip format preview'}
            {activeTab === 'cbseCopy' && 'CBSE format preview'}
          </h3>
        </div>

        <div className="p-6">
          {activeTab === 'mainGate' && (
            <div className="space-y-4">
              {/* Main Gate Preview */}
              <div className="overflow-x-auto py-2">
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-900 mx-auto seating-plan-preview-page">
                  {/* Header */}
                  <div className="text-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Centre Name</h2>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Seating Plan CBSE Board Exam</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Centre No: 202601</p>
                  </div>

                  {/* Exam Details */}
                  <div className="flex justify-between mb-4 text-sm font-bold text-gray-900 dark:text-white">
                    <div>
                      <p>Date: 15.02.2026 (Saturday)</p>
                      <p>Subject: English (Lang. & Lit.)</p>
                    </div>
                    <div className="text-right">
                      <p>Class: X</p>
                      <p>Subject Code: 184</p>
                    </div>
                  </div>

                  {/* Room Table 1 */}
                  <style>{`.sp-main-gate-layout { --sp-col1-width: ${mainGateLayoutDraft.col1Width}%; --sp-col2-width: ${mainGateLayoutDraft.col2Width}%; --sp-col3-width: ${mainGateLayoutDraft.col3Width}%; --sp-col4-width: ${mainGateLayoutDraft.col4Width}%; --sp-row-height: ${mainGateLayoutDraft.rowHeight}px; }${mainGateColumnBoundaries.map((b, i) => `.sp-main-gate-boundary-${i} { left: ${b}%; }`).join(' ')}`}</style>
                  <div className="relative mb-5" ref={mainGateTableWrapperRef}>
                    <table className="w-full border-collapse seating-plan-table-layout-fixed sp-main-gate-layout">
                      <colgroup>
                        <col className="sp-col-1" />
                        <col className="sp-col-2" />
                        <col className="sp-col-3" />
                        <col className="sp-col-4" />
                      </colgroup>
                      <caption className="text-sm font-bold text-gray-900 dark:text-white p-2 border border-black dark:border-gray-400 border-b-0 bg-white dark:bg-gray-900">
                        Room No. 01 - X Rose (First Floor)
                      </caption>
                      <thead>
                        <tr>
                          <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row</th>
                          <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 1</th>
                          <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 2</th>
                          <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(8)].map((_, i) => (
                          <tr key={i}>
                            <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center font-bold text-gray-900 dark:text-white text-sm">Roll No</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261001 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261009 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261017 + i}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {mainGateColumnBoundaries.map((_, index) => (
                      <div
                        key={`main-gate-boundary-${index}`}
                        className={`sp-main-gate-boundary-${index} absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20`}
                        onMouseDown={(event) => startMainGateColumnResize(index, event)}
                        title="Drag to resize column"
                      />
                    ))}
                  </div>

                  {/* Room Table 2 */}
                  <table className="w-full border-collapse mb-5 seating-plan-table-layout-fixed sp-main-gate-layout">
                    <colgroup>
                      <col className="sp-col-1" />
                      <col className="sp-col-2" />
                      <col className="sp-col-3" />
                      <col className="sp-col-4" />
                    </colgroup>
                    <caption className="text-sm font-bold text-gray-900 dark:text-white p-2 border border-black dark:border-gray-400 border-b-0 bg-white dark:bg-gray-900">
                      Room No. 02 - X Tulip (First Floor)
                    </caption>
                    <thead>
                      <tr>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 1</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 2</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(8)].map((_, i) => (
                        <tr key={i}>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center font-bold text-gray-900 dark:text-white text-sm">Roll No</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261025 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261033 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261041 + i}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Room Table 3 */}
                  <table className="w-full border-collapse mb-5 seating-plan-table-layout-fixed sp-main-gate-layout">
                    <colgroup>
                      <col className="sp-col-1" />
                      <col className="sp-col-2" />
                      <col className="sp-col-3" />
                      <col className="sp-col-4" />
                    </colgroup>
                    <caption className="text-sm font-bold text-gray-900 dark:text-white p-2 border border-black dark:border-gray-400 border-b-0 bg-white dark:bg-gray-900">
                      Room No. 03 - X Lotus (First Floor)
                    </caption>
                    <thead>
                      <tr>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 1</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 2</th>
                        <th className="border border-black dark:border-gray-400 p-1.5 font-bold text-gray-900 dark:text-white text-sm">Row 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(8)].map((_, i) => (
                        <tr key={i}>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center font-bold text-gray-900 dark:text-white text-sm">Roll No</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261049 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261057 + i}</td>
                          <td className="sp-row-height-cell border border-black dark:border-gray-400 p-1.5 text-center text-gray-700 dark:text-gray-300 font-mono text-sm">{20261065 + i}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-2 flex-1 rounded bg-blue-100 dark:bg-blue-900/30 cursor-row-resize"
                      onMouseDown={startMainGateRowHeightResize}
                      title="Drag up/down to resize row height"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Row Height: {mainGateLayoutDraft.rowHeight}px
                    </span>
                  </div>

                  {/* Footer */}
                  <p className="mt-16 text-right font-bold text-gray-900 dark:text-white">CENTRE SUPERINTENDENT</p>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                Click the download button next to any exam to generate the Main Gate PDF with actual candidate data.
              </p>
            </div>
          )}

          {activeTab === 'roomFolderSlip' && (
            <div className="space-y-4">
              <div className="overflow-x-auto py-2">
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-900 mx-auto seating-plan-preview-page">
                  <h2 className="text-lg font-bold text-center mb-4 text-gray-900 dark:text-white">SEATING PLAN</h2>

                  <style>{`.sp-room-folder-info-cols { --sp-info-col-1: ${roomFolderLayoutDraft.infoCol1Width}%; --sp-info-col-2: ${roomFolderLayoutDraft.infoCol2Width}%; --sp-info-col-3: ${roomFolderLayoutDraft.infoCol3Width}%; --sp-info-col-4: ${roomFolderLayoutDraft.infoCol4Width}%; --sp-info-col-5: ${roomFolderLayoutDraft.infoCol5Width}%; --sp-info-col-6: ${roomFolderLayoutDraft.infoCol6Width}%; --sp-info-col-7: ${roomFolderLayoutDraft.infoCol7Width}%; } .sp-room-folder-data-cols { --sp-data-col-1: ${roomFolderLayoutDraft.col1Width}%; --sp-data-col-2: ${roomFolderLayoutDraft.col2Width}%; --sp-data-col-3: ${roomFolderLayoutDraft.col3Width}%; --sp-data-col-4: ${roomFolderLayoutDraft.col4Width}%; --sp-data-col-5: ${roomFolderLayoutDraft.col5Width}%; --sp-data-col-6: ${roomFolderLayoutDraft.col6Width}%; --sp-data-col-7: ${roomFolderLayoutDraft.col7Width}%; --sp-data-col-8: ${roomFolderLayoutDraft.col8Width}%; --sp-data-col-9: ${roomFolderLayoutDraft.col9Width}%; --sp-row-height: ${roomFolderLayoutDraft.rowHeight}px; } ${roomFolderInfoColumnBoundaries.map((b, i) => `.sp-rf-info-b-${i} { left: ${b}%; }`).join(' ')} ${roomFolderColumnBoundaries.map((b, i) => `.sp-rf-data-b-${i} { left: ${b}%; }`).join(' ')}`}</style>
                  <div className="relative mb-4" ref={roomFolderInfoTableWrapperRef}>
                    <table className="w-full border-collapse text-sm seating-plan-table-layout-fixed sp-room-folder-info-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Centre</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>
                            Centre Name
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Centre No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">202601</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Class: XII</td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Examination</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>
                            Senior School Certificate Examinations - 2026
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Subject</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            048 ; PHYSICAL EDUCATION
                          </td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Date</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>18.02.2026 (Wednesday)</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Room No.</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-900 dark:text-white font-bold" colSpan={2}>02 - XII A</td>
                        </tr>
                      </tbody>
                    </table>
                    {roomFolderInfoColumnBoundaries.map((_, index) => (
                      <div
                        key={`room-folder-info-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-rf-info-b-${index}`}
                        onMouseDown={(event) => startRoomFolderInfoColumnResize(index, event)}
                        title="Drag to resize info table columns"
                      />
                    ))}
                  </div>

                  <div className="relative" ref={roomFolderTableWrapperRef}>
                    <table className="w-full border-collapse text-xs seating-plan-table-layout-fixed sp-room-folder-data-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 1</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 2</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 3</th>
                        </tr>
                        <tr>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                          <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(8)].map((_, i) => (
                          <tr key={i}>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261025 + i}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{(i % 3) + 1}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A00{41 + i}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261033 + i}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{((i + 1) % 3) + 1}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A00{49 + i}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261041 + i}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{((i + 2) % 3) + 1}</td>
                            <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A00{57 + i}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td className="border border-gray-800 dark:border-gray-400 p-2" colSpan={2}>Registered:</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-2 text-center">24</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-2" colSpan={2}>Present:</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-2"></td>
                          <td className="border border-gray-800 dark:border-gray-400 p-2" colSpan={2}>Absent:</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                    {roomFolderColumnBoundaries.map((_, index) => (
                      <div
                        key={`room-folder-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-rf-data-b-${index}`}
                        onMouseDown={(event) => startRoomFolderColumnResize(index, event)}
                        title="Drag to resize column"
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 mb-1">
                    <div
                      className="h-2 flex-1 rounded bg-green-100 dark:bg-green-900/30 cursor-row-resize"
                      onMouseDown={startRoomFolderRowHeightResize}
                      title="Drag up/down to resize row height"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Row Height: {roomFolderLayoutDraft.rowHeight}px
                    </span>
                  </div>
                  <div className="my-4 border-t border-dashed border-gray-400 dark:border-gray-500" />

                  <table className="w-full border-collapse mb-4 text-sm seating-plan-table-layout-fixed sp-room-folder-info-cols">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Centre</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>
                          Centre Name
                        </td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Centre No</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">202601</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Class: XII</td>
                      </tr>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Examination</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>
                          Senior School Certificate Examinations - 2026
                        </td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Subject</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                          048 ; PHYSICAL EDUCATION
                        </td>
                      </tr>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Date</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={3}>18.02.2026 (Wednesday)</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Room No.</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-900 dark:text-white font-bold" colSpan={2}>03 - XII B</td>
                      </tr>
                    </tbody>
                  </table>

                  <table className="w-full border-collapse text-xs seating-plan-table-layout-fixed sp-room-folder-data-cols">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 1</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 2</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-2" colSpan={3}>Row 3</th>
                      </tr>
                      <tr>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Roll No</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">QP Code</th>
                        <th className="border border-gray-800 dark:border-gray-400 p-1.5">Sheet No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(8)].map((_, i) => (
                        <tr key={`second-slip-row-${i}`}>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261049 + i}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{(i % 3) + 1}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A10{41 + i}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261057 + i}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{((i + 1) % 3) + 1}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A10{49 + i}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{20261065 + i}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">{((i + 2) % 3) + 1}</td>
                          <td className="border border-gray-800 dark:border-gray-400 p-1.5 text-center sp-row-height-cell">A10{57 + i}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roomDoorSlip' && (
            <div className="space-y-4">
              <div className="overflow-x-auto py-2">
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-900 mx-auto seating-plan-preview-page">
                  <h2 className="text-xl font-bold text-center mb-4 text-gray-900 dark:text-white">SEATING PLAN</h2>

                  <style>{`.sp-room-door-info-cols { --sp-door-info-col-1: ${roomDoorLayoutDraft.infoCol1Width}%; --sp-door-info-col-2: ${roomDoorLayoutDraft.infoCol2Width}%; --sp-door-info-col-3: ${roomDoorLayoutDraft.infoCol3Width}%; --sp-door-info-col-4: ${roomDoorLayoutDraft.infoCol4Width}%; --sp-door-info-col-5: ${roomDoorLayoutDraft.infoCol5Width}%; --sp-door-info-col-6: ${roomDoorLayoutDraft.infoCol6Width}%; } .sp-room-door-data-cols { --sp-door-data-col-1: ${roomDoorLayoutDraft.col1Width}%; --sp-door-data-col-2: ${roomDoorLayoutDraft.col2Width}%; --sp-door-data-col-3: ${roomDoorLayoutDraft.col3Width}%; --sp-door-row-height: ${roomDoorLayoutDraft.rowHeight}px; } ${roomDoorInfoColumnBoundaries.map((b, i) => `.sp-rd-info-b-${i} { left: ${b}%; }`).join(' ')} ${roomDoorColumnBoundaries.map((b, i) => `.sp-rd-data-b-${i} { left: ${b}%; }`).join(' ')}`}</style>
                  <div className="relative mb-4" ref={roomDoorInfoTableWrapperRef}>
                    <table className="w-full border-collapse text-sm seating-plan-table-layout-fixed sp-room-door-info-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Centre</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            Centre Name
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Centre No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">202601</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Class: XII</td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Examination</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            Senior School Certificate Examinations - 2026
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Subject</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            048 ; PHYSICAL EDUCATION
                          </td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Date</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>18.02.2026 (Wednesday)</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Room No.</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-900 dark:text-white font-bold" colSpan={2}>02 - XII A</td>
                        </tr>
                      </tbody>
                    </table>
                    {roomDoorInfoColumnBoundaries.map((_, index) => (
                      <div
                        key={`room-door-info-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-rd-info-b-${index}`}
                        onMouseDown={(event) => startRoomDoorInfoColumnResize(index, event)}
                        title="Drag to resize info table columns"
                      />
                    ))}
                  </div>

                  <div className="relative" ref={roomDoorTableWrapperRef}>
                    <table className="w-full border-collapse text-sm seating-plan-table-layout-fixed sp-room-door-data-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 1</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 2</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 3</th>
                        </tr>
                        <tr>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(8)].map((_, i) => (
                          <tr key={i}>
                            <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261025 + i}</td>
                            <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261033 + i}</td>
                            <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261041 + i}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {roomDoorColumnBoundaries.map((_, index) => (
                      <div
                        key={`room-door-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-rd-data-b-${index}`}
                        onMouseDown={(event) => startRoomDoorColumnResize(index, event)}
                        title="Drag to resize column"
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 mb-1">
                    <div
                      className="h-2 flex-1 rounded bg-yellow-100 dark:bg-yellow-900/30 cursor-row-resize"
                      onMouseDown={startRoomDoorRowHeightResize}
                      title="Drag up/down to resize row height"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Row Height: {roomDoorLayoutDraft.rowHeight}px
                    </span>
                  </div>

                  <div className="my-4 border-t border-dashed border-gray-400 dark:border-gray-500" />

                  <table className="w-full border-collapse mb-4 text-sm seating-plan-table-layout-fixed sp-room-door-info-cols">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Centre</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>Centre Name</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Centre No</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">202601</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Class: XII</td>
                      </tr>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Name Of Examination</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>Senior School Certificate Examinations - 2026</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Subject</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>048 ; PHYSICAL EDUCATION</td>
                      </tr>
                      <tr>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">Date</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>18.02.2026 (Wednesday)</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold bg-gray-50 dark:bg-gray-800 text-center text-gray-900 dark:text-white">Room No.</td>
                        <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-900 dark:text-white font-bold" colSpan={2}>03 - XII B</td>
                      </tr>
                    </tbody>
                  </table>

                  <table className="w-full border-collapse text-sm seating-plan-table-layout-fixed sp-room-door-data-cols">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 1</th>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 2</th>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Row 3</th>
                      </tr>
                      <tr>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                        <th className="border-2 border-gray-800 dark:border-gray-400 p-2">Roll No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(8)].map((_, i) => (
                        <tr key={`second-door-row-${i}`}>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261049 + i}</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261057 + i}</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center sp-row-height-cell">{20261065 + i}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cbseCopy' && (
            <div className="space-y-4">
              {/* CBSE Format Preview */}
              <div className="overflow-x-auto py-2">
                <style>{`.sp-cbse-info-cols { --sp-cbse-info-col-1: ${cbseLayoutDraft.infoCol1Width}%; --sp-cbse-info-col-2: ${cbseLayoutDraft.infoCol2Width}%; --sp-cbse-info-col-3: ${cbseLayoutDraft.infoCol3Width}%; --sp-cbse-info-col-4: ${cbseLayoutDraft.infoCol4Width}%; --sp-cbse-info-col-5: ${cbseLayoutDraft.infoCol5Width}%; } .sp-cbse-data-cols { --sp-cbse-data-col-1: ${cbseLayoutDraft.col1Width}%; --sp-cbse-data-col-2: ${cbseLayoutDraft.col2Width}%; --sp-cbse-data-col-3: ${cbseLayoutDraft.col3Width}%; --sp-cbse-data-col-4: ${cbseLayoutDraft.col4Width}%; --sp-cbse-data-col-5: ${cbseLayoutDraft.col5Width}%; --sp-cbse-data-col-6: ${cbseLayoutDraft.col6Width}%; --sp-cbse-header-font-size: ${cbseLayoutDraft.headerFontSize}pt; --sp-cbse-subheader-font-size: ${cbseLayoutDraft.subHeaderFontSize}pt; --sp-cbse-row-height: ${cbseLayoutDraft.rowHeight}px; --sp-cbse-cell-padding-y: ${cbseLayoutDraft.cellPaddingY}px; --sp-cbse-cell-padding-x: ${cbseLayoutDraft.cellPaddingX}px; --sp-cbse-body-font-size: ${cbseLayoutDraft.bodyFontSize}pt; } ${cbseInfoColumnBoundaries.map((b, i) => `.sp-cbse-info-b-${i} { left: ${b}%; }`).join(' ')} ${cbseColumnBoundaries.map((b, i) => `.sp-cbse-data-b-${i} { left: ${b}%; }`).join(' ')}`}</style>
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-900 mx-auto sp-preview-page-size">
                  {/* Header */}
                  <h2 className="text-xl font-bold text-center mb-4 text-gray-900 dark:text-white">SEATING PLAN</h2>

                  {/* Info Table */}
                  <div className="relative mb-4" ref={cbseInfoTableWrapperRef}>
                    <table className="w-full border-collapse seating-plan-table-layout-fixed sp-cbse-info-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white">Name Of Centre</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            Centre Name
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white">Centre No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">202601</td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white">Name Of<br />Examination</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>
                            Senior School Certificate Examinations - 2026
                          </td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white">Subject</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-sm text-gray-900 dark:text-white">184 ; ENGLISH (LANG. & LIT.)</td>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white">Date</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center text-gray-700 dark:text-gray-300" colSpan={2}>15.02.2026</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white">Room No.</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 text-center font-bold text-gray-900 dark:text-white">01</td>
                        </tr>
                      </tbody>
                    </table>

                    {cbseInfoColumnBoundaries.map((_, index) => (
                      <div
                        key={`cbse-info-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-cbse-info-b-${index}`}
                        onMouseDown={(event) => startInfoColumnResize(index, event)}
                        title="Drag to resize info table columns"
                      />
                    ))}
                  </div>

                  {/* Seating Table */}
                  <div className="relative" ref={cbseTableWrapperRef}>
                    <table className="w-full border-collapse mb-4 seating-plan-table-layout-fixed sp-cbse-data-cols">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white sp-cbse-header-font" colSpan={2}>Row 1</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white sp-cbse-header-font" colSpan={2}>Row 2</th>
                          <th className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-gray-900 dark:text-white sp-cbse-header-font" colSpan={2}>Row 3</th>
                        </tr>
                        <tr>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Roll No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Q.P. Code</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Roll No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Q.P. Code</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Roll No</td>
                          <td className="border-2 border-gray-800 dark:border-gray-400 p-2 font-bold text-center text-gray-900 dark:text-white sp-cbse-subheader-font">Q.P. Code</td>
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(8)].map((_, i) => (
                          <tr key={i}>
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-700 dark:text-gray-300 sp-cbse-body-cell">{20261001 + i}</td>
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-400 dark:text-gray-500 sp-cbse-body-cell" />
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-700 dark:text-gray-300 sp-cbse-body-cell">{20261009 + i}</td>
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-400 dark:text-gray-500 sp-cbse-body-cell" />
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-700 dark:text-gray-300 sp-cbse-body-cell">{20261017 + i}</td>
                            <td className="border-2 border-gray-800 dark:border-gray-400 text-center text-gray-400 dark:text-gray-500 sp-cbse-body-cell" />
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {cbseColumnBoundaries.map((_, index) => (
                      <div
                        key={`cbse-boundary-${index}`}
                        className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-20 sp-cbse-data-b-${index}`}
                        onMouseDown={(event) => startColumnResize(index, event)}
                        title="Drag to resize column"
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-2 flex-1 rounded bg-purple-100 dark:bg-purple-900/30 cursor-row-resize"
                      onMouseDown={startRowHeightResize}
                      title="Drag up/down to resize row height"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Row Height: {cbseLayoutDraft.rowHeight}px
                    </span>
                  </div>

                  {/* Footer Section */}
                  <div className="flex justify-between mb-6 text-sm">
                    <div className="w-1/2 leading-relaxed">
                      <p className="font-bold text-gray-900 dark:text-white">Signature of Assistant</p>
                      <p className="font-bold text-gray-900 dark:text-white mb-3">Superintendent</p>
                      <p className="text-gray-700 dark:text-gray-300 mt-2">1. ______________</p>
                      <p className="text-gray-700 dark:text-gray-300 mt-3">2. ______________</p>
                    </div>
                    <div className="w-1/2 text-left pl-10 leading-relaxed">
                      <p className="font-bold text-gray-900 dark:text-white">Total Students</p>
                      <p className="text-gray-700 dark:text-gray-300 mt-2"><span className="font-bold text-gray-900 dark:text-white">Registered:</span> 24</p>
                      <p className="text-gray-700 dark:text-gray-300 mt-3"><span className="font-bold text-gray-900 dark:text-white">Present:</span> ________</p>
                      <p className="text-gray-700 dark:text-gray-300 mt-3"><span className="font-bold text-gray-900 dark:text-white">Absent:</span> ________</p>
                    </div>
                  </div>

                  <p className="text-right font-bold text-gray-900 dark:text-white">Signature of Centre Superintendent</p>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                Click the download button next to any exam to generate the CBSE Format PDF with actual candidate data.
              </p>
            </div>
          )}
        </div>
      </div>

      {showPreviewDialog && previewPdfUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-6xl h-[88vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Seating Plan PDF Preview
              </h4>
              <div className="flex items-center gap-2">
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Open in New Tab
                </a>
                <a
                  href={previewPdfUrl}
                  download={previewFilename || 'seating-plan.pdf'}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  Download PDF
                </a>
                <button
                  type="button"
                  onClick={closePreviewDialog}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="w-full flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 p-4">
              {previewRenderError ? (
                <div className="h-full w-full flex items-center justify-center p-6 text-center text-sm text-gray-600 dark:text-gray-300">
                  {previewRenderError}
                </div>
              ) : (
                <Document
                  file={previewPdfUrl}
                  loading={
                    <div className="h-full w-full flex items-center justify-center text-sm text-gray-600 dark:text-gray-300">
                      Loading PDF preview...
                    </div>
                  }
                  onLoadSuccess={({ numPages }) => {
                    setPreviewPageCount(numPages)
                    setPreviewRenderError(null)
                  }}
                  onLoadError={(error) => {
                    console.error('Failed to render seating plan preview:', error)
                    const message = (error as Error)?.message || 'Unknown PDF render error'
                    setPreviewRenderError(`Failed to render preview in dialog (${message}). Use "Open in New Tab" or "Download PDF".`)
                  }}
                  className="flex flex-col items-center gap-4"
                >
                  {Array.from({ length: previewPageCount }).map((_, index) => (
                    <Page
                      key={`seating-preview-page-${index + 1}`}
                      pageNumber={index + 1}
                      width={980}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  ))}
                </Document>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SeatingPlan
