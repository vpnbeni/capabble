import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { masterSchoolDirectoryApi } from '../services/platformApi'
import type { MasterSchoolDirectory } from '../types/platform'

const toWebsiteHref = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

const DEFAULT_GOVT_SCHOOL_KEYWORDS = [
  'Govt.',
  'Government',
  'PM SHRI',
  'GMSSSS',
  'G.M.S.S.S.S',
]

type SortKey = 'srNo' | 'affiliationNo' | 'schoolCode' | 'status' | 'name' | 'headName' | 'website'

const getSchoolType = (school: MasterSchoolDirectory, govtKeywords: string[]) => {
  if (school.manualType === 'Govt.' || school.manualType === 'Private') {
    return school.manualType
  }

  const schoolName = school.name || ''
  const normalized = String(schoolName || '').toLowerCase()
  return govtKeywords.some((keyword) => normalized.includes(String(keyword || '').toLowerCase())) ? 'Govt.' : 'Private'
}

const compareSchoolValues = (left: string | number, right: string | number) => {
  const leftText = String(left || '').trim()
  const rightText = String(right || '').trim()
  const leftNumber = Number(leftText)
  const rightNumber = Number(rightText)
  const leftIsNumber = leftText !== '' && !Number.isNaN(leftNumber)
  const rightIsNumber = rightText !== '' && !Number.isNaN(rightNumber)

  if (leftIsNumber && rightIsNumber) {
    return leftNumber - rightNumber
  }

  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' })
}

export function SchoolDirectoryPage() {
  const [schools, setSchools] = useState<MasterSchoolDirectory[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [districtFilter, setDistrictFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [govtKeywords, setGovtKeywords] = useState<string[]>(DEFAULT_GOVT_SCHOOL_KEYWORDS)
  const [keywordInput, setKeywordInput] = useState(DEFAULT_GOVT_SCHOOL_KEYWORDS.join(', '))
  const [savingKeywords, setSavingKeywords] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('srNo')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [updatingTypeId, setUpdatingTypeId] = useState('')
  const csvUploadInputRef = useRef<HTMLInputElement | null>(null)

  const loadSchools = async () => {
    setLoading(true)
    setError('')

    try {
      const items = await masterSchoolDirectoryApi.list()
      setSchools(items)
      setSelectedIds((prev) => prev.filter((id) => items.some((item) => item._id === id)))
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load school directory')
      } else {
        setError('Failed to load school directory')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchools().catch(() => undefined)
  }, [])

  useEffect(() => {
    masterSchoolDirectoryApi
      .getTypeSettings()
      .then((data) => {
        const nextKeywords = data.govtKeywords?.length ? data.govtKeywords : DEFAULT_GOVT_SCHOOL_KEYWORDS
        setGovtKeywords(nextKeywords)
        setKeywordInput(nextKeywords.join(', '))
      })
      .catch(() => undefined)
  }, [])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await masterSchoolDirectoryApi.upload(formData)
      const total = response.data?.total || 0
      const inserted = response.data?.inserted || 0
      const updated = response.data?.updated || 0
      const source = response.data?.source === 'csv' ? 'CSV' : 'PDF'
      setSuccess(`School directory ${source} uploaded. Parsed ${total} rows, inserted ${inserted}, updated ${updated}.`)
      window.setTimeout(() => setSuccess(''), 5000)
      await loadSchools()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to upload school directory file')
      } else {
        setError('Failed to upload school directory file')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadTemplate = () => {
    const csvHeaders = [
      'Sr No',
      'Aff. No.',
      'Sch. Code',
      'State',
      'District',
      'Status',
      'Name',
      'Head Name',
      'Address Details',
      'Website',
    ]
    const csvContent = `${csvHeaders.join(',')}\n`
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'school-directory-template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleCsvUploadClick = () => {
    csvUploadInputRef.current?.click()
  }

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    await handleUpload(file)
    event.target.value = ''
  }

  const handleSaveKeywords = async () => {
    const nextKeywords = Array.from(new Set(
      keywordInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    ))

    if (nextKeywords.length === 0) {
      setError('Enter at least one keyword for Govt. school detection')
      return
    }

    setSavingKeywords(true)
    setError('')

    try {
      const data = await masterSchoolDirectoryApi.updateTypeSettings(nextKeywords)
      setGovtKeywords(data.govtKeywords)
      setKeywordInput(data.govtKeywords.join(', '))
      setSuccess('School type keywords updated successfully.')
      window.setTimeout(() => setSuccess(''), 5000)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to update school type keywords')
      } else {
        setError('Failed to update school type keywords')
      }
    } finally {
      setSavingKeywords(false)
    }
  }

  const handleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection('asc')
  }

  const handleTypeToggle = async (school: MasterSchoolDirectory) => {
    const nextType = getSchoolType(school, govtKeywords) === 'Govt.' ? 'Private' : 'Govt.'

    setUpdatingTypeId(school._id)
    setError('')

    try {
      const updatedSchool = await masterSchoolDirectoryApi.updateSchoolType(school._id, nextType)
      setSchools((prev) => prev.map((item) => (item._id === updatedSchool._id ? updatedSchool : item)))
      setSuccess(`School type updated to ${nextType}.`)
      window.setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to update school type')
      } else {
        setError('Failed to update school type')
      }
    } finally {
      setUpdatingTypeId('')
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id]
    ))
  }

  const toggleSelectAll = () => {
    if (filteredSchools.length === 0) {
      return
    }

    const filteredIds = filteredSchools.map((school) => school._id)
    const allFilteredSelected = filteredIds.every((id) => selectedIds.includes(id))

    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
      return
    }

    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one school record to delete')
      return
    }

    const confirmed = window.confirm(`Hard delete ${selectedIds.length} selected school record(s)? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    setDeleting(true)
    setError('')

    try {
      const response = await masterSchoolDirectoryApi.deleteMany(selectedIds)
      const deletedCount = response.deletedCount || 0
      setSuccess(`Deleted ${deletedCount} school record(s) permanently.`)
      window.setTimeout(() => setSuccess(''), 5000)
      setSelectedIds([])
      await loadSchools()
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to delete selected school records')
      } else {
        setError('Failed to delete selected school records')
      }
    } finally {
      setDeleting(false)
    }
  }

  const stateOptions = useMemo(() => (
    Array.from(new Set(schools.map((school) => school.state).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [schools])

  const districtOptions = useMemo(() => {
    const scopedSchools = stateFilter === 'all'
      ? schools
      : schools.filter((school) => school.state === stateFilter)

    return Array.from(new Set(scopedSchools.map((school) => school.district).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [schools, stateFilter])

  const statusOptions = useMemo(() => {
    const scopedSchools = schools.filter((school) => {
      if (stateFilter !== 'all' && school.state !== stateFilter) return false
      if (districtFilter !== 'all' && school.district !== districtFilter) return false
      return true
    })

    return Array.from(new Set(scopedSchools.map((school) => school.status).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [schools, stateFilter, districtFilter])

  const typeOptions = useMemo(() => ['Govt.', 'Private'], [])

  const filteredSchools = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = schools.filter((school) => {
      if (stateFilter !== 'all' && school.state !== stateFilter) return false
      if (districtFilter !== 'all' && school.district !== districtFilter) return false
      if (statusFilter !== 'all' && school.status !== statusFilter) return false
      if (typeFilter !== 'all' && getSchoolType(school, govtKeywords) !== typeFilter) return false

      if (!query) return true

      return [
        school.schoolCode,
        school.affiliationNo,
        school.name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    return [...filtered].sort((left, right) => {
      const leftValue = left[sortKey] || ''
      const rightValue = right[sortKey] || ''
      const result = compareSchoolValues(leftValue, rightValue)
      return sortDirection === 'asc' ? result : -result
    })
  }, [schools, search, stateFilter, districtFilter, statusFilter, typeFilter, govtKeywords, sortKey, sortDirection])

  const stats = useMemo(() => {
    const districts = new Set<string>()
    const statuses = new Set<string>()

    filteredSchools.forEach((school) => {
      if (school.district) {
        districts.add(school.district.toLowerCase())
      }
      if (school.status) {
        statuses.add(school.status.toLowerCase())
      }
    })

    return [
      { label: 'Schools Listed', value: filteredSchools.length },
      { label: 'Districts Covered', value: districts.size },
      { label: 'Statuses Found', value: statuses.size },
    ]
  }, [filteredSchools])

  const renderSortButton = (label: string, key: SortKey) => {
    const isActive = sortKey === key
    const directionLabel = isActive ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''

    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          color: isActive ? 'var(--accent)' : 'inherit',
          font: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
          cursor: 'pointer',
        }}
        aria-label={`Sort by ${label}${isActive ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {label}
        {directionLabel}
      </button>
    )
  }

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div>
        <h1 className="section-title" style={{ marginBottom: 6 }}>School directory</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Upload a filled school-directory CSV and review the records in one place.
        </p>
      </div>

      <div className="grid grid-3">
        {stats.map((item) => (
          <section key={item.label} className="card stat-card">
            <span className="stat-label">{item.label}</span>
            <span className="stat-value">{item.value}</span>
          </section>
        ))}
      </div>

      <section className="card" style={{ display: 'grid', gap: 18 }}>
        <div>
          <h2 className="card-title" style={{ marginBottom: 8 }}>Directory records</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Download the CSV template, fill in school details, and upload it here. Schools will be added or updated by school code.
          </p>
        </div>

        {error && <div className="error-text" style={{ marginBottom: 0 }}>{error}</div>}
        {success && <div className="success-text" style={{ marginBottom: 0 }}>{success}</div>}

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary"
              onClick={handleDownloadTemplate}
              disabled={loading || uploading || deleting}
            >
              Template
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleCsvUploadClick}
              disabled={loading || uploading || deleting}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Accepted file: `.csv`
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              aria-label="Government school keywords"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="Govt keywords: Govt., Government, PM SHRI..."
              disabled={loading || uploading || deleting || savingKeywords}
              style={{ flex: '1 1 320px', minWidth: 0 }}
            />
            <button
              type="button"
              className="secondary"
              onClick={handleSaveKeywords}
              disabled={loading || uploading || deleting || savingKeywords}
            >
              {savingKeywords ? 'Saving...' : 'Save Type Keywords'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select false entries and hard delete them if needed.'}
          </div>

          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'center' }}>
            <input
              type="text"
              aria-label="Search schools"
              placeholder="Search school code, aff. no., name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={loading || uploading || deleting}
              style={{ minWidth: 0, gridColumn: 'span 2' }}
            />
            <select
              aria-label="State"
              value={stateFilter}
              onChange={(event) => {
                setStateFilter(event.target.value)
                setDistrictFilter('all')
                setStatusFilter('all')
                setTypeFilter('all')
              }}
              disabled={loading}
            >
              <option value="all">All States</option>
              {stateOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              aria-label="District"
              value={districtFilter}
              onChange={(event) => {
                setDistrictFilter(event.target.value)
                setStatusFilter('all')
                setTypeFilter('all')
              }}
              disabled={loading}
            >
              <option value="all">All Districts</option>
              {districtOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              disabled={loading}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              aria-label="School type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              disabled={loading}
              >
                <option value="all">All Types</option>
                {typeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
          </div>
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ghost"
                onClick={handleDeleteSelected}
                disabled={deleting || loading || uploading}
                style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
              >
                {deleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          )}
        </div>

        <input
          ref={csvUploadInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvFileChange}
          style={{ display: 'none' }}
        />

        <div
          style={{
            overflow: 'auto',
            maxHeight: 640,
          }}
        >
          <table className="data-table" style={{ minWidth: 1710 }}>
            <thead>
              <tr>
                <th style={{ width: 56, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>
                  <input
                    type="checkbox"
                    checked={filteredSchools.length > 0 && filteredSchools.every((school) => selectedIds.includes(school._id))}
                    onChange={toggleSelectAll}
                    aria-label="Select all schools"
                    disabled={loading || filteredSchools.length === 0}
                  />
                </th>
                <th style={{ width: 80, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Sr No', 'srNo')}</th>
                <th style={{ width: 120, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Aff. No.', 'affiliationNo')}</th>
                <th style={{ width: 120, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Sch. Code', 'schoolCode')}</th>
                <th style={{ width: 140, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Status', 'status')}</th>
                <th style={{ minWidth: 240, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Name', 'name')}</th>
                <th style={{ minWidth: 180, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Head Name', 'headName')}</th>
                <th style={{ minWidth: 220, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>{renderSortButton('Website', 'website')}</th>
                <th style={{ width: 110, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>Type</th>
                <th style={{ width: 130, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>State</th>
                <th style={{ width: 150, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>District</th>
                <th style={{ minWidth: 320, position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>Address Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12}>
                    <div className="empty-state">Loading school directory...</div>
                  </td>
                </tr>
              )}

              {!loading && filteredSchools.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <div className="empty-state">
                      {schools.length === 0 ? 'No schools imported yet.' : 'No schools match the current filters.'}
                    </div>
                  </td>
                </tr>
              )}

              {!loading && filteredSchools.map((school) => (
                <tr key={school._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(school._id)}
                      onChange={() => toggleSelection(school._id)}
                      aria-label={`Select ${school.schoolCode || school.name || school._id}`}
                    />
                  </td>
                  <td>{school.srNo || '-'}</td>
                  <td>{school.affiliationNo || '-'}</td>
                  <td>{school.schoolCode || '-'}</td>
                  <td>{school.status || '-'}</td>
                  <td>{school.name || '-'}</td>
                  <td>{school.headName || '-'}</td>
                  <td>
                    {school.website ? (
                      <a
                        href={toWebsiteHref(school.website)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                      >
                        {school.website}
                      </a>
                    ) : '-'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleTypeToggle(school)}
                      disabled={loading || uploading || deleting || updatingTypeId === school._id}
                      style={{
                        minWidth: 88,
                        padding: '6px 10px',
                        color: getSchoolType(school, govtKeywords) === 'Govt.' ? 'var(--success)' : 'var(--text-primary)',
                        borderColor: getSchoolType(school, govtKeywords) === 'Govt.'
                          ? 'var(--success-border)'
                          : 'var(--border-control)',
                      }}
                    >
                      {updatingTypeId === school._id ? 'Saving...' : getSchoolType(school, govtKeywords)}
                    </button>
                  </td>
                  <td>{school.state || '-'}</td>
                  <td>{school.district || '-'}</td>
                  <td>{school.addressDetails || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
