import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useCapitalSettings, useFeeHeads, useInvalidateCpitl, useSaveFeeHead } from '@/hooks/useCpitl'
import cpitlService, { CapitalSettings, FeeFrequency, FeeHead } from '@/services/cpitlService'
import {
  CpitlCard,
  CpitlPageShell,
  FREQUENCY_LABELS,
  Field,
  btnGhost,
  btnPrimary,
  btnSecondary,
  errorMessage,
  inputClass,
  tableHead,
} from '@/components/cpitl/CpitlUi'

const CATEGORIES = ['academic', 'admission', 'transport', 'activity', 'examination', 'facility', 'misc']
const EMPTY_HEAD: Partial<FeeHead> = { name: '', code: '', category: 'academic', frequency: 'monthly', isOptional: false, isRefundable: false }

const FeeHeadModal: React.FC<{ head: Partial<FeeHead> | null; onClose: () => void }> = ({ head, onClose }) => {
  const [form, setForm] = useState<Partial<FeeHead>>(EMPTY_HEAD)
  const save = useSaveFeeHead()
  useEffect(() => setForm(head || EMPTY_HEAD), [head])

  const submit = async () => {
    if (!form.name?.trim() || !form.code?.trim()) {
      toast.error('Name and code are required.')
      return
    }
    try {
      await save.mutateAsync({ id: form._id, payload: form })
      toast.success('Fee head saved.')
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <Modal isOpen={Boolean(head)} onClose={onClose} title={form._id ? 'Edit fee head' : 'New fee head'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2">
          <input className={inputClass} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Code" hint="Short unique code, e.g. TUITION">
          <input
            className={`${inputClass} uppercase`}
            value={form.code || ''}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
          />
        </Field>
        <Field label="Category">
          <select className={`${inputClass} capitalize`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default frequency">
          <select className={inputClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as FeeFrequency })}>
            {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded" checked={Boolean(form.isOptional)} onChange={(e) => setForm({ ...form, isOptional: e.target.checked })} />
            Optional (opt-in per student)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded" checked={Boolean(form.isRefundable)} onChange={(e) => setForm({ ...form, isRefundable: e.target.checked })} />
            Refundable
          </label>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} disabled={save.isPending} onClick={submit}>
          Save
        </button>
      </div>
    </Modal>
  )
}

const CpitlSettings: React.FC = () => {
  const { data: heads = [] } = useFeeHeads()
  const { data: settings } = useCapitalSettings()
  const invalidate = useInvalidateCpitl()
  const [editing, setEditing] = useState<Partial<FeeHead> | null>(null)
  const [form, setForm] = useState<CapitalSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const removeHead = async (head: FeeHead) => {
    if (!window.confirm(`Remove fee head "${head.name}"?`)) return
    try {
      await cpitlService.deleteFeeHead(head._id)
      toast.success('Fee head removed.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const saveSettings = async () => {
    if (!form) return
    setSaving(true)
    try {
      await cpitlService.updateSettings(form)
      toast.success('Settings saved.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const updatePreset = (i: number, patch: Partial<CapitalSettings['concessionPresets'][number]>) =>
    form && setForm({ ...form, concessionPresets: form.concessionPresets.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) })

  return (
    <CpitlPageShell title="Fee Settings" subtitle="Fee heads, receipt numbering and concession presets">
      <CpitlCard
        title="Fee heads"
        actions={
          <button type="button" className={btnSecondary} onClick={() => setEditing({ ...EMPTY_HEAD })}>
            <Plus className="h-4 w-4" /> Add fee head
          </button>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-2.5">Name</th>
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Default frequency</th>
                <th className="px-3 py-2.5">Flags</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {heads.map((h) => (
                <tr key={h._id}>
                  <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{h.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{h.code}</td>
                  <td className="px-3 py-2.5 capitalize">{h.category}</td>
                  <td className="px-3 py-2.5">{FREQUENCY_LABELS[h.frequency]}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{[h.isOptional && 'Optional', h.isRefundable && 'Refundable'].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className={btnGhost} onClick={() => setEditing(h)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={`${btnGhost} text-rose-600`} onClick={() => removeHead(h)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CpitlCard>

      {form ? (
        <>
          <CpitlCard title="Receipts & fee slips">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Receipt prefix" hint={`Receipts look like ${form.receiptPrefix || 'RCPT'}/25-26/00001`}>
                <input className={inputClass} value={form.receiptPrefix} onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="GSTIN (optional)">
                <input className={inputClass} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Default due day for new structures">
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={inputClass}
                  value={form.defaultDueDay}
                  onChange={(e) => setForm({ ...form, defaultDueDay: Number(e.target.value) })}
                />
              </Field>
              <Field label="Bank details printed on fee slip" className="md:col-span-3">
                <input
                  className={inputClass}
                  value={form.bankDetails}
                  placeholder="e.g. SBI A/C 1234567890, IFSC SBIN0001234"
                  onChange={(e) => setForm({ ...form, bankDetails: e.target.value })}
                />
              </Field>
              <Field label="Footer note" className="md:col-span-3">
                <textarea className={inputClass} rows={2} value={form.slipFooterNote} onChange={(e) => setForm({ ...form, slipFooterNote: e.target.value })} />
              </Field>
            </div>
          </CpitlCard>

          <CpitlCard
            title="Concession presets"
            actions={
              <button
                type="button"
                className={btnGhost}
                onClick={() => setForm({ ...form, concessionPresets: [...form.concessionPresets, { name: '', type: 'percent', value: 0, feeHeadCode: '' }] })}
              >
                <Plus className="h-3.5 w-3.5" /> Add preset
              </button>
            }
          >
            <div className="space-y-2">
              {form.concessionPresets.map((p, i) => (
                <div key={p._id || i} className="grid grid-cols-12 items-end gap-2">
                  <Field label="Name" className="col-span-12 sm:col-span-4">
                    <input className={inputClass} value={p.name} onChange={(e) => updatePreset(i, { name: e.target.value })} />
                  </Field>
                  <Field label="Applies to" className="col-span-5 sm:col-span-3">
                    <select className={inputClass} value={p.feeHeadCode} onChange={(e) => updatePreset(i, { feeHeadCode: e.target.value })}>
                      <option value="">All fee heads</option>
                      {heads.map((h) => (
                        <option key={h._id} value={h.code}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Type" className="col-span-3 sm:col-span-2">
                    <select className={inputClass} value={p.type} onChange={(e) => updatePreset(i, { type: e.target.value as 'percent' | 'flat' })}>
                      <option value="percent">%</option>
                      <option value="flat">₹ flat</option>
                    </select>
                  </Field>
                  <Field label="Value" className="col-span-3 sm:col-span-2">
                    <input type="number" min={0} className={inputClass} value={p.value} onChange={(e) => updatePreset(i, { value: Number(e.target.value) })} />
                  </Field>
                  <div className="col-span-1 flex justify-end pb-2">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setForm({ ...form, concessionPresets: form.concessionPresets.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CpitlCard>

          <div className="flex justify-end">
            <button type="button" className={btnPrimary} disabled={saving} onClick={saveSettings}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </>
      ) : null}

      <FeeHeadModal head={editing} onClose={() => setEditing(null)} />
    </CpitlPageShell>
  )
}

export default CpitlSettings
