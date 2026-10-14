import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, Pencil, Plus, Shapes } from 'lucide-react'
import cpitlService, { ExpenseCategory } from '@/services/cpitlService'
import { Button, Dialog, EmptyState, Menu, Select, Sheet, TextField } from '@/components/ui'
import { CategoryIcon, ColorSwatches, IconPicker, catStyle } from './IconPicker'
import { errorMessage } from './CpitlUi'
import './expenses.css'

type Draft = Partial<ExpenseCategory>

/** Add, edit and archive expense categories in one kit Sheet: the list, or a form in its place. */
const CategoryManager: React.FC<{ isOpen: boolean; onClose: () => void; categories: ExpenseCategory[]; onChanged: () => void }> = ({
  isOpen,
  onClose,
  categories,
  onChanged,
}) => {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const [archiving, setArchiving] = useState<ExpenseCategory | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const parents = categories.filter((c) => !c.parentId)

  useEffect(() => {
    if (!isOpen) {
      setDraft(null)
      setArchiving(null)
    }
  }, [isOpen])

  const startDraft = (next: Draft) => {
    setTried(false)
    setDraft(next)
  }

  const save = async () => {
    if (!draft) return
    setTried(true)
    if (!draft.name?.trim()) {
      toast.error('Give the category a name.')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveExpenseCategory({ ...draft, name: draft.name.trim(), parentId: draft.parentId || null })
      toast.success('Category saved.')
      setDraft(null)
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!archiving) return
    setArchiveBusy(true)
    try {
      await cpitlService.archiveExpenseCategory(archiving._id)
      toast.success('Category archived.')
      setArchiving(null)
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setArchiveBusy(false)
    }
  }

  // While the confirm dialog is up, Escape/backdrop should close only the dialog.
  const closeSheet = () => {
    if (archiving) return
    onClose()
  }

  const set = (patch: Draft) => setDraft((prev) => ({ ...(prev || {}), ...patch }))
  const archivingHasChildren = archiving ? categories.some((x) => x.parentId === archiving._id) : false

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={closeSheet}
        title={draft ? (draft._id ? 'Edit category' : draft.parentId ? 'Add sub-category' : 'Add category') : 'Expense categories'}
        description={draft ? 'Pick a name, colour and icon. They show on every expense in this category.' : `${categories.length} active categor${categories.length === 1 ? 'y' : 'ies'}`}
        icon={Shapes}
        size="lg"
        onSubmit={
          draft
            ? (event) => {
                event.preventDefault()
                if (!saving) void save()
              }
            : undefined
        }
        footer={
          draft ? (
            <>
              <Button onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save category
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Done</Button>
              <Button variant="primary" icon={Plus} onClick={() => startDraft({ name: '', icon: 'shapes', color: '#6366f1', parentId: null })}>
                Add category
              </Button>
            </>
          )
        }
      >
        {draft ? (
          <>
            <div className="ce-catform__head">
              <CategoryIcon icon={draft.icon} color={draft.color} size="lg" />
              <div className="cb-form-grid">
                <TextField
                  label="Name"
                  required
                  autoFocus
                  value={draft.name || ''}
                  onChange={(e) => set({ name: e.target.value })}
                  error={tried && !draft.name?.trim() ? 'Give the category a name.' : undefined}
                />
                <Select
                  label="Sub-category of"
                  value={draft.parentId || ''}
                  onChange={(e) => set({ parentId: e.target.value || null })}
                  placeholder="None (top level)"
                  options={parents.filter((p) => p._id !== draft._id).map((p) => ({ value: p._id, label: p.name }))}
                />
              </div>
            </div>
            <fieldset className="ce-group">
              <legend className="ce-group__label">Colour</legend>
              <ColorSwatches value={draft.color || '#6366f1'} onChange={(color) => set({ color })} />
            </fieldset>
            <fieldset className="ce-group">
              <legend className="ce-group__label">Icon</legend>
              <IconPicker value={draft.icon || 'shapes'} color={draft.color} onChange={(icon) => set({ icon })} />
            </fieldset>
          </>
        ) : parents.length ? (
          <ul className="ce-catlist">
            {parents.map((p) => {
              const subs = categories.filter((c) => c.parentId === p._id)
              return (
                <li key={p._id}>
                  <div className="ce-catrow">
                    <CategoryIcon icon={p.icon} color={p.color} size="sm" />
                    <div className="ce-catrow__text">
                      <span className="ce-catrow__name">{p.name}</span>
                      {subs.length ? (
                        <span className="ce-catrow__meta">
                          {subs.length} sub-categor{subs.length === 1 ? 'y' : 'ies'}
                        </span>
                      ) : null}
                    </div>
                    <Menu
                      label={`Actions for ${p.name}`}
                      items={[
                        { label: 'Add sub-category', icon: Plus, onSelect: () => startDraft({ name: '', icon: p.icon, color: p.color, parentId: p._id }) },
                        { label: 'Edit category', icon: Pencil, onSelect: () => startDraft(p) },
                        { divider: true },
                        { label: 'Archive category', icon: Archive, tone: 'danger', onSelect: () => setArchiving(p) },
                      ]}
                    />
                  </div>
                  {subs.map((c) => (
                    <div key={c._id} className="ce-catrow ce-catrow--sub">
                      <span className="ce-chip-dot" style={catStyle(c.color)} aria-hidden="true" />
                      <div className="ce-catrow__text">
                        <span className="ce-catrow__name">{c.name}</span>
                      </div>
                      <Menu
                        label={`Actions for ${c.name}`}
                        items={[
                          { label: 'Edit sub-category', icon: Pencil, onSelect: () => startDraft(c) },
                          { divider: true },
                          { label: 'Archive sub-category', icon: Archive, tone: 'danger', onSelect: () => setArchiving(c) },
                        ]}
                      />
                    </div>
                  ))}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={Shapes} title="No expense categories yet" body="Add a category such as Stationery or Repairs, then record expenses against it." />
        )}
      </Sheet>

      <Dialog
        open={Boolean(archiving)}
        onClose={() => !archiveBusy && setArchiving(null)}
        tone="danger"
        size="sm"
        title={`Archive “${archiving?.name || ''}”?`}
        description={`${archivingHasChildren ? 'Its sub-categories are archived too. ' : ''}Past expenses keep this category; you can’t pick it for new ones.`}
        footer={
          <>
            <Button onClick={() => setArchiving(null)} disabled={archiveBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Archive} loading={archiveBusy} onClick={() => void archive()}>
              Archive category
            </Button>
          </>
        }
      />
    </>
  )
}

export default CategoryManager
