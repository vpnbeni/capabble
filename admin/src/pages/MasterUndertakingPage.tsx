import { useEffect, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { FileUpload } from '../components/FileUpload'
import { masterUndertakingsApi, rolloutApi } from '../services/platformApi'
import type { MasterUndertaking } from '../types/platform'

const formatDate = (date?: string) => (date ? new Date(date).toLocaleString() : '-')

export function MasterUndertakingPage() {
  const [undertakings, setUndertakings] = useState<MasterUndertaking[]>([])
  const [currentUndertaking, setCurrentUndertaking] = useState<MasterUndertaking | null>(null)
  const [title, setTitle] = useState('Undertaking Form for Exam Functionaries')
  const [academicYear, setAcademicYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rollingOut, setRollingOut] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const setFlashSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 5000)
  }

  const loadUndertakings = async () => {
    setLoading(true)
    setError('')

    try {
      const [items, current] = await Promise.all([
        masterUndertakingsApi.list(),
        masterUndertakingsApi.current(),
      ])
      setUndertakings(items)
      setCurrentUndertaking(current)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load undertakings')
      } else {
        setError('Failed to load undertakings')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUndertakings().catch(() => undefined)
  }, [])

  const handleUpload = async (file: File) => {
    if (!academicYear.trim()) {
      setError('Academic year is required for undertaking upload')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim() || 'Undertaking Form for Exam Functionaries')
      formData.append('academicYear', academicYear.trim())

      await masterUndertakingsApi.upload(formData)
      setFlashSuccess('Undertaking uploaded successfully')
      await loadUndertakings()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to upload undertaking')
      } else {
        setError('Failed to upload undertaking')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setError('')
    try {
      await masterUndertakingsApi.delete(id)
      setFlashSuccess('Undertaking deleted')
      await loadUndertakings()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to delete undertaking')
      } else {
        setError('Failed to delete undertaking')
      }
    }
  }

  const handleRollout = async () => {
    if (!currentUndertaking) {
      setError('Upload undertaking before rollout')
      return
    }

    setRollingOut(true)
    setError('')

    try {
      await rolloutApi.initiate({
        module: 'undertaking',
        masterDataId: currentUndertaking._id,
        versionLabel: `Undertaking ${currentUndertaking.academicYear}`,
      })
      setFlashSuccess('Undertaking rollout initiated')
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to start rollout')
      } else {
        setError('Failed to start rollout')
      }
    } finally {
      setRollingOut(false)
    }
  }

  const columns: DataTableColumn<MasterUndertaking>[] = [
    { header: 'Title', accessor: 'title' },
    { header: 'Academic Year', accessor: 'academicYear' },
    { header: 'Uploaded At', accessor: (row) => formatDate(row.createdAt) },
    { header: 'Status', accessor: (row) => (row.isActive ? 'Active' : 'Archived') },
    {
      header: 'Actions',
      accessor: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={row.cloudinaryUrl} target="_blank" rel="noreferrer" className="secondary" onClick={(event) => event.stopPropagation()}>
            Open
          </a>
          <button
            type="button"
            className="ghost"
            onClick={(event) => {
              event.stopPropagation()
              handleDelete(row._id).catch(() => undefined)
            }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Master undertaking form</h1>
        <p className="page-subtitle">Upload the undertaking PDF and roll it out to all active tenants.</p>
      </header>

      <section className="card">
        <h2 className="card-title">Upload undertaking</h2>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Undertaking Form for Exam Functionaries"
            />
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Academic Year</label>
            <input
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              placeholder="2025-26"
            />
          </div>
        </div>

        <FileUpload
          accept=".pdf"
          label="Upload Undertaking PDF"
          onUpload={handleUpload}
          disabled={uploading || loading}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={handleRollout} disabled={rollingOut || !currentUndertaking}>
            {rollingOut ? 'Starting rollout...' : 'Rollout Undertaking'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Current undertaking</h2>

        {!currentUndertaking && <div className="empty-state">No active undertaking uploaded yet.</div>}

        {currentUndertaking && (
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Title</div>
              <div>{currentUndertaking.title}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Academic Year</div>
              <div>{currentUndertaking.academicYear}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Uploaded</div>
              <div>{formatDate(currentUndertaking.createdAt)}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>File</div>
              <a href={currentUndertaking.cloudinaryUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">All uploaded undertakings</h2>
        <DataTable
          columns={columns}
          data={undertakings}
          emptyMessage={loading ? 'Loading undertakings...' : 'No undertaking files uploaded'}
          rowKey={(row) => row._id}
        />
      </section>
    </div>
  )
}
