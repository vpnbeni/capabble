import { useEffect, useState } from 'react'
import { billingAdminApi } from '../services/platformApi'
import type { BillingTenantDetails, BillingTenantListItem } from '../types/platform'

const formatMoney = (minor: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format((minor || 0) / 100)
}

export function BillingTenantsPage() {
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<BillingTenantListItem[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [details, setDetails] = useState<BillingTenantDetails | null>(null)
  const [planCode, setPlanCode] = useState('')
  const [extensionDays, setExtensionDays] = useState(7)

  const loadList = async (searchText = search) => {
    setLoading(true)
    setError('')

    try {
      const response = await billingAdminApi.listTenants(searchText)
      setItems(response.items)

      if (!selectedTenantId && response.items.length > 0) {
        setSelectedTenantId(response.items[0].account.tenantId)
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load billing tenants')
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (tenantId: string) => {
    if (!tenantId) return

    setDetailLoading(true)
    setError('')

    try {
      const response = await billingAdminApi.getTenantById(tenantId)
      setDetails(response)
      setPlanCode(response.subscription?.planCode || '')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load tenant billing detail')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadList('')
  }, [])

  useEffect(() => {
    if (selectedTenantId) {
      loadDetail(selectedTenantId)
    }
  }, [selectedTenantId])

  const onChangePlan = async () => {
    if (!selectedTenantId || !planCode.trim()) return

    try {
      await billingAdminApi.changePlan(selectedTenantId, planCode.trim())
      setSuccess('Plan updated successfully')
      await loadDetail(selectedTenantId)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update plan')
    }
  }

  const onGrantExtension = async () => {
    if (!selectedTenantId || !extensionDays) return

    try {
      await billingAdminApi.grantExtension(selectedTenantId, extensionDays)
      setSuccess(`Granted ${extensionDays} day(s) extension`)
      await loadDetail(selectedTenantId)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to grant extension')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="page-head-row" style={{ marginBottom: 0 }}>
        <h1 className="section-title" style={{ margin: 0 }}>Billing tenants</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="search"
            aria-label="Search billing tenants"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tenant, slug, email"
          />
          <button className="secondary" onClick={() => loadList(search)} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>State</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.account._id}
                  onClick={() => setSelectedTenantId(item.account.tenantId)}
                  className={`clickable-row${selectedTenantId === item.account.tenantId ? ' is-selected' : ''}`}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.account.tenantName}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.account.tenantSlug}</div>
                  </td>
                  <td>{item.entitlement.state}</td>
                  <td>{item.entitlement.accessMode}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 18, color: 'var(--text-secondary)' }}>No billing tenants found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ minHeight: 300 }}>
          {detailLoading && <p>Loading tenant billing details...</p>}
          {!detailLoading && !details && <p style={{ color: 'var(--text-secondary)' }}>Select a tenant to view details.</p>}

          {!detailLoading && details && (
            <div style={{ display: 'grid', gap: 14 }}>
              <h2 className="card-title">{details.account.tenantName} Billing</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{details.account.billingEmail}</p>

              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>State</div>
                  <div>{details.entitlement.state}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Access</div>
                  <div>{details.entitlement.accessMode}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Plan</div>
                  <div>{details.subscription?.planCode || 'n/a'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Trial Ends</div>
                  <div>{details.entitlement.trialEndsAt ? new Date(details.entitlement.trialEndsAt).toLocaleDateString() : 'n/a'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label className="input-label">Change Plan Code</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={planCode} onChange={(event) => setPlanCode(event.target.value)} placeholder="core_monthly" />
                  <button className="primary" onClick={onChangePlan}>Apply</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label className="input-label">Grant Extension (days)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    value={extensionDays}
                    onChange={(event) => setExtensionDays(Number(event.target.value || 0))}
                  />
                  <button className="secondary" onClick={onGrantExtension}>Grant</button>
                </div>
              </div>

              <div>
                <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Recent invoices</h3>
                <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Status</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.invoices.map((invoice) => (
                        <tr key={invoice._id}>
                          <td>{invoice.invoiceNo}</td>
                          <td>{invoice.status}</td>
                          <td>{formatMoney(invoice.totalMinor, invoice.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
