import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, FileText } from 'lucide-react'
import undertakingService, { type UndertakingRecord } from '../services/undertakingService'
import { Button, Card, DetailList, EmptyState, Page, formatDate, formatTime } from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'

const formatDateTime = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return `${formatDate(parsed)}, ${formatTime(`${parsed.getHours()}:${parsed.getMinutes()}`)}`
}

const formatBytes = (value?: number) => {
  if (!value || value <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

const UndertakingForm: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [record, setRecord] = useState<UndertakingRecord | null>(null)

  const loadCurrent = async () => {
    try {
      setLoading(true)
      const data = await undertakingService.getCurrent()
      setRecord(data)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load undertaking file')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCurrent().catch(() => undefined)
  }, [])

  const uploadedAt = useMemo(
    () => formatDateTime(record?.rolledOutAt || record?.createdAt),
    [record?.rolledOutAt, record?.createdAt]
  )

  const handleDownload = async () => {
    if (!record) return
    try {
      setDownloading(true)
      await undertakingService.downloadCurrent()
    } catch (error: any) {
      toast.error(error?.serverMessage ?? error?.response?.data?.error ?? 'Failed to download file')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Page>

      <Card
        title="Current form"
        subtitle="The latest undertaking form rolled out for all exam functionaries."
        action={
          record ? (
            <Button size="sm" variant="primary" icon={Download} onClick={handleDownload} loading={downloading}>
              {downloading ? 'Downloading…' : 'Download undertaking'}
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <CardLoading label="Loading undertaking file…" />
        ) : !record ? (
          <EmptyState
            icon={FileText}
            title="No undertaking form has been rolled out yet"
            body="It appears here as soon as the super admin rolls one out."
          />
        ) : (
          <DetailList
            items={[
              { label: 'Title', value: record.title },
              { label: 'Academic year', value: record.academicYear },
              { label: 'File size', value: formatBytes(record.metadata?.fileSize) },
              { label: 'Rolled out', value: uploadedAt },
            ]}
          />
        )}
      </Card>
    </Page>
  )
}

export default UndertakingForm
