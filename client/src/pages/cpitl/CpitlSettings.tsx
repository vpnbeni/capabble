import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Layers, Pencil, Plus, Save, Tag, Trash2 } from 'lucide-react'
import { useCapitalSettings, useFeeHeads, useInvalidateCpitl, useSaveFeeHead } from '@/hooks/useCpitl'
import cpitlService, { CapitalSettings, FeeFrequency, FeeHead } from '@/services/cpitlService'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Page,
  Select,
  Sheet,
  TextArea,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { FREQUENCY_LABELS, errorMessage } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/overview.css'

const CATEGORIES = ['academic', 'admission', 'transport', 'activity', 'examination', 'facility', 'misc']
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))
const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))
const EMPTY_HEAD: Partial<FeeHead> = { name: '', code: '', category: 'academic', frequency: 'monthly', isOptional: false, isRefundable: false }

const FeeHeadSheet: React.FC<{ head: Partial<FeeHead> | null; onClose: () => void }> = ({ head, onClose }) => {
  const [form, setForm] = useState<Partial<FeeHead>>(EMPTY_HEAD)
  const save = useSaveFeeHead()
  useEffect(() => setForm(head || EMPTY_HEAD), [head])

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
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
    <Sheet
      open={Boolean(head)}
      onClose={onClose}
      icon={Tag}
      title={form._id ? 'Edit fee head' : 'New fee head'}
      description="Fee heads are the line items used in fee structures and receipts."
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={save.isPending}>
            Save fee head
          </Button>
        </>
      }
    >
      <div className="cb-form-section">
        <div className="cb-form-grid">
          <TextField
            className="is-wide"
            label="Name"
            required
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Code"
            required
            hint="Short unique code, e.g. TUITION"
            value={form.code || ''}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
          />
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <Select
            className="is-wide"
            label="Default frequency"
            options={FREQUENCY_OPTIONS}
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value as FeeFrequency })}
          />
        </div>
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Options</h3>
        <div className="co-checks">
          <Checkbox
            label="Optional"
            description="Students opt in to this fee individually."
            checked={Boolean(form.isOptional)}
            onChange={(checked) => setForm({ ...form, isOptional: checked })}
          />
          <Checkbox
            label="Refundable"
            description="The amount can be returned, like a caution deposit."
            checked={Boolean(form.isRefundable)}
            onChange={(checked) => setForm({ ...form, isRefundable: checked })}
          />
        </div>
      </div>
    </Sheet>
  )
}

const CpitlSettings: React.FC = () => {
  const { data: heads = [], isLoading: headsLoading } = useFeeHeads()
  const { data: settings, isLoading: settingsLoading } = useCapitalSettings()
  const invalidate = useInvalidateCpitl()
  const [editing, setEditing] = useState<Partial<FeeHead> | null>(null)
  const [removing, setRemoving] = useState<FeeHead | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [form, setForm] = useState<CapitalSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const removeHead = async () => {
    if (!removing) return
    setRemoveBusy(true)
    try {
      await cpitlService.deleteFeeHead(removing._id)
      toast.success('Fee head removed.')
      invalidate()
      setRemoving(null)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setRemoveBusy(false)
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

  const headColumns: DataTableColumn<FeeHead>[] = [
    { key: 'name', header: 'Name', mobile: 'title', render: (h) => <span className="cb-strong">{h.name}</span> },
    { key: 'code', header: 'Code', mobile: 'subtitle', render: (h) => <span className="co-code">{h.code}</span> },
    { key: 'category', header: 'Category', render: (h) => <span style={{ textTransform: 'capitalize' }}>{h.category}</span> },
    { key: 'frequency', header: 'Default frequency', render: (h) => FREQUENCY_LABELS[h.frequency] || h.frequency },
    {
      key: 'flags',
      header: 'Options',
      render: (h) =>
        h.isOptional || h.isRefundable ? (
          <span className="co-flags">
            {h.isOptional ? <Badge tone="info">Optional</Badge> : null}
            {h.isRefundable ? <Badge tone="neutral">Refundable</Badge> : null}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      mobile: 'aside',
      render: (h) => (
        <span className="co-rowactions">
          <Button variant="tertiary" size="sm" icon={Pencil} aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)} />
          <Button variant="tertiary" size="sm" icon={Trash2} aria-label={`Remove ${h.name}`} onClick={() => setRemoving(h)} />
        </span>
      ),
    },
  ]

  const headOptions = [{ value: '', label: 'All fee heads' }, ...heads.map((h) => ({ value: h.code, label: h.name }))]
  const prefix = form?.receiptPrefix || 'RCPT'

  return (
    <Page>
      <Card
        title="Fee heads"
        subtitle="Line items such as tuition or transport, used in fee structures and receipts."
        flush
        action={
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing({ ...EMPTY_HEAD })}>
            Add fee head
          </Button>
        }
      >
        <DataTable
          columns={headColumns}
          rows={heads}
          getRowKey={(h) => h._id}
          onRowClick={(h) => setEditing(h)}
          loading={headsLoading}
          loadingLabel="Loading fee heads"
          caption="Fee heads"
          empty={
            <EmptyState
              compact
              icon={Layers}
              title="No fee heads yet"
              body="Add a fee head such as Tuition before building fee structures."
            />
          }
        />
      </Card>

      {form ? (
        <>
          <Card title="Receipts and fee slips" subtitle="How receipts are numbered and what prints on fee slips.">
            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Receipt numbering</h3>
              <div className="cb-form-grid cb-form-grid--3">
                <TextField
                  label="Receipt prefix"
                  hint={`Receipts look like ${prefix}/25-26/00001`}
                  value={form.receiptPrefix}
                  onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })}
                />
                <TextField
                  label="GSTIN"
                  hint="Optional. Printed on receipts."
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                />
                <TextField
                  label="Default due day"
                  hint="Day of the month (1–28) for new fee structures."
                  type="number"
                  min={1}
                  max={28}
                  value={form.defaultDueDay}
                  onChange={(e) => setForm({ ...form, defaultDueDay: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Fee slip</h3>
              <div className="cb-form-grid">
                <TextField
                  className="is-wide"
                  label="Bank details"
                  hint="Printed on every fee slip."
                  placeholder="e.g. SBI A/C 1234567890, IFSC SBIN0001234"
                  value={form.bankDetails}
                  onChange={(e) => setForm({ ...form, bankDetails: e.target.value })}
                />
                <TextArea
                  className="is-wide"
                  label="Footer note"
                  rows={2}
                  value={form.slipFooterNote}
                  onChange={(e) => setForm({ ...form, slipFooterNote: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <Card
            title="Concession presets"
            subtitle="Ready-made concessions you can apply when assigning fees to a student."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() =>
                  setForm({ ...form, concessionPresets: [...form.concessionPresets, { name: '', type: 'percent', value: 0, feeHeadCode: '' }] })
                }
              >
                Add preset
              </Button>
            }
          >
            {form.concessionPresets.length ? (
              <ul className="co-presets">
                {form.concessionPresets.map((p, i) => (
                  <li key={p._id || i} className="co-preset">
                    <TextField label="Name" value={p.name} onChange={(e) => updatePreset(i, { name: e.target.value })} />
                    <Select
                      label="Applies to"
                      options={headOptions}
                      value={p.feeHeadCode}
                      onChange={(e) => updatePreset(i, { feeHeadCode: e.target.value })}
                    />
                    <Select
                      label="Type"
                      options={[
                        { value: 'percent', label: '% of fee' },
                        { value: 'flat', label: '₹ flat' },
                      ]}
                      value={p.type}
                      onChange={(e) => updatePreset(i, { type: e.target.value as 'percent' | 'flat' })}
                    />
                    <TextField
                      label="Value"
                      type="number"
                      min={0}
                      value={p.value}
                      onChange={(e) => updatePreset(i, { value: Number(e.target.value) })}
                    />
                    <div className="co-preset__remove">
                      <Button
                        variant="tertiary"
                        icon={Trash2}
                        aria-label={`Remove preset ${p.name || i + 1}`}
                        onClick={() => setForm({ ...form, concessionPresets: form.concessionPresets.filter((_, idx) => idx !== i) })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Tag}
                title="No concession presets"
                body="Add a preset such as a sibling discount to apply it in one click."
              />
            )}
          </Card>

          <div className="co-savebar">
            <Button variant="primary" icon={Save} loading={saving} onClick={saveSettings}>
              Save settings
            </Button>
          </div>
        </>
      ) : settingsLoading ? (
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading settings
        </div>
      ) : null}

      <FeeHeadSheet head={editing} onClose={() => setEditing(null)} />

      <Dialog
        open={Boolean(removing)}
        onClose={() => (removeBusy ? undefined : setRemoving(null))}
        tone="danger"
        size="sm"
        title={`Remove fee head "${removing?.name || ''}"?`}
        description="It will no longer be offered for new fee structures. A fee head used in an active fee structure can't be removed until it is taken out of that structure."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={removeBusy} onClick={removeHead}>
              Remove fee head
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default CpitlSettings
