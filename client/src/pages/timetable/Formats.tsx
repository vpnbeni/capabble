import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText, History, Sparkles, Users } from 'lucide-react'
import timetableService, { type TimetableVersionSummary } from '@/services/timetableService'
import toast from 'react-hot-toast'
import { Badge, Button, Card, DetailList, EmptyState, Page, Select, formatDate, type Tone } from '@/components/ui'
import '@/components/timetable/generate.css'

type FormatType = 'excel' | 'class-pdf' | 'teacher-pdf'

const FORMAT_OPTIONS: Array<{ value: FormatType; label: string; helper: string }> = [
  {
    value: 'excel',
    label: 'Excel (.xlsx)',
    helper: 'All class timetables in spreadsheet format',
  },
  {
    value: 'class-pdf',
    label: 'Class-wise PDF',
    helper: 'Combined class timetable PDF',
  },
  {
    value: 'teacher-pdf',
    label: 'Teacher-wise PDF',
    helper: 'Combined teacher timetable PDF',
  },
]

const FORMAT_ICON = {
  excel: FileSpreadsheet,
  'class-pdf': FileText,
  'teacher-pdf': Users,
} as const

const VERSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'warning' },
}

const STATUS_WORD: Record<string, string> = { draft: 'draft', published: 'published', archived: 'archived' }

const toSafeName = (value: string) => value.replace(/[^a-zA-Z0-9-]/g, '_')

const Formats: React.FC = () => {
  const navigate = useNavigate()
  const [versions, setVersions] = useState<TimetableVersionSummary[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<FormatType>('excel')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const loadVersions = async () => {
      setLoadingVersions(true)
      try {
        const data = await timetableService.getVersions()
        setVersions(data)

        const preferred = data.find((item) => item.status === 'published') || data[0]
        if (preferred) {
          setSelectedVersionId(preferred._id)
        }
      } catch {
        toast.error('Failed to load timetable versions.')
      } finally {
        setLoadingVersions(false)
      }
    }

    void loadVersions()
  }, [])

  const selectedVersion = useMemo(
    () => versions.find((item) => item._id === selectedVersionId) || null,
    [versions, selectedVersionId]
  )

  const handleDownload = async () => {
    if (!selectedVersion) {
      toast.error('Select a version first.')
      return
    }

    setDownloading(true)
    try {
      const safeVersionName = toSafeName(selectedVersion.name || 'version')
      if (selectedFormat === 'excel') {
        await timetableService.exportExcel(selectedVersion._id, `timetable-${safeVersionName}.xlsx`)
      } else if (selectedFormat === 'class-pdf') {
        await timetableService.exportClassPDF(selectedVersion._id, undefined, `class-timetable-${safeVersionName}.pdf`)
      } else {
        await timetableService.exportTeacherPDF(selectedVersion._id, undefined, `teacher-timetable-${safeVersionName}.pdf`)
      }
      toast.success('Download started.')
    } catch {
      toast.error('Failed to download timetable in selected format.')
    } finally {
      setDownloading(false)
    }
  }

  const selectedFormatOption = FORMAT_OPTIONS.find((item) => item.value === selectedFormat)
  const selectedStatus = selectedVersion ? VERSION_STATUS[selectedVersion.status] ?? VERSION_STATUS.draft : null

  let body: React.ReactNode
  if (loadingVersions) {
    body = (
      <div className="cb-table-state" role="status">
        <span className="cb-spinner" aria-hidden="true" />
        Loading versions…
      </div>
    )
  } else if (versions.length === 0) {
    body = (
      <EmptyState
        compact
        icon={History}
        title="No saved timetable versions"
        body="Generate a timetable first, then come back here to download it."
        action={
          <Button icon={Sparkles} onClick={() => navigate('/time-table/generate')}>
            Go to generate
          </Button>
        }
      />
    )
  } else {
    body = (
      <>
        <div className="cb-form-grid">
          <Select
            id="format-version"
            label="Version"
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            options={versions.map((version) => ({
              value: version._id,
              label: `${version.name} (${STATUS_WORD[version.status] ?? version.status})`,
            }))}
          />
          <Select
            id="format-type"
            label="Format"
            value={selectedFormat}
            onChange={(event) => setSelectedFormat(event.target.value as FormatType)}
            options={FORMAT_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            hint={selectedFormatOption?.helper}
          />
        </div>

        {selectedVersion && selectedStatus ? (
          <DetailList
            className="tg-format-summary"
            columns={3}
            items={[
              { label: 'Status', value: <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge> },
              { label: 'Generated', value: formatDate(selectedVersion.generatedAt) },
              {
                label: 'Conflicts',
                value:
                  selectedVersion.conflictCount > 0 ? (
                    <Badge tone="warning">{selectedVersion.conflictCount} unresolved</Badge>
                  ) : (
                    <Badge tone="success">None</Badge>
                  ),
              },
            ]}
          />
        ) : null}
      </>
    )
  }

  return (
    <Page>
      <Card
        className="tg-formats"
        title="Download timetable"
        subtitle="Choose a saved version and a format, then download in one click."
        footer={
          versions.length > 0 ? (
            <Button
              variant="primary"
              icon={FORMAT_ICON[selectedFormat]}
              loading={downloading}
              disabled={loadingVersions || !selectedVersion}
              onClick={() => void handleDownload()}
            >
              {downloading ? 'Preparing download…' : 'Download timetable'}
            </Button>
          ) : null
        }
      >
        {body}
      </Card>
    </Page>
  )
}

export default Formats
