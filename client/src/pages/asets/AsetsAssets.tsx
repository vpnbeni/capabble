import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { ASSET_CONDITIONS, ASSET_STATUSES, formatMoney } from '@/constants/asetsConstants'
import {
  AsetsCard,
  AsetsEmpty,
  AsetsPageShell,
  AsetsStatusBadge,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '@/components/asets/AsetsUi'

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

const AsetsAssets: React.FC = () => {
  const [items, setItems] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 })
  const [categories, setCategories] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [condition, setCondition] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const parentCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const subcategories = useMemo(
    () => categories.filter((c) => String(c.parentId || '') === String(form.categoryId)),
    [categories, form.categoryId]
  )

  const loadLookups = async () => {
    const [cats, locs, vends] = await Promise.all([
      asetsService.listCategories(),
      asetsService.listLocations(),
      asetsService.listVendors(),
    ])
    setCategories(cats)
    setLocations(locs)
    setVendors(vends)
  }

  const load = async (page = pagination.page) => {
    setLoading(true)
    try {
      const data = await asetsService.listAssets({
        page,
        limit: pagination.limit,
        q: q || undefined,
        status: status || undefined,
        condition: condition || undefined,
        categoryId: categoryId || undefined,
        locationId: locationId || undefined,
      })
      setItems(data.items || [])
      setPagination(data.pagination)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load assets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLookups()
    void load(1)
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name || !form.categoryId) {
      toast.error('Name and category are required.')
      return
    }
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

  return (
    <AsetsPageShell
      title="All Assets"
      subtitle="Search, filter, create, and open individual asset profiles."
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => { setBulkMode(true); setShowForm(true) }}>
            Batch create
          </button>
          <button type="button" className={btnPrimary} onClick={() => { setBulkMode(false); setShowForm(true) }}>
            New asset
          </button>
        </>
      }
    >
      <AsetsCard>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input className={inputClass} placeholder="Search ID, name, serial, barcode..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select title="Status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
          <select title="Condition" className={inputClass} value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">All conditions</option>
            {ASSET_CONDITIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select title="Category" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {parentCategories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          <select title="Location" className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((item) => <option key={item._id} value={item._id}>{item.path || item.name}</option>)}
          </select>
          <button type="button" className={btnPrimary} onClick={() => void load(1)}>Apply filters</button>
        </div>
      </AsetsCard>

      {showForm ? (
        <AsetsCard>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{bulkMode ? 'Batch create identical assets' : 'Create asset'}</h3>
          <form onSubmit={handleSave} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Name</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Category</label>
              <select title="Category" className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })} required>
                <option value="">Select category</option>
                {parentCategories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Subcategory</label>
              <select title="Subcategory" className={inputClass} value={form.subcategoryId} onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })}>
                <option value="">Optional</option>
                {subcategories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Location</label>
              <select title="Location" className={inputClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Select location</option>
                {locations.map((item) => <option key={item._id} value={item._id}>{item.path || item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Vendor</label>
              <select title="Vendor" className={inputClass} value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">Select vendor</option>
                {vendors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Brand</label>
              <input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Model</label>
              <input className={inputClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            {!bulkMode ? (
              <div>
                <label className="text-xs font-medium text-slate-600">Serial number</label>
                <input className={inputClass} value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-600">Quantity</label>
                <input type="number" min={1} max={500} className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-600">Purchase cost</label>
              <input type="number" className={inputClass} value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Purchase date</label>
              <input type="date" className={inputClass} value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Condition</label>
              <select title="Condition" className={inputClass} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                {ASSET_CONDITIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select title="Status" className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {ASSET_STATUSES.filter((s) => s !== 'DISPOSED').map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="xl:col-span-4 flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={btnSecondary} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </AsetsCard>
      ) : null}

      <AsetsCard className="!p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading assets...</div>
        ) : items.length === 0 ? (
          <div className="p-8"><AsetsEmpty message="No assets found. Create your first asset or run seed:asets." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Custodian</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((asset) => (
                  <tr key={asset._id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3">
                      <Link to={`/asets/assets/${asset._id}`} className="font-medium text-indigo-600 hover:underline">
                        {asset.name}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{asset.assetId}</div>
                    </td>
                    <td className="px-4 py-3">{asset.categoryId?.name || '—'}</td>
                    <td className="px-4 py-3">{asset.locationPath || asset.locationId?.name || '—'}</td>
                    <td className="px-4 py-3">{asset.custodianName || '—'}</td>
                    <td className="px-4 py-3">{asset.condition}</td>
                    <td className="px-4 py-3">{formatMoney(asset.currentValue)}</td>
                    <td className="px-4 py-3"><AsetsStatusBadge status={asset.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-700">
          <span className="text-slate-500">{pagination.total} assets</span>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} disabled={pagination.page <= 1} onClick={() => void load(pagination.page - 1)}>Previous</button>
            <button type="button" className={btnSecondary} disabled={pagination.page >= pagination.pages} onClick={() => void load(pagination.page + 1)}>Next</button>
          </div>
        </div>
      </AsetsCard>
    </AsetsPageShell>
  )
}

export default AsetsAssets
