import { useCallback, useEffect, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { FileUpload } from '../components/FileUpload'
import { StatusBadge } from '../components/StatusBadge'
import { Banner, DetailList, TextField } from '../components/kit'
import { workspaceDataApi } from '../services/platformApi'
import type {
  BackupRun,
  ClosingWorkspace,
  PurgePlan,
  WorkspaceArchive,
  WorkspaceDataOverview,
  WorkspaceImport,
  WorkspacePurge,
} from '../types/platform'
import './workspaceData.css'

/* ── Formatting ────────────────────────────────────────────────────────── */

const formatDateTime = (value?: string | null) => (value
  ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—')

const formatDate = (value?: string | null) => (value
  ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—')

const formatTime = (value?: string | null) => (value
  ? new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  : '')

const formatBytes = (bytes?: number) => {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

const formatCount = (value: unknown) => (typeof value === 'number' ? value.toLocaleString('en-IN') : '—')

const errorMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) return response.data.message
  }
  return fallback
}

/** One line per key, nested values as compact JSON: the daily job's result read as plain text. */
const describeResult = (result: Record<string, unknown>) => Object.entries(result)
  .map(([key, value]) => `${key}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`)
  .join('\n')

const AREAS = [
  { key: 'backups', label: 'Nightly backups' },
  { key: 'archives', label: 'Workspace archives' },
  { key: 'imports', label: 'Uploaded imports' },
]

/* ── Page ──────────────────────────────────────────────────────────────── */

export function WorkspaceDataPage() {
  const [overview, setOverview] = useState<WorkspaceDataOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [backupStarting, setBackupStarting] = useState(false)
  const [jobRunning, setJobRunning] = useState(false)
  const [jobResult, setJobResult] = useState<string>('')
  const [importRecord, setImportRecord] = useState<WorkspaceImport | null>(null)

  const flash = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 6000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await workspaceDataApi.overview())
      setError('')
    } catch (err) {
      setError(errorMessage(err, 'Could not load workspace data. Refresh to try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  const runBackup = async () => {
    setBackupStarting(true)
    setError('')
    try {
      flash(await workspaceDataApi.runBackup())
    } catch (err) {
      setError(errorMessage(err, 'Could not start the backup.'))
    } finally {
      setBackupStarting(false)
    }
  }

  const runDailyJob = async () => {
    setJobRunning(true)
    setError('')
    try {
      const result = await workspaceDataApi.runLifecycle()
      setJobResult(describeResult(result || {}))
      await load()
    } catch (err) {
      setError(errorMessage(err, 'The daily job did not finish.'))
    } finally {
      setJobRunning(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-head-row" style={{ marginBottom: 0 }}>
        <div className="page-header">
          <h1 className="section-title">Workspace data</h1>
          <p className="page-subtitle">Backups, closing workspaces, deletion approvals and re-imports.</p>
        </div>
        <div className="wd-actions">
          <button type="button" className="secondary" onClick={() => load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="secondary" onClick={runDailyJob} disabled={jobRunning}>
            {jobRunning ? 'Running daily job…' : 'Run daily job now'}
          </button>
        </div>
      </header>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}

      {jobResult && (
        <section className="card">
          <div className="wd-card-head">
            <div>
              <h2 className="card-title">Daily job result</h2>
              <p>Closures, deletion notices and deletion requests checked just now.</p>
            </div>
            <button type="button" className="ghost" onClick={() => setJobResult('')}>Hide</button>
          </div>
          <pre className="wd-result">{jobResult || 'Nothing to do.'}</pre>
        </section>
      )}

      {!overview && loading && <section className="card"><div className="empty-state">Loading workspace data…</div></section>}

      {overview && (
        <>
          <BackupsCard overview={overview} starting={backupStarting} onRun={runBackup} />
          <ClosingCard
            closing={overview.closing}
            storageReady={overview.storage.configured}
            onError={setError}
            onFlash={flash}
            onPlanned={(record) => {
              setImportRecord(record)
              load().catch(() => undefined)
              document.getElementById('workspace-reimport')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          />
          <PurgesCard purges={overview.purges} onChanged={load} onFlash={flash} />
          <ImportCard
            imports={overview.imports}
            storageReady={overview.storage.configured}
            record={importRecord}
            setRecord={setImportRecord}
            onChanged={load}
          />
        </>
      )}
    </div>
  )
}

/* ── Backups ───────────────────────────────────────────────────────────── */

function BackupsCard({ overview, starting, onRun }: { overview: WorkspaceDataOverview; starting: boolean; onRun: () => void }) {
  const { storage, jobs, runs } = overview
  const rules = storage.retention || []
  const ruleFor = (area: string) => rules.find((rule) => rule.prefix === `${storage.prefix}/${area}/` && rule.status !== 'Disabled')
  const backupsRule = ruleFor('backups')
  const expectedBackupDays = storage.expectedRetention?.backups ?? 30
  const otherMismatches = AREAS.slice(1).filter((area) => {
    const rule = ruleFor(area.key)
    return !rule || rule.days !== storage.expectedRetention?.[area.key]
  })
  const lastNightly = jobs.leases.find((lease) => lease._id === 'backup-nightly')
  const lastLifecycle = jobs.leases.find((lease) => lease._id === 'workspace-lifecycle')

  const columns: DataTableColumn<BackupRun>[] = [
    {
      header: 'Run',
      accessor: (run) => (
        <span>
          <code>{run.runId}</code>
          <span className="wd-cell-sub">{run.trigger === 'manual' ? 'Started by an admin' : 'Nightly'}</span>
        </span>
      ),
    },
    { header: 'Started', accessor: (run) => formatDateTime(run.startedAt) },
    { header: 'Status', accessor: (run) => <StatusBadge status={run.status} size="sm" /> },
    {
      header: 'Files',
      className: 'wd-num',
      accessor: (run) => `${run.files.filter((file) => file.ok).length} of ${run.files.length}`,
    },
    {
      header: 'Size',
      className: 'wd-num',
      accessor: (run) => formatBytes(run.files.reduce((sum, file) => sum + (file.bytes || 0), 0)),
    },
    {
      header: 'Failures',
      accessor: (run) => {
        const failed = run.files.filter((file) => !file.ok)
        if (!failed.length && !run.error) return '—'
        return (
          <ul className="wd-fail">
            {run.error && <li>{run.error}</li>}
            {failed.map((file, index) => (
              <li key={`${file.dbName || file.label}-${index}`}>{file.label || file.dbName || file.kind}: {file.error || 'failed'}</li>
            ))}
          </ul>
        )
      },
    },
  ]

  return (
    <section className="card">
      <div className="wd-card-head">
        <div>
          <h2 className="card-title">Backups</h2>
          <p>Every database is copied each night and kept for {expectedBackupDays} days.</p>
        </div>
        <button type="button" className="primary" onClick={onRun} disabled={starting || !storage.configured}>
          {starting ? 'Starting backup…' : 'Back up now'}
        </button>
      </div>

      <div className="grid" style={{ gap: 12, marginBottom: 20 }}>
        {!storage.configured && (
          <Banner tone="danger" title="Backup storage is not configured">
            Nothing is being backed up. Set the storage settings on the server, then restart it.
          </Banner>
        )}
        {storage.configured && storage.retentionError && (
          <Banner tone="warning" title="Could not read the expiry rules">{storage.retentionError}</Banner>
        )}
        {storage.configured && !storage.retentionError && (!backupsRule || backupsRule.days !== expectedBackupDays) && (
          <Banner tone="warning" title={backupsRule ? `Backups expire after ${backupsRule.days} days, not ${expectedBackupDays}` : 'No expiry rule for backups'}>
            Old backups should be removed after {expectedBackupDays} days. Check the bucket's lifecycle rules for {storage.prefix}/backups/.
          </Banner>
        )}
        {storage.configured && !storage.retentionError && otherMismatches.length > 0 && (
          <Banner tone="warning" title="Some expiry rules don't match">
            Check the rules for {otherMismatches.map((area) => area.label.toLowerCase()).join(' and ')}.
          </Banner>
        )}
        {storage.configured && !jobs.encryptionKeySet && (
          <Banner tone="warning" title="Backups are not encrypted">Set the backup encryption key on the server.</Banner>
        )}
      </div>

      <DetailList
        columns={3}
        items={[
          { label: 'Storage', value: storage.driver === 's3' ? 'S3 bucket' : storage.driver === 'local' ? 'Local folder' : storage.driver },
          { label: storage.driver === 's3' ? 'Bucket' : 'Folder', value: storage.bucket },
          { label: 'Region', value: storage.region },
          { label: 'Prefix', value: storage.prefix ? <code>{storage.prefix}</code> : '' },
          { label: 'Nightly backups', value: jobs.backupsEnabled ? 'On' : 'Off' },
          { label: 'Encryption key', value: jobs.encryptionKeySet ? 'Set' : 'Not set' },
          { label: 'Last nightly backup', value: formatDateTime(lastNightly?.lastRunAt) },
          { label: 'Daily workspace job', value: jobs.lifecycleEnabled ? 'On' : 'Off' },
          { label: 'Last daily job', value: formatDateTime(lastLifecycle?.lastRunAt) },
        ]}
      />

      <div className="wd-block">
        <h3 className="wd-subhead">Expiry rules found</h3>
        {rules.length === 0 ? (
          <p className="cb-muted" style={{ margin: 0, fontSize: 13 }}>{storage.configured ? 'No expiry rules for this prefix.' : 'Storage is not configured.'}</p>
        ) : (
          <ul className="wd-list">
            {rules.map((rule) => (
              <li key={rule.prefix} className={rule.status === 'Disabled' ? 'is-off' : undefined}>
                <code>{rule.prefix}</code> removed after {rule.days ?? '—'} days{rule.status === 'Disabled' ? ' (rule turned off)' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="wd-block">
        <h3 className="wd-subhead">Recent runs</h3>
        <DataTable
          columns={columns}
          data={runs}
          emptyMessage="No backups have run yet"
          rowKey={(run) => run.runId}
        />
      </div>
    </section>
  )
}

/* ── Closing workspaces ────────────────────────────────────────────────── */

function ArchivesList({ workspace, archives, loading, onRefresh, onClose, onDryRun }: {
  workspace: ClosingWorkspace
  archives: WorkspaceArchive[]
  loading: boolean
  onRefresh: () => void
  onClose: () => void
  onDryRun: (archive: WorkspaceArchive) => void
}) {
  const columns: DataTableColumn<WorkspaceArchive>[] = [
    { header: 'Made', accessor: (archive) => formatDateTime(archive.createdAt) },
    { header: 'Reason', accessor: (archive) => (archive.reason === 'closure' ? 'Closure' : 'On request') },
    { header: 'Status', accessor: (archive) => <StatusBadge status={archive.status} size="sm" /> },
    { header: 'Size', className: 'wd-num', accessor: (archive) => formatBytes(archive.bytes) },
    {
      header: 'Files',
      accessor: (archive) => (archive.fileCount != null
        ? `${formatCount(archive.fileCount)}${archive.filesMode === 'links' ? ' (links only)' : archive.filesMode === 'partial' ? ' (some as links)' : ''}`
        : '—'),
    },
    {
      header: 'Download',
      accessor: (archive) => (archive.downloadUrl
        ? <a className="cb-link" href={archive.downloadUrl} target="_blank" rel="noreferrer">Download .zip</a>
        : '—'),
    },
    {
      header: 'Re-import',
      accessor: (archive) => (archive.status === 'ready' ? (
        <div className="wd-row-actions">
          <button type="button" className="ghost" onClick={() => onDryRun(archive)}>Check re-import</button>
        </div>
      ) : null),
    },
  ]

  return (
    <div className="wd-block">
      <div className="wd-card-head" style={{ marginBottom: 0 }}>
        <h3 className="wd-subhead">Archives for {workspace.name} ({workspace.slug})</h3>
        <div className="wd-row-actions">
          <button type="button" className="ghost" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="ghost" onClick={onClose}>Hide</button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={archives}
        emptyMessage={loading ? 'Loading archives…' : 'No archives yet. Make one to give the school its data.'}
        rowKey={(archive) => archive._id}
      />
      <p className="cb-muted" style={{ margin: 0, fontSize: 12 }}>Download links work for one hour.</p>
    </div>
  )
}

function ClosingCard({ closing, storageReady, onError, onFlash, onPlanned }: {
  closing: ClosingWorkspace[]
  storageReady: boolean
  onError: (message: string) => void
  onFlash: (message: string) => void
  onPlanned: (record: WorkspaceImport) => void
}) {
  const [archives, setArchives] = useState<Record<string, WorkspaceArchive[]>>({})
  const [open, setOpen] = useState<string[]>([])
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const loadArchives = async (tenantId: string) => {
    setBusy((prev) => ({ ...prev, [tenantId]: true }))
    try {
      const list = await workspaceDataApi.listArchives(tenantId)
      setArchives((prev) => ({ ...prev, [tenantId]: list }))
    } catch (err) {
      onError(errorMessage(err, 'Could not load the archives.'))
    } finally {
      setBusy((prev) => ({ ...prev, [tenantId]: false }))
    }
  }

  const toggle = (tenantId: string) => {
    if (open.includes(tenantId)) {
      setOpen((prev) => prev.filter((id) => id !== tenantId))
      return
    }
    setOpen((prev) => [...prev, tenantId])
    loadArchives(tenantId).catch(() => undefined)
  }

  const makeArchive = async (workspace: ClosingWorkspace) => {
    setBusy((prev) => ({ ...prev, [workspace._id]: true }))
    try {
      const archive = await workspaceDataApi.createArchive(workspace._id)
      onFlash(archive.status === 'ready'
        ? `An archive for ${workspace.slug} is ready.`
        : `Making an archive for ${workspace.slug}. The school admin gets an email when it is ready.`)
      setOpen((prev) => (prev.includes(workspace._id) ? prev : [...prev, workspace._id]))
      await loadArchives(workspace._id)
    } catch (err) {
      onError(errorMessage(err, 'Could not start the archive.'))
      setBusy((prev) => ({ ...prev, [workspace._id]: false }))
    }
  }

  // Dry run of a re-import from an archive we still hold; the result shows in the re-import card.
  const dryRun = async (workspace: ClosingWorkspace, archive: WorkspaceArchive) => {
    setBusy((prev) => ({ ...prev, [workspace._id]: true }))
    try {
      onPlanned(await workspaceDataApi.planImport(archive._id))
    } catch (err) {
      onError(errorMessage(err, 'Could not check this archive.'))
    } finally {
      setBusy((prev) => ({ ...prev, [workspace._id]: false }))
    }
  }

  const columns: DataTableColumn<ClosingWorkspace>[] = [
    {
      header: 'School',
      accessor: (row) => (
        <span>
          {row.name}
          <span className="wd-cell-sub">{row.slug}</span>
        </span>
      ),
    },
    { header: 'Status', accessor: (row) => <StatusBadge status={row.status} size="sm" /> },
    { header: 'Requested', accessor: (row) => formatDate(row.closure?.requestedAt) },
    { header: 'Export until', accessor: (row) => formatDate(row.closure?.exportUntil) },
    { header: 'Delete after', accessor: (row) => formatDate(row.closure?.deleteAfter) },
    { header: 'Notice sent', accessor: (row) => formatDate(row.closure?.deletionNoticeSentAt) },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="wd-row-actions">
          <button type="button" className="secondary" disabled={!storageReady || busy[row._id]} onClick={() => makeArchive(row)}>
            Make archive
          </button>
          <button type="button" className="ghost" onClick={() => toggle(row._id)} aria-expanded={open.includes(row._id)}>
            {open.includes(row._id) ? 'Hide archives' : 'Show archives'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <section className="card">
      <div className="wd-card-head">
        <div>
          <h2 className="card-title">Closing workspaces</h2>
          <p>Schools that asked to close. They can download their data until the export date; deletion needs your approval.</p>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={closing}
        emptyMessage="No workspaces are closing"
        rowKey={(row) => row._id}
      />
      {closing.filter((row) => open.includes(row._id)).map((row) => (
        <ArchivesList
          key={row._id}
          workspace={row}
          archives={archives[row._id] || []}
          loading={Boolean(busy[row._id])}
          onRefresh={() => loadArchives(row._id)}
          onClose={() => toggle(row._id)}
          onDryRun={(archive) => dryRun(row, archive)}
        />
      ))}
    </section>
  )
}

/* ── Deletion approvals ────────────────────────────────────────────────── */

const purgeResultLine = (purge: WorkspacePurge) => {
  const result = purge.result || {}
  const parts = [
    `${formatCount(result.collections)} collections`,
    `${formatCount(result.documents)} records`,
    `${formatCount(result.filesDeleted)} files deleted`,
  ]
  if (typeof result.archivesDeleted === 'number') parts.push(`${formatCount(result.archivesDeleted)} archives`)
  return parts.join(' · ')
}

function PurgeReviewDialog({ purge, onClose, onDone }: {
  purge: WorkspacePurge | null
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [plan, setPlan] = useState<PurgePlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [working, setWorking] = useState<'' | 'approve' | 'dismiss'>('')
  const [error, setError] = useState('')

  useEffect(() => {
    setPlan(null)
    setConfirm('')
    setError('')
    if (!purge) return
    setLoading(true)
    workspaceDataApi.purgePlan(purge._id)
      .then((data) => setPlan(data.plan))
      .catch((err) => setError(errorMessage(err, 'Could not work out what would be deleted.')))
      .finally(() => setLoading(false))
  }, [purge])

  const close = useCallback(() => {
    if (!working) onClose()
  }, [working, onClose])

  if (!purge) return null

  const confirmed = confirm.trim().toLowerCase() === purge.slug

  const approve = async () => {
    setWorking('approve')
    setError('')
    try {
      await workspaceDataApi.approvePurge(purge._id, confirm.trim())
      onDone(`${purge.slug} was deleted.`)
    } catch (err) {
      setError(errorMessage(err, 'The deletion did not finish. Nothing more was removed.'))
    } finally {
      setWorking('')
    }
  }

  const dismiss = async () => {
    setWorking('dismiss')
    setError('')
    try {
      await workspaceDataApi.dismissPurge(purge._id)
      onDone(`Deletion of ${purge.slug} was dismissed.`)
    } catch (err) {
      setError(errorMessage(err, 'Could not dismiss this request.'))
    } finally {
      setWorking('')
    }
  }

  return (
    <Dialog
      isOpen
      onClose={close}
      tone="danger"
      size="md"
      title={`Delete ${purge.name || purge.slug}'s data`}
      description="This can't be undone. The workspace record stays for audit; everything below is removed for good."
      footer={(
        <>
          <button type="button" className="ghost" onClick={close} disabled={Boolean(working)}>Cancel</button>
          <button type="button" className="secondary" onClick={dismiss} disabled={Boolean(working)}>
            {working === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
          <button type="button" className="danger" onClick={approve} disabled={!confirmed || !plan || Boolean(working)}>
            {working === 'approve' ? 'Deleting…' : 'Delete workspace data'}
          </button>
        </>
      )}
    >
      <div className="grid" style={{ gap: 16 }}>
        {error && <Banner tone="danger">{error}</Banner>}
        {purge.status === 'failed' && purge.error && (
          <Banner tone="warning" title="The last attempt failed">{purge.error}</Banner>
        )}
        {loading && <div className="empty-state">Working out what would be deleted…</div>}
        {plan && (
          <DetailList
            columns={2}
            items={[
              { label: 'Database dropped', value: <code>{plan.dbName}</code>, wide: true },
              { label: 'Collections', value: formatCount(plan.collections) },
              { label: 'Records', value: formatCount(plan.documents) },
              { label: 'Uploaded files deleted', value: formatCount(plan.files) },
              { label: 'Shared files kept', value: formatCount(plan.sharedFilesKept) },
              { label: 'Sign-in directory rows', value: formatCount(plan.directoryEntries) },
              { label: 'Sign-up tickets', value: formatCount(plan.onboardingTickets) },
              { label: 'Workspace archives', value: formatCount(plan.archives) },
              { label: 'Due', value: formatDate(purge.dueAt) },
            ]}
          />
        )}
        <p className="cb-muted" style={{ margin: 0, fontSize: 13 }}>
          Billing records (subscriptions, payments, fee receipts) are kept for 8 years, as the law requires.
        </p>
        <TextField
          label={<>Type <code>{purge.slug}</code> to confirm</>}
          value={confirm}
          onChange={setConfirm}
          placeholder={purge.slug}
          disabled={Boolean(working)}
        />
      </div>
    </Dialog>
  )
}

function PurgesCard({ purges, onChanged, onFlash }: {
  purges: WorkspacePurge[]
  onChanged: () => Promise<void>
  onFlash: (message: string) => void
}) {
  const [reviewing, setReviewing] = useState<WorkspacePurge | null>(null)
  const waiting = purges.filter((purge) => purge.status === 'awaiting_approval').length

  const columns: DataTableColumn<WorkspacePurge>[] = [
    {
      header: 'School',
      accessor: (row) => (
        <span>
          {row.name || row.slug}
          <span className="wd-cell-sub">{row.slug}</span>
        </span>
      ),
    },
    { header: 'Status', accessor: (row) => <StatusBadge status={row.status} size="sm" /> },
    { header: 'Due', accessor: (row) => formatDate(row.dueAt) },
    {
      header: 'Decided by',
      accessor: (row) => (row.approvedBy?.email || row.approvedBy?.name ? (
        <span>
          {row.approvedBy?.name || row.approvedBy?.email}
          <span className="wd-cell-sub">{formatDateTime(row.approvedAt || row.completedAt)}</span>
        </span>
      ) : '—'),
    },
    {
      header: 'Result',
      accessor: (row) => {
        if (row.status === 'done') {
          return (
            <span>
              {purgeResultLine(row)}
              <span className="wd-cell-sub">Finished {formatDateTime(row.completedAt)}</span>
            </span>
          )
        }
        if (row.status === 'failed') return <span className="wd-fail">{row.error || 'Failed'}</span>
        if (row.status === 'dismissed') return 'Dismissed, data kept'
        return '—'
      },
    },
    {
      header: 'Actions',
      accessor: (row) => (row.status === 'awaiting_approval' || row.status === 'failed' ? (
        <div className="wd-row-actions">
          <button type="button" className="secondary" onClick={() => setReviewing(row)}>Review</button>
        </div>
      ) : null),
    },
  ]

  return (
    <section className="card">
      <div className="wd-card-head">
        <div>
          <h2 className="card-title">Deletion approvals</h2>
          <p>
            {waiting > 0 ? `${waiting} waiting for your approval. ` : ''}
            A closed workspace is only deleted after an admin approves it here. This list is the record of who approved what.
          </p>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={purges}
        emptyMessage="No deletion requests"
        rowKey={(row) => row._id}
        pageSize={10}
      />
      <PurgeReviewDialog
        purge={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(message) => {
          setReviewing(null)
          onFlash(message)
          onChanged().catch(() => undefined)
        }}
      />
    </section>
  )
}

/* ── Re-import ─────────────────────────────────────────────────────────── */

function ImportSummary({ record }: { record: WorkspaceImport }) {
  const plan = record.plan
  if (!plan) return <p className="cb-muted" style={{ margin: 0 }}>No dry-run result for this import.</p>
  const files = plan.files || {}
  return (
    <div className="grid" style={{ gap: 12 }}>
      {plan.errors?.length > 0 && (
        <Banner tone="danger" title="This archive can't be imported">
          <ul className="wd-list">{plan.errors.map((text) => <li key={text}>{text}</li>)}</ul>
        </Banner>
      )}
      {plan.warnings?.length > 0 && (
        <Banner tone="warning" title="Check before importing">
          <ul className="wd-list">{plan.warnings.map((text) => <li key={text}>{text}</li>)}</ul>
        </Banner>
      )}
      <DetailList
        columns={2}
        items={[
          {
            label: 'Archive',
            value: `${plan.archive?.tenant?.name || '—'} (${plan.archive?.tenant?.slug || '—'}), made ${formatDateTime(plan.archive?.createdAt)}`,
            wide: true,
          },
          {
            label: 'Made by app version',
            value: [plan.archive?.app?.version, plan.archive?.app?.commit ? plan.archive.app.commit.slice(0, 7) : '']
              .filter(Boolean).join(' · ') + (plan.archive?.formatVersion != null ? ` (format ${plan.archive.formatVersion})` : ''),
          },
          {
            label: 'Target workspace',
            value: plan.target
              ? `${plan.target.slug}: ${plan.target.action === 'create' ? 'new workspace' : `replaces the existing one${plan.target.currentStatus ? ` (${plan.target.currentStatus})` : ''}`}`
              : '—',
          },
          { label: 'Database', value: plan.target?.dbName ? <code>{plan.target.dbName}</code> : '—' },
          {
            label: 'Records',
            value: `${formatCount(plan.database?.documents)} in ${formatCount(plan.database?.collections)} collections`,
          },
          {
            label: 'Files',
            value: `${formatCount(files.count)} total · ${formatCount(files.inArchive)} in the archive · ${formatCount(files.linksOnly)} as links`,
          },
          {
            label: 'Data updates to apply',
            value: plan.migrations?.length ? plan.migrations.join(', ') : 'None',
          },
        ]}
      />
    </div>
  )
}

function ImportCard({ imports, storageReady, record, setRecord, onChanged }: {
  imports: WorkspaceImport[]
  storageReady: boolean
  record: WorkspaceImport | null
  setRecord: (record: WorkspaceImport | null) => void
  onChanged: () => Promise<void>
}) {
  const [targetSlug, setTargetSlug] = useState('')
  const [confirm, setConfirm] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const recordId = record?._id
  const running = record?.status === 'running'

  // Poll while the import runs, then refresh the page once it settles.
  useEffect(() => {
    if (!recordId || !running) return undefined
    let stopped = false
    const timer = window.setInterval(() => {
      workspaceDataApi.getImport(recordId)
        .then((next) => {
          if (stopped) return
          setRecord(next)
          if (next.status !== 'running') onChanged().catch(() => undefined)
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [recordId, running, onChanged, setRecord])

  const upload = async (file: File) => {
    setError('')
    setConfirm('')
    try {
      const next = await workspaceDataApi.uploadImport(file, targetSlug.trim().toLowerCase() || undefined)
      setRecord(next)
      onChanged().catch(() => undefined)
    } catch (err) {
      setError(errorMessage(err, 'Could not read the archive.'))
    }
  }

  const apply = async () => {
    if (!record) return
    setApplying(true)
    setError('')
    try {
      setRecord(await workspaceDataApi.applyImport(record._id, confirm.trim()))
    } catch (err) {
      setError(errorMessage(err, 'The import did not start.'))
    } finally {
      setApplying(false)
    }
  }

  const reset = () => {
    setRecord(null)
    setConfirm('')
    setError('')
  }

  const canApply = record?.status === 'planned' && Boolean(record.plan?.ok)
  const confirmed = Boolean(record) && confirm.trim().toLowerCase() === record?.targetSlug

  const columns: DataTableColumn<WorkspaceImport>[] = [
    { header: 'Uploaded', accessor: (row) => formatDateTime(row.createdAt) },
    { header: 'Workspace', accessor: (row) => row.targetSlug || '—' },
    { header: 'Status', accessor: (row) => <StatusBadge status={row.status} size="sm" /> },
    {
      header: 'Notes',
      accessor: (row) => {
        if (row.error) return <span className="wd-fail">{row.error}</span>
        if (row.plan && !row.plan.ok) return `${row.plan.errors.length} problems found`
        if (row.steps?.length) return row.steps[row.steps.length - 1].text
        return '—'
      },
    },
  ]

  return (
    <section className="card" id="workspace-reimport">
      <div className="wd-card-head">
        <div>
          <h2 className="card-title">Re-import a workspace</h2>
          <p>Upload a workspace archive, or check one from the list above. It is checked first as a dry run; nothing is written until you confirm.</p>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {!record && (
        <div className="grid" style={{ gap: 16 }}>
          {!storageReady && <Banner tone="warning">Uploads need backup storage. Configure it first.</Banner>}
          <TextField
            label="Workspace code"
            hint="Leave empty to use the code in the archive. Use a new code to import as a copy."
            value={targetSlug}
            onChange={setTargetSlug}
            placeholder="e.g. dps-rohini"
            disabled={!storageReady}
          />
          <FileUpload accept=".zip" label="Choose a workspace archive" onUpload={upload} disabled={!storageReady} />
        </div>
      )}

      {record && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="wd-card-head" style={{ marginBottom: 0 }}>
            <h3 className="wd-subhead">
              {record.status === 'planned' ? 'Dry run' : 'Import'} for {record.targetSlug || 'this archive'}
            </h3>
            <div className="wd-actions">
              <StatusBadge status={record.status} size="sm" />
              {!running && <button type="button" className="ghost" onClick={reset}>Start over</button>}
            </div>
          </div>

          <ImportSummary record={record} />

          {canApply && (
            <div className="wd-confirm">
              <TextField
                label={<>Type <code>{record.targetSlug}</code> to import</>}
                value={confirm}
                onChange={setConfirm}
                placeholder={record.targetSlug}
                disabled={applying}
              />
              <button type="button" className="primary" onClick={apply} disabled={!confirmed || applying}>
                {applying ? 'Starting import…' : 'Import'}
              </button>
            </div>
          )}

          {record.steps && record.steps.length > 0 && (
            <div className="grid" style={{ gap: 8 }}>
              <h3 className="wd-subhead">Steps</h3>
              <ol className="wd-steps">
                {record.steps.map((step, index) => (
                  <li key={`${step.at}-${index}`} className={step.ok === false ? 'is-failed' : undefined}>
                    <time dateTime={step.at}>{formatTime(step.at)}</time>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {running && <p className="cb-muted" style={{ margin: 0, fontSize: 13 }}>Importing. This page updates by itself.</p>}
          {record.status === 'done' && <Banner tone="success">The workspace was imported.</Banner>}
          {record.status === 'failed' && record.error && <Banner tone="danger" title="The import failed">{record.error}</Banner>}
        </div>
      )}

      <div className="wd-block">
        <h3 className="wd-subhead">Recent imports</h3>
        <DataTable
          columns={columns}
          data={imports}
          emptyMessage="No imports yet"
          rowKey={(row) => row._id}
          onRowClick={(row) => {
            setConfirm('')
            setError('')
            setRecord(row)
          }}
        />
      </div>
    </section>
  )
}
