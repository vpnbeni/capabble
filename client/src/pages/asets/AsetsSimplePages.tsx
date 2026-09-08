import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { AsetsCard, AsetsEmpty, AsetsPageShell, btnPrimary, btnSecondary, inputClass } from '@/components/asets/AsetsUi'

type SimplePageProps = {
  title: string
  subtitle: string
  list: () => Promise<any[]>
  save: (payload: any, id?: string) => Promise<unknown>
  remove?: (id: string) => Promise<unknown>
  fields: Array<{ key: string; label: string; type?: string; options?: string[] }>
  titleOf: (item: any) => string
  metaOf: (item: any) => string
}

const SimpleCrudPage: React.FC<SimplePageProps> = ({
  title, subtitle, list, save, remove, fields, titleOf, metaOf,
}) => {
  const empty = fields.reduce((acc, field) => {
    acc[field.key] = field.type === 'number' ? 0 : field.options?.[0] || ''
    return acc
  }, {} as Record<string, any>)
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await list())
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await save(form, editingId || undefined)
      toast.success(editingId ? 'Updated.' : 'Created.')
      setForm(empty)
      setEditingId('')
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AsetsPageShell title={title} subtitle={subtitle}>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form onSubmit={onSave} className="space-y-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-slate-600">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    title={field.label}
                    className={inputClass}
                    value={form[field.key] || ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  >
                    {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea className={inputClass} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
                ) : (
                  <input
                    type={field.type || 'text'}
                    className={inputClass}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({
                      ...form,
                      [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                    })}
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
              {editingId ? <button type="button" className={btnSecondary} onClick={() => { setEditingId(''); setForm(empty) }}>Cancel</button> : null}
            </div>
          </form>
        </AsetsCard>
        <AsetsCard>
          {loading ? <div className="text-sm text-slate-500">Loading...</div> : null}
          {!loading && items.length === 0 ? <AsetsEmpty message="No records yet." /> : null}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item._id} className="flex items-start justify-between rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{titleOf(item)}</div>
                  <div className="text-xs text-slate-500">{metaOf(item)}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnSecondary} onClick={() => {
                    setEditingId(item._id)
                    const next = { ...empty }
                    fields.forEach((field) => { next[field.key] = item[field.key] ?? next[field.key] })
                    setForm(next)
                  }}>Edit</button>
                  {remove ? (
                    <button type="button" className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={async () => {
                      await remove(item._id)
                      toast.success('Archived.')
                      await load()
                    }}>Archive</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsCategories: React.FC = () => {
  const [parents, setParents] = useState<any[]>([])
  useEffect(() => {
    void asetsService.listCategories().then((rows) => setParents(rows.filter((r) => !r.parentId)))
  }, [])
  return (
    <SimpleCrudPage
      title="Categories"
      subtitle="Hierarchical asset categories and subcategories."
      list={asetsService.listCategories}
      save={async (payload, id) => asetsService.saveCategory({ ...payload, parentId: payload.parentId || null }, id)}
      remove={asetsService.removeCategory}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'parentId', label: 'Parent category ID (optional)' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'trackingModeDefault', label: 'Default tracking', type: 'select', options: ['individual', 'consumable'] },
      ]}
      titleOf={(item) => `${item.name} (${item.code})`}
      metaOf={(item) => (item.parentId ? `Subcategory · parent ${item.parentId}` : `Root category · ${parents.length ? 'top-level' : ''}`)}
    />
  )
}

export const AsetsLocationsLegacy: React.FC = () => (
  <SimpleCrudPage
    title="Locations"
    subtitle="Hierarchical school locations — campus, building, floor, room, store."
    list={asetsService.listLocations}
    save={async (payload, id) => {
      const body = {
        ...payload,
        isStore: payload.isStore === true || payload.isStore === 'true',
        parentId: payload.parentId || null,
      }
      return asetsService.saveLocation(body, id)
    }}
    remove={asetsService.removeLocation}
    fields={[
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'type', label: 'Type', type: 'select', options: ['School', 'Campus', 'Building', 'Floor', 'Wing', 'Room', 'Classroom', 'Store', 'Lab', 'Office', 'Other'] },
      { key: 'parentId', label: 'Parent location ID (optional)' },
      { key: 'department', label: 'Department' },
      { key: 'isStore', label: 'Is store', type: 'select', options: ['false', 'true'] },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ]}
    titleOf={(item) => item.name}
    metaOf={(item) => `${item.type} · ${item.path || 'path pending'}${item.isStore ? ' · STORE' : ''}`}
  />
)

export const AsetsVendors: React.FC = () => (
  <SimpleCrudPage
    title="Vendors"
    subtitle="Suppliers and service providers for school assets."
    list={asetsService.listVendors}
    save={asetsService.saveVendor}
    remove={asetsService.removeVendor}
    fields={[
      { key: 'name', label: 'Vendor name' },
      { key: 'code', label: 'Vendor code' },
      { key: 'contactPerson', label: 'Contact person' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'productsServices', label: 'Products / services', type: 'textarea' },
    ]}
    titleOf={(item) => item.name}
    metaOf={(item) => [item.code, item.contactPerson, item.phone].filter(Boolean).join(' · ')}
  />
)

export default SimpleCrudPage
