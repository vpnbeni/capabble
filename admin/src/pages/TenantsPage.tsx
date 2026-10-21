import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { tenantAdminApi } from '../services/platformApi'
import type { PlatformAdmin, Tenant } from '../types/platform'
import { StatusBadge } from '../components/StatusBadge'
import { Building2, ChevronLeft, ChevronRight, Plus } from '../components/icons'

/** "Closure requested · delete after 19 Jan 2027" while a school's closure request is pending. */
const closureLabel = (tenant: Tenant) => {
  const closure = tenant.closure
  if (!closure?.requestedAt || closure.canceledAt) return null
  const date = closure.deleteAfter
    ? new Date(closure.deleteAfter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  return `Closure requested · delete after ${date}`
}

const ClosureNote = ({ tenant }: { tenant: Tenant }) => {
  const label = closureLabel(tenant)
  return label ? <div style={{ marginTop: 6 }}><StatusBadge status="pending_closure" label={label} size="sm" /></div> : null
}

interface TenantDraft {
  name: string
  adminEmail: string
}

interface TenantsPageProps {
  admin: PlatformAdmin
  navigateTo: (path: string) => void
  currentPath: string
}

const TENANT_ROUTE_REGEX = /^\/tenants\/([a-f0-9]{24})\/?$/i

const parseTenantIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(TENANT_ROUTE_REGEX)
  return match ? match[1] : null
}

const buildTenantPath = (tenantId: string) => `/tenants/${tenantId}`

export function TenantsPage({ navigateTo, currentPath }: TenantsPageProps) {
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [search, setSearch] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantDrafts, setTenantDrafts] = useState<Record<string, TenantDraft>>({})
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [deleteSlugInput, setDeleteSlugInput] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const [newTenant, setNewTenant] = useState({
    slug: '',
    name: '',
    adminEmail: '',
    adminPassword: '',
  })

  const selectedTenantId = useMemo(() => parseTenantIdFromPath(currentPath), [currentPath])
  const isTenantDetailPage = Boolean(selectedTenantId)

  const initializeDrafts = (items: Tenant[]) => {
    const drafts: Record<string, TenantDraft> = {}
    items.forEach((tenant) => {
      drafts[tenant._id] = {
        name: tenant.name,
        adminEmail: tenant.adminEmail,
      }
    })
    setTenantDrafts((prev) => ({ ...prev, ...drafts }))
  }

  const loadTenants = async (searchText = search) => {
    const response = await tenantAdminApi.list(searchText)
    setTenants(response.items)
    initializeDrafts(response.items)
  }

  const refreshSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 5000)
  }

  useEffect(() => {
    loadTenants('').catch((err: unknown) => {
      const fallbackMessage = 'Failed to load tenants'
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || fallbackMessage)
        return
      }
      setError(fallbackMessage)
    })
  }, [])

  useEffect(() => {
    if (!selectedTenantId) {
      setSelectedTenant(null)
      return
    }

    const existing = tenants.find((tenant) => tenant._id === selectedTenantId)
    if (existing) {
      setSelectedTenant(existing)
    }

    let cancelled = false
    setDetailLoading(true)

    tenantAdminApi
      .getById(selectedTenantId)
      .then((tenant) => {
        if (cancelled) return

        setSelectedTenant(tenant)
        setTenantDrafts((prev) => ({
          ...prev,
          [tenant._id]: {
            name: tenant.name,
            adminEmail: tenant.adminEmail,
          },
        }))
      })
      .catch((err: unknown) => {
        if (cancelled) return

        const message = typeof err === 'object' && err && 'response' in err
          ? ((err as { response?: { data?: { message?: string }; status?: number } }).response?.data?.message || 'Failed to load tenant details')
          : 'Failed to load tenant details'

        setError(message)

        const status = typeof err === 'object' && err && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined

        if (status === 404) {
          navigateTo('/')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedTenantId, tenants, navigateTo])

  const handleCreateTenant = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const payload = {
        slug: newTenant.slug.trim().toLowerCase(),
        name: newTenant.name.trim(),
        adminEmail: newTenant.adminEmail.trim().toLowerCase(),
        ...(newTenant.adminPassword ? { adminPassword: newTenant.adminPassword } : {}),
      }

      const response = await tenantAdminApi.create(payload)
      await loadTenants('')
      setNewTenant({ slug: '', name: '', adminEmail: '', adminPassword: '' })

      if (response.generatedPassword) {
        refreshSuccess(`Tenant created. Password: ${response.generatedPassword}`)
      } else {
        refreshSuccess('Tenant created successfully')
      }
      setIsCreateDialogOpen(false)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to create tenant')
      } else {
        setError('Failed to create tenant')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTenantUpdate = async (tenantId: string) => {
    const draft = tenantDrafts[tenantId]
    if (!draft) return

    setLoading(true)
    setError('')

    try {
      const updated = await tenantAdminApi.update(tenantId, {
        name: draft.name,
        adminEmail: draft.adminEmail,
      })

      setSelectedTenant((prev) => (prev && prev._id === updated._id ? updated : prev))
      await loadTenants(search)
      refreshSuccess('Tenant updated')
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to update tenant')
      } else {
        setError('Failed to update tenant')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (tenant: Tenant) => {
    setLoading(true)
    setError('')

    try {
      const updatedTenant = tenant.status === 'active'
        ? await tenantAdminApi.suspend(tenant._id)
        : await tenantAdminApi.activate(tenant._id)

      refreshSuccess(`Tenant ${updatedTenant.slug} ${updatedTenant.status === 'active' ? 'activated' : 'suspended'}`)
      setSelectedTenant((prev) => (prev && prev._id === updatedTenant._id ? updatedTenant : prev))
      await loadTenants(search)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setError(response?.data?.message || 'Failed to change status')
      } else {
        setError('Failed to change status')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTenantRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, tenantId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateTo(buildTenantPath(tenantId))
    }
  }

  const openDeleteDialog = () => {
    setDeleteSlugInput('')
    setDeleteError('')
    setIsDeleteDialogOpen(true)
  }

  const closeDeleteDialog = () => {
    setIsDeleteDialogOpen(false)
    setDeleteSlugInput('')
    setDeleteError('')
  }

  const handleDeleteTenant = async () => {
    if (!selectedTenant) return

    const typedSlug = deleteSlugInput.trim().toLowerCase()
    if (typedSlug !== selectedTenant.slug.toLowerCase()) {
      setDeleteError(`Type ${selectedTenant.slug} exactly to confirm.`)
      return
    }

    setIsDeleting(true)
    setDeleteError('')

    try {
      await tenantAdminApi.delete(selectedTenant._id, typedSlug)
      await loadTenants(search)
      closeDeleteDialog()
      setSelectedTenant(null)
      navigateTo('/')
      refreshSuccess(`Tenant ${selectedTenant.slug} deleted from central and tenant databases`)
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        setDeleteError(response?.data?.message || "Couldn't delete the tenant. Nothing was removed.")
      } else {
        setDeleteError("Couldn't delete the tenant. Nothing was removed.")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const selectedTenantDraft = selectedTenant
    ? tenantDrafts[selectedTenant._id] || {
      name: selectedTenant.name,
      adminEmail: selectedTenant.adminEmail,
    }
    : null

  const filteredCount = tenants.length
  // The delete button enables as soon as the typed slug matches; no separate verify step.
  const isDeleteVerified = Boolean(selectedTenant && deleteSlugInput.trim().toLowerCase() === selectedTenant.slug.toLowerCase())

  return (
    <>
      <div className="page-head-row">
        <div>
          <h1 className="section-title" style={{ marginBottom: 8 }}>
            {isTenantDetailPage ? 'Tenant details' : 'Tenants'}
          </h1>
          {isTenantDetailPage && selectedTenant && (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Manage tenant <strong style={{ color: 'var(--text-primary)' }}>{selectedTenant.slug}</strong>
            </p>
          )}
          {!isTenantDetailPage && (
            <p className="page-subtitle">Schools using Capabble. Open one to edit its details or status.</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {error && <span className="error-text" style={{ margin: 0, alignSelf: 'center' }}>{error}</span>}
          {success && <span className="success-text" style={{ margin: 0, alignSelf: 'center' }}>{success}</span>}
          {!isTenantDetailPage && (
            <button
              className="primary"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus size={16} />
              Create tenant
            </button>
          )}
        </div>
      </div>

      <Dialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        title="Create tenant"
      >
        <form onSubmit={handleCreateTenant} className="grid" style={{ gap: 20 }}>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Slug</label>
              <input
                placeholder="xyz"
                value={newTenant.slug}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, slug: e.target.value }))}
                required
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Display Name</label>
              <input
                placeholder="Acme Corp"
                value={newTenant.name}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Admin Email</label>
            <input
              type="email"
              placeholder="admin@tenant.com"
              value={newTenant.adminEmail}
              onChange={(e) => setNewTenant((prev) => ({ ...prev, adminEmail: e.target.value }))}
              required
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Custom Password (optional)</label>
            <input
              type="text"
              placeholder="Leave blank for auto-gen"
              value={newTenant.adminPassword}
              onChange={(e) => setNewTenant((prev) => ({ ...prev, adminPassword: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              className="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ flex: 2 }}>
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={isDeleteDialogOpen}
        onClose={closeDeleteDialog}
        title={`Delete Tenant ${selectedTenant?.slug || ''}`}
      >
        {selectedTenant && (
          <div className="grid" style={{ gap: 16 }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This action is permanent. It will remove this tenant from the central platform database and also drop
              tenant database <strong style={{ color: 'var(--text-primary)' }}>{selectedTenant.dbName}</strong>.
            </p>

            <label className="input-group" style={{ marginBottom: 0 }}>
              <span className="input-label">
                Type <strong style={{ color: 'var(--ink)' }}>{selectedTenant.slug}</strong> to confirm
              </span>
              <input
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={deleteSlugInput}
                onChange={(e) => {
                  setDeleteSlugInput(e.target.value)
                  setDeleteError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isDeleteVerified && !isDeleting) handleDeleteTenant()
                }}
              />
            </label>

            {deleteError ? <div className="error-text" role="alert" style={{ margin: 0 }}>{deleteError}</div> : null}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="ghost"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={handleDeleteTenant}
                disabled={isDeleting || !isDeleteVerified}
                style={{ flex: 2 }}
              >
                {isDeleting ? 'Deleting…' : 'Delete tenant'}
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {!isTenantDetailPage && (
        <>
          <section className="card admin-list-card">
            <div className="admin-toolbar">
              <form
                className="admin-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  loadTenants(search)
                }}
              >
                <input
                  type="search"
                  aria-label="Search tenants"
                  placeholder="Search by slug, school name or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="secondary" disabled={loading}>
                  {loading ? 'Searching…' : 'Search'}
                </button>
                {search ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setSearch('')
                      loadTenants('')
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </form>
              <span className="admin-count">{filteredCount} {filteredCount === 1 ? 'tenant' : 'tenants'}</span>
            </div>

            <div className="tenant-list tenant-list--flush">
              <div className="tenant-item tenant-item--head" aria-hidden="true">
                <div>Tenant</div>
                <div>School</div>
                <div>Admin email</div>
                <div>Status</div>
                <div />
              </div>
              {tenants.map((tenant) => (
                <div
                  key={tenant._id}
                  className="tenant-item tenant-item-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigateTo(buildTenantPath(tenant._id))}
                  onKeyDown={(event) => handleTenantRowKeyDown(event, tenant._id)}
                >
                  <div>
                    <div className="tenant-slug">{tenant.slug}</div>
                    <div className="tenant-db">{tenant.dbName}</div>
                  </div>
                  <div>{tenant.name}</div>
                  <div className="tenant-email">{tenant.adminEmail}</div>
                  <div>
                    <StatusBadge status={tenant.status} />
                    <ClosureNote tenant={tenant} />
                  </div>
                  <div className="tenant-open"><ChevronRight size={16} /></div>
                </div>
              ))}
              {tenants.length === 0 && (
                <div className="cb-empty cb-empty--compact">
                  <span className="cb-empty__icon"><Building2 /></span>
                  <p className="cb-empty__title">No tenants match this search</p>
                  <p className="cb-empty__body">Clear the search or try a different slug, name or email.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {isTenantDetailPage && (
        <section>
          <button
            type="button"
            className="ghost"
            onClick={() => navigateTo('/')}
            style={{ marginBottom: 20 }}
          >
            <ChevronLeft size={16} /> Back to tenants
          </button>

          {detailLoading && !selectedTenant && (
            <div className="card" style={{ color: 'var(--text-secondary)' }}>
              Loading tenant details...
            </div>
          )}

          {!detailLoading && !selectedTenant && (
            <div className="card" style={{ color: 'var(--text-secondary)' }}>
              Tenant not found.
            </div>
          )}

          {selectedTenant && selectedTenantDraft && (
            <div className="grid" style={{ gap: 24 }}>
              <div className="card">
                <h2 className="card-title">Tenant profile</h2>
                <div className="tenant-meta-grid" style={{ marginBottom: 24 }}>
                  <div>
                    <div className="input-label" style={{ marginBottom: 6 }}>Slug</div>
                    <div>{selectedTenant.slug}</div>
                  </div>
                  <div>
                    <div className="input-label" style={{ marginBottom: 6 }}>Database</div>
                    <div>{selectedTenant.dbName}</div>
                  </div>
                  <div>
                    <div className="input-label" style={{ marginBottom: 6 }}>Status</div>
                    <StatusBadge status={selectedTenant.status} />
                    <ClosureNote tenant={selectedTenant} />
                  </div>
                  <div>
                    <div className="input-label" style={{ marginBottom: 6 }}>Created</div>
                    <div>{new Date(selectedTenant.createdAt).toLocaleString()}</div>
                  </div>
                </div>

                <div className="grid" style={{ gap: 16 }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label">Display Name</label>
                    <input
                      value={selectedTenantDraft.name}
                      onChange={(e) => setTenantDrafts((prev) => ({
                        ...prev,
                        [selectedTenant._id]: { ...selectedTenantDraft, name: e.target.value },
                      }))}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label">Admin Email</label>
                    <input
                      type="email"
                      value={selectedTenantDraft.adminEmail}
                      onChange={(e) => setTenantDrafts((prev) => ({
                        ...prev,
                        [selectedTenant._id]: { ...selectedTenantDraft, adminEmail: e.target.value },
                      }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleTenantUpdate(selectedTenant._id)}
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleStatusChange(selectedTenant)}
                      disabled={loading}
                    >
                      {selectedTenant.status === 'active' ? 'Suspend Tenant' : 'Activate Tenant'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2 className="card-title">Delete tenant</h2>
                <p style={{ marginTop: 0, marginBottom: 18, color: 'var(--text-secondary)' }}>
                  Delete this tenant from central records and permanently drop tenant database.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={openDeleteDialog}
                >
                  Delete tenant…
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}
