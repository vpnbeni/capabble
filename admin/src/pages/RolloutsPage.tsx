import { Fragment, useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import {
  masterDatesheetApi,
  masterGuidelinesApi,
  masterUndertakingsApi,
  masterSubjectsApi,
  rolloutApi,
} from '../services/platformApi'
import type { DataRollout, RolloutModule } from '../types/platform'

const moduleLabel: Record<RolloutModule, string> = {
  subjects: 'Subjects',
  datesheet: 'Datesheet',
  guidelines: 'Guidelines',
  undertaking: 'Undertaking',
}

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '-')

export function RolloutsPage() {
  const [rollouts, setRollouts] = useState<DataRollout[]>([])
  const [detailsById, setDetailsById] = useState<Record<string, DataRollout>>({})
  const [expandedRolloutId, setExpandedRolloutId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rollingOutModule, setRollingOutModule] = useState<RolloutModule | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const setFlashSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 5000)
  }

  const loadRollouts = async () => {
    setLoading(true)
    setError('')

    try {
      const items = await rolloutApi.list()
      setRollouts(items)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load rollouts')
      } else {
        setError('Failed to load rollouts')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRollouts().catch(() => undefined)
  }, [])

  const openRolloutDetail = async (rolloutId: string) => {
    if (expandedRolloutId === rolloutId) {
      setExpandedRolloutId(null)
      return
    }

    setExpandedRolloutId(rolloutId)
    if (detailsById[rolloutId]) {
      return
    }

    try {
      const detail = await rolloutApi.getById(rolloutId)
      setDetailsById((prev) => ({ ...prev, [rolloutId]: detail }))
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to load rollout detail')
      } else {
        setError('Failed to load rollout detail')
      }
    }
  }

  const getMasterDataIdForModule = async (module: RolloutModule): Promise<string> => {
    if (module === 'subjects') {
      const result = await masterSubjectsApi.list()
      if (result.subjects.length === 0) {
        throw new Error('No master subjects found. Upload subjects first.')
      }
      return result.subjects[0]._id
    }

    if (module === 'datesheet') {
      const datesheets = await masterDatesheetApi.list()
      if (datesheets.length === 0) {
        throw new Error('No master datesheet found. Upload datesheet first.')
      }
      const active = datesheets.find((item) => item.isActive) || datesheets[0]
      return active._id
    }

    if (module === 'guidelines') {
      const currentGuideline = await masterGuidelinesApi.current()
      if (currentGuideline) {
        return currentGuideline._id
      }

      const guidelines = await masterGuidelinesApi.list()
      if (guidelines.length === 0) {
        throw new Error('No master guideline found. Upload guideline first.')
      }
      return guidelines[0]._id
    }

    const currentUndertaking = await masterUndertakingsApi.current()
    if (currentUndertaking) {
      return currentUndertaking._id
    }

    const undertakings = await masterUndertakingsApi.list()
    if (undertakings.length === 0) {
      throw new Error('No master undertaking found. Upload undertaking first.')
    }
    return undertakings[0]._id
  }

  const initiateQuickRollout = async (module: RolloutModule) => {
    setRollingOutModule(module)
    setError('')

    try {
      const masterDataId = await getMasterDataIdForModule(module)
      const versionLabel = `${moduleLabel[module]} ${new Date().toISOString().slice(0, 10)}`
      await rolloutApi.initiate({ module, masterDataId, versionLabel })
      setFlashSuccess(`${moduleLabel[module]} rollout initiated`)
      await loadRollouts()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to initiate rollout')
      } else {
        setError('Failed to initiate rollout')
      }
    } finally {
      setRollingOutModule(null)
    }
  }

  const retryRollout = async (rolloutId: string) => {
    setRetryingId(rolloutId)
    setError('')

    try {
      await rolloutApi.retry(rolloutId)
      setFlashSuccess('Retry initiated for failed tenants')
      const [list, detail] = await Promise.all([
        rolloutApi.list(),
        rolloutApi.getById(rolloutId),
      ])
      setRollouts(list)
      setDetailsById((prev) => ({ ...prev, [rolloutId]: detail }))
      setExpandedRolloutId(rolloutId)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to retry rollout')
      } else {
        setError('Failed to retry rollout')
      }
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Data rollouts</h1>
        <p className="page-subtitle">Trigger module rollouts and track tenant-level rollout status.</p>
      </header>

      <section className="card">
        <h2 className="card-title">Start a rollout</h2>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => initiateQuickRollout('subjects')}
            disabled={rollingOutModule !== null}
          >
            {rollingOutModule === 'subjects' ? 'Starting...' : 'Rollout Subjects'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => initiateQuickRollout('datesheet')}
            disabled={rollingOutModule !== null}
          >
            {rollingOutModule === 'datesheet' ? 'Starting...' : 'Rollout Datesheet'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => initiateQuickRollout('guidelines')}
            disabled={rollingOutModule !== null}
          >
            {rollingOutModule === 'guidelines' ? 'Starting...' : 'Rollout Guidelines'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => initiateQuickRollout('undertaking')}
            disabled={rollingOutModule !== null}
          >
            {rollingOutModule === 'undertaking' ? 'Starting...' : 'Rollout Undertaking'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Rollout history</h2>

        {loading && <div className="empty-state">Loading rollouts...</div>}

        {!loading && rollouts.length === 0 && (
          <div className="empty-state">No rollouts found yet.</div>
        )}

        {!loading && rollouts.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Version Label</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Initiated</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {rollouts.map((rollout) => {
                  const detail = detailsById[rollout._id]
                  const canRetry = (detail?.summary.failureCount || rollout.summary.failureCount) > 0

                  return (
                    <Fragment key={rollout._id}>
                      <tr
                        className="clickable-row"
                        onClick={() => openRolloutDetail(rollout._id).catch(() => undefined)}
                      >
                        <td style={{ textTransform: 'capitalize' }}>{rollout.module}</td>
                        <td>{rollout.versionLabel}</td>
                        <td><StatusBadge status={rollout.status} /></td>
                        <td>{rollout.summary.successCount}/{rollout.summary.totalTenants} success, {rollout.summary.failureCount} failed</td>
                        <td>{formatDateTime(rollout.initiatedAt)}</td>
                        <td>{formatDateTime(rollout.completedAt)}</td>
                      </tr>

                      {expandedRolloutId === rollout._id && (
                        <tr>
                          <td colSpan={6}>
                            {!detail && <div className="empty-state">Loading rollout details...</div>}

                            {detail && (
                              <div className="rollout-detail">
                                {canRetry && (
                                  <div style={{ marginBottom: 12 }}>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => retryRollout(rollout._id).catch(() => undefined)}
                                      disabled={retryingId === rollout._id}
                                    >
                                      {retryingId === rollout._id ? 'Retrying...' : 'Retry Failed Tenants'}
                                    </button>
                                  </div>
                                )}

                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>Tenant</th>
                                      <th>Status</th>
                                      <th>Records Affected</th>
                                      <th>Error</th>
                                      <th>Completed At</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.tenantStatuses.map((tenant) => (
                                      <tr key={`${rollout._id}-${tenant.tenantSlug}`}>
                                        <td>{tenant.tenantSlug}</td>
                                        <td><StatusBadge status={tenant.status} size="sm" /></td>
                                        <td>{tenant.recordsAffected ?? '-'}</td>
                                        <td style={{ color: tenant.error ? 'var(--danger)' : 'inherit' }}>{tenant.error || '-'}</td>
                                        <td>{formatDateTime(tenant.completedAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
