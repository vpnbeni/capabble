import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Download, Eye, ExternalLink, FileText, RefreshCw, Upload } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  Entity,
  Page,
  Menu,
  Progress,
  Sheet,
  StatCard,
  Tabs,
  formatDate,
  type DataTableColumn,
  PdfFrame,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-form66.css'
import {
  useForm66DatePdfMutation,
  useForm66FileUrls,
  useForm66Records,
  useUploadForm66Mutation,
} from '@/hooks/useForm66'
import form66Service, {
  type Form66Record,
  type Form66UploadResponse as UploadResponse,
} from '@/services/form66Service'

interface DateGroup {
  date: string
  subjects: SubjectGroup[]
  totalRecords: number
}

interface SubjectGroup {
  code: string
  name: string
  records: Form66Record[]
  count: number
}

type ProcessingStep = 'idle' | 'uploading' | 'converting' | 'analyzing' | 'saving' | 'complete' | 'error'
type FormClassKey = 'X' | 'XII'

const processingSteps: { step: ProcessingStep; label: string }[] = [
  { step: 'uploading', label: 'Uploading the file' },
  { step: 'converting', label: 'Converting to PDF' },
  { step: 'analyzing', label: 'Arranging pages by exam date' },
  { step: 'saving', label: 'Saving records' },
  { step: 'complete', label: 'Processing complete' }
]

const isClass10 = (value?: string) => value === 'X' || value === '10th'
const isClass12 = (value?: string) => value === 'XII' || value === '12th'

/** Class 10 and Class 12 are categories, not statuses: neutral and info badges without a dot. */
const ClassBadge: React.FC<{ value?: string }> = ({ value }) =>
  isClass10(value) ? (
    <Badge tone="neutral" dot={false}>Class 10</Badge>
  ) : isClass12(value) ? (
    <Badge tone="info" dot={false}>Class 12</Badge>
  ) : value ? (
    <Badge tone="neutral" dot={false}>{value}</Badge>
  ) : (
    <>—</>
  )

/** Form 66 dates arrive as "DD.MM.YYYY"; show them as "17 Feb 2026" when they parse. */
const parseDotDate = (value: string) => {
  const [day, month, year] = String(value || '').split('.').map(Number)
  if (!day || !month || !year) return null
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const displayDotDate = (value: string) => {
  const parsed = parseDotDate(value)
  return parsed ? formatDate(parsed) : value || '—'
}

const weekdayOf = (value: string) => {
  const parsed = parseDotDate(value)
  return parsed ? parsed.toLocaleDateString('en-IN', { weekday: 'long' }) : ''
}

const CLASS_LABEL: Record<FormClassKey, string> = { X: 'Class 10', XII: 'Class 12' }

const Form66: React.FC = () => {
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle')
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [rollSubject, setRollSubject] = useState<{ date: string; subject: SubjectGroup } | null>(null)
  const [downloadDialogClass, setDownloadDialogClass] = useState<FormClassKey | null>(null)
  const [previewTab, setPreviewTab] = useState<'pdf' | 'txt'>('pdf')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [pdfPreviewUrls, setPdfPreviewUrls] = useState<Record<FormClassKey, string | null>>({
    X: null,
    XII: null,
  })
  const [txtPreviewContent, setTxtPreviewContent] = useState<Record<FormClassKey, string | null>>({
    X: null,
    XII: null,
  })
  const pdfObjectUrlsRef = useRef<Record<FormClassKey, string | null>>({
    X: null,
    XII: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Form 66 by-date PDF preview (same pattern as Duties preview) */
  const [form66DatePreviewDate, setForm66DatePreviewDate] = useState<string | null>(null)
  const [form66DatePreviewSubject, setForm66DatePreviewSubject] = useState<string | null>(null)
  const [form66DatePreviewUrl, setForm66DatePreviewUrl] = useState<string | null>(null)
  const [showForm66DatePreview, setShowForm66DatePreview] = useState(false)
  const [form66DatePreviewLoading, setForm66DatePreviewLoading] = useState(false)
  const [form66DatePreviewError, setForm66DatePreviewError] = useState<string | null>(null)
  const recordsQuery = useForm66Records()
  const fileUrlsQuery = useForm66FileUrls()
  const uploadMutation = useUploadForm66Mutation()
  const datePdfMutation = useForm66DatePdfMutation()
  const uploading = uploadMutation.isPending
  const loadingRecords = recordsQuery.isLoading
  const records = recordsQuery.data ?? []
  const originalFileUrls = fileUrlsQuery.data?.original ?? { X: null, XII: null }
  const processedPdfUrls = fileUrlsQuery.data?.processed ?? { X: null, XII: null }

  useEffect(() => {
    return () => {
      Object.values(pdfObjectUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const groupRecordsByDate = (records: Form66Record[]): DateGroup[] => {
    if (!records || records.length === 0) {
      return []
    }

    const dateMap = new Map<string, Map<string, Form66Record[]>>()

    records.forEach(record => {
      // Skip records without examDate
      if (!record.examDate) return

      if (!dateMap.has(record.examDate)) {
        dateMap.set(record.examDate, new Map())
      }

      const subjectMap = dateMap.get(record.examDate)!
      const subjectKey = `${record.subjectCode || 'Unknown'}-${record.subject || 'Unknown'}`

      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, [])
      }

      subjectMap.get(subjectKey)!.push(record)
    })

    const groups: DateGroup[] = []

    dateMap.forEach((subjectMap, date) => {
      const subjects: SubjectGroup[] = []
      let totalRecords = 0

      subjectMap.forEach((records, subjectKey) => {
        const [code, ...nameParts] = subjectKey.split('-')
        const name = nameParts.join('-')

        subjects.push({
          code,
          name,
          records: records.sort((a, b) => a.rollNo.localeCompare(b.rollNo)),
          count: records.length
        })

        totalRecords += records.length
      })

      groups.push({
        date,
        subjects: subjects.sort((a, b) => a.code.localeCompare(b.code)),
        totalRecords
      })
    })

    // Sort by date
    return groups.sort((a, b) => {
      if (!a.date || !b.date) return 0
      const dateA = a.date.split('.').reverse().join('')
      const dateB = b.date.split('.').reverse().join('')
      return dateA.localeCompare(dateB)
    })
  }

  const dateGroups = useMemo(() => groupRecordsByDate(records), [records])

  // Compute stats
  const stats = useMemo(() => {
    const class10Records = records.filter(r => r.class === 'X' || r.class === '10th')
    const class12Records = records.filter(r => r.class === 'XII' || r.class === '12th')
    return {
      totalRecords: records.length,
      totalDates: dateGroups.length,
      class10th: class10Records.length,
      class12th: class12Records.length,
    }
  }, [records, dateGroups])

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const simulateProcessingSteps = async () => {
    // Simulate step progression for better UX
    const steps: ProcessingStep[] = ['uploading', 'converting', 'analyzing', 'saving']
    for (const step of steps) {
      setProcessingStep(step)
      await new Promise(resolve => setTimeout(resolve, 800))
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type - only TXT files now
    const isTxtFile = file.name.toLowerCase().endsWith('.txt') ||
      file.type === 'text/plain'

    if (!isTxtFile) {
      setUploadStatus({ type: 'error', message: `Select a .txt file. ${file.name} is not a text file.` })
      return
    }

    try {
      setUploadStatus(null)
      setProcessingStep('uploading')

      // Start simulating steps in parallel with actual upload
      const stepPromise = simulateProcessingSteps()

      // Wait for step simulation to finish
      await stepPromise

      const data: UploadResponse = await uploadMutation.mutateAsync(file)
      setProcessingStep('complete')
      setUploadStatus({
        type: 'success',
        message: `Upload complete. Processed ${data.count || 0} records across ${data.dateCount || 0} exam dates.`
      })
    } catch (error) {
      console.error('Upload error:', error)
      setProcessingStep('error')
      setUploadStatus({
        type: 'error',
        message: 'The file couldn’t be uploaded. Try again.'
      })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      // Reset processing step after a delay
      setTimeout(() => setProcessingStep('idle'), 3000)
    }
  }

  const getCurrentStepIndex = () => {
    return processingSteps.findIndex(s => s.step === processingStep)
  }

  const toggleDateExpansion = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }

  const expandAllDates = () => {
    setExpandedDates(new Set(dateGroups.map(d => d.date)))
  }

  const collapseAllDates = () => {
    setExpandedDates(new Set())
  }

  const closeForm66DatePreview = useCallback(() => {
    setShowForm66DatePreview(false)
    setForm66DatePreviewDate(null)
    setForm66DatePreviewSubject(null)
    setForm66DatePreviewError(null)
    setForm66DatePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (form66DatePreviewUrl) URL.revokeObjectURL(form66DatePreviewUrl)
    }
  }, [form66DatePreviewUrl])

  const openForm66DatePreview = async (date: string, subjectCode?: string) => {
    setForm66DatePreviewDate(date)
    setForm66DatePreviewSubject(subjectCode || null)
    setForm66DatePreviewError(null)
    setForm66DatePreviewLoading(true)
    setShowForm66DatePreview(true)
    setForm66DatePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    try {
      const blob = await datePdfMutation.mutateAsync({ date, subjectCode })
      const objectUrl = URL.createObjectURL(blob)
      setForm66DatePreviewUrl(objectUrl)
    } catch (error: any) {
      console.error('Failed to load Form 66 PDF preview:', error)
      setForm66DatePreviewError(error?.message || 'Failed to load Form 66 PDF')
      setUploadStatus({ type: 'error', message: error?.message || 'Failed to load Form 66 PDF' })
    } finally {
      setForm66DatePreviewLoading(false)
    }
  }

  const form66DatePdfDownloadFilename = form66DatePreviewDate
    ? form66DatePreviewSubject
      ? `Form66_${form66DatePreviewDate.replace(/\./g, '-')}_${form66DatePreviewSubject}.pdf`
      : `Form66_${form66DatePreviewDate.replace(/\./g, '-')}.pdf`
    : 'Form66.pdf'

  const openDownloadDialog = (classKey: FormClassKey) => {
    const hasPdf = Boolean(processedPdfUrls[classKey])
    const hasTxt = Boolean(originalFileUrls[classKey])

    if (hasPdf) {
      setPreviewTab('pdf')
    } else if (hasTxt) {
      setPreviewTab('txt')
    }

    setPreviewError(null)
    setDownloadDialogClass(classKey)
  }

  const closeDownloadDialog = () => {
    setDownloadDialogClass(null)
    setPreviewTab('pdf')
    setPreviewError(null)
    setPreviewLoading(false)
  }

  useEffect(() => {
    const classKey = downloadDialogClass
    if (!classKey) return

    let isCancelled = false

    const loadPreview = async () => {
      setPreviewError(null)

      if (previewTab === 'pdf') {
        const sourceUrl = processedPdfUrls[classKey]
        if (!sourceUrl) {
          setPreviewError('No PDF available for preview.')
          return
        }

        if (pdfPreviewUrls[classKey]) return

        try {
          setPreviewLoading(true)
          const rawBlob = await form66Service.fetchRemoteBlob(sourceUrl)
          const pdfBlob = rawBlob.type === 'application/pdf'
            ? rawBlob
            : new Blob([rawBlob], { type: 'application/pdf' })
          const objectUrl = URL.createObjectURL(pdfBlob)

          if (isCancelled) {
            URL.revokeObjectURL(objectUrl)
            return
          }

          const previousObjectUrl = pdfObjectUrlsRef.current[classKey]
          if (previousObjectUrl) {
            URL.revokeObjectURL(previousObjectUrl)
          }

          pdfObjectUrlsRef.current[classKey] = objectUrl
          setPdfPreviewUrls((prev) => ({ ...prev, [classKey]: objectUrl }))
        } catch (error) {
          if (!isCancelled) {
            console.error('Failed to load PDF preview:', error)
            setPreviewError('Failed to load PDF preview.')
          }
        } finally {
          if (!isCancelled) {
            setPreviewLoading(false)
          }
        }
      } else {
        const sourceUrl = originalFileUrls[classKey]
        if (!sourceUrl) {
          setPreviewError('No TXT file available for preview.')
          return
        }

        if (txtPreviewContent[classKey]) return

        try {
          setPreviewLoading(true)
          const content = await form66Service.fetchRemoteText(sourceUrl)
          if (!isCancelled) {
            setTxtPreviewContent((prev) => ({ ...prev, [classKey]: content }))
          }
        } catch (error) {
          if (!isCancelled) {
            console.error('Failed to load TXT preview:', error)
            setPreviewError('Failed to load TXT preview.')
          }
        } finally {
          if (!isCancelled) {
            setPreviewLoading(false)
          }
        }
      }
    }

    loadPreview()

    return () => {
      isCancelled = true
    }
  }, [downloadDialogClass, previewTab, processedPdfUrls, originalFileUrls, pdfPreviewUrls, txtPreviewContent])

  const showProcessing = processingStep !== 'idle' && processingStep !== 'error'
  const currentStepIndex = getCurrentStepIndex()
  const currentStepLabel = processingSteps[currentStepIndex]?.label || 'Processing'
  const processingPercent =
    processingStep === 'complete' ? 100 : Math.round(((Math.max(currentStepIndex, 0) + 0.5) / (processingSteps.length - 1)) * 100)

  const subjectColumns = (date: string): DataTableColumn<SubjectGroup>[] => [
    { key: 'name', header: 'Subject', mobile: 'title', render: (subject) => subject.name || '—' },
    { key: 'code', header: 'Code', mobile: 'subtitle', render: (subject) => subject.code || '—' },
    { key: 'class', header: 'Class', render: (subject) => <ClassBadge value={subject.records[0]?.class} /> },
    { key: 'count', header: 'Candidates', numeric: true, align: 'right', mobile: 'aside', render: (subject) => subject.count },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (subject) => (
        <Button
          variant="tertiary"
          size="sm"
          icon={FileText}
          onClick={() => openForm66DatePreview(date, subject.code)}
          disabled={form66DatePreviewLoading}
          aria-label={`Preview Form 66 PDF for subject ${subject.code}`}
          title={`Preview Form 66 PDF for subject ${subject.code}`}
        />
      ),
    },
  ]

  const rollColumns: DataTableColumn<Form66Record>[] = [
    {
      key: 'sr',
      header: 'Sr no.',
      numeric: true,
      width: 72,
      mobile: 'hidden',
      render: (record) => (rollSubject ? rollSubject.subject.records.indexOf(record) + 1 : '—'),
    },
    { key: 'rollNo', header: 'Roll no.', mobile: 'title', render: (record) => record.rollNo || '—' },
    { key: 'class', header: 'Class', mobile: 'aside', render: (record) => <ClassBadge value={record.class} /> },
  ]

  const dialogPdfUrl = downloadDialogClass ? pdfPreviewUrls[downloadDialogClass] : null
  const dialogTxt = downloadDialogClass ? txtPreviewContent[downloadDialogClass] : null
  const dialogTabs = downloadDialogClass
    ? [
        ...(processedPdfUrls[downloadDialogClass] ? [{ id: 'pdf', label: 'PDF' }] : []),
        ...(originalFileUrls[downloadDialogClass] ? [{ id: 'txt', label: 'Text file' }] : []),
      ]
    : []

  const downloadDatePdf = () => {
    if (!form66DatePreviewUrl) return
    const link = document.createElement('a')
    link.href = form66DatePreviewUrl
    link.download = form66DatePdfDownloadFilename
    link.click()
  }

  return (
    <Page>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        onChange={handleFileChange}
        className="cb-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {records.length > 0 ? (
        <section className="cb-stats" aria-label="Form 66 totals">
          <StatCard label="Candidates" value={stats.totalRecords.toLocaleString('en-IN')} />
          <StatCard label="Exam dates" value={stats.totalDates} />
          <StatCard label="Class 10 candidates" value={stats.class10th.toLocaleString('en-IN')} />
          <StatCard label="Class 12 candidates" value={stats.class12th.toLocaleString('en-IN')} />
        </section>
      ) : null}

      {showProcessing ? (
        <Card title="Processing upload" subtitle={`Step ${Math.min(currentStepIndex + 1, processingSteps.length)} of ${processingSteps.length}`}>
          <Progress
            value={processingPercent}
            label={currentStepLabel}
            tone={processingStep === 'complete' ? 'success' : 'accent'}
          />
        </Card>
      ) : null}

      {uploadStatus ? (
        <Banner tone={uploadStatus.type === 'success' ? 'success' : 'danger'} onDismiss={() => setUploadStatus(null)}>
          {uploadStatus.message}
        </Banner>
      ) : null}

      <Card
        flush
        title="Records by exam date"
        subtitle={
          dateGroups.length > 0
            ? 'Open a date to see its papers. Select a paper to see its roll numbers.'
            : undefined
        }
        action={
          <>
            {processedPdfUrls.X || originalFileUrls.X ? (
              <Button size="sm" icon={Eye} onClick={() => openDownloadDialog('X')}>
                Class 10 file
              </Button>
            ) : null}
            {processedPdfUrls.XII || originalFileUrls.XII ? (
              <Button size="sm" icon={Eye} onClick={() => openDownloadDialog('XII')}>
                Class 12 file
              </Button>
            ) : null}
            {dateGroups.length > 0 ? (
              <Button size="sm" variant="primary" icon={Upload} onClick={handleFileSelect} loading={uploading}>
                {uploading ? 'Processing…' : 'Upload Form 66'}
              </Button>
            ) : null}
            <Menu
              label="More record actions"
              items={[
                ...(dateGroups.length > 0
                  ? [
                      { label: 'Expand all dates', icon: ChevronDown, onSelect: expandAllDates },
                      { label: 'Collapse all dates', icon: ChevronRight, onSelect: collapseAllDates },
                    ]
                  : []),
                { label: 'Refresh records', icon: RefreshCw, onSelect: () => recordsQuery.refetch() },
              ]}
            />
          </>
        }
      >
        {loadingRecords ? (
          <CardLoading label="Loading records…" />
        ) : dateGroups.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Form 66 records yet"
            body="Upload the Form 66 .txt file. It is stored securely, converted to PDF and its pages are rearranged by exam date, so the roll numbers can be used for seating plans."
            action={
              <Button variant="primary" icon={Upload} onClick={handleFileSelect} loading={uploading}>
                Upload Form 66
              </Button>
            }
          />
        ) : (
          <ul className="cx-f66-dates">
            {dateGroups.map((dateGroup) => {
              const isDateExpanded = expandedDates.has(dateGroup.date)
              const weekday = weekdayOf(dateGroup.date)
              return (
                <li key={dateGroup.date} className="cx-f66-date">
                  <div className="cx-f66-date__head" onClick={() => toggleDateExpansion(dateGroup.date)}>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={isDateExpanded ? ChevronDown : ChevronRight}
                      aria-expanded={isDateExpanded}
                      aria-label={`${isDateExpanded ? 'Hide' : 'Show'} papers on ${displayDotDate(dateGroup.date)}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleDateExpansion(dateGroup.date)
                      }}
                    />
                    <Entity
                      className="cx-f66-date__title"
                      primary={displayDotDate(dateGroup.date)}
                      secondary={[
                        weekday,
                        `${dateGroup.subjects.length} paper${dateGroup.subjects.length !== 1 ? 's' : ''}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                    <span className="cx-f66-date__count">
                      <span className="cb-strong">{dateGroup.totalRecords.toLocaleString('en-IN')}</span>
                      <span className="cb-muted"> candidates</span>
                    </span>
                    <Button
                      size="sm"
                      icon={FileText}
                      onClick={(event) => {
                        event.stopPropagation()
                        openForm66DatePreview(dateGroup.date)
                      }}
                      disabled={form66DatePreviewLoading}
                      title="Preview and download PDF"
                    >
                      Preview PDF
                    </Button>
                  </div>
                  {isDateExpanded ? (
                    <div className="cx-f66-date__body">
                      <DataTable
                        caption={`Papers on ${displayDotDate(dateGroup.date)}`}
                        columns={subjectColumns(dateGroup.date)}
                        rows={dateGroup.subjects}
                        getRowKey={(subject) => `${dateGroup.date}-${subject.code}-${subject.name}`}
                        onRowClick={(subject) => setRollSubject({ date: dateGroup.date, subject })}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Roll numbers for one paper */}
      <Sheet
        open={rollSubject !== null}
        onClose={() => setRollSubject(null)}
        icon={FileText}
        title={rollSubject ? rollSubject.subject.name || rollSubject.subject.code : 'Roll numbers'}
        description={
          rollSubject
            ? `${rollSubject.subject.code} · ${displayDotDate(rollSubject.date)} · ${rollSubject.subject.count} candidate${rollSubject.subject.count !== 1 ? 's' : ''}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setRollSubject(null)}>Close</Button>
            {rollSubject ? (
              <Button
                variant="primary"
                icon={FileText}
                onClick={() => {
                  const current = rollSubject
                  setRollSubject(null)
                  openForm66DatePreview(current.date, current.subject.code)
                }}
                disabled={form66DatePreviewLoading}
              >
                Preview PDF
              </Button>
            ) : null}
          </>
        }
      >
        {rollSubject ? (
          <DataTable
            caption="Roll numbers"
            columns={rollColumns}
            rows={rollSubject.subject.records}
            getRowKey={(record) => record._id}
          />
        ) : null}
      </Sheet>

      {/* Uploaded Form 66 files for one class */}
      <Sheet
        open={downloadDialogClass !== null}
        onClose={closeDownloadDialog}
        size="xl"
        icon={FileText}
        title="Form 66 files"
        description={downloadDialogClass ? CLASS_LABEL[downloadDialogClass] : undefined}
        footer={
          <>
            <Button onClick={closeDownloadDialog}>Close</Button>
            {downloadDialogClass && originalFileUrls[downloadDialogClass] ? (
              <Button
                icon={Download}
                onClick={() => window.open(originalFileUrls[downloadDialogClass]!, '_blank', 'noopener,noreferrer')}
              >
                Download original
              </Button>
            ) : null}
            {downloadDialogClass && processedPdfUrls[downloadDialogClass] ? (
              <Button
                variant="primary"
                icon={Download}
                onClick={() => window.open(processedPdfUrls[downloadDialogClass]!, '_blank', 'noopener,noreferrer')}
              >
                Download Form 66 PDF
              </Button>
            ) : null}
          </>
        }
      >
        <div className="cx-f66-preview">
          {dialogTabs.length > 1 ? (
            <Tabs
              variant="segmented"
              label="File to preview"
              items={dialogTabs}
              value={previewTab}
              onChange={(id) => setPreviewTab(id as 'pdf' | 'txt')}
            />
          ) : null}
          {previewLoading ? (
            <CardLoading label="Generating preview…" />
          ) : previewError ? (
            <Banner tone="danger" title="The preview couldn’t be loaded">
              {previewError}
            </Banner>
          ) : previewTab === 'pdf' && dialogPdfUrl ? (
            <PdfFrame src={dialogPdfUrl} title="Form 66 PDF preview" />
          ) : previewTab === 'txt' && dialogTxt ? (
            <pre className="cx-f66-txt">{dialogTxt}</pre>
          ) : (
            <EmptyState icon={FileText} title="No file selected" body="Choose the PDF or the text file to preview it." compact />
          )}
        </div>
      </Sheet>

      {/* Form 66 PDF for one date, or one paper on that date */}
      <Sheet
        open={showForm66DatePreview && Boolean(form66DatePreviewUrl || form66DatePreviewLoading || form66DatePreviewError)}
        onClose={closeForm66DatePreview}
        size="xl"
        icon={FileText}
        title="Form 66 PDF"
        description={
          form66DatePreviewDate
            ? `${displayDotDate(form66DatePreviewDate)}${form66DatePreviewSubject ? ` · Subject ${form66DatePreviewSubject}` : ''}`
            : undefined
        }
        footer={
          <>
            <Button onClick={closeForm66DatePreview}>Close</Button>
            {form66DatePreviewUrl ? (
              <>
                <Button
                  icon={ExternalLink}
                  onClick={() => window.open(form66DatePreviewUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open in new tab
                </Button>
                <Button variant="primary" icon={Download} onClick={downloadDatePdf}>
                  Download PDF
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {form66DatePreviewLoading ? (
          <CardLoading label="Loading PDF preview…" />
        ) : form66DatePreviewError ? (
          <Banner tone="warning" title="The PDF couldn’t be generated">
            {form66DatePreviewError} Close this and try again, or check that the date has Form 66 data.
          </Banner>
        ) : form66DatePreviewUrl ? (
          <PdfFrame src={form66DatePreviewUrl} title="Form 66 PDF preview" />
        ) : null}
      </Sheet>
    </Page>
  )
}

export default Form66
