import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Document, Page as PdfPage, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import toast from 'react-hot-toast'
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  BookOpen,
  Clock,
  Coffee,
  FileText,
  History,
  Link2,
  Plus,
  Save,
  Timer,
  Trash2,
} from 'lucide-react'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import bellTimingsService, {
  type BellTimingsPayload,
  type BellTimingVersionSummary,
} from '@/services/bellTimingsService'
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Page,
  Select,
  StatCard,
  TextField,
  cx,
  formatDate,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/timetable/bell-timings.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/* ──────────────────────────── Types ──────────────────────────── */

type PeriodType = 'period' | 'break'

/** Stored row — only label, type, and duration. "from"/"to" are derived. */
interface BellRow {
  id: string
  type: PeriodType
  label: string       // e.g. "1st", "LUNCH", "RECREATION"
  duration: number    // minutes
}

/** Derived row with computed from / to for display & PDF */
interface ComputedRow extends BellRow {
  from: string   // "HH:MM" 24-h
  to: string     // "HH:MM" 24-h
}

interface BellMeta {
  schoolName: string
  title: string
  session: string
  effectiveDate: string   // "YYYY-MM-DD"
}

/* ──────────────────────────── Helpers ──────────────────────────── */

let _uid = 0
const uid = () => `bt-${++_uid}-${Date.now()}`

/** "HH:MM" → total minutes since midnight */
const toMins = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Total minutes → "HH:MM" */
const fromMins = (total: number): string => {
  const clamped = ((total % 1440) + 1440) % 1440 // wrap within 24h
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** Format minutes → "X Minutes" */
const fmtDuration = (mins: number): string => {
  if (mins <= 0) return '-'
  return `${mins} Minutes`
}

/** "HH:MM" → "hh:MM AM/PM" with zero-padded hour */
const to12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Ordinal label for a period number */
const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Format "YYYY-MM-DD" → "dd.MM.yyyy (DayName)" */
const formatEffectiveDate = (iso: string): string => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${dd}.${mm}.${yyyy} (${dayName})`
}

const normalizeBellRows = (rowsInput: Array<Partial<BellRow>> | null | undefined): BellRow[] => {
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) {
    return defaultRows.map((row) => ({ ...row }))
  }

  return rowsInput.map((row, index) => {
    const type: PeriodType = row.type === 'break' ? 'break' : 'period'
    const fallbackLabel = type === 'break' ? 'BREAK' : ordinal(index + 1)
    const parsedDuration = Number.parseInt(String(row.duration ?? ''), 10)

    return {
      id: row.id?.trim() || `bt-loaded-${index + 1}-${Date.now()}`,
      type,
      label: String(row.label || '').trim() || fallbackLabel,
      duration: Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 480
        ? parsedDuration
        : type === 'break'
          ? 15
          : 40,
    }
  })
}

/* ──────────────────────────── Default data ──────────────────────────── */

const defaultMeta: BellMeta = {
  schoolName: '',
  title: 'SUMMER BELL TIMINGS',
  session: '',
  effectiveDate: '',
}

const defaultStartTime = '08:00'

const defaultRows: BellRow[] = [
  { id: uid(), type: 'break',  label: 'RECREATION', duration: 45 },
  { id: uid(), type: 'period', label: '1st',        duration: 40 },
  { id: uid(), type: 'period', label: '2nd',        duration: 40 },
  { id: uid(), type: 'period', label: '3rd',        duration: 40 },
  { id: uid(), type: 'break',  label: 'LUNCH',      duration: 15 },
  { id: uid(), type: 'period', label: '4th',        duration: 40 },
  { id: uid(), type: 'period', label: '5th',        duration: 40 },
  { id: uid(), type: 'period', label: '6th',        duration: 40 },
  { id: uid(), type: 'period', label: '7th',        duration: 40 },
]

/* ──────────────────────────── PDF Generation ──────────────────────────── */

/** Generate PDF and return as Blob (does NOT auto-download) */
const generatePDFBlob = async (meta: BellMeta, computed: ComputedRow[]): Promise<Blob> => {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // 210
  const pageH = doc.internal.pageSize.getHeight()   // 297

  const marginX = 30
  const tableW = pageW - marginX * 2  // 150mm

  let y = 30

  /* ── Header Section ── */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(meta.schoolName || 'SCHOOL NAME', pageW / 2, y, { align: 'center' })
  y += 7

  doc.setFontSize(12)
  doc.text(meta.title || 'BELL TIMINGS', pageW / 2, y, { align: 'center' })
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Session (${meta.session || '____-____'})`, pageW / 2, y, { align: 'center' })
  y += 10

  /* ── Effective date row ── */
  if (meta.effectiveDate) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const dateStr = `w.e.f. ${formatEffectiveDate(meta.effectiveDate)}`
    const dateTextW = doc.getTextWidth(dateStr) + 8
    const dateBoxX = (pageW - dateTextW) / 2
    doc.setLineWidth(0.3)
    doc.rect(dateBoxX, y - 4, dateTextW, 7)
    doc.text(dateStr, pageW / 2, y, { align: 'center' })
    y += 12
  } else {
    y += 4
  }

  /* ── Table ── */
  const colRatios = [0.22, 0.26, 0.26, 0.26]
  const colWidths = colRatios.map(r => r * tableW)
  const colX = [marginX]
  for (let i = 1; i < colWidths.length; i++) {
    colX.push(colX[i - 1] + colWidths[i - 1])
  }

  const rowH = 10
  const headerLabels = ['PERIOD', 'FROM', 'TO', 'DURATION']

  const drawCell = (x: number, w: number, h: number, text: string, bold = false, fontSize = 10) => {
    doc.setLineWidth(0.3)
    doc.rect(x, y, w, h)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    doc.text(text, x + w / 2, y + h / 2 + 1, { align: 'center' })
  }

  // Header row
  for (let c = 0; c < 4; c++) {
    drawCell(colX[c], colWidths[c], rowH, headerLabels[c], true, 11)
  }
  y += rowH

  // Data rows
  for (const row of computed) {
    const isBold = row.type === 'break'
    drawCell(colX[0], colWidths[0], rowH, row.label, isBold, 10)
    drawCell(colX[1], colWidths[1], rowH, to12h(row.from), isBold, 10)
    drawCell(colX[2], colWidths[2], rowH, to12h(row.to), isBold, 10)
    drawCell(colX[3], colWidths[3], rowH, fmtDuration(row.duration), isBold, 10)
    y += rowH
  }

  /* ── Signature Section ── */
  const sigY = Math.max(y + 30, pageH - 50)

  doc.setLineWidth(0.3)

  const sigLeftX = marginX + 10
  doc.line(sigLeftX, sigY, sigLeftX + 40, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('INCHARGE', sigLeftX + 20, sigY + 6, { align: 'center' })

  const sigRightX = pageW - marginX - 50
  doc.line(sigRightX, sigY, sigRightX + 40, sigY)
  doc.text('PRINCIPAL', sigRightX + 20, sigY + 6, { align: 'center' })

  /* ── Return as Blob ── */
  return doc.output('blob')
}

/* ──────────────────────────── Component ──────────────────────────── */

const BellTimings: React.FC = () => {
  const { currentSession } = useAcademicSession()
  const [meta, setMeta] = useState<BellMeta>(defaultMeta)
  const [rows, setRows] = useState<BellRow[]>(defaultRows)
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingSavedState, setIsLoadingSavedState] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [versions, setVersions] = useState<BellTimingVersionSummary[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [versionName, setVersionName] = useState('')
  const [isSavingVersion, setIsSavingVersion] = useState(false)
  const [isApplyingVersion, setIsApplyingVersion] = useState(false)
  const [isDeletingVersion, setIsDeletingVersion] = useState(false)

  /* ── PDF preview dialog state ── */
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewPageCount, setPreviewPageCount] = useState(0)
  const [previewRenderError, setPreviewRenderError] = useState<string | null>(null)
  /* ── View-only state: delete-version confirmation ── */
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState(false)

  /* ── Sync session from global academic session selector ── */
  useEffect(() => {
    if (currentSession) {
      setMeta(p => ({ ...p, session: currentSession }))
    }
  }, [currentSession])

  useEffect(() => {
    let mounted = true

    const loadSavedBellTimings = async () => {
      setIsLoadingSavedState(true)
      try {
        const [saved, loadedVersions] = await Promise.all([
          bellTimingsService.getBellTimings(),
          bellTimingsService.getVersions(),
        ])
        if (!mounted) return

        setMeta({
          schoolName: saved.meta.schoolName || '',
          title: saved.meta.title || defaultMeta.title,
          session: currentSession || saved.meta.session || '',
          effectiveDate: saved.meta.effectiveDate || '',
        })
        setStartTime(saved.startTime || defaultStartTime)
        setRows(normalizeBellRows(saved.rows))
        setVersions(loadedVersions)
      } catch {
        if (!mounted) return
        toast.error('Failed to load saved bell timings.')
        setRows(defaultRows.map((row) => ({ ...row })))
      } finally {
        if (mounted) {
          setIsLoadingSavedState(false)
        }
      }
    }

    loadSavedBellTimings()
    return () => {
      mounted = false
    }
  }, [currentSession])

  const refreshVersions = useCallback(async () => {
    const loadedVersions = await bellTimingsService.getVersions()
    setVersions(loadedVersions)
    if (selectedVersionId && !loadedVersions.some((version) => version._id === selectedVersionId)) {
      setSelectedVersionId('')
    }
  }, [selectedVersionId])

  /* ── Cleanup blob URL on unmount ── */
  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
    }
  }, [previewPdfUrl])

  /* ── Compute from / to for every row from startTime + durations ── */
  const computedRows: ComputedRow[] = useMemo(() => {
    let cursor = toMins(startTime)
    return rows.map(row => {
      const from = fromMins(cursor)
      const to = fromMins(cursor + row.duration)
      cursor += row.duration
      return { ...row, from, to }
    })
  }, [rows, startTime])

  /* ── Row CRUD ── */
  const updateRow = useCallback((id: string, patch: Partial<BellRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id))
  }, [])

  const addPeriod = useCallback(() => {
    const periodCount = rows.filter(r => r.type === 'period').length
    setRows(prev => [...prev, {
      id: uid(),
      type: 'period',
      label: ordinal(periodCount + 1),
      duration: 40,
    }])
  }, [rows])

  const addBreak = useCallback(() => {
    setRows(prev => [...prev, {
      id: uid(),
      type: 'break',
      label: 'BREAK',
      duration: 15,
    }])
  }, [])

  const moveRow = useCallback((id: string, direction: -1 | 1) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
      return copy
    })
  }, [])

  /* ── Duration change handler ── */
  const handleDurationChange = useCallback((id: string, value: string) => {
    const num = parseInt(value, 10)
    if (value === '' || isNaN(num)) {
      // Allow empty field while typing, treat as 0
      setRows(prev => prev.map(r => r.id === id ? { ...r, duration: 0 } : r))
      return
    }
    if (num < 0 || num > 480) return // cap at 8 hours
    setRows(prev => prev.map(r => r.id === id ? { ...r, duration: num } : r))
  }, [])

  /* ── PDF preview: generate blob and open dialog ── */
  const handleDownload = async () => {
    if (rows.length === 0) {
      toast.error('Add at least one period before downloading.')
      return
    }
    setIsGenerating(true)
    try {
      const blob = await generatePDFBlob(meta, computedRows)
      const blobUrl = URL.createObjectURL(blob)
      setPreviewPdfUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return blobUrl
      })
      setPreviewFilename(`bell-timings-${meta.session || 'schedule'}.pdf`)
      setPreviewPageCount(0)
      setPreviewRenderError(null)
      setShowPreviewDialog(true)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate PDF.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveBellTimings = async () => {
    if (rows.length === 0) {
      toast.error('Add at least one period before saving.')
      return
    }

    setIsSaving(true)
    try {
      const payload: BellTimingsPayload = {
        meta: {
          schoolName: meta.schoolName.trim(),
          title: meta.title.trim() || defaultMeta.title,
          session: currentSession || meta.session || '',
          effectiveDate: meta.effectiveDate,
        },
        startTime,
        rows: rows.map((row, index) => {
          const normalizedType: PeriodType = row.type === 'break' ? 'break' : 'period'
          const parsedDuration = Number.parseInt(String(row.duration), 10)
          const fallbackDuration = normalizedType === 'break' ? 15 : 40
          const normalizedDuration = Number.isFinite(parsedDuration) && parsedDuration > 0
            ? Math.min(480, parsedDuration)
            : fallbackDuration

          return {
            id: row.id.trim() || `bt-row-${index + 1}`,
            type: normalizedType,
            label: row.label.trim() || (normalizedType === 'break' ? 'BREAK' : ordinal(index + 1)),
            duration: normalizedDuration,
          }
        }),
      }

      const saved = await bellTimingsService.saveBellTimings(payload)
      setMeta({
        schoolName: saved.meta.schoolName || '',
        title: saved.meta.title || defaultMeta.title,
        session: currentSession || saved.meta.session || '',
        effectiveDate: saved.meta.effectiveDate || '',
      })
      setStartTime(saved.startTime || defaultStartTime)
      setRows(normalizeBellRows(saved.rows))
      toast.success('Bell timings saved successfully.')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save bell timings.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveVersion = async () => {
    setIsSavingVersion(true)
    try {
      const created = await bellTimingsService.createVersion(versionName.trim() || undefined)
      await refreshVersions()
      setSelectedVersionId(created._id)
      setVersionName('')
      toast.success('Bell timing version saved.')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save version.')
    } finally {
      setIsSavingVersion(false)
    }
  }

  const handleApplyVersion = async () => {
    if (!selectedVersionId) {
      toast.error('Select a version to apply.')
      return
    }

    setIsApplyingVersion(true)
    try {
      const applied = await bellTimingsService.applyVersion(selectedVersionId)
      setMeta({
        schoolName: applied.meta.schoolName || '',
        title: applied.meta.title || defaultMeta.title,
        session: currentSession || applied.meta.session || '',
        effectiveDate: applied.meta.effectiveDate || '',
      })
      setStartTime(applied.startTime || defaultStartTime)
      setRows(normalizeBellRows(applied.rows))
      toast.success('Bell timing version applied.')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to apply version.')
    } finally {
      setIsApplyingVersion(false)
    }
  }

  const handleDeleteVersion = async () => {
    if (!selectedVersionId) {
      toast.error('Select a version to delete.')
      return
    }

    setIsDeletingVersion(true)
    try {
      await bellTimingsService.deleteVersion(selectedVersionId)
      await refreshVersions()
      setSelectedVersionId('')
      toast.success('Bell timing version deleted.')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to delete version.')
    } finally {
      setIsDeletingVersion(false)
    }
  }

  const closePreviewDialog = () => {
    setShowPreviewDialog(false)
    setPreviewPageCount(0)
    setPreviewRenderError(null)
    setPreviewFilename('')
    setPreviewPdfUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const totalMinutes = rows.reduce((sum, r) => sum + r.duration, 0)

  const periodCount = rows.filter(r => r.type === 'period').length
  const breakCount = rows.filter(r => r.type === 'break').length
  const dayStart = computedRows.length > 0 ? to12h(computedRows[0].from) : null
  const dayEnd = computedRows.length > 0 ? to12h(computedRows[computedRows.length - 1].to) : null
  const selectedVersion = versions.find((version) => version._id === selectedVersionId) || null

  /* ── Bell schedule columns (kept above any return) ── */
  const scheduleColumns = useMemo<DataTableColumn<ComputedRow & { index: number }>[]>(() => [
    {
      key: 'label',
      header: 'Period',
      mobile: 'title',
      interactive: true,
      render: (row) => (
        <TextField
          size="sm"
          value={row.label}
          onChange={e => updateRow(row.id, { label: e.target.value })}
          aria-label={`Label for row ${row.index + 1}`}
          className={cx('tbt-label', row.type === 'break' && 'is-break')}
        />
      ),
    },
    {
      key: 'type',
      header: 'Type',
      interactive: true,
      render: (row) => (
        <Select
          size="sm"
          value={row.type}
          onChange={e => updateRow(row.id, { type: e.target.value === 'break' ? 'break' : 'period' })}
          options={[
            { value: 'period', label: 'Period' },
            { value: 'break', label: 'Break' },
          ]}
          aria-label={`Type for ${row.label || `row ${row.index + 1}`}`}
          className="tbt-type"
        />
      ),
    },
    {
      key: 'from',
      header: 'From',
      numeric: true,
      render: (row) => <span className="tbt-time">{to12h(row.from)}</span>,
    },
    {
      key: 'to',
      header: 'To',
      numeric: true,
      render: (row) => <span className="tbt-time">{to12h(row.to)}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      interactive: true,
      render: (row) => (
        <TextField
          size="sm"
          type="number"
          min={1}
          max={480}
          inputMode="numeric"
          value={row.duration || ''}
          onChange={e => handleDurationChange(row.id, e.target.value)}
          suffix="min"
          aria-label={`Duration in minutes for ${row.label || `row ${row.index + 1}`}`}
          className={cx('tbt-duration', row.type === 'break' && 'is-break')}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      mobile: 'aside',
      interactive: true,
      render: (row) => (
        <div className="tbt-row-actions">
          <Button
            variant="tertiary"
            size="sm"
            icon={ArrowUp}
            onClick={() => moveRow(row.id, -1)}
            disabled={row.index === 0}
            aria-label={`Move ${row.label || 'row'} up`}
            title="Move up"
          />
          <Button
            variant="tertiary"
            size="sm"
            icon={ArrowDown}
            onClick={() => moveRow(row.id, 1)}
            disabled={row.index === computedRows.length - 1}
            aria-label={`Move ${row.label || 'row'} down`}
            title="Move down"
          />
          <Button
            variant="tertiary"
            size="sm"
            icon={Trash2}
            onClick={() => removeRow(row.id)}
            aria-label={`Remove ${row.label || 'row'}`}
            title="Remove"
            className="tbt-remove"
          />
        </div>
      ),
    },
  ], [computedRows.length, handleDurationChange, moveRow, removeRow, updateRow])

  const scheduleRows = useMemo(
    () => computedRows.map((row, index) => ({ ...row, index })),
    [computedRows]
  )

  const timelineRows = computedRows.filter(row => row.duration > 0)

  /* ── Render ── */
  return (
    <Page>
      {/* ── Page actions ── */}
      <div className="tbt-actions">
        <p className="tbt-actions__lead cb-muted">
          Set the start time and the length of each period and break. Timings for every row are worked out for you.
        </p>
        <div className="tbt-actions__buttons">
          <Button
            icon={FileText}
            onClick={handleDownload}
            loading={isGenerating}
            disabled={isLoadingSavedState}
          >
            {isGenerating ? 'Preparing PDF…' : 'Preview PDF'}
          </Button>
          <Button
            variant="primary"
            icon={Save}
            onClick={handleSaveBellTimings}
            loading={isSaving}
            disabled={isLoadingSavedState}
          >
            {isSaving ? 'Saving…' : 'Save bell timings'}
          </Button>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="cb-stats">
        <StatCard label="Periods" value={periodCount} icon={BookOpen} hint="Teaching periods in the day" />
        <StatCard label="Breaks" value={breakCount} icon={Coffee} hint="Recess, lunch and other breaks" />
        <StatCard
          label="School day"
          value={totalMinutes}
          unit="min"
          icon={Timer}
          hint={totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min in total` : 'No time scheduled yet'}
        />
        <StatCard
          label="Day runs"
          value={dayStart ?? '—'}
          icon={Clock}
          hint={dayEnd ? `Ends at ${dayEnd}` : 'Add a row to see the end time'}
        />
      </div>

      <div className="cb-grid-8-4">
        {/* ── Bell schedule ── */}
        <Card
          flush
          title="Bell schedule"
          subtitle="Rows run in order from the start time. Change a duration to shift every row after it."
          className="tbt-schedule"
        >
          {isLoadingSavedState ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading bell timings…
            </div>
          ) : (
            <>
              <div className="tbt-toolbar">
                <div className="tbt-start">
                  <TextField
                    label="Start time"
                    type="time"
                    size="sm"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    title="Bell timings start time"
                  />
                </div>

                {timelineRows.length > 0 ? (
                  <div className="tbt-timeline" aria-label="Day timeline">
                    <div className="tbt-timeline__scroll">
                      <ol className="tbt-timeline__track">
                        {timelineRows.map(row => (
                          <li
                            key={row.id}
                            className={cx('tbt-timeline__seg', row.type === 'break' && 'is-break')}
                            style={{ flexGrow: row.duration }}
                            title={`${row.label} (${row.type === 'break' ? 'Break' : 'Period'}): ${to12h(row.from)} – ${to12h(row.to)}, ${row.duration} min`}
                          >
                            <span className="tbt-timeline__label">{row.label}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="tbt-timeline__ends is-num">
                        <span>{dayStart}</span>
                        <span>{dayEnd}</span>
                      </div>
                    </div>
                    <div className="tbt-timeline__legend">
                      <span className="tbt-legend"><span className="tbt-legend__swatch" aria-hidden="true" />Period</span>
                      <span className="tbt-legend"><span className="tbt-legend__swatch is-break" aria-hidden="true" />Break</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <DataTable
                className="tbt-table"
                caption="Bell schedule"
                columns={scheduleColumns}
                rows={scheduleRows}
                getRowKey={row => row.id}
                empty={
                  <EmptyState
                    icon={BellRing}
                    title="No periods or breaks yet"
                    body="The school day is empty. Add a period or a break to start building the bell schedule."
                    action={
                      <div className="tbt-add">
                        <Button size="sm" icon={Plus} onClick={addPeriod}>Add period</Button>
                        <Button size="sm" icon={Plus} onClick={addBreak}>Add break</Button>
                      </div>
                    }
                  />
                }
                footer={
                  rows.length > 0 ? (
                    <>
                      <div className="tbt-add">
                        <Button size="sm" icon={Plus} onClick={addPeriod}>Add period</Button>
                        <Button size="sm" icon={Plus} onClick={addBreak}>Add break</Button>
                      </div>
                      <span className="tbt-summary is-num">
                        {periodCount} {periodCount === 1 ? 'period' : 'periods'} · {breakCount} {breakCount === 1 ? 'break' : 'breaks'} · {totalMinutes} min
                        {dayStart && dayEnd ? ` · ${dayStart} – ${dayEnd}` : ''}
                      </span>
                    </>
                  ) : undefined
                }
              />
            </>
          )}
        </Card>

        <div className="cb-stack">
          {/* ── PDF details ── */}
          <Card title="PDF details" subtitle="Printed at the top of the bell timings sheet.">
            <div className="tbt-fields">
              <TextField
                label="School name"
                value={meta.schoolName}
                onChange={e => setMeta(p => ({ ...p, schoolName: e.target.value }))}
                placeholder="e.g. Delhi Public School, Jind Road, Rohtak"
                disabled={isLoadingSavedState}
              />
              <TextField
                label="Title"
                value={meta.title}
                onChange={e => setMeta(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. SUMMER BELL TIMINGS 3.0"
                disabled={isLoadingSavedState}
              />
              <TextField
                label="Session"
                value={meta.session}
                readOnly
                tabIndex={-1}
                title="Academic session"
                icon={Link2}
                hint="Linked to the active academic session."
              />
              <TextField
                label="Effective date (w.e.f.)"
                type="date"
                value={meta.effectiveDate}
                onChange={e => setMeta(p => ({ ...p, effectiveDate: e.target.value }))}
                title="Effective date"
                disabled={isLoadingSavedState}
              />
            </div>
          </Card>

          {/* ── Versions ── */}
          <Card
            title="Versions"
            subtitle="Keep snapshots of the saved bell timings and switch between them."
            action={<Badge tone={versions.length > 0 ? 'info' : 'neutral'}>{versions.length} saved</Badge>}
          >
            <div className="tbt-fields">
              <div className="tbt-inline">
                <TextField
                  label="Version name"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g. Winter timings"
                  hint="Optional."
                  className="tbt-inline__grow"
                />
                <Button
                  icon={History}
                  onClick={handleSaveVersion}
                  loading={isSavingVersion}
                  disabled={isLoadingSavedState}
                >
                  {isSavingVersion ? 'Saving…' : 'Save version'}
                </Button>
              </div>

              <div className="tbt-divider" role="separator" />

              <Select
                label="Saved versions"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                placeholder={versions.length > 0 ? 'Select a version' : 'No saved versions yet'}
                options={versions.map((version) => ({ value: version._id, label: version.name }))}
                title="Select bell timing version"
                hint={selectedVersion ? `Saved on ${formatDate(selectedVersion.createdAt)}` : 'Pick a version to apply or delete it.'}
              />
              <div className="tbt-add">
                <Button
                  onClick={handleApplyVersion}
                  disabled={!selectedVersionId}
                  loading={isApplyingVersion}
                >
                  {isApplyingVersion ? 'Applying…' : 'Apply version'}
                </Button>
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setConfirmDeleteVersion(true)}
                  disabled={!selectedVersionId || isDeletingVersion}
                >
                  Delete version
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Delete version confirmation ── */}
      <Dialog
        open={confirmDeleteVersion}
        onClose={() => { if (!isDeletingVersion) setConfirmDeleteVersion(false) }}
        tone="danger"
        size="sm"
        title="Delete this version?"
        description={`"${selectedVersion?.name || 'This version'}" will be removed. Your current bell timings stay as they are.`}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setConfirmDeleteVersion(false)} disabled={isDeletingVersion}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isDeletingVersion}
              onClick={async () => {
                await handleDeleteVersion()
                setConfirmDeleteVersion(false)
              }}
            >
              Delete version
            </Button>
          </>
        }
      />

      {/* ── PDF preview (opens from "Preview PDF") ── */}
      <Dialog
        open={showPreviewDialog && Boolean(previewPdfUrl)}
        onClose={closePreviewDialog}
        size="lg"
        title="Bell timings PDF"
        description="Check the sheet, then download it or open it in a new tab."
        footer={
          previewPdfUrl ? (
            <>
              <Button variant="tertiary" onClick={closePreviewDialog}>Close</Button>
              <a
                href={previewPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cb-btn cb-btn--secondary cb-btn--md"
              >
                <span className="cb-btn__label">Open in new tab</span>
              </a>
              <a
                href={previewPdfUrl}
                download={previewFilename || 'bell-timings.pdf'}
                className="cb-btn cb-btn--primary cb-btn--md"
              >
                <span className="cb-btn__label">Download PDF</span>
              </a>
            </>
          ) : null
        }
      >
        {previewPdfUrl ? (
          <div className="tbt-pdf">
            {previewRenderError ? (
              <Banner tone="danger" title="Preview could not be shown">
                {previewRenderError}
              </Banner>
            ) : (
              <Document
                file={previewPdfUrl}
                loading={
                  <div className="cb-table-state" role="status">
                    <span className="cb-spinner" aria-hidden="true" />
                    Loading PDF preview…
                  </div>
                }
                onLoadSuccess={({ numPages }) => {
                  setPreviewPageCount(numPages)
                  setPreviewRenderError(null)
                }}
                onLoadError={(error) => {
                  console.error('Failed to render bell timings preview:', error)
                  const message = (error as Error)?.message || 'Unknown PDF render error'
                  setPreviewRenderError(
                    `Failed to render preview (${message}). Use "Open in new tab" or "Download PDF".`
                  )
                }}
                className="tbt-pdf__doc"
              >
                {Array.from({ length: previewPageCount }).map((_, index) => (
                  <PdfPage
                    key={`bell-preview-page-${index + 1}`}
                    pageNumber={index + 1}
                    width={640}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="tbt-pdf__page"
                  />
                ))}
              </Document>
            )}
          </div>
        ) : null}
      </Dialog>
    </Page>
  )
}

export default BellTimings
