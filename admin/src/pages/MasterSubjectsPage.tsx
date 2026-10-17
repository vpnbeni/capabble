import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { FileUpload } from '../components/FileUpload'
import { masterSubjectsApi, rolloutApi } from '../services/platformApi'
import type { MasterSubject, SubjectStats } from '../types/platform'

const EMPTY_STATS: SubjectStats = {
  total: 0,
  class10th: 0,
  class12th: 0,
}

type ClassFilter = 'all' | '10th' | '12th'

const answerSheetLabel = (value: MasterSubject['answerSheet']) => {
  switch (value) {
    case '32_pages':
      return '32 Pages'
    case '20_pages':
      return '20 Pages'
    case '40_graph':
      return '40 Graph'
    default:
      return 'None'
  }
}

export function MasterSubjectsPage() {
  const [subjects, setSubjects] = useState<MasterSubject[]>([])
  const [stats, setStats] = useState<SubjectStats>(EMPTY_STATS)
  const [classFilter, setClassFilter] = useState<ClassFilter>('all')
  const [search, setSearch] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rollingOut, setRollingOut] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingSubject, setEditingSubject] = useState<MasterSubject | null>(null)

  const setFlashSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 5000)
  }

  const loadData = async (filter: ClassFilter = classFilter) => {
    setLoading(true)
    setError('')

    try {
      const [subjectsResult, statsResult] = await Promise.all([
        masterSubjectsApi.list(filter === 'all' ? undefined : filter),
        masterSubjectsApi.stats(),
      ])

      setSubjects(subjectsResult.subjects)
      setStats(statsResult)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load master subjects')
      } else {
        setError('Failed to load master subjects')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData().catch(() => undefined)
  }, [classFilter])

  const filteredSubjects = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()
    if (!searchTerm) {
      return subjects
    }

    return subjects.filter((subject) => {
      const code = String(subject.code || '').toLowerCase()
      const name = String(subject.name || '').toLowerCase()
      return code.includes(searchTerm) || name.includes(searchTerm)
    })
  }, [search, subjects])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (academicYear.trim()) {
        formData.append('academicYear', academicYear.trim())
      }

      const response = await masterSubjectsApi.upload(formData)
      const uploadData = response.data

      const inserted = uploadData?.inserted || 0
      const updated = uploadData?.updated || 0
      const skipped = uploadData?.skipped || 0
      setFlashSuccess(`Subjects uploaded. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`)
      await loadData()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to upload subjects')
      } else {
        setError('Failed to upload subjects')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (subjectId: string) => {
    setError('')
    try {
      await masterSubjectsApi.delete(subjectId)
      setFlashSuccess('Subject deleted')
      await loadData()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to delete subject')
      } else {
        setError('Failed to delete subject')
      }
    }
  }

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingSubject) return

    setError('')
    try {
      await masterSubjectsApi.update(editingSubject._id, editingSubject)
      setFlashSuccess('Subject updated')
      setEditingSubject(null)
      await loadData()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to update subject')
      } else {
        setError('Failed to update subject')
      }
    }
  }

  const handleRollout = async () => {
    if (subjects.length === 0) {
      setError('Upload subjects before rollout')
      return
    }

    setRollingOut(true)
    setError('')

    try {
      const versionSuffix = academicYear.trim() || new Date().getFullYear().toString()
      await rolloutApi.initiate({
        module: 'subjects',
        masterDataId: subjects[0]._id,
        versionLabel: `Subjects ${versionSuffix}`,
      })
      setFlashSuccess('Subject rollout initiated')
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to initiate rollout')
      } else {
        setError('Failed to initiate rollout')
      }
    } finally {
      setRollingOut(false)
    }
  }

  const columns: DataTableColumn<MasterSubject>[] = [
    { header: 'Code', accessor: 'code' },
    { header: 'Name', accessor: 'name' },
    { header: 'Class', accessor: 'class' },
    { header: 'Duration', accessor: (row) => `${row.duration} hrs` },
    { header: 'Answer Sheet', accessor: (row) => answerSheetLabel(row.answerSheet) },
    {
      header: 'Actions',
      accessor: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="secondary" onClick={(event) => {
            event.stopPropagation()
            setEditingSubject(row)
          }}>
            Edit
          </button>
          <button type="button" className="ghost" onClick={(event) => {
            event.stopPropagation()
            handleDelete(row._id).catch(() => undefined)
          }}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Master subjects</h1>
        <p className="page-subtitle">Upload one Excel/PDF file and roll out subjects to all active tenants.</p>
      </header>

      <section className="card">
        <h2 className="card-title">Upload subjects</h2>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Academic Year (optional)</label>
            <input
              placeholder="2025-26"
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
            />
          </div>
        </div>

        <FileUpload
          accept=".xlsx,.pdf"
          label="Upload Subjects (Excel/PDF)"
          onUpload={handleUpload}
          disabled={uploading || loading}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={handleRollout} disabled={rollingOut || subjects.length === 0}>
            {rollingOut ? 'Starting rollout...' : 'Rollout Subjects'}
          </button>
        </div>
      </section>

      <section className="grid grid-3">
        <article className="card stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Subjects</div>
        </article>
        <article className="card stat-card">
          <div className="stat-value">{stats.class10th}</div>
          <div className="stat-label">Class 10th</div>
        </article>
        <article className="card stat-card">
          <div className="stat-value">{stats.class12th}</div>
          <div className="stat-label">Class 12th</div>
        </article>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="filter-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`filter-tab ${classFilter === 'all' ? 'active' : ''}`}
              onClick={() => setClassFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-tab ${classFilter === '10th' ? 'active' : ''}`}
              onClick={() => setClassFilter('10th')}
            >
              10th
            </button>
            <button
              type="button"
              className={`filter-tab ${classFilter === '12th' ? 'active' : ''}`}
              onClick={() => setClassFilter('12th')}
            >
              12th
            </button>
          </div>

          <div className="input-group" style={{ marginBottom: 0, minWidth: 280, flex: '0 1 360px' }}>
            <input
              type="search"
              aria-label="Search subjects"
              placeholder="Search subject name or code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredSubjects}
          emptyMessage={
            loading
              ? 'Loading subjects...'
              : search.trim()
                ? `No subjects match "${search.trim()}"`
                : 'No subjects found'
          }
          rowKey={(row) => row._id}
        />
      </section>

      <Dialog
        isOpen={Boolean(editingSubject)}
        onClose={() => setEditingSubject(null)}
        title="Edit Master Subject"
      >
        {editingSubject && (
          <form onSubmit={handleSaveEdit} className="grid" style={{ gap: 14 }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Code</label>
              <input
                value={editingSubject.code}
                onChange={(event) => setEditingSubject((prev) => prev ? {
                  ...prev,
                  code: event.target.value.toUpperCase(),
                } : null)}
                required
              />
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Name</label>
              <input
                value={editingSubject.name}
                onChange={(event) => setEditingSubject((prev) => prev ? {
                  ...prev,
                  name: event.target.value,
                } : null)}
                required
              />
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Class</label>
                <select
                  value={editingSubject.class}
                  onChange={(event) => setEditingSubject((prev) => prev ? {
                    ...prev,
                    class: event.target.value as '10th' | '12th',
                  } : null)}
                >
                  <option value="10th">10th</option>
                  <option value="12th">12th</option>
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Duration</label>
                <select
                  value={editingSubject.duration}
                  onChange={(event) => setEditingSubject((prev) => prev ? {
                    ...prev,
                    duration: Number(event.target.value) as 2 | 3,
                  } : null)}
                >
                  <option value="2">2 hours</option>
                  <option value="3">3 hours</option>
                </select>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Answer Sheet</label>
                <select
                  value={editingSubject.answerSheet}
                  onChange={(event) => setEditingSubject((prev) => prev ? {
                    ...prev,
                    answerSheet: event.target.value as MasterSubject['answerSheet'],
                  } : null)}
                >
                  <option value="none">None</option>
                  <option value="20_pages">20 Pages</option>
                  <option value="32_pages">32 Pages</option>
                  <option value="40_graph">40 Graph</option>
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Board Code</label>
                <input
                  value={editingSubject.boardCode || ''}
                  onChange={(event) => setEditingSubject((prev) => prev ? {
                    ...prev,
                    boardCode: event.target.value.toUpperCase(),
                  } : null)}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editingSubject.isTheorySubject}
                onChange={(event) => setEditingSubject((prev) => prev ? {
                  ...prev,
                  isTheorySubject: event.target.checked,
                } : null)}
                style={{ width: 16, height: 16 }}
              />
              Theory Subject
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editingSubject.isPracticalSubject}
                onChange={(event) => setEditingSubject((prev) => prev ? {
                  ...prev,
                  isPracticalSubject: event.target.checked,
                } : null)}
                style={{ width: 16, height: 16 }}
              />
              Practical Subject
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="button" className="ghost" onClick={() => setEditingSubject(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="primary" style={{ flex: 1 }}>
                Save
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
