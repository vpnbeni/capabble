import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useLocation } from 'react-router-dom'
import asetsService from '@/services/asetsService'
import { AsetsCard, AsetsEmpty, AsetsPageShell, btnPrimary, btnSecondary, inputClass } from '@/components/asets/AsetsUi'

type Level = 'Block' | 'Floor' | 'Location'
const empty = { name: '', code: '', level: 'Block' as Level, parentId: '', department: '', locationType: 'Location', isStore: false, notes: '' }
const locationTypes = ['Location', 'Classroom', 'Lab', 'Office', 'Store', 'Room', 'Other']

const AsetsLocations: React.FC = () => {
  const routerLocation = useLocation()
  const [items, setItems] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<any>(empty)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const load = async () => { try { setItems(await asetsService.listLocations()) } catch { toast.error('Failed to load campus.') } }
  useEffect(() => { void load() }, [])
  const campuses = useMemo(() => items.filter((item) => item.type === 'Campus'), [items])
  const blocks = useMemo(() => items.filter((item) => item.type === 'Block'), [items])
  const floors = useMemo(() => items.filter((item) => item.type === 'Floor'), [items])
  const parentOptions = form.level === 'Block' ? campuses : form.level === 'Floor' ? blocks : form.level === 'Location' ? [...blocks, ...floors] : []
  const addLabel = 'Add to campus'
  const openForm = () => { setForm(empty); setShowForm(true) }
  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search)
    const level = params.get('add')
    if (['block', 'floor', 'location'].includes(level || '') && params.get('parent')) {
      setForm({ ...empty, level: `${level?.charAt(0).toUpperCase()}${level?.slice(1)}` as Level, parentId: params.get('parent') || '' })
      setShowForm(true)
    }
  }, [routerLocation.search])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    const type = form.level === 'Location' ? form.locationType : form.level
    try {
      await asetsService.saveLocation({ ...form, type, parentId: form.parentId || null })
      toast.success(`${form.level} created.`); setShowForm(false); await load()
    } catch (error: any) { toast.error(error?.response?.data?.message || 'Could not create campus item.') } finally { setSaving(false) }
  }
  const visible = items.filter((item) => `${item.name} ${item.code} ${item.path}`.toLowerCase().includes(query.toLowerCase()))
  const levelSummary: string = (['Campus', 'Block', 'Floor'] as string[])
    .map((level) => ({ level, count: visible.filter((item) => item.type === level).length }))
    .concat([{ level: 'Location', count: visible.filter((item) => !['Campus', 'Block', 'Floor'].includes(item.type)).length }])
    .filter((item) => item.count > 0)
    .map((item) => `${item.count} ${item.level}${item.count === 1 ? '' : 's'}`)
    .join(' · ')
  return <AsetsPageShell>
    <AsetsCard>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-base font-semibold text-slate-900 dark:text-white">{levelSummary || 'No campus items'}</div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><input className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-72 dark:border-slate-600 dark:bg-slate-700" placeholder="Search campus" value={query} onChange={(e) => setQuery(e.target.value)} /><button className={btnPrimary} onClick={openForm}>+ {addLabel}</button></div></div>
      <div className="mb-5 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">Your campus is provided by default. Add <b>Blocks</b>, then add <b>Floors</b> or direct <b>Locations</b> inside each block.</div>
      {!visible.length ? <AsetsEmpty message="Add your first block to begin setting up the campus." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map((item) => <Link key={item._id} to={`/asets/locations/${item._id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"><div className={`h-2 ${item.type === 'Campus' ? 'bg-indigo-700' : item.type === 'Block' ? 'bg-violet-500' : item.type === 'Floor' ? 'bg-sky-500' : item.isStore ? 'bg-amber-400' : 'bg-indigo-400'}`} /><div className="p-5"><div className="flex items-start justify-between gap-2"><span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{item.type}</span>{item.isStore ? <span className="text-xs font-semibold text-amber-600">STORE</span> : null}</div><div className="mt-5 text-lg font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.code || 'No code'}</div><div className="mt-4 min-h-10 text-sm text-slate-500">{item.path || 'Top-level campus item'}</div><div className="mt-5 border-t border-slate-100 pt-3 text-xs font-medium text-indigo-600 dark:border-slate-700">Open profile →</div></div></Link>)}</div>}
    </AsetsCard>
    {showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-lg font-semibold dark:text-white">Add to campus</h3><p className="text-sm text-slate-500">Create a block, floor, or location in the campus hierarchy.</p></div><button type="button" className="text-slate-500" onClick={() => setShowForm(false)}>✕</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Add<select className={inputClass} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level, parentId: '' })}>{(['Block', 'Floor', 'Location'] as Level[]).map((level) => <option key={level} value={level}>{level}</option>)}</select></label><label className="text-sm">Name<input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="text-sm">Code<input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label><label className="text-sm">{form.level === 'Block' ? 'Campus' : form.level === 'Floor' ? 'Block' : 'Block or floor'}<select required className={inputClass} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">Select {form.level === 'Block' ? 'campus' : form.level === 'Floor' ? 'block' : 'block or floor'}</option>{parentOptions.map((item) => <option key={item._id} value={item._id}>{item.path || item.name}</option>)}</select></label>{form.level === 'Location' ? <label className="text-sm">Location type<select className={inputClass} value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value })}>{locationTypes.map((type) => <option key={type}>{type}</option>)}</select></label> : null}<label className="text-sm">Department<input className={inputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>{form.level === 'Location' ? <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.isStore} onChange={(e) => setForm({ ...form, isStore: e.target.checked })} /> This is a store</label> : null}</div><label className="mt-4 block text-sm">Notes<textarea className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><div className="mt-6 flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={() => setShowForm(false)}>Cancel</button><button disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : `Create ${form.level}`}</button></div></form></div> : null}
  </AsetsPageShell>
}

export default AsetsLocations
