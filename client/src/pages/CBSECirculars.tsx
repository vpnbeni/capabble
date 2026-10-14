import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink, Megaphone, Plus, Trash2 } from 'lucide-react'
import cbseCircularService, { CBSECircular } from '../services/cbseCircularService'
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  Icon,
  Page,
  Sheet,
  TextArea,
  TextField,
  formatDate,
  orDash,
  type DataTableColumn,
} from '@/components/ui'

const CBSECirculars: React.FC = () => {
  const [circulars, setCirculars] = useState<CBSECircular[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CBSECircular | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    circularNumber: '',
    publishDate: '',
    sourceUrl: '',
    summary: '',
  })

  const loadCirculars = async () => {
    try {
      setLoading(true)
      const response = await cbseCircularService.getAll()
      setCirculars(response.data?.data || [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load CBSE circulars')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCirculars()
  }, [])

  const handleCreate = async () => {
    if (!form.title.trim() || !form.publishDate) {
      toast.error('Title and publish date are required')
      return
    }

    try {
      setSaving(true)
      await cbseCircularService.create({
        title: form.title.trim(),
        circularNumber: form.circularNumber.trim() || undefined,
        publishDate: form.publishDate,
        sourceUrl: form.sourceUrl.trim() || undefined,
        summary: form.summary.trim() || undefined,
      })
      setShowAddModal(false)
      setForm({
        title: '',
        circularNumber: '',
        publishDate: '',
        sourceUrl: '',
        summary: '',
      })
      await loadCirculars()
      toast.success('Circular added')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to add circular')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true)
      await cbseCircularService.deleteById(id)
      setCirculars((prev) => prev.filter((item) => item._id !== id))
      toast.success('Circular deleted')
      setPendingDelete(null)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to delete circular')
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<CBSECircular>[] = [
    {
      key: 'title',
      header: 'Circular',
      mobile: 'title',
      wrap: true,
      render: (item) => <Entity primary={item.title} secondary={item.summary || undefined} />,
    },
    {
      key: 'circularNumber',
      header: 'Number',
      mobile: 'hidden',
      render: (item) => orDash(item.circularNumber),
    },
    {
      key: 'publishDate',
      header: 'Published',
      mobile: 'subtitle',
      render: (item) => formatDate(item.publishDate),
    },
    {
      key: 'source',
      header: 'Source',
      interactive: true,
      render: (item) =>
        item.sourceUrl ? (
          <a className="cb-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Open circular <Icon icon={ExternalLink} size={14} />
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      interactive: true,
      render: (item) => (
        <Button
          size="sm"
          variant="tertiary"
          icon={Trash2}
          aria-label={`Delete ${item.title}`}
          onClick={() => setPendingDelete(item)}
        />
      ),
    },
  ]

  return (
    <Page>
      <Card
        flush
        title="Circulars"
        subtitle="Examination circulars, sorted by publish date"
        action={
          <Button variant="primary" icon={Plus} onClick={() => setShowAddModal(true)}>
            Add circular
          </Button>
        }
      >
        <DataTable
          caption="CBSE circulars"
          columns={columns}
          rows={loading ? [] : circulars}
          getRowKey={(item) => item._id}
          loading={loading}
          loadingLabel="Loading circulars…"
          empty={
            <EmptyState
              icon={Megaphone}
              title="No circulars added yet"
              body="Add a CBSE circular to keep its number, date and link in one place."
              action={
                <Button icon={Plus} onClick={() => setShowAddModal(true)}>
                  Add circular
                </Button>
              }
            />
          }
        />
      </Card>

      <Sheet
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        icon={Megaphone}
        title="Add CBSE circular"
        description="Title and publish date are required."
        onSubmit={(event) => {
          event.preventDefault()
          handleCreate()
        }}
        footer={
          <>
            <Button onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save circular
            </Button>
          </>
        }
      >
        <TextField
          label="Title"
          required
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        />
        <div className="cb-form-grid">
          <TextField
            label="Circular number"
            value={form.circularNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, circularNumber: e.target.value }))}
          />
          <TextField
            label="Publish date"
            type="date"
            required
            value={form.publishDate}
            onChange={(e) => setForm((prev) => ({ ...prev, publishDate: e.target.value }))}
          />
        </div>
        <TextField
          label="Source URL"
          type="url"
          hint="Optional"
          value={form.sourceUrl}
          onChange={(e) => setForm((prev) => ({ ...prev, sourceUrl: e.target.value }))}
        />
        <TextArea
          label="Summary"
          hint="Optional"
          rows={4}
          value={form.summary}
          onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
        />
      </Sheet>

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        tone="danger"
        size="sm"
        title="Delete this circular?"
        description={pendingDelete ? `${pendingDelete.title} will be removed from the list.` : undefined}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => pendingDelete && handleDelete(pendingDelete._id)}
            >
              Delete circular
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default CBSECirculars
