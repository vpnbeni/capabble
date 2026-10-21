import { useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { Sheet } from '../components/Dialog'
import { StatusBadge } from '../components/StatusBadge'
import { Banner, DetailList, Select, Tabs } from '../components/kit'
import { ChevronLeft, ChevronRight, Search } from '../components/icons'
import { errorMessage } from '../services/billingApi'
import { demoRequestApi, type DemoRequest, type DemoRequestStatus } from '../services/demoRequestApi'

const STATUSES: Array<{ value: DemoRequestStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'closed', label: 'Closed' },
]

const PAGE_SIZE = 25

const formatDateTime = (value?: string | null) => (value
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  : '—')

const place = (row: DemoRequest) => [row.city, row.state].filter(Boolean).join(', ')

/** Leads from the "Request a demo" page on capabble.cloud. */
export function DemoRequestsPage() {
  const [tab, setTab] = useState<'all' | DemoRequestStatus>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<DemoRequest[]>([])
  const [meta, setMeta] = useState({ total: 0, pages: 1 })
  const [counts, setCounts] = useState<Partial<Record<DemoRequestStatus, number>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState<DemoRequest | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      demoRequestApi.list({ status: tab === 'all' ? undefined : tab, search, page, limit: PAGE_SIZE })
        .then((res) => {
          setRows(res.items)
          setMeta({ total: res.total, pages: res.pages })
          setCounts(res.counts)
          setError('')
        })
        .catch((err) => setError(errorMessage(err, "Couldn't load demo requests.")))
        .finally(() => setLoading(false))
    }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [tab, search, page, reloadKey])

  const allCount = STATUSES.reduce((sum, s) => sum + (counts[s.value] || 0), 0)

  const saved = (lead: DemoRequest) => {
    setOpen(null)
    setNotice(`Saved ${lead.institution}`)
    window.setTimeout(() => setNotice(''), 4000)
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Demo requests</h1>
        <p className="page-subtitle">People who asked for a demo on capabble.cloud. Open one to change its status or add notes.</p>
      </header>

      {notice ? <Banner tone="success" title={notice} onDismiss={() => setNotice('')} /> : null}

      <section className="card admin-list-card">
        <div style={{ padding: '0 var(--space-5)' }}>
          <Tabs
            label="Status"
            value={tab}
            onChange={(id) => { setTab(id as typeof tab); setPage(1) }}
            items={[
              { id: 'all', label: 'All', count: allCount },
              ...STATUSES.map((s) => ({ id: s.value, label: s.label, count: counts[s.value] || 0 })),
            ]}
          />
        </div>
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Find a request"
              placeholder="Find by name, school, email, phone or city"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
          </div>
          <span className="admin-count">{loading ? 'Loading…' : `${meta.total} ${meta.total === 1 ? 'request' : 'requests'}`}</span>
        </div>
        {error ? <div className="error-text" role="alert">{error}</div> : null}
        <DataTable
          data={rows}
          rowKey={(row) => row._id}
          onRowClick={setOpen}
          emptyMessage={search
            ? `No request matches "${search}".`
            : tab === 'all' ? 'No demo requests yet. They appear here when someone sends the form on capabble.cloud/request-demo.' : 'No requests with this status.'}
          columns={[
            {
              header: 'Institution',
              accessor: (row) => (
                <span className="cb-entity">
                  <span className="cb-entity__primary">{row.institution}</span>
                  <span className="cb-entity__secondary">{place(row) || '—'}</span>
                </span>
              ),
            },
            {
              header: 'Contact',
              accessor: (row) => (
                <span className="cb-entity">
                  <span className="cb-entity__primary">{row.name}{row.role ? ` · ${row.role}` : ''}</span>
                  <span className="cb-entity__secondary">{row.email} · {row.phone}</span>
                </span>
              ),
            },
            { header: 'Students', accessor: (row) => row.studentCount || '—' },
            { header: 'Received', accessor: (row) => formatDateTime(row.createdAt) },
            { header: 'Status', accessor: (row) => <StatusBadge status={row.status} size="sm" /> },
          ]}
        />
        {meta.pages > 1 ? (
          <div className="cb-table-foot">
            <span>Page {page} of {meta.pages}</span>
            <div className="admin-table__pager">
              <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></button>
              <button type="button" className="icon-button" aria-label="Next page" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}><ChevronRight /></button>
            </div>
          </div>
        ) : null}
      </section>

      {open ? <DemoRequestSheet lead={open} onClose={() => setOpen(null)} onSaved={saved} /> : null}
    </div>
  )
}

function DemoRequestSheet({ lead, onClose, onSaved }: {
  lead: DemoRequest
  onClose: () => void
  onSaved: (lead: DemoRequest) => void
}) {
  const [status, setStatus] = useState<DemoRequestStatus>(lead.status)
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changed = status !== lead.status || notes !== (lead.notes || '')

  const save = async () => {
    if (!changed) return onClose()
    setSaving(true)
    try {
      onSaved(await demoRequestApi.update(lead._id, { status, notes }))
    } catch (err) {
      setError(errorMessage(err, "Couldn't save this request."))
      setSaving(false)
    }
  }

  return (
    <Sheet
      isOpen
      onClose={onClose}
      size="lg"
      title={lead.institution}
      description={`Received ${formatDateTime(lead.createdAt)}`}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button type="submit" className="primary" disabled={saving || !changed}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="cb-form-section">
        <DetailList
          items={[
            { label: 'Name', value: lead.name },
            { label: 'Role', value: lead.role },
            { label: 'Email', value: <a href={`mailto:${lead.email}`}>{lead.email}</a> },
            { label: 'Phone', value: <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a> },
            { label: 'City / state', value: place(lead) },
            { label: 'Students', value: lead.studentCount },
            { label: 'Preferred time', value: lead.preferredTime },
            { label: 'Modules', value: lead.modules.join(', '), wide: true },
            { label: 'Message', value: lead.message ? <span style={{ whiteSpace: 'pre-wrap' }}>{lead.message}</span> : '', wide: true },
          ]}
        />
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Follow-up</h3>
        <Select
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as DemoRequestStatus)}
          options={STATUSES}
          hint={lead.statusUpdatedAt ? `Last changed ${formatDateTime(lead.statusUpdatedAt)}${lead.statusUpdatedBy ? ` by ${lead.statusUpdatedBy}` : ''}` : undefined}
        />
        <div className="cb-field">
          <label className="cb-field__label" htmlFor="demo-request-notes">Notes</label>
          <textarea
            id="demo-request-notes"
            rows={4}
            value={notes}
            maxLength={4000}
            placeholder="Calls, the demo date, what they asked about"
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="cb-field__hint">Only Capabble staff see these.</div>
        </div>
      </div>
    </Sheet>
  )
}
