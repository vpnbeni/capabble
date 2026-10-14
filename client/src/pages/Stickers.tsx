import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CalendarDays, Download, ExternalLink, FileText } from 'lucide-react'
import { useCentreDatesheetEntries, useGenerateSeatingPlanPDFMutation } from '../hooks/useSeatingPlan'
import type { CentreDatesheetEntry } from '../services/centreDatesheetService'
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
  formatDate,
  formatTime,
  type DataTableColumn,
  PdfFrame,
} from '@/components/ui'
import '@/components/exmcl/centre-stickers.css'

const getCalendarDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const Stickers: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const { data: entries = [], isLoading, error, refetch } = useCentreDatesheetEntries()
  const pdfMutation = useGenerateSeatingPlanPDFMutation({
    autoDownload: false,
    onSuccess: (blob, variables) => {
      const blobUrl = URL.createObjectURL(blob)
      setPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return blobUrl
      })
      setPreviewFilename(variables.filename || 'roll-no-stickers.pdf')
    },
  })
  const downloadingId = pdfMutation.isPending ? pdfMutation.variables?.datesheetId ?? null : null
  const searchTerm = searchParams.get('q') || ''

  const todayDateKey = useMemo(() => getCalendarDateKey(new Date()), [])
  const nextExamDateKey = useMemo(() => {
    const futureExamDateKeys = entries
      .map((entry) => getCalendarDateKey(entry.examDate))
      .filter((key) => key && key > todayDateKey)
      .sort()

    return futureExamDateKeys[0] || null
  }, [entries, todayDateKey])

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return entries

    return entries.filter((entry) => {
      return (
        entry.subjectName.toLowerCase().includes(normalizedSearch) ||
        entry.subjectCode.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [entries, searchTerm])

  const handleDownload = (datesheetId: string, examDate: string, classValue: string, subjectName: string) => {
    const date = new Date(examDate)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const safeSubject = subjectName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim()
    const filename = `Roll No Stickers - ${day}-${month}-${year} - Class ${classValue} - ${safeSubject}.pdf`
    setPreviewSubject(subjectName)

    pdfMutation.mutate({
      datesheetId,
      format: 'mainGate',
      filename,
    })
  }

  const closePreview = () => {
    setPreviewSubject('')
    setPreviewFilename('')
    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const setSearchTerm = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>()
    filteredEntries.forEach((entry, index) => map.set(entry._id, index + 1))
    return map
  }, [filteredEntries])

  const downloadPreview = () => {
    if (!previewUrl) return
    const link = document.createElement('a')
    link.href = previewUrl
    link.download = previewFilename || 'roll-no-stickers.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const columns: DataTableColumn<CentreDatesheetEntry>[] = [
    {
      key: 'sr',
      header: 'Sr no.',
      numeric: true,
      width: 64,
      mobile: 'hidden',
      render: (entry) => rowIndex.get(entry._id) ?? '—',
    },
    {
      key: 'date',
      header: 'Date',
      mobile: 'subtitle',
      render: (entry) => {
        const examDateKey = getCalendarDateKey(entry.examDate)
        const isTodayExam = examDateKey === todayDateKey
        const isNextExam = !isTodayExam && !!nextExamDateKey && examDateKey === nextExamDateKey
        return (
          <span className="cx-stk-date">
            <Entity primary={formatDate(entry.examDate)} secondary={entry.dayName || undefined} />
            {isTodayExam ? <Badge tone="success">Today</Badge> : null}
            {isNextExam ? <Badge tone="warning">Next</Badge> : null}
          </span>
        )
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      wrap: true,
      render: (entry) => `${entry.subjectName}${entry.subjectCode ? ` (${entry.subjectCode})` : ''}`,
    },
    {
      key: 'class',
      header: 'Class',
      mobile: 'aside',
      render: (entry) => (
        <Badge tone={entry.class === '12' ? 'info' : 'neutral'} dot={false}>
          Class {entry.class}
        </Badge>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      mobile: 'hidden',
      render: (entry) => `${formatTime(entry.timeSlot?.start)} – ${formatTime(entry.timeSlot?.end)}`,
    },
    {
      key: 'candidates',
      header: 'Candidates',
      numeric: true,
      align: 'right',
      render: (entry) => entry.candidateCount,
    },
    {
      key: 'rooms',
      header: 'Rooms',
      numeric: true,
      align: 'right',
      mobile: 'hidden',
      render: (entry) => (entry.roomsNeeded === 0 ? <span className="cb-muted">Shared</span> : entry.roomsNeeded),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      mobile: 'hidden',
      interactive: true,
      render: (entry) => (
        <Button
          variant="tertiary"
          size="sm"
          icon={FileText}
          loading={downloadingId === entry._id}
          disabled={pdfMutation.isPending}
          onClick={() => handleDownload(entry._id, entry.examDate, entry.class, entry.subjectName)}
          aria-label={`Preview roll number stickers for ${entry.subjectName}`}
          title="Preview roll number stickers"
        >
          Preview
        </Button>
      ),
    },
  ]

  return (
    <Page>

      {pdfMutation.isError ? (
        <Banner tone="danger" title="The stickers couldn’t be generated" onDismiss={() => pdfMutation.reset()}>
          {previewSubject ? `${previewSubject}: ` : ''}the server couldn’t build the PDF. Try again, or check the seating plan for this paper.
        </Banner>
      ) : null}

      <Card flush title="Papers" subtitle="Today’s paper and the next one are marked.">
        <CardToolbar>
          <FilterBar
            search={{ placeholder: 'Search subject name or code', value: searchTerm, onChange: setSearchTerm }}
          />
        </CardToolbar>
        {error ? (
          <EmptyState
            icon={AlertCircle}
            title="The papers couldn’t be loaded"
            body={error.message}
            action={
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <DataTable
            caption="Papers with roll number stickers"
            columns={columns}
            rows={filteredEntries}
            getRowKey={(entry) => entry._id}
            onRowClick={(entry) => {
              if (!pdfMutation.isPending) handleDownload(entry._id, entry.examDate, entry.class, entry.subjectName)
            }}
            loading={isLoading}
            loadingLabel="Loading papers…"
            empty={
              searchTerm.trim() ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No papers match this search"
                  body={`No subject name or code matches “${searchTerm.trim()}”.`}
                  action={
                    <Button size="sm" onClick={() => setSearchTerm('')}>
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No papers on the centre datesheet yet"
                  body="Generate or refresh the seating plan data first, then stickers appear here."
                />
              )
            }
          />
        )}
      </Card>

      <Sheet
        open={Boolean(previewUrl)}
        onClose={closePreview}
        size="xl"
        icon={FileText}
        title="Roll number stickers"
        description={previewSubject || previewFilename || undefined}
        footer={
          <>
            <Button onClick={closePreview}>Close</Button>
            <Button
              icon={ExternalLink}
              onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
            >
              Open in new tab
            </Button>
            <Button variant="primary" icon={Download} onClick={downloadPreview}>
              Download PDF
            </Button>
          </>
        }
      >
        {previewUrl ? (
          <PdfFrame src={previewUrl} title="Roll number stickers PDF preview" toolbar />
        ) : null}
      </Sheet>
    </Page>
  )
}

export default Stickers
