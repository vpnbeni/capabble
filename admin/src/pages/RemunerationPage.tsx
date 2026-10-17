import { FormEvent, useEffect, useMemo, useState } from 'react'
import { masterRemunerationApi } from '../services/platformApi'
import type { MasterRemunerationRate } from '../types/platform'

type DutyRateRow = {
  key: string
  dutyType: string
  remuneration: number
  conveyance: number
  refreshment: number
}

const CS_SUB_DUTIES = ['CS', 'QP Collection', 'AB Deposit'] as const

export function RemunerationPage() {
  const [rows, setRows] = useState<DutyRateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const defaultRows = useMemo<DutyRateRow[]>(
    () => [
      { key: 'cs_core', dutyType: 'CS', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'cs_qp', dutyType: 'QP Collection', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'cs_ab', dutyType: 'AB Deposit', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'cs', dutyType: 'Centre Superintendent', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'dcs', dutyType: 'Deputy Centre Superintendent', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'inv', dutyType: 'Invigilator', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'cctv', dutyType: 'ASI (CCTV)', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'asfm', dutyType: 'ASI (Frisking Male)', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'asff', dutyType: 'ASI (Frisking Female)', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'clerk', dutyType: 'Clerk', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'cl4', dutyType: 'Class IV', remuneration: 0, conveyance: 0, refreshment: 0 },
      { key: 'observer', dutyType: 'Observer', remuneration: 0, conveyance: 0, refreshment: 0 },
    ],
    [],
  )

  const showSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 2500)
  }

  const loadRates = async () => {
    setLoading(true)
    setError('')
    try {
      const items = await masterRemunerationApi.list()
      const byDutyType = new Map<string, MasterRemunerationRate>()
      items.forEach((item) => byDutyType.set(String(item.dutyType), item))

      setRows(
        defaultRows.map((row) => {
          const found = byDutyType.get(row.dutyType)
          return {
            ...row,
            remuneration: Number(found?.rates?.remuneration ?? 0),
            conveyance: Number(found?.rates?.conveyance ?? 0),
            refreshment: Number(found?.rates?.refreshment ?? 0),
          }
        }),
      )
    } catch (err: any) {
      setRows(defaultRows)
      setError(err?.response?.data?.message || 'Failed to load remuneration rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRates()
  }, [])

  const updateCell = (key: string, field: 'remuneration' | 'conveyance' | 'refreshment', value: number) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await masterRemunerationApi.upsert(
        rows.map((row) => ({
          dutyType: row.dutyType,
          remuneration: Number(row.remuneration) || 0,
          conveyance: Number(row.conveyance) || 0,
          refreshment: Number(row.refreshment) || 0,
        })),
      )
      showSuccess('Rates saved successfully')
      await loadRates()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save rates')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="section-title" style={{ marginBottom: 6 }}>Remuneration</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Configure duty-wise payout components (Remuneration, Conveyance, Refreshment).
        </p>
      </div>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 18, borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="card-title" style={{ margin: 0 }}>Duty types</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
              Enter per-day rates in rupees (₹). These will be used by all tenants.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Currency: INR (₹)
            </span>
            <button type="submit" className="primary" disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Sr No</th>
                <th>Duty Type</th>
                <th style={{ width: 200 }}>Sub Duties</th>
                <th style={{ width: 180 }}>Remuneration</th>
                <th style={{ width: 180 }}>Conveyance</th>
                <th style={{ width: 180 }}>Refreshment</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const workingRows = loading ? defaultRows : rows
                const workingByDutyType = new Map<string, DutyRateRow>()
                workingRows.forEach((row) => workingByDutyType.set(row.dutyType, row))
                const centreSuperintendent = workingByDutyType.get('Centre Superintendent')

                const visibleOtherRows = workingRows.filter((row) => {
                  const hidden = new Set<string>([...CS_SUB_DUTIES, 'Centre Superintendent'])
                  return !hidden.has(row.dutyType)
                })

                let srNo = 1

                return (
                  <>
                    {/* Centre Superintendent grouped layout */}
                    {CS_SUB_DUTIES.map((subDuty, subIdx) => {
                      const subRow = workingByDutyType.get(subDuty)
                      return (
                        <tr key={`cs-group-${subDuty}`}>
                          {subIdx === 0 && (
                            <>
                              <td rowSpan={CS_SUB_DUTIES.length}>{srNo}</td>
                              <td rowSpan={CS_SUB_DUTIES.length} style={{ fontWeight: 600 }}>
                                Centre Superintendent
                              </td>
                            </>
                          )}
                          <td style={{ fontWeight: 600 }}>{subDuty}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={Number(subRow?.remuneration ?? 0)}
                              onChange={(e) => subRow && updateCell(subRow.key, 'remuneration', Number(e.target.value))}
                              disabled={loading || saving || !subRow}
                              aria-label={`${subDuty} remuneration`}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={Number(subRow?.conveyance ?? 0)}
                              onChange={(e) => subRow && updateCell(subRow.key, 'conveyance', Number(e.target.value))}
                              disabled={loading || saving || !subRow}
                              aria-label={`${subDuty} conveyance`}
                            />
                          </td>
                          {subIdx === 0 && (
                            <td rowSpan={CS_SUB_DUTIES.length}>
                              <input
                                type="number"
                                min={0}
                                step="1"
                                value={Number(centreSuperintendent?.refreshment ?? 0)}
                                onChange={(e) => centreSuperintendent && updateCell(centreSuperintendent.key, 'refreshment', Number(e.target.value))}
                                disabled={loading || saving || !centreSuperintendent}
                                aria-label="Centre Superintendent refreshment"
                              />
                            </td>
                          )}
                        </tr>
                      )
                    })}

                    {(() => {
                      srNo += 1
                      return null
                    })()}

                    {/* Remaining duty types */}
                    {visibleOtherRows.map((row, idx) => (
                      <tr key={row.key}>
                        <td>{srNo + idx}</td>
                        <td style={{ fontWeight: 600 }}>{row.dutyType}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={row.remuneration}
                            onChange={(e) => updateCell(row.key, 'remuneration', Number(e.target.value))}
                            disabled={loading || saving}
                            aria-label={`${row.dutyType} remuneration`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={row.conveyance}
                            onChange={(e) => updateCell(row.key, 'conveyance', Number(e.target.value))}
                            disabled={loading || saving}
                            aria-label={`${row.dutyType} conveyance`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={row.refreshment}
                            onChange={(e) => updateCell(row.key, 'refreshment', Number(e.target.value))}
                            disabled={loading || saving}
                            aria-label={`${row.dutyType} refreshment`}
                          />
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  )
}

