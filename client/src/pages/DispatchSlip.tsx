import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Document, Page as PdfPage, pdfjs } from 'react-pdf'
import { CalendarX, Download, ExternalLink, FileDown, FileText } from 'lucide-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import toast from 'react-hot-toast'
import { useCentreDatesheet } from '../hooks/useDatesheets'
import { useCentreDetails } from '../hooks/useCentreDetails'
import { useGenerateDispatchSlipPdfMutation } from '../hooks/useDispatchSlip'
import { useAttendanceAbsentees } from '../hooks/useAttendance'
import { dispatchSlipService } from '../services/dispatchSlipService'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Entity,
  PAPER_PAGES_CLASS,
  Page,
  Paper,
  PaperStage,
  Sheet,
  formatDate,
  formatTime,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import './DispatchSlip.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type CentreDatesheetEntry = any

type ScheduleRow = {
  key: string
  id: string
  entry: CentreDatesheetEntry
  dateSerial: number
  classBadge: '10' | '12' | ''
  absentCount: number
}

const previewPageWidth = () =>
  typeof window !== 'undefined' ? Math.max(260, Math.min(680, window.innerWidth - 72)) : 680

const formatExamDate = (value: any) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const getDateKey = (value: any) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toISOString().slice(0, 10)
}

const formatDayName = (value: any) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

const normalizeClassBadge = (value: any): '10' | '12' | '' => {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('10')) return '10'
  if (raw.includes('12')) return '12'
  return ''
}

const toAttendanceClass = (classBadge: '10' | '12' | ''): 'X' | 'XII' | '' => {
  if (classBadge === '10') return 'X'
  if (classBadge === '12') return 'XII'
  return ''
}

const formatTimeRange = (entry: any) => {
  const start = String(entry?.startTime || entry?.timeSlot?.start || '').trim()
  const end = String(entry?.endTime || entry?.timeSlot?.end || '').trim()
  if (!start && !end) return '—'
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`
  return formatTime(start || end)
}

const DispatchSlip: React.FC = () => {
  const navigate = useNavigate()
  const { data: centreDetails, isLoading: centreLoading } = useCentreDetails()
  const { data: centreData, isLoading: datesheetLoading } = useCentreDatesheet({ limit: 200 })
  const { data: absenteeRecords = [], isLoading: absenteesLoading } = useAttendanceAbsentees()

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewPages, setPreviewPages] = useState<number>(1)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const entries: CentreDatesheetEntry[] = useMemo(() => centreData?.entries ?? [], [centreData?.entries])

  const datesheetEntries = useMemo(() => {
    const sorted = [...entries]
    sorted.sort((a, b) => {
      const aTime = a?.examDate ? new Date(a.examDate).getTime() : Number.POSITIVE_INFINITY
      const bTime = b?.examDate ? new Date(b.examDate).getTime() : Number.POSITIVE_INFINITY
      if (aTime !== bTime) return aTime - bTime
      return String(a?.subject?.code || '').localeCompare(String(b?.subject?.code || ''))
    })
    return sorted
  }, [entries])

  const absentCountByKey = useMemo(() => {
    const map = new Map<string, number>()
    absenteeRecords.forEach((r: any) => {
      const dateKey = getDateKey(r?.examDate)
      const code = String(r?.subjectCode || '').trim()
      const cls = String(r?.class || '').trim().toUpperCase()
      if (!dateKey || dateKey === 'Unknown' || !code || !cls) return
      const key = `${dateKey}|${code}|${cls}`
      map.set(key, (map.get(key) || 0) + 1)
    })
    return map
  }, [absenteeRecords])

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const dateSerialByKey = new Map<string, number>()
    let nextSerial = 1
    return datesheetEntries.map((entry, index) => {
      const dateKey = getDateKey(entry?.examDate)
      if (!dateSerialByKey.has(dateKey)) {
        dateSerialByKey.set(dateKey, nextSerial)
        nextSerial += 1
      }
      const classBadge = normalizeClassBadge(entry?.subject?.class)
      const attendanceClass = toAttendanceClass(classBadge)
      const subjectCode = String(entry?.subject?.code || '').trim()
      const absentKey = `${dateKey}|${subjectCode}|${attendanceClass}`
      return {
        key: String(entry?._id || index),
        id: String(entry?._id || ''),
        entry,
        dateSerial: dateSerialByKey.get(dateKey) || 0,
        classBadge,
        absentCount: attendanceClass && subjectCode ? absentCountByKey.get(absentKey) || 0 : 0,
      }
    })
  }, [datesheetEntries, absentCountByKey])

  const generatePdfMutation = useGenerateDispatchSlipPdfMutation({
    autoDownload: false,
  })

  const openPreviewForEntry = async (entry: CentreDatesheetEntry) => {
    const entryId = String(entry?._id || '').trim()
    if (!entryId) {
      toast.error('Missing entry id for this subject')
      return
    }

    setDownloadingId(entryId)
    const subjectCode = String(entry?.subject?.code || '').trim()
    const classValue = String(entry?.subject?.class || '').trim()
    const examDate = formatExamDate(entry?.examDate)
    const title = [subjectCode, classValue, examDate].filter(Boolean).join(' · ')

    setPreviewTitle(title || 'Dispatch slip')
    setPreviewBlob(null)
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPreviewPages(1)
    setPreviewOpen(true)

    try {
      const blob = await generatePdfMutation.mutateAsync({
        entryId,
        destination: 'CBSE Regional Office',
        filename: `dispatch-slip_${getDateKey(entry?.examDate)}_${subjectCode}_${classValue}.pdf`,
      })
      setPreviewBlob(blob)
      const blobUrl = URL.createObjectURL(blob)
      setPreviewBlobUrl(blobUrl)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate dispatch slip PDF')
      setPreviewOpen(false)
    } finally {
      setDownloadingId(null)
    }
  }

  const getPreviewFilename = () => {
    const safeTitle = previewTitle ? previewTitle.replace(/[^\w\-]+/g, '_') : 'dispatch-slip'
    return `${safeTitle}.pdf`
  }

  const handleDownloadPreview = () => {
    if (!previewBlob) return
    dispatchSlipService.downloadPDF(previewBlob, getPreviewFilename())
  }

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewBlob(null)
    setPreviewPages(1)
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const centreLabel = [
    String(centreDetails?.centreNo || centreDetails?.centreSchoolCode || '').trim(),
    String(centreDetails?.centreName || '').trim(),
  ]
    .filter(Boolean)
    .join(' · ')

  const columns: DataTableColumn<ScheduleRow>[] = [
    { key: 'serial', header: 'No.', numeric: true, mobile: 'hidden', width: 56, render: (row) => row.dateSerial },
    {
      key: 'date',
      header: 'Date',
      mobile: 'subtitle',
      render: (row) => (
        <Entity
          primary={formatDate(row.entry?.examDate)}
          secondary={String(row.entry?.dayName || '').trim() || formatDayName(row.entry?.examDate)}
        />
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (row) => (
        <Entity
          primary={orDash(row.entry?.subject?.name)}
          secondary={String(row.entry?.subject?.code || '').trim() || undefined}
        />
      ),
    },
    {
      key: 'class',
      header: 'Class',
      render: (row) => (
        <Badge dot={false}>
          {row.classBadge ? `Class ${row.classBadge}` : String(row.entry?.subject?.class || '').trim() || 'Class'}
        </Badge>
      ),
    },
    { key: 'time', header: 'Time', mobile: 'hidden', render: (row) => formatTimeRange(row.entry) },
    {
      key: 'candidates',
      header: 'Candidates',
      numeric: true,
      align: 'right',
      render: (row) => Number(row.entry?.candidateCount ?? 0) || 0,
    },
    {
      key: 'absent',
      header: 'Absent',
      numeric: true,
      align: 'right',
      mobile: 'hidden',
      render: (row) => (absenteesLoading ? '—' : row.absentCount),
    },
    {
      key: 'slip',
      header: '',
      headerLabel: 'Dispatch slip',
      interactive: true,
      render: (row) => (
        <Button
          size="sm"
          icon={FileDown}
          loading={downloadingId === row.id}
          disabled={generatePdfMutation.isPending && downloadingId !== row.id}
          onClick={() => openPreviewForEntry(row.entry)}
        >
          Open slip
        </Button>
      ),
    },
  ]

  const slipCentreNo = String(centreDetails?.centreNo || '').trim() || '829261'
  const slipInsuredAmount = String(centreDetails?.dispatchSlipInsuredAmount || '').trim() || '1000'
  const slipToLines = String(centreDetails?.dispatchSlipToAddress || '').trim()
    ? String(centreDetails?.dispatchSlipToAddress || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    : [
        'The RO GURUGRAM (CBSE)',
        '1st & 2nd FLOOR',
        'C-1 BUILDING, TOWER-A, INFOCITY – 1,',
        'SECTOR – 34,',
        'GURUGRAM, PIN: 122001',
        'HARYANA',
        'Tel:- 0124-2973658',
      ]
  const slipCentreName = String(centreDetails?.centreName || '').trim() || 'INTERNATIONAL BHARTI SCHOOL'
  const slipFromLines = String(centreDetails?.dispatchSlipFromAddress || '').trim()
    ? String(centreDetails?.dispatchSlipFromAddress || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    : [
        slipCentreName,
        'SKM MILESTONE, GOHANA ROAD',
        'ROHTAK, HARYANA, PIN – 124001',
        'School Code: 40921',
        'Mobile No: 9138891415, 16',
      ]

  const renderSlip = () => (
    <div className="cx-dslip">
      <div className="cx-dslip__head">
        CENTRE No. <span className="cx-dslip__blank cx-dslip__blank--centre">{slipCentreNo}</span>
      </div>

      <div className="cx-dslip__grid">
        <div className="cx-dslip__col">
          <div>
            <span className="cx-dslip__label">Class:</span> <span className="cx-dslip__blank" style={{ minWidth: 80 }} />
          </div>
          <div>
            <span className="cx-dslip__label">Subject. Name:</span>{' '}
            <span className="cx-dslip__blank" style={{ minWidth: 200 }} />
          </div>
          <div>
            <span className="cx-dslip__label">Subject code:</span>{' '}
            <span className="cx-dslip__blank" style={{ minWidth: 80 }} />
          </div>
        </div>
        <div className="cx-dslip__col">
          <div>
            <span className="cx-dslip__label">Date:</span> <span className="cx-dslip__blank" style={{ minWidth: 90 }} />
          </div>
          <div>
            <span className="cx-dslip__label">Insured:</span> Rs {slipInsuredAmount}
          </div>
          <div>
            <span className="cx-dslip__label">No. of Answer Sheet Packed:</span>{' '}
            <span className="cx-dslip__blank" style={{ minWidth: 80 }} />
          </div>
          <div>
            <span className="cx-dslip__label">Parcel No.</span> <span className="cx-dslip__blank" style={{ minWidth: 80 }} />
          </div>
          <div>
            <span className="cx-dslip__label">Time of Packing:</span>{' '}
            <span className="cx-dslip__blank" style={{ minWidth: 80 }} />
          </div>
        </div>
      </div>

      <div className="cx-dslip__grid cx-dslip__grid--address">
        <div>
          <div className="cx-dslip__label">To,</div>
          <div className="cx-dslip__address">{slipToLines.join('\n')}</div>
        </div>
        <div>
          <div className="cx-dslip__label">From,</div>
          <div className="cx-dslip__address">{slipFromLines.join('\n')}</div>
        </div>
      </div>
    </div>
  )

  if (centreLoading || datesheetLoading) {
    return (
      <Page>
        <Card>
          <CardLoading label="Loading exam schedule…" />
        </Card>
      </Page>
    )
  }

  return (
    <Page>

      {scheduleRows.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarX}
            title="No centre datesheet yet"
            body="Generate the centre datesheet on the Datesheets page, then open slips here."
            action={
              <Button variant="primary" onClick={() => navigate('/datesheets')}>
                Go to datesheets
              </Button>
            }
          />
        </Card>
      ) : (
        <Card
          flush
          title="Exam schedule"
          subtitle={`Open a paper's slip to preview and download it as a PDF${centreLabel ? ` · Centre ${centreLabel}` : ''}.`}
        >
          <DataTable
            caption="Exam schedule"
            columns={columns}
            rows={scheduleRows}
            getRowKey={(row) => row.key}
          />
        </Card>
      )}

      <Card flush title="Slip template" subtitle="Sample layout. Each download fills in the subject, class and date for that paper.">
        <PaperStage flush>
          <Paper pageSize="A4" width={794}>
            <div className="cx-dslip-sheet">
              {renderSlip()}
              <div className="cx-dslip-sheet__cut" aria-hidden="true" />
              {renderSlip()}
            </div>
          </Paper>
        </PaperStage>
      </Card>

      <Sheet
        open={previewOpen}
        onClose={closePreview}
        size="xl"
        icon={FileText}
        title="Dispatch slip"
        description={previewTitle || undefined}
        footer={
          <>
            <Button onClick={closePreview}>Close</Button>
            <Button
              icon={ExternalLink}
              disabled={!previewBlobUrl}
              onClick={() => {
                if (previewBlobUrl) window.open(previewBlobUrl, '_blank', 'noopener,noreferrer')
              }}
            >
              Open in new tab
            </Button>
            <Button variant="primary" icon={Download} disabled={!previewBlob} onClick={handleDownloadPreview}>
              Download PDF
            </Button>
          </>
        }
      >
        <PaperStage state={!previewBlob ? <CardLoading label="Generating slip…" /> : undefined}>
          {previewBlob ? (
            <Document
              file={previewBlob}
              className={PAPER_PAGES_CLASS}
              onLoadSuccess={(doc) => setPreviewPages(doc.numPages)}
              loading={<CardLoading label="Rendering preview…" />}
            >
              {Array.from({ length: previewPages }).map((_, idx) => (
                <Paper key={idx}>
                  <PdfPage pageNumber={idx + 1} width={previewPageWidth()} />
                </Paper>
              ))}
            </Document>
          ) : null}
        </PaperStage>
      </Sheet>
    </Page>
  )
}

export default DispatchSlip
