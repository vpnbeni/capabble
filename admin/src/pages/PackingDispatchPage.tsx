import { FormEvent, useEffect, useState } from 'react'
import { masterPackingDispatchApi } from '../services/platformApi'
import type { MasterPackingDispatch } from '../types/platform'

const defaultForm: MasterPackingDispatch = {
  packingClothColor: '',
  packingMarker: '',
  packingClothColorClass10: '',
  packingMarkerClass10: '',
  packingClothColorClass12: '',
  packingMarkerClass12: '',
  dispatchSlipToAddress: '',
  dispatchSlipFromAddress: '',
  dispatchSlipInsuredAmount: '1000',
}

export function PackingDispatchPage() {
  const [form, setForm] = useState<MasterPackingDispatch>(defaultForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const updateField = (key: keyof MasterPackingDispatch, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const loadSettings = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await masterPackingDispatchApi.get()
      setForm({
        ...defaultForm,
        ...data,
      })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load packing and dispatch settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const saved = await masterPackingDispatchApi.upsert(form)
      setForm({
        ...defaultForm,
        ...saved,
      })
      setSuccess('Packing and dispatch settings saved successfully')
      window.setTimeout(() => setSuccess(''), 2500)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save packing and dispatch settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="section-title" style={{ marginBottom: 6 }}>Packing and dispatch</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Configure shared exam-day packing colours and dispatch slip defaults for all tenants.
        </p>
      </div>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}

      <div className="card" style={{ display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="card-title" style={{ margin: 0 }}>Shared settings</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
              These values are fetched by tenant centre details, dashboards, and dispatch slip generation.
            </div>
          </div>
          <button type="submit" className="primary" disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="grid grid-2">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Overall Cloth Colour</label>
            <input
              type="text"
              placeholder="e.g. Blue"
              value={form.packingClothColor}
              onChange={(event) => updateField('packingClothColor', event.target.value)}
              disabled={loading || saving}
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Overall Ink / Marker</label>
            <input
              type="text"
              placeholder="e.g. Red"
              value={form.packingMarker}
              onChange={(event) => updateField('packingMarker', event.target.value)}
              disabled={loading || saving}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Class</th>
                <th>Colour of Cloth</th>
                <th>Colour of Ink</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Class X</td>
                <td>
                  <input
                    aria-label="Class X cloth colour"
                    type="text"
                    placeholder="e.g. Blue"
                    value={form.packingClothColorClass10}
                    onChange={(event) => updateField('packingClothColorClass10', event.target.value)}
                    disabled={loading || saving}
                  />
                </td>
                <td>
                  <input
                    aria-label="Class X ink colour"
                    type="text"
                    placeholder="e.g. Red"
                    value={form.packingMarkerClass10}
                    onChange={(event) => updateField('packingMarkerClass10', event.target.value)}
                    disabled={loading || saving}
                  />
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Class XII</td>
                <td>
                  <input
                    aria-label="Class XII cloth colour"
                    type="text"
                    placeholder="e.g. Pink"
                    value={form.packingClothColorClass12}
                    onChange={(event) => updateField('packingClothColorClass12', event.target.value)}
                    disabled={loading || saving}
                  />
                </td>
                <td>
                  <input
                    aria-label="Class XII ink colour"
                    type="text"
                    placeholder="e.g. Blue"
                    value={form.packingMarkerClass12}
                    onChange={(event) => updateField('packingMarkerClass12', event.target.value)}
                    disabled={loading || saving}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-2">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Default Insured Amount (Rs)</label>
            <input
              type="text"
              placeholder="e.g. 1000"
              value={form.dispatchSlipInsuredAmount}
              onChange={(event) => updateField('dispatchSlipInsuredAmount', event.target.value)}
              disabled={loading || saving}
            />
          </div>
          <div style={{ alignSelf: 'end', color: 'var(--text-secondary)', fontSize: 13 }}>
            Used as the default insured value in dispatch slip PDF generation.
          </div>
        </div>

        <div className="grid grid-2">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">To Address</label>
            <textarea
              placeholder="Enter multiline destination address"
              value={form.dispatchSlipToAddress}
              onChange={(event) => updateField('dispatchSlipToAddress', event.target.value)}
              disabled={loading || saving}
              style={{ minHeight: 140, resize: 'vertical' }}
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">From Address</label>
            <textarea
              placeholder="Enter multiline sender address"
              value={form.dispatchSlipFromAddress}
              onChange={(event) => updateField('dispatchSlipFromAddress', event.target.value)}
              disabled={loading || saving}
              style={{ minHeight: 140, resize: 'vertical' }}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
