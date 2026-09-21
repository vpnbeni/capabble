import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { ASSET_CONDITIONS, ASSET_STATUSES, formatDate, formatMoney } from '@/constants/asetsConstants'
import {
  AsetsCard,
  AsetsEmpty,
  AsetsPageShell,
  AsetsQrPanel,
  AsetsStatusBadge,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '@/components/asets/AsetsUi'

const AsetsAssetDetail: React.FC = () => {
  const { id = '' } = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edit, setEdit] = useState({ condition: '', status: '', notes: '', custodianName: '', conditionReason: '', statusReason: '' })

  const load = async () => {
    setLoading(true)
    try {
      const result = await asetsService.getAsset(id)
      setData(result)
      setEdit({
        condition: result.asset.condition || '',
        status: result.asset.status || '',
        notes: result.asset.notes || '',
        custodianName: result.asset.custodianName || '',
        conditionReason: '',
        statusReason: '',
      })
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load asset.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) void load()
  }, [id])

  const save = async () => {
    setSaving(true)
    try {
      await asetsService.updateAsset(id, edit)
      toast.success('Asset updated.')
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading asset profile...</div>
  if (!data?.asset) {
    return (
      <AsetsPageShell title="Asset not found">
        <AsetsEmpty message="This asset does not exist or is unavailable." />
        <Link to="/asets/assets" className="text-sm font-semibold text-indigo-600">Back to assets</Link>
      </AsetsPageShell>
    )
  }

  const asset = data.asset

  return (
    <AsetsPageShell
      title={asset.name}
      subtitle={`${asset.assetId} · ${asset.categoryId?.name || 'Uncategorized'}`}
      actions={
        <>
          <Link to="/asets/assets" className={btnSecondary}>Back</Link>
          <button type="button" className={btnPrimary} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <AsetsCard>
            <div className="flex flex-wrap items-center gap-3">
              <AsetsStatusBadge status={asset.status} />
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                {asset.condition}
              </span>
              <span className="text-sm text-slate-500">{asset.locationPath || 'No location'}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Status</label>
                <select title="Status" className={inputClass} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Condition</label>
                <select title="Condition" className={inputClass} value={edit.condition} onChange={(e) => setEdit({ ...edit, condition: e.target.value })}>
                  {ASSET_CONDITIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Custodian</label>
                <input className={inputClass} value={edit.custodianName} onChange={(e) => setEdit({ ...edit, custodianName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Status reason</label>
                <input className={inputClass} value={edit.statusReason} onChange={(e) => setEdit({ ...edit, statusReason: e.target.value })} placeholder="Required for lifecycle audit" />
              </div>
            </div>
          </AsetsCard>

          <div className="grid gap-6 md:grid-cols-2">
            <AsetsCard>
              <h3 className="text-sm font-semibold">Overview</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Brand / Model</dt><dd>{asset.brand || '—'} / {asset.model || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Serial</dt><dd className="font-mono">{asset.serialNumber || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Department</dt><dd>{asset.department || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Ownership</dt><dd>{asset.ownershipType || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Funding</dt><dd>{asset.fundingSource || '—'}</dd></div>
              </dl>
            </AsetsCard>
            <AsetsCard>
              <h3 className="text-sm font-semibold">Financial</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Purchase cost</dt><dd>{formatMoney(asset.purchaseCost)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Current value</dt><dd>{formatMoney(asset.currentValue)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Purchase date</dt><dd>{formatDate(asset.purchaseDate)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Invoice</dt><dd>{asset.invoiceNumber || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">PO</dt><dd>{asset.purchaseOrder || '—'}</dd></div>
              </dl>
            </AsetsCard>
          </div>

          <AsetsCard>
            <h3 className="text-sm font-semibold">Warranty</h3>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              <div>Provider: {asset.warranty?.provider || '—'}</div>
              <div>Start: {formatDate(asset.warranty?.startDate)}</div>
              <div>End: {formatDate(asset.warranty?.endDate)}</div>
            </div>
          </AsetsCard>

          <AsetsCard>
            <h3 className="text-sm font-semibold">Lifecycle timeline</h3>
            <div className="mt-4 space-y-3">
              {(data.timeline || []).map((event: any) => (
                <div key={event._id} className="relative border-l-2 border-indigo-200 pl-4 dark:border-indigo-900">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{event.eventType}</div>
                  <div className="text-xs text-slate-500">{formatDate(event.occurredAt)} · {event.reason || '—'}</div>
                </div>
              ))}
              {!data.timeline?.length ? <AsetsEmpty message="No lifecycle events yet." /> : null}
            </div>
          </AsetsCard>

          <div className="grid gap-6 md:grid-cols-2">
            <AsetsCard>
              <h3 className="mb-3 text-sm font-semibold">Allocations</h3>
              {(data.allocations || []).map((row: any) => (
                <div key={row._id} className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  {row.toLocationId?.name || 'Location'} · {row.status} · {formatDate(row.allocationDate)}
                </div>
              ))}
              {!data.allocations?.length ? <AsetsEmpty message="No allocations." /> : null}
            </AsetsCard>
            <AsetsCard>
              <h3 className="mb-3 text-sm font-semibold">Maintenance</h3>
              {(data.maintenance || []).map((row: any) => (
                <div key={row._id} className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  {row.issue} · {row.status}
                </div>
              ))}
              {!data.maintenance?.length ? <AsetsEmpty message="No maintenance records." /> : null}
            </AsetsCard>
          </div>

          <AsetsCard>
            <h3 className="text-sm font-semibold">Notes</h3>
            <textarea className={`${inputClass} mt-2 min-h-[100px]`} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </AsetsCard>
        </div>

        <div className="space-y-4">
          <AsetsQrPanel assetId={asset.assetId} qrPayload={asset.qrPayload} />
          <AsetsCard>
            <h3 className="text-sm font-semibold">Quick links</h3>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link className="text-indigo-600 hover:underline" to="/asets/allocations">Allocate</Link>
              <Link className="text-indigo-600 hover:underline" to="/asets/transfers">Transfer</Link>
              <Link className="text-indigo-600 hover:underline" to="/asets/maintenance">Maintenance</Link>
              <Link className="text-indigo-600 hover:underline" to="/asets/disposals">Dispose</Link>
            </div>
          </AsetsCard>
        </div>
      </div>
    </AsetsPageShell>
  )
}

export default AsetsAssetDetail
