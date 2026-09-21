import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useParams } from 'react-router-dom'
import asetsService from '@/services/asetsService'
import { AsetsCard, AsetsEmpty, AsetsPageShell, AsetsStatusBadge, btnSecondary } from '@/components/asets/AsetsUi'
import { formatMoney } from '@/constants/asetsConstants'

const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-GB') : '—'

const AsetsLocationDetail: React.FC = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { void asetsService.getLocationOverview(id).then(setData).catch((error) => toast.error(error?.response?.data?.message || 'Failed to load location.')) }, [id])
  if (!data) return <div className="p-6 text-sm text-slate-500">Loading location profile...</div>
  const { location, assets, allocations, transfers, custodians, children = [], summary } = data
  const deleteLocation = async () => {
    const message = summary.assetCount || summary.childCount
      ? `This location currently has ${summary.assetCount} asset(s) and ${summary.childCount} sub-location(s). Archive it anyway?`
      : `Archive ${location.name}?`
    if (!window.confirm(message)) return
    setDeleting(true)
    try {
      await asetsService.removeLocation(id)
      toast.success('Location archived.')
      navigate('/asets/locations')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not archive location.')
    } finally { setDeleting(false) }
  }
  return <AsetsPageShell title={location.name} subtitle={location.path || location.type} actions={<><Link className={btnSecondary} to="/asets/locations">Back to locations</Link>{location.type === 'Campus' ? <Link className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700" to={`/asets/locations?add=block&parent=${location._id}`}>+ Add block</Link> : null}{location.type === 'Block' ? <><Link className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700" to={`/asets/locations?add=floor&parent=${location._id}`}>+ Add floor</Link><Link className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700" to={`/asets/locations?add=location&parent=${location._id}`}>+ Add location</Link></> : null}{location.type !== 'Campus' ? <button type="button" disabled={deleting} onClick={deleteLocation} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{deleting ? 'Deleting...' : 'Delete location'}</button> : null}</>}>
    <AsetsCard className="border-t-4 border-t-indigo-600">
      <div className="flex flex-col justify-between gap-5 lg:flex-row"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{location.type}</span>{location.isStore ? <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">STORE</span> : null}</div><div className="mt-4 text-sm text-slate-500">Code: {location.code || '—'} · Department: {location.department || '—'}</div>{location.notes ? <p className="mt-3 max-w-2xl text-sm text-slate-600">{location.notes}</p> : null}</div><div className="grid grid-cols-3 gap-3"><Metric label="Assets" value={summary.assetCount} /><Metric label="Value" value={formatMoney(summary.assetValue)} /><Metric label="Sub-locations" value={summary.childCount} /></div></div>
    </AsetsCard>
    {location.type === 'Campus' ? <AsetsCard><div className="flex items-center justify-between gap-3"><h3 className="font-semibold dark:text-white">Blocks in this campus</h3><Link className="text-sm font-semibold text-indigo-600" to={`/asets/locations?add=block&parent=${location._id}`}>+ Add block</Link></div>{!children.length ? <div className="mt-4"><AsetsEmpty message="No blocks have been added to this campus." /></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children.filter((child: any) => child.type === 'Block').map((child: any) => <Link key={child._id} to={`/asets/locations/${child._id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700"><div className="text-xs font-semibold uppercase tracking-wide text-violet-600">Block</div><div className="mt-2 font-semibold text-slate-900 dark:text-white">{child.name}</div><div className="mt-1 text-xs text-slate-500">{child.code || 'No code'}</div></Link>)}</div>}</AsetsCard> : null}
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="space-y-6"><AsetsCard><h3 className="font-semibold dark:text-white">Assets at this location</h3>{!assets.length ? <div className="mt-4"><AsetsEmpty message="No assets are currently assigned here." /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="pb-2">Asset</th><th className="pb-2">Category</th><th className="pb-2">Custodian</th><th className="pb-2">Status</th></tr></thead><tbody>{assets.map((asset: any) => <tr key={asset._id} className="border-b border-slate-100 last:border-0 dark:border-slate-700"><td className="py-3"><Link className="font-medium text-indigo-600" to={`/asets/assets/${asset._id}`}>{asset.name}</Link><div className="font-mono text-xs text-slate-500">{asset.assetId}</div></td><td className="py-3 text-slate-600">{asset.categoryId?.name || '—'}</td><td className="py-3 text-slate-600">{asset.custodianName || '—'}</td><td className="py-3"><AsetsStatusBadge status={asset.status} /></td></tr>)}</tbody></table></div>}</AsetsCard><Movement title="Transfer history" rows={transfers} transfer /></div><div className="space-y-6"><AsetsCard><h3 className="font-semibold dark:text-white">Custodians</h3>{custodians.length ? <div className="mt-3 flex flex-wrap gap-2">{custodians.map((name: string) => <span key={name} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100">{name}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">No custodian is assigned to assets here.</p>}</AsetsCard><Movement title="Allocation history" rows={allocations} /></div></div>
  </AsetsPageShell>
}

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => <div className="rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-900/40"><div className="text-lg font-semibold dark:text-white">{value}</div><div className="text-xs text-slate-500">{label}</div></div>
const Movement: React.FC<{ title: string; rows: any[]; transfer?: boolean }> = ({ title, rows, transfer }) => <AsetsCard><h3 className="font-semibold dark:text-white">{title}</h3>{!rows.length ? <p className="mt-3 text-sm text-slate-500">No {title.toLowerCase()} recorded.</p> : <div className="mt-3 space-y-3">{rows.slice(0, 8).map((row) => { const from = transfer ? row.sourceLocationId : row.fromLocationId; const to = transfer ? row.destinationLocationId : row.toLocationId; return <div key={row._id} className="border-b border-slate-100 pb-3 text-sm last:border-0 dark:border-slate-700"><div className="font-medium dark:text-white">{row.assetId?.name || 'Asset'} <span className="font-normal text-slate-400">· {date(row.transferDate || row.allocationDate)}</span></div><div className="mt-1 text-xs text-slate-500">{from?.name || 'Unassigned'} → {to?.name || 'Location'}</div></div> })}</div>}</AsetsCard>

export default AsetsLocationDetail
