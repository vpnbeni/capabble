import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import exmclCircularService, { type ExmclCircular, type ExmclCircularPageSize } from '@/services/exmclCircularService'
import CircularRichTextEditor from '@/components/exmcl/CircularRichTextEditor'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  TextField,
  formatDate,
  type DataTableColumn,
} from '@/components/ui'
import { errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'

const PAGE_SIZE_OPTIONS: Array<{ value: ExmclCircularPageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'legal', label: 'Legal' },
  { value: 'letter', label: 'Letter' },
]

// Local calendar date (toISOString would give yesterday's date before 5:30 am IST).
const ymdLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = () => ymdLocal(new Date())

const toInputDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return ymdLocal(date)
}

const deriveSeriesFromReference = (referenceNumber?: string | null) => {
  const value = String(referenceNumber || '').trim()
  if (!value) return ''
  const match = value.match(/^(.*?)(\d+)$/)
  if (!match) return value
  return match[1].trim()
}

const getNextReferenceNumber = (seriesRaw: string, circulars: ExmclCircular[]) => {
  const series = seriesRaw.trim()
  if (!series) return ''
  const escapedSeries = series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const suffixPattern = new RegExp(`^${escapedSeries}(\\d+)$`, 'i')

  let maxCounter = 0
  circulars.forEach((item) => {
    const value = item.referenceNumber?.trim()
    if (!value) return
    const match = value.match(suffixPattern)
    if (!match) return
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > maxCounter) {
      maxCounter = parsed
    }
  })

  return `${series}${String(maxCounter + 1).padStart(3, '0')}`
}

const pageSizeLabel = (value?: string) => PAGE_SIZE_OPTIONS.find((option) => option.value === value)?.label || 'A4'

const plainText = (html: string) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value)

type CircularForm = {
  title: string
  content: string
  circularDate: string
  referenceSeries: string
  referenceNumber: string
  pageSize: ExmclCircularPageSize
}

type StatusFilter = 'all' | 'draft' | 'published'

const ExmclCirculars: React.FC = () => {
  const [circulars, setCirculars] = useState<ExmclCircular[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ExmclCircular | null>(null)
  const [form, setForm] = useState<CircularForm>({
    title: '',
    content: '',
    circularDate: today(),
    referenceSeries: '',
    referenceNumber: '',
    pageSize: 'A4',
  })
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState<ExmclCircular | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<ExmclCircular | null>(null)

  const loadCirculars = async () => {
    try {
      setCirculars(await exmclCircularService.getAll())
    } catch (error) {
      toast.error(errorMessage(error, 'Circulars didn’t load. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCirculars()
  }, [])

  const set = (patch: Partial<CircularForm>) => setForm((prev) => ({ ...prev, ...patch }))

  // New circulars continue the latest reference series and take its next number.
  useEffect(() => {
    if (editing || !sheetOpen) return
    setForm((prev) => ({ ...prev, referenceNumber: getNextReferenceNumber(prev.referenceSeries, circulars) }))
  }, [form.referenceSeries, circulars, editing, sheetOpen])

  const openAdd = () => {
    const latest = circulars.find((item) => item.referenceSeries?.trim() || item.referenceNumber?.trim())
    const series = latest ? latest.referenceSeries?.trim() || deriveSeriesFromReference(latest.referenceNumber) : ''
    setEditing(null)
    setForm({
      title: '',
      content: '',
      circularDate: today(),
      referenceSeries: series,
      referenceNumber: getNextReferenceNumber(series, circulars),
      pageSize: 'A4',
    })
    setTried(false)
    setSheetOpen(true)
  }

  const openEdit = (item: ExmclCircular) => {
    setEditing(item)
    setForm({
      title: item.title,
      content: looksLikeHtml(item.content) ? item.content : String(item.content || '').replace(/\n/g, '<br>'),
      circularDate: toInputDate(item.circularDate),
      referenceSeries: item.referenceSeries?.trim() || deriveSeriesFromReference(item.referenceNumber),
      referenceNumber: item.referenceNumber || '',
      pageSize: item.pageSize === 'legal' || item.pageSize === 'letter' ? item.pageSize : 'A4',
    })
    setTried(false)
    setSheetOpen(true)
  }

  const contentBlank = plainText(form.content) === ''

  const save = async () => {
    setTried(true)
    if (!form.title.trim() || contentBlank || !form.circularDate || !form.referenceNumber.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        content: form.content,
        circularDate: form.circularDate,
        referenceSeries: form.referenceSeries.trim(),
        referenceNumber: form.referenceNumber.trim(),
        pageSize: form.pageSize,
      }
      if (editing) await exmclCircularService.update(editing._id, payload)
      else await exmclCircularService.create(payload)
      toast.success(editing ? 'Circular saved.' : 'Circular saved as a draft.')
      setSheetOpen(false)
      await loadCirculars()
    } catch (error) {
      toast.error(errorMessage(error, 'The circular wasn’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    if (!publishing) return
    setBusy(true)
    try {
      await exmclCircularService.publish(publishing._id)
      toast.success(`${publishing.referenceNumber || 'Circular'} published.`)
      setPublishing(null)
      await loadCirculars()
    } catch (error) {
      toast.error(errorMessage(error, 'The circular wasn’t published. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await exmclCircularService.remove(removing._id)
      toast.success('Circular deleted.')
      if (editing?._id === removing._id) setSheetOpen(false)
      setRemoving(null)
      await loadCirculars()
    } catch (error) {
      toast.error(errorMessage(error, 'The circular wasn’t deleted. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const publishedCount = useMemo(() => circulars.filter((item) => item.status === 'published').length, [circulars])
  const draftCount = circulars.length - publishedCount

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return circulars.filter((item) => {
      if (status !== 'all' && (item.status === 'published' ? 'published' : 'draft') !== status) return false
      if (!needle) return true
      return [item.title, item.referenceNumber, plainText(item.content)].some((v) =>
        String(v || '').toLowerCase().includes(needle)
      )
    })
  }, [circulars, search, status])

  const columns: DataTableColumn<ExmclCircular>[] = [
    {
      key: 'title',
      header: 'Circular',
      mobile: 'title',
      wrap: true,
      render: (item) => <Entity primary={item.title} secondary={plainText(item.content).slice(0, 120) || undefined} />,
    },
    { key: 'ref', header: 'Ref. no.', mobile: 'subtitle', render: (item) => item.referenceNumber || '—' },
    { key: 'date', header: 'Date', render: (item) => formatDate(item.circularDate) },
    { key: 'page', header: 'Paper', mobile: 'hidden', render: (item) => pageSizeLabel(item.pageSize) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (item) =>
        item.status === 'published' ? (
          <Badge tone="success" title={item.publishedAt ? `Published ${formatDate(item.publishedAt)}` : undefined}>
            Published
          </Badge>
        ) : (
          <Badge tone="neutral">Draft</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (item) => (
        <Menu
          label={`Actions for ${item.title}`}
          items={[
            { label: 'Edit circular', icon: Pencil, onSelect: () => openEdit(item) },
            ...(item.status !== 'published'
              ? [{ label: 'Publish circular', icon: Send, onSelect: () => setPublishing(item) }]
              : []),
            { divider: true },
            { label: 'Delete circular', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(item) },
          ]}
        />
      ),
    },
  ]

  const filtered = Boolean(search.trim() || status !== 'all')

  return (
    <Page>
      <Card flush title="Circulars" subtitle="Notices to staff and parents about exams, numbered in series">
        <CardToolbar>
          <FilterBar
            search={{ placeholder: 'Search title, reference or text', value: search, onChange: setSearch, label: 'Search circulars' }}
            chips={[
              { id: 'all', label: 'All', count: circulars.length, active: status === 'all' },
              { id: 'draft', label: 'Drafts', count: draftCount, active: status === 'draft' },
              { id: 'published', label: 'Published', count: publishedCount, active: status === 'published' },
            ]}
            onChipClick={(id) => setStatus(id as StatusFilter)}
            chipsLabel="Status"
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Write circular
              </Button>
            }
          />
        </CardToolbar>
        <DataTable
          caption="Circulars"
          columns={columns}
          rows={rows}
          getRowKey={(item) => item._id}
          onRowClick={openEdit}
          loading={loading}
          loadingLabel="Loading circulars…"
          empty={
            circulars.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No circulars yet"
                body="Write one and save it as a draft. Publish it when it’s ready to go out."
                action={
                  <Button size="sm" icon={Plus} onClick={openAdd}>
                    Write circular
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={FileText}
                title="No circulars match these filters"
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setStatus('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Edit ${editing.referenceNumber || 'circular'}` : 'Write circular'}
        description={
          editing?.status === 'published'
            ? `Published ${formatDate(editing.publishedAt)}. Changes show on the printed copy.`
            : 'Saved as a draft until you publish it.'
        }
        icon={FileText}
        size="xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (!saving) void save()
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? 'Save circular' : 'Save draft'}
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <div className="cb-form-grid cb-form-grid--3">
            <TextField
              className="is-wide"
              label="Title"
              required
              autoFocus
              placeholder="e.g. Half-yearly exam schedule"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              error={tried && !form.title.trim() ? 'Enter a title.' : undefined}
            />
            <TextField
              label="Date"
              type="date"
              required
              value={form.circularDate}
              onChange={(e) => set({ circularDate: e.target.value })}
              error={tried && !form.circularDate ? 'Pick the circular’s date.' : undefined}
            />
            <TextField
              label="Reference series"
              placeholder="e.g. EXM/2026/"
              value={form.referenceSeries}
              onChange={(e) => set({ referenceSeries: e.target.value })}
            />
            <TextField
              label="Reference no."
              required
              readOnly={!editing}
              hint={editing ? undefined : 'Next number in the series'}
              value={form.referenceNumber}
              onChange={(e) => set({ referenceNumber: e.target.value })}
              error={tried && !form.referenceNumber.trim() ? 'Enter a reference series to number it.' : undefined}
            />
            <Select
              label="Paper size"
              value={form.pageSize}
              onChange={(e) => set({ pageSize: e.target.value as ExmclCircularPageSize })}
              options={PAGE_SIZE_OPTIONS}
            />
          </div>
        </div>
        <div className="cb-form-section">
          <CircularRichTextEditor
            value={form.content}
            onChange={(content) => set({ content })}
            error={tried && contentBlank ? 'Write the circular’s text.' : undefined}
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        size="sm"
        title={`Publish ${publishing?.referenceNumber || 'this circular'}?`}
        description="It’s marked published. You can still edit it afterwards."
        footer={
          <>
            <Button onClick={() => setPublishing(null)} disabled={busy}>
              Keep as draft
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void publish()}>
              Publish circular
            </Button>
          </>
        }
      />

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Delete ${removing?.referenceNumber || 'this circular'}?`}
        description={`“${removing?.title || ''}” is removed for good.`}
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={busy}>
              Keep circular
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Delete circular
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ExmclCirculars
