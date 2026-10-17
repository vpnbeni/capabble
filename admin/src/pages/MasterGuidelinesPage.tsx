import { useEffect, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { FileUpload } from '../components/FileUpload'
import { masterGuidelinesApi, rolloutApi } from '../services/platformApi'
import type { MasterGuideline } from '../types/platform'

const formatDate = (date?: string) => (date ? new Date(date).toLocaleString() : '-')

export function MasterGuidelinesPage() {
  const [guidelines, setGuidelines] = useState<MasterGuideline[]>([])
  const [currentGuideline, setCurrentGuideline] = useState<MasterGuideline | null>(null)
  const [selectedGuideline, setSelectedGuideline] = useState<MasterGuideline | null>(null)
  const [title, setTitle] = useState('Centre Examination Guidelines')
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

  const loadGuidelines = async () => {
    setLoading(true)
    setError('')

    try {
      const [items, current] = await Promise.all([
        masterGuidelinesApi.list(),
        masterGuidelinesApi.current(),
      ])

      setGuidelines(items)
      setCurrentGuideline(current)

      if (current) {
        const detailed = await masterGuidelinesApi.getById(current._id)
        setSelectedGuideline(detailed)
      } else {
        setSelectedGuideline(null)
      }
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load guidelines')
      } else {
        setError('Failed to load guidelines')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGuidelines().catch(() => undefined)
  }, [])

  const handleUpload = async (file: File) => {
    const MAX_GUIDELINES_SIZE_BYTES = 200 * 1024 * 1024
    if (!academicYear.trim()) {
      setError('Academic year is required for guideline upload')
      return
    }
    if (file.size > MAX_GUIDELINES_SIZE_BYTES) {
      setError('Selected file is too large. Maximum allowed size is 200MB.')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim() || 'Centre Examination Guidelines')
      formData.append('academicYear', academicYear.trim())

      await masterGuidelinesApi.upload(formData)
      setFlashSuccess('Guidelines uploaded. Shared Cloudinary file has been updated for all tenants.')
      await loadGuidelines()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } }; message?: string }).response
        const fallbackMessage = (err as { message?: string }).message || 'Failed to upload guidelines'
        setError(response?.data?.message || fallbackMessage)
      } else {
        setError((err as { message?: string })?.message || 'Failed to upload guidelines')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleOpenGuideline = async (guidelineId: string) => {
    setError('')
    try {
      const details = await masterGuidelinesApi.getById(guidelineId)
      setSelectedGuideline(details)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load guideline details')
      } else {
        setError('Failed to load guideline details')
      }
    }
  }

  const handleDelete = async (guidelineId: string) => {
    setError('')

    try {
      await masterGuidelinesApi.delete(guidelineId)
      if (selectedGuideline?._id === guidelineId) {
        setSelectedGuideline(null)
      }
      setFlashSuccess('Guideline deleted')
      await loadGuidelines()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to delete guideline')
      } else {
        setError('Failed to delete guideline')
      }
    }
  }

  const handleRollout = async () => {
    const source = currentGuideline || selectedGuideline
    if (!source) {
      setError('Upload a guideline before rollout')
      return
    }

    setRollingOut(true)
    setError('')

    try {
      await rolloutApi.initiate({
        module: 'guidelines',
        masterDataId: source._id,
        versionLabel: `Guidelines ${source.academicYear}`,
      })
      setFlashSuccess('Guidelines metadata rollout initiated')
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

  const columns: DataTableColumn<MasterGuideline>[] = [
    { header: 'Title', accessor: 'title' },
    { header: 'Academic Year', accessor: 'academicYear' },
    { header: 'Pages', accessor: (row) => row.metadata?.pages || '-' },
    { header: 'Uploaded At', accessor: (row) => formatDate(row.createdAt) },
    { header: 'Status', accessor: (row) => (row.isActive ? 'Active' : 'Archived') },
    {
      header: 'Actions',
      accessor: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              event.stopPropagation()
              handleOpenGuideline(row._id).catch(() => undefined)
            }}
          >
            View
          </button>
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
        <h1 className="section-title">Master centre guidelines</h1>
        <p className="page-subtitle">Uploading replaces the shared guidelines PDF for all tenants.</p>
      </header>

      <section className="card">
        <h2 className="card-title">Upload guidelines</h2>

        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Rollout only syncs guideline metadata records in tenant databases.
        </p>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Guideline Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Centre Examination Guidelines"
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
          label="Upload Guidelines PDF"
          onUpload={handleUpload}
          disabled={uploading || loading}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={handleRollout} disabled={rollingOut || !currentGuideline}>
            {rollingOut ? 'Starting rollout...' : 'Rollout Guidelines'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Current guideline</h2>

        {!currentGuideline && <div className="empty-state">No active guideline uploaded yet.</div>}

        {currentGuideline && (
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Title</div>
              <div>{currentGuideline.title}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Academic Year</div>
              <div>{currentGuideline.academicYear}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Pages</div>
              <div>{currentGuideline.metadata?.pages || '-'}</div>
            </div>
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Uploaded</div>
              <div>{formatDate(currentGuideline.createdAt)}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="input-label" style={{ marginBottom: 6 }}>Shared Cloudinary URL</div>
              <a href={currentGuideline.cloudinaryUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">All uploaded guidelines</h2>
        <DataTable
          columns={columns}
          data={guidelines}
          emptyMessage={loading ? 'Loading guidelines...' : 'No guidelines uploaded'}
          rowKey={(row) => row._id}
          onRowClick={(row) => handleOpenGuideline(row._id).catch(() => undefined)}
        />
      </section>

      <section className="card">
        <h2 className="card-title">Parsed structure preview</h2>

        {!selectedGuideline && <div className="empty-state">Select a guideline to preview parsed structure.</div>}

        {selectedGuideline && (
          <div className="grid grid-2" style={{ gap: 24 }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Chapters</h3>
              {selectedGuideline.parsedStructure?.chapters?.length ? (
                <ul className="simple-list">
                  {selectedGuideline.parsedStructure.chapters.map((chapter, index) => (
                    <li key={`${chapter.number}-${index}`}>
                      <strong>{chapter.number}.</strong> {chapter.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">No chapter data parsed.</div>
              )}
            </div>

            <div>
              <h3 style={{ marginTop: 0 }}>Appendices</h3>
              {selectedGuideline.parsedStructure?.appendices?.length ? (
                <ul className="simple-list">
                  {selectedGuideline.parsedStructure.appendices.map((appendix, index) => (
                    <li key={`${appendix.letter}-${index}`}>
                      <strong>{appendix.letter}</strong> - {appendix.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">No appendix data parsed.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
