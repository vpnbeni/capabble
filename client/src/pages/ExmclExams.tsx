import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import {
  Button,
  Card,
  CardToolbar,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'

const STANDARD_EXAMS = [
  { name: 'Unit Test 1', code: 'UT1' },
  { name: 'Unit Test 2', code: 'UT2' },
  { name: 'Periodic Test 1', code: 'PT1' },
  { name: 'Periodic Test 2', code: 'PT2' },
  { name: 'Semester Assessment 1', code: 'SA1' },
  { name: 'Semester Assessment 2 / Annual', code: 'SA2/ANNUAL' },
]

type ExamForm = { name: string; code: string; duration: string; maximumMarks: string }
const emptyForm = (): ExamForm => ({ name: '', code: '', duration: '', maximumMarks: '' })

const ExmclExams: React.FC = () => {
  const [items, setItems] = useState<ExmclExamDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ExmclExamDefinition | null>(null)
  const [form, setForm] = useState<ExamForm>(emptyForm)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<ExmclExamDefinition | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadExams = async () => {
    try {
      setItems(await exmclExamService.getAll())
    } catch (error) {
      toast.error(errorMessage(error, 'Exams didn’t load. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadExams()
  }, [])

  const usedCodes = useMemo(() => new Set(items.map((item) => item.code.trim().toUpperCase())), [items])
  const freeStandard = STANDARD_EXAMS.filter((t) => !usedCodes.has(t.code))

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => [item.name, item.code].some((v) => String(v || '').toLowerCase().includes(needle)))
  }, [items, search])

  const set = (patch: Partial<ExamForm>) => setForm((prev) => ({ ...prev, ...patch }))

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setTried(false)
    setSheetOpen(true)
  }

  const openEdit = (item: ExmclExamDefinition) => {
    setEditing(item)
    setForm({
      name: item.name,
      code: item.code,
      duration: String(item.duration || ''),
      maximumMarks: String(item.maximumMarks ?? ''),
    })
    setTried(false)
    setSheetOpen(true)
  }

  const marks = Number(form.maximumMarks)
  const marksInvalid = form.maximumMarks.trim() !== '' && (!Number.isFinite(marks) || marks < 0)
  const codeTaken =
    form.code.trim() !== '' &&
    usedCodes.has(form.code.trim().toUpperCase()) &&
    form.code.trim().toUpperCase() !== editing?.code.trim().toUpperCase()

  const save = async () => {
    setTried(true)
    if (!form.name.trim() || !form.code.trim() || marksInvalid || codeTaken) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        duration: form.duration.trim(),
        maximumMarks: form.maximumMarks.trim() ? marks : 0,
        displayOrder: editing ? editing.displayOrder ?? items.length : items.length,
      }
      if (editing) await exmclExamService.update(editing._id, payload)
      else await exmclExamService.create(payload)
      toast.success(editing ? `${payload.code} updated.` : `${payload.code} added.`)
      setSheetOpen(false)
      await loadExams()
    } catch (error) {
      toast.error(errorMessage(error, 'The exam wasn’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await exmclExamService.remove(removing._id)
      toast.success(`${removing.code} removed.`)
      setRemoving(null)
      await loadExams()
    } catch (error) {
      toast.error(errorMessage(error, 'The exam wasn’t removed. Try again.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<ExmclExamDefinition>[] = [
    { key: 'order', header: '#', width: 48, numeric: true, mobile: 'hidden', render: (item) => items.indexOf(item) + 1 },
    { key: 'name', header: 'Exam', mobile: 'title', render: (item) => <span className="cb-strong">{item.name}</span> },
    { key: 'code', header: 'Code', mobile: 'aside', render: (item) => <span className="ex-code">{item.code}</span> },
    { key: 'duration', header: 'Duration', render: (item) => item.duration || '—' },
    {
      key: 'marks',
      header: 'Maximum marks',
      numeric: true,
      align: 'right',
      render: (item) => (item.maximumMarks ? item.maximumMarks : '—'),
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
          label={`Actions for ${item.code}`}
          items={[
            { label: 'Edit exam', icon: Pencil, onSelect: () => openEdit(item) },
            { divider: true },
            { label: 'Remove exam', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(item) },
          ]}
        />
      ),
    },
  ]

  return (
    <Page>
      <Card flush title="Exams this session" subtitle="The tests every class sits, with their duration and maximum marks">
        <CardToolbar>
          <FilterBar
            search={{ placeholder: 'Search exam or code', value: search, onChange: setSearch, label: 'Search exams' }}
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Add exam
              </Button>
            }
          />
        </CardToolbar>
        <DataTable
          caption="Exams this session"
          columns={columns}
          rows={rows}
          getRowKey={(item) => item._id}
          onRowClick={openEdit}
          loading={loading}
          loadingLabel="Loading exams…"
          empty={
            items.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No exams set up for this session"
                body="Add the tests your school holds — UT1, PT1, SA1 and so on. Subjects, datesheets and results are built from this list."
                action={
                  <Button size="sm" icon={Plus} onClick={openAdd}>
                    Add exam
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={ClipboardList}
                title="No exams match this search"
                action={
                  <Button size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add exam'}
        description="Name, short code, duration and maximum marks."
        icon={ClipboardList}
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
              {editing ? 'Save exam' : 'Add exam'}
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          {!editing && freeStandard.length ? (
            <Select
              className="is-wide"
              label="Start from a standard exam"
              placeholder="Custom exam"
              value={STANDARD_EXAMS.find((t) => t.code === form.code && t.name === form.name)?.code || ''}
              onChange={(e) => {
                const t = STANDARD_EXAMS.find((x) => x.code === e.target.value)
                set(t ? { name: t.name, code: t.code } : { name: '', code: '' })
              }}
              options={freeStandard.map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` }))}
            />
          ) : null}
          <TextField
            className="is-wide"
            label="Exam name"
            required
            autoFocus
            placeholder="e.g. Periodic Test 1"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            error={tried && !form.name.trim() ? 'Enter the exam name.' : undefined}
          />
          <TextField
            label="Code"
            required
            placeholder="e.g. PT1"
            value={form.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            error={
              tried && !form.code.trim()
                ? 'Enter a short code.'
                : tried && codeTaken
                  ? `${form.code.trim().toUpperCase()} is already in this session.`
                  : undefined
            }
          />
          <TextField
            label="Maximum marks"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="e.g. 80"
            value={form.maximumMarks}
            onChange={(e) => set({ maximumMarks: e.target.value })}
            error={tried && marksInvalid ? 'Marks can’t be negative.' : undefined}
          />
          <TextField
            label="Duration"
            placeholder="e.g. 3 hours"
            value={form.duration}
            onChange={(e) => set({ duration: e.target.value })}
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removing?.code || 'this exam'}?`}
        description="The exam leaves this session’s list and can’t be picked for subjects, datesheets or results."
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={deleting}>
              Keep exam
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Remove exam
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ExmclExams
