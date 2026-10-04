import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, Pencil, Plus } from 'lucide-react'
import Modal from '@/components/common/Modal'
import cpitlService, { ExpenseCategory } from '@/services/cpitlService'
import { CategoryIcon, ColorSwatches, IconPicker } from './IconPicker'
import { Field, btnGhost, btnPrimary, btnSecondary, errorMessage, inputClass } from './CpitlUi'

type Draft = Partial<ExpenseCategory>

const CategoryForm: React.FC<{ draft: Draft; parents: ExpenseCategory[]; onCancel: () => void; onSaved: () => void }> = ({ draft, parents, onCancel, onSaved }) => {
  const [form, setForm] = useState<Draft>(draft)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name?.trim()) {
      toast.error('Give the category a name.')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveExpenseCategory({ ...form, name: form.name.trim(), parentId: form.parentId || null })
      toast.success('Category saved.')
      onSaved()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={form.icon} color={form.color} size="lg" />
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} autoFocus value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Sub-category of">
            <select className={inputClass} value={form.parentId || ''} onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}>
              <option value="">— Top level —</option>
              {parents
                .filter((p) => p._id !== form._id)
                .map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Colour</span>
        <div className="mt-1.5">
          <ColorSwatches value={form.color || '#6366f1'} onChange={(color) => setForm({ ...form, color })} />
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Icon</span>
        <div className="mt-1.5">
          <IconPicker value={form.icon || 'shapes'} color={form.color} onChange={(icon) => setForm({ ...form, icon })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save category'}
        </button>
      </div>
    </div>
  )
}

const CategoryManager: React.FC<{ isOpen: boolean; onClose: () => void; categories: ExpenseCategory[]; onChanged: () => void }> = ({
  isOpen,
  onClose,
  categories,
  onChanged,
}) => {
  const [draft, setDraft] = useState<Draft | null>(null)
  const parents = categories.filter((c) => !c.parentId)

  const archive = async (c: ExpenseCategory) => {
    if (!window.confirm(`Archive "${c.name}"${categories.some((x) => x.parentId === c._id) ? ' and its sub-categories' : ''}? Past expenses keep it.`)) return
    try {
      await cpitlService.archiveExpenseCategory(c._id)
      toast.success('Category archived.')
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Expense categories" size="xl">
      <div className="space-y-4">
        {draft ? (
          <CategoryForm
            key={draft._id || 'new'}
            draft={draft}
            parents={parents}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              setDraft(null)
              onChanged()
            }}
          />
        ) : (
          <button type="button" className={btnSecondary} onClick={() => setDraft({ name: '', icon: 'shapes', color: '#6366f1', parentId: null })}>
            <Plus className="h-4 w-4" /> New category
          </button>
        )}
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {parents.map((p) => (
            <li key={p._id} className="py-2">
              <div className="flex items-center gap-3">
                <CategoryIcon icon={p.icon} color={p.color} size="sm" />
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                <button type="button" className={btnGhost} onClick={() => setDraft({ name: '', icon: p.icon, color: p.color, parentId: p._id })}>
                  <Plus className="h-3.5 w-3.5" /> Sub
                </button>
                <button type="button" className={btnGhost} aria-label={`Edit ${p.name}`} onClick={() => setDraft(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={`${btnGhost} text-rose-600`} aria-label={`Archive ${p.name}`} onClick={() => archive(p)}>
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
              {categories
                .filter((c) => c.parentId === p._id)
                .map((c) => (
                  <div key={c._id} className="ml-10 mt-1 flex items-center gap-3">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{c.name}</span>
                    <button type="button" className={btnGhost} aria-label={`Edit ${c.name}`} onClick={() => setDraft(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={`${btnGhost} text-rose-600`} aria-label={`Archive ${c.name}`} onClick={() => archive(c)}>
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

export default CategoryManager
