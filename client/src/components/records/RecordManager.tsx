import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

export type RecordField = {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'date' | 'number'
  options?: string[]
  required?: boolean
}

type RecordItem = Record<string, any> & { _id?: string }

export const RecordManager = ({
  fields,
  list,
  save,
  remove,
  cardTitle,
  cardMeta,
}: {
  fields: RecordField[]
  list: () => Promise<RecordItem[]>
  save: (payload: RecordItem, id?: string) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  cardTitle: (item: RecordItem) => string
  cardMeta: (item: RecordItem) => string
}) => {
  const empty = fields.reduce((acc, field) => {
    acc[field.key] = field.type === 'number' ? 0 : field.options?.[0] || ''
    return acc
  }, {} as RecordItem)

  const [records, setRecords] = useState<RecordItem[]>([])
  const [form, setForm] = useState<RecordItem>(empty)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setRecords(await list())
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load records.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await save(form, editingId || undefined)
      toast.success(editingId ? 'Record updated.' : 'Record saved.')
      setForm(empty)
      setEditingId('')
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save record.'))
    } finally {
      setSaving(false)
    }
  }

  const visible = records.filter((item) =>
    `${cardTitle(item)} ${cardMeta(item)}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form onSubmit={handleSave} className="rounded-[28px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{editingId ? 'Edit record' : 'New record'}</h3>
            <div className="mt-4 max-h-[68vh] space-y-3 overflow-auto pr-1">
              {fields.map((field) => (
                <label key={field.key} className="block text-sm">
                  <span className="mb-1 block text-slate-600">{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      required={field.required}
                      value={form[field.key] || ''}
                      onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                      rows={4}
                      className={inputClass}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={form[field.key] || ''}
                      onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                      className={inputClass}
                    >
                      {(field.options || []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type || 'text'}
                      required={field.required}
                      value={form[field.key] ?? ''}
                      onChange={(event) => setForm({ ...form, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value })}
                      className={inputClass}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
              {editingId ? (
                <button type="button" onClick={() => { setEditingId(''); setForm(empty) }} className="rounded-xl border border-slate-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              ) : null}
            </div>
          </form>
          <section className="rounded-[28px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{visible.length} records</h3>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="w-[200px] rounded-xl border border-slate-200 dark:border-gray-700 px-3 py-2 text-sm" />
            </div>
            {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
            <div className="space-y-3">
              {visible.map((item) => (
                <article key={item._id} className="rounded-2xl border border-slate-100 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-gray-100">{cardTitle(item)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{cardMeta(item)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditingId(String(item._id || '')); setForm({ ...empty, ...item }) }} className="text-xs font-semibold text-indigo-600">Edit</button>
                      <button type="button" onClick={async () => {
                        if (!item._id || !window.confirm('Remove this record?')) return
                        await remove(item._id)
                        toast.success('Record removed.')
                        await load()
                      }} className="text-xs font-semibold text-rose-600">Remove</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!loading && visible.length === 0 ? <p className="mt-6 text-sm text-slate-500">No records yet.</p> : null}
          </section>
        </div>
      </div>
    </div>
  )
}

const inputClass = 'w-full rounded-xl border border-slate-200 dark:border-gray-700 px-3 py-2 text-sm text-slate-900 dark:text-gray-100 outline-none focus:border-indigo-400'
