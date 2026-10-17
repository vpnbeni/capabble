import { useEffect, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { FileUpload } from '../components/FileUpload'
import { masterDatesheetApi, rolloutApi } from '../services/platformApi'
import type { MasterCBSEDatesheet } from '../types/platform'

const formatDate = (date?: string) => (date ? new Date(date).toLocaleDateString() : '-')

export function MasterDatesheetPage() {
  const [datesheets, setDatesheets] = useState<MasterCBSEDatesheet[]>([])
  const [selectedDatesheetId, setSelectedDatesheetId] = useState<string | null>(null)
  const [selectedDatesheet, setSelectedDatesheet] = useState<MasterCBSEDatesheet | null>(null)
  const [academicYear, setAcademicYear] = useState('')
  const [title, setTitle] = useState('CBSE Full Datesheet')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rollingOut, setRollingOut] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const setFlashSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 5000)
  }

  const loadDatesheets = async () => {
    setLoading(true)
    setError('')

    try {
      const items = await masterDatesheetApi.list()
      setDatesheets(items)

      if (items.length > 0 && !selectedDatesheetId) {
        const activeItem = items.find((item) => item.isActive) || items[0]
        setSelectedDatesheetId(activeItem._id)
      }
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load master datesheets')
      } else {
        setError('Failed to load master datesheets')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDatesheets().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selectedDatesheetId) {
      setSelectedDatesheet(null)
      return
    }

    masterDatesheetApi
      .getById(selectedDatesheetId)
      .then((datesheet) => {
        setSelectedDatesheet(datesheet)
      })
      .catch((err: unknown) => {
        if (typeof err === 'object' && err && 'response' in err) {
          const response = (err as { response?: { data?: { message?: string } } }).response
          setError(response?.data?.message || 'Failed to load datesheet details')
        } else {
          setError('Failed to load datesheet details')
        }
      })
  }, [selectedDatesheetId])

  const handleUpload = async (file: File) => {
    if (!academicYear.trim()) {
      setError('Academic year is required for datesheet upload')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('academicYear', academicYear.trim())
      formData.append('title', title.trim() || 'CBSE Full Datesheet')

      const response = await masterDatesheetApi.upload(formData)
      const totalEntries = response.data?.datesheet?.totalEntries || 0
      setFlashSuccess(`Datesheet uploaded with ${totalEntries} entries`)
      await loadDatesheets()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to upload datesheet')
      } else {
        setError('Failed to upload datesheet')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setError('')

    try {
      await masterDatesheetApi.delete(id)
      if (selectedDatesheetId === id) {
        setSelectedDatesheetId(null)
      }
      setFlashSuccess('Datesheet deleted')
      await loadDatesheets()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to delete datesheet')
      } else {
        setError('Failed to delete datesheet')
      }
    }
  }

  const handleRollout = async () => {
    const activeDatesheet = datesheets.find((item) => item.isActive)
      || (selectedDatesheet ? selectedDatesheet : datesheets[0])

    if (!activeDatesheet) {
      setError('Upload a datesheet before rollout')
      return
    }

    setRollingOut(true)
    setError('')

    try {
      await rolloutApi.initiate({
        module: 'datesheet',
        masterDataId: activeDatesheet._id,
        versionLabel: `Datesheet ${activeDatesheet.academicYear}`,
      })
      setFlashSuccess('Datesheet rollout initiated')
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to initiate datesheet rollout')
      } else {
        setError('Failed to initiate datesheet rollout')
      }
    } finally {
      setRollingOut(false)
    }
  }

  const columns: DataTableColumn<MasterCBSEDatesheet>[] = [
    { header: 'Title', accessor: 'title' },
    { header: 'Academic Year', accessor: 'academicYear' },
    { header: 'Entries', accessor: (row) => row.totalEntries },
    { header: 'Date Range', accessor: (row) => `${formatDate(row.dateRange?.startDate)} - ${formatDate(row.dateRange?.endDate)}` },
    { header: 'Status', accessor: (row) => (row.isActive ? 'Active' : 'Archived') },
    {
      header: 'Actions',
      accessor: (row) => (
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
      ),
    },
  ]

  const stats = selectedDatesheet?.statistics

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Master CBSE datesheet</h1>
        <p className="page-subtitle">Upload one datesheet PDF and roll it out to all active tenants.</p>
      </header>

      <section className="card">
        <h2 className="card-title">Upload datesheet</h2>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Academic Year</label>
            <input
              placeholder="2025-26"
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Title</label>
            <input
              placeholder="CBSE Full Datesheet"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </div>

        <FileUpload
          accept=".pdf"
          label="Upload Datesheet PDF"
          onUpload={handleUpload}
          disabled={uploading || loading}
        />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={handleRollout} disabled={rollingOut || datesheets.length === 0}>
            {rollingOut ? 'Starting rollout...' : 'Rollout Datesheet'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Uploaded datesheets</h2>
        <DataTable
          columns={columns}
          data={datesheets}
          emptyMessage={loading ? 'Loading datesheets...' : 'No datesheets uploaded yet'}
          rowKey={(row) => row._id}
          onRowClick={(row) => setSelectedDatesheetId(row._id)}
        />
      </section>

      <section className="card">
        <h2 className="card-title">Datesheet detail</h2>

        {!selectedDatesheet && <div className="empty-state">Select a datesheet row to view all entries.</div>}

        {selectedDatesheet && (
          <>
            {stats && (
              <div className="grid grid-5" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="stat-value">{stats.total}</div>
                  <div className="stat-label">Total Entries</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.class10th}</div>
                  <div className="stat-label">Class 10th</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.class12th}</div>
                  <div className="stat-label">Class 12th</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.uniqueDates}</div>
                  <div className="stat-label">Unique Dates</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.uniqueSubjects}</div>
                  <div className="stat-label">Unique Subjects</div>
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Class</th>
                    <th>Duration</th>
                    <th>Time</th>
                    <th>Answer Sheet</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDatesheet.entries.map((entry, index) => (
                    <tr key={`${entry.subject.code}-${entry.examDate}-${index}`}>
                      <td>{formatDate(entry.examDate)}</td>
                      <td>{entry.dayName}</td>
                      <td>{entry.subject.code}</td>
                      <td>{entry.subject.name}</td>
                      <td>{entry.subject.class}</td>
                      <td>{entry.subject.duration} hrs</td>
                      <td>{entry.timeSlot.start} - {entry.timeSlot.end}</td>
                      <td>{entry.answerSheet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
