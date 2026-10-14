import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Boxes, Layers, Package, Plus, SearchX } from 'lucide-react'
import asetsService from '@/services/asetsService'
import { ASSET_CONDITIONS, ASSET_STATUSES, formatMoney } from '@/constants/asetsConstants'
import { AsetsStatusBadge } from '@/components/asets/AsetsUi'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  Page,
  Select,
  Sheet,
  TextField,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/asets/assets.css'

const emptyForm = {
  name: '',
  categoryId: '',
  subcategoryId: '',
  locationId: '',
  vendorId: '',
  brand: '',
  model: '',
  serialNumber: '',
  purchaseCost: 0,
  purchaseDate: '',
  condition: 'New',
  status: 'IN_STOCK',
  custodianName: '',
  department: '',
  notes: '',
  quantity: 1,
}

type AssetForm = typeof emptyForm

const statusWords = (status: string) => {
  const words = status.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const statusOptions = ASSET_STATUSES.map((s) => ({ value: s, label: statusWords(s) }))
const conditionOptions = ASSET_CONDITIONS.map((c) => ({ value: c, label: c }))

const AsetsAssets: React.FC = () => {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 })
  const [categories, setCategories] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('')
  const [condition, setCondition] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [form, setForm] = useState<AssetForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; categoryId?: string }>({})
  const requestRef = useRef(0)

  const parentCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const subcategories = useMemo(
    () => categories.filter((c) => String(c.parentId || '') === String(form.categoryId)),
    [categories, form.categoryId]
  )
  const categoryOptions = useMemo(
    () => parentCategories.map((c) => ({ value: String(c._id), label: c.name })),
    [parentCategories]
  )
  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: String(l._id), label: l.path || l.name })),
    [locations]
  )
  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: String(v._id), label: v.name })), [vendors])

  const loadLookups = async () => {
    try {
      const [cats, locs, vends] = await Promise.all([
        asetsService.listCategories(),
        asetsService.listLocations(),
        asetsService.listVendors(),
      ])
      setCategories(cats)
      setLocations(locs)
      setVendors(vends)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load categories, locations and vendors.')
    }
  }

  const load = useCallback(
    async (page: number) => {
      const requestId = ++requestRef.current
      setLoading(true)
      try {
        const data = await asetsService.listAssets({
          page,
          limit: pagination.limit,
          q: debouncedQ || undefined,
          status: status || undefined,
          condition: condition || undefined,
          categoryId: categoryId || undefined,
          locationId: locationId || undefined,
        })
        if (requestId !== requestRef.current) return
        setItems(data.items || [])
        if (data.pagination) setPagination(data.pagination)
      } catch (error: any) {
        if (requestId !== requestRef.current) return
        toast.error(error?.response?.data?.message || 'Failed to load assets.')
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    },
    [pagination.limit, debouncedQ, status, condition, categoryId, locationId]
  )

  useEffect(() => {
    void loadLookups()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [q])

  // Filters apply as they change; any change goes back to page 1.
  useEffect(() => {
    void load(1)
  }, [load])

  const hasFilters = Boolean(q || status || condition || categoryId || locationId)
  const clearFilters = () => {
    setQ('')
    setDebouncedQ('')
    setStatus('')
    setCondition('')
    setCategoryId('')
    setLocationId('')
  }

  const openForm = (bulk: boolean) => {
    setBulkMode(bulk)
    setForm(emptyForm)
    setErrors({})
    setShowForm(true)
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name || !form.categoryId) {
      setErrors({
        name: form.name ? undefined : 'Enter a name.',
        categoryId: form.categoryId ? undefined : 'Choose a category.',
      })
      toast.error('Name and category are required.')
      return
    }
    setErrors({})
    setSaving(true)
    try {
      if (bulkMode) {
        await asetsService.bulkCreateAssets({
          ...form,
          quantity: Number(form.quantity || 1),
          purchaseCost: Number(form.purchaseCost || 0),
        })
        toast.success('Batch assets created.')
      } else {
        await asetsService.createAsset({
          ...form,
          purchaseCost: Number(form.purchaseCost || 0),
        })
        toast.success('Asset created.')
      }
      setForm(emptyForm)
      setShowForm(false)
      await load(1)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to save asset.')
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof AssetForm>(key: K, value: AssetForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const columns: DataTableColumn<any>[] = [
    {
      key: 'name',
      header: 'Asset',
      mobile: 'title',
      render: (asset) => (
        <span className="aa-name">
          <span className="aa-name__primary">{asset.name}</span>
          <span className="aa-code">{asset.assetId}</span>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      mobile: 'subtitle',
      render: (asset) => orDash(asset.categoryId?.name),
    },
    {
      key: 'location',
      header: 'Location',
      render: (asset) => {
        const text = asset.locationPath || asset.locationId?.name
        return text ? (
          <span className="aa-clip" title={text}>
            {text}
          </span>
        ) : (
          '—'
        )
      },
    },
    { key: 'custodian', header: 'Custodian', render: (asset) => orDash(asset.custodianName) },
    { key: 'condition', header: 'Condition', render: (asset) => orDash(asset.condition) },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      align: 'right',
      render: (asset) => formatMoney(asset.currentValue),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (asset) => <AsetsStatusBadge status={asset.status} />,
    },
  ]

  const { page, pages, total, limit } = pagination
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const noun = total === 1 ? 'asset' : 'assets'

  return (
    <Page>
      <Card flush className="aa-card">
        <div className="aa-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search ID, name, serial or barcode',
              value: q,
              onChange: setQ,
              label: 'Search assets',
            }}
            filters={
              <>
                <Select
                  aria-label="Status"
                  size="sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="All statuses"
                  options={statusOptions}
                  className="aa-filter"
                />
                <Select
                  aria-label="Condition"
                  size="sm"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  placeholder="All conditions"
                  options={conditionOptions}
                  className="aa-filter"
                />
                <Select
                  aria-label="Category"
                  size="sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  placeholder="All categories"
                  options={categoryOptions}
                  className="aa-filter"
                />
                <Select
                  aria-label="Location"
                  size="sm"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  placeholder="All locations"
                  options={locationOptions}
                  className="aa-filter"
                />
                {hasFilters ? (
                  <Button variant="tertiary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </>
            }
            actions={
              <>
                <Button size="sm" icon={Layers} onClick={() => openForm(true)}>
                  Add a batch
                </Button>
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openForm(false)}>
                  Add asset
                </Button>
              </>
            }
          />
        </div>

        <DataTable
          caption="Asset register"
          columns={columns}
          rows={items}
          getRowKey={(asset) => String(asset._id)}
          onRowClick={(asset) => navigate(`/asets/assets/${asset._id}`)}
          loading={loading}
          loadingLabel="Loading assets…"
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchX}
                title="No assets match these filters"
                body="Try a different search, or clear the filters to see the whole register."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Boxes}
                title="No assets registered yet"
                body="Add an asset, or add a batch of identical items such as chairs or tablets."
                action={
                  <Button size="sm" icon={Plus} onClick={() => openForm(false)}>
                    Add asset
                  </Button>
                }
              />
            )
          }
          footer={
            items.length > 0 ? (
              <>
                <span className="is-num">
                  {start}–{end} of {total.toLocaleString('en-IN')} {noun}
                  {pages > 1 ? ` · page ${page} of ${pages}` : ''}
                </span>
                {pages > 1 ? (
                  <span className="aa-pager">
                    <Button size="sm" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" disabled={loading || page >= pages} onClick={() => void load(page + 1)}>
                      Next
                    </Button>
                  </span>
                ) : null}
              </>
            ) : null
          }
        />
      </Card>

      <Sheet
        open={showForm}
        onClose={closeForm}
        icon={bulkMode ? Layers : Package}
        size="lg"
        title={bulkMode ? 'Add a batch of assets' : 'Add asset'}
        description={
          bulkMode
            ? 'Creates identical assets in one go, each with its own asset ID.'
            : 'Registers one asset. You can allocate, transfer or service it from its profile.'
        }
        onSubmit={handleSave}
        footer={
          <>
            <Button onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {bulkMode ? `Create ${Number(form.quantity || 1)} ${Number(form.quantity || 1) === 1 ? 'asset' : 'assets'}` : 'Add asset'}
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">What it is</h3>
          <div className="cb-form-grid">
            <TextField
              label="Name"
              required
              className="is-wide"
              value={form.name}
              error={errors.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Dell OptiPlex 7090"
            />
            <Select
              label="Category"
              required
              value={form.categoryId}
              error={errors.categoryId}
              onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value, subcategoryId: '' }))}
              placeholder="Choose a category"
              options={categoryOptions}
            />
            <Select
              label="Subcategory"
              value={form.subcategoryId}
              onChange={(e) => set('subcategoryId', e.target.value)}
              placeholder={form.categoryId ? (subcategories.length ? 'None' : 'No subcategories') : 'Choose a category first'}
              disabled={!form.categoryId || subcategories.length === 0}
              options={subcategories.map((c) => ({ value: String(c._id), label: c.name }))}
            />
            <TextField label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            <TextField label="Model" value={form.model} onChange={(e) => set('model', e.target.value)} />
            {bulkMode ? (
              <TextField
                label="Quantity"
                type="number"
                min={1}
                max={500}
                value={form.quantity}
                hint="Up to 500 in one batch."
                onChange={(e) => set('quantity', Number(e.target.value))}
              />
            ) : (
              <TextField
                label="Serial number"
                value={form.serialNumber}
                onChange={(e) => set('serialNumber', e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Where it is</h3>
          <div className="cb-form-grid">
            <Select
              label="Location"
              className="is-wide"
              value={form.locationId}
              onChange={(e) => set('locationId', e.target.value)}
              placeholder="Not placed yet"
              options={locationOptions}
            />
            <TextField
              label="Custodian"
              value={form.custodianName}
              onChange={(e) => set('custodianName', e.target.value)}
              placeholder="Person responsible"
            />
            <TextField label="Department" value={form.department} onChange={(e) => set('department', e.target.value)} />
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Purchase and state</h3>
          <div className="cb-form-grid">
            <Select
              label="Vendor"
              className="is-wide"
              value={form.vendorId}
              onChange={(e) => set('vendorId', e.target.value)}
              placeholder="No vendor"
              options={vendorOptions}
            />
            <TextField
              label={bulkMode ? 'Purchase cost (each)' : 'Purchase cost'}
              type="number"
              min={0}
              prefix="₹"
              value={form.purchaseCost}
              onChange={(e) => set('purchaseCost', Number(e.target.value))}
            />
            <TextField
              label="Purchase date"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => set('purchaseDate', e.target.value)}
            />
            <Select
              label="Condition"
              value={form.condition}
              onChange={(e) => set('condition', e.target.value)}
              options={conditionOptions}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              options={statusOptions.filter((s) => s.value !== 'DISPOSED')}
            />
          </div>
        </div>
      </Sheet>
    </Page>
  )
}

export default AsetsAssets
