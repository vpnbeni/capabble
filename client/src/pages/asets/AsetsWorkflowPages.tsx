import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { DISPOSAL_REASONS, MAINTENANCE_STATUSES, formatDate, formatMoney } from '@/constants/asetsConstants'
import {
  AsetsCard,
  AsetsEmpty,
  AsetsPageShell,
  AsetsStatusBadge,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '@/components/asets/AsetsUi'

const useLookups = () => {
  const [assets, setAssets] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    void Promise.all([
      asetsService.listAssets({ limit: 200 }),
      asetsService.listLocations(),
      asetsService.listVendors(),
      asetsService.listCategories(),
    ]).then(([assetData, locs, vends, cats]) => {
      setAssets(assetData.items || [])
      setLocations(locs)
      setVendors(vends)
      setCategories(cats)
    }).catch((error: any) => toast.error(error?.response?.data?.message || 'Failed to load lookups.'))
  }, [])

  return { assets, locations, vendors, categories }
}

export const AsetsAllocations: React.FC = () => {
  const { assets, locations } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ assetId: '', toLocationId: '', newCustodianName: '', reason: '', approvedBy: '' })

  const load = async () => {
    const data = await asetsService.listAllocations({ limit: 100 })
    setItems(data.items || [])
  }

  useEffect(() => { void load().catch(() => toast.error('Failed to load allocations.')) }, [])

  return (
    <AsetsPageShell title="Allocations" subtitle="Assign assets to classrooms, labs, offices, or custodians with full history.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.createAllocation(form)
              toast.success('Asset allocated.')
              setForm({ assetId: '', toLocationId: '', newCustodianName: '', reason: '', approvedBy: '' })
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Allocation failed.')
            }
          }}>
            <select title="Asset" className={inputClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">Select asset</option>
              {assets.map((a) => <option key={a._id} value={a._id}>{a.assetId} — {a.name}</option>)}
            </select>
            <select title="Location" className={inputClass} value={form.toLocationId} onChange={(e) => setForm({ ...form, toLocationId: e.target.value })} required>
              <option value="">To location</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.path || l.name}</option>)}
            </select>
            <input className={inputClass} placeholder="New custodian" value={form.newCustodianName} onChange={(e) => setForm({ ...form, newCustodianName: e.target.value })} />
            <input className={inputClass} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <input className={inputClass} placeholder="Approved by" value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} />
            <button type="submit" className={btnPrimary}>Allocate</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 flex items-start justify-between rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="text-sm">
                <div className="font-semibold">{row.assetId?.assetId} — {row.assetId?.name}</div>
                <div className="text-xs text-slate-500">{row.toLocationId?.name} · {row.status} · {formatDate(row.allocationDate)}</div>
              </div>
              {row.status === 'Active' ? (
                <button type="button" className={btnSecondary} onClick={async () => {
                  await asetsService.returnAllocation(row._id)
                  toast.success('Returned.')
                  await load()
                }}>Return</button>
              ) : null}
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No allocations yet." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsTransfers: React.FC = () => {
  const { assets, locations } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ assetId: '', destinationLocationId: '', reason: '', approvedBy: '', requestedBy: '' })
  const load = async () => {
    const data = await asetsService.listTransfers({ limit: 100 })
    setItems(data.items || [])
  }
  useEffect(() => { void load().catch(() => toast.error('Failed to load transfers.')) }, [])

  return (
    <AsetsPageShell title="Transfers" subtitle="Move assets between locations with immutable history events.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.createTransfer(form)
              toast.success('Transfer recorded.')
              setForm({ assetId: '', destinationLocationId: '', reason: '', approvedBy: '', requestedBy: '' })
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Transfer failed.')
            }
          }}>
            <select title="Asset" className={inputClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">Select asset</option>
              {assets.map((a) => <option key={a._id} value={a._id}>{a.assetId} — {a.name}</option>)}
            </select>
            <select title="Destination" className={inputClass} value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} required>
              <option value="">Destination</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.path || l.name}</option>)}
            </select>
            <input className={inputClass} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <input className={inputClass} placeholder="Requested by" value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })} />
            <input className={inputClass} placeholder="Approved by" value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} />
            <button type="submit" className={btnPrimary}>Transfer</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 flex items-start justify-between rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="text-sm">
                <div className="font-semibold">{row.assetId?.assetId}</div>
                <div className="text-xs text-slate-500">
                  {row.sourceLocationId?.name || '—'} → {row.destinationLocationId?.name || '—'} · {row.status}
                </div>
              </div>
              {row.status === 'Pending' ? (
                <button type="button" className={btnPrimary} onClick={async () => {
                  await asetsService.completeTransfer(row._id, { approvedBy: 'admin' })
                  toast.success('Transfer completed.')
                  await load()
                }}>Approve</button>
              ) : null}
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No transfers yet." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsMaintenance: React.FC = () => {
  const { assets, vendors } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ assetId: '', issue: '', priority: 'Medium', assignedTo: '', vendorId: '' })
  const load = async () => {
    const data = await asetsService.listMaintenance({ limit: 100 })
    setItems(data.items || [])
  }
  useEffect(() => { void load().catch(() => toast.error('Failed to load maintenance.')) }, [])

  return (
    <AsetsPageShell title="Maintenance" subtitle="Corrective and preventive maintenance with costs and warranty claims.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.createMaintenance(form)
              toast.success('Maintenance created.')
              setForm({ assetId: '', issue: '', priority: 'Medium', assignedTo: '', vendorId: '' })
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed.')
            }
          }}>
            <select title="Asset" className={inputClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">Select asset</option>
              {assets.map((a) => <option key={a._id} value={a._id}>{a.assetId} — {a.name}</option>)}
            </select>
            <textarea className={inputClass} placeholder="Issue" value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} required />
            <select title="Priority" className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['Low', 'Medium', 'High', 'Critical'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={inputClass} placeholder="Assigned technician / vendor" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} />
            <select title="Vendor" className={inputClass} value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Vendor (optional)</option>
              {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
            <button type="submit" className={btnPrimary}>Report issue</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{row.assetId?.assetId} — {row.issue}</div>
                  <div className="text-xs text-slate-500">{row.priority} · {formatDate(row.reportedDate)}</div>
                </div>
                <select
                  title="Status"
                  className={inputClass}
                  value={row.status}
                  onChange={async (e) => {
                    await asetsService.updateMaintenance(row._id, { status: e.target.value, completionDate: ['Completed', 'Closed'].includes(e.target.value) ? new Date().toISOString() : undefined })
                    toast.success('Updated.')
                    await load()
                  }}
                >
                  {MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No maintenance records." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsStock: React.FC = () => {
  const { locations } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', sku: '', unit: 'pcs', quantityOnHand: 0, reorderLevel: 0, locationId: '', categoryId: '', vendorId: '' })
  const load = async () => setItems(await asetsService.listStock())
  useEffect(() => { void load().catch(() => toast.error('Failed to load stock.')) }, [])

  return (
    <AsetsPageShell title="Stock / Store" subtitle="Quantity-based consumables. Individually tracked assets remain in All Assets.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.saveStock({ ...form, openingStock: form.quantityOnHand })
              toast.success('Stock item saved.')
              setForm({ name: '', sku: '', unit: 'pcs', quantityOnHand: 0, reorderLevel: 0, locationId: '', categoryId: '', vendorId: '' })
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed.')
            }
          }}>
            <input className={inputClass} placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className={inputClass} placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <input className={inputClass} placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Opening qty" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: Number(e.target.value) })} />
            <input type="number" className={inputClass} placeholder="Reorder level" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
            <select title="Location" className={inputClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">Location</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
            <button type="submit" className={btnPrimary}>Add stock item</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{row.name}</div>
                  <div className="text-xs text-slate-500">
                    On hand {row.quantityOnHand} {row.unit} · reserved {row.reservedQuantity || 0} · reorder {row.reorderLevel}
                    {row.quantityOnHand <= row.reorderLevel ? ' · LOW STOCK' : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnSecondary} onClick={async () => {
                    await asetsService.adjustStock(row._id, { type: 'receipt', quantity: 1 })
                    await load()
                  }}>+1</button>
                  <button type="button" className={btnSecondary} onClick={async () => {
                    try {
                      await asetsService.adjustStock(row._id, { type: 'issue', quantity: 1 })
                      await load()
                    } catch (error: any) {
                      toast.error(error?.response?.data?.message || 'Issue failed.')
                    }
                  }}>-1</button>
                </div>
              </div>
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No consumable stock items." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsAudits: React.FC = () => {
  const { locations, categories } = useLookups()
  const [audits, setAudits] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [scanCode, setScanCode] = useState('')
  const [form, setForm] = useState({ title: '', scopeType: 'Full', locationId: '', categoryId: '' })

  const load = async () => setAudits(await asetsService.listAudits())
  const openAudit = async (id: string) => setSelected(await asetsService.getAudit(id))

  useEffect(() => { void load().catch(() => toast.error('Failed to load audits.')) }, [])

  return (
    <AsetsPageShell title="Audits" subtitle="Physical verification with expected vs found vs missing reporting.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              const res = await asetsService.createAudit(form)
              toast.success('Audit started.')
              await load()
              await openAudit(res.data.data._id)
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed.')
            }
          }}>
            <input className={inputClass} placeholder="Audit title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select title="Scope" className={inputClass} value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value })}>
              {['Full', 'Campus', 'Building', 'Department', 'Classroom', 'Category', 'Custom'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select title="Location" className={inputClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">All locations</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
            <select title="Category" className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">All categories</option>
              {categories.filter((c) => !c.parentId).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <button type="submit" className={btnPrimary}>Start audit</button>
          </form>
          <div className="mt-6 space-y-2">
            {audits.map((audit) => (
              <button key={audit._id} type="button" className="w-full rounded-xl border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900/40" onClick={() => void openAudit(audit._id)}>
                <div className="font-semibold">{audit.title}</div>
                <div className="text-xs text-slate-500">{audit.status} · expected {audit.summary?.expected || 0}</div>
              </button>
            ))}
          </div>
        </AsetsCard>
        <AsetsCard>
          {!selected ? <AsetsEmpty message="Select or start an audit." /> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selected.audit.title}</h3>
                  <div className="text-xs text-slate-500">
                    Found {selected.audit.summary?.found} · Missing {selected.audit.summary?.missing} · Damaged {selected.audit.summary?.damaged} · Wrong location {selected.audit.summary?.wrongLocation} · Unverified {selected.audit.summary?.unverified}
                  </div>
                </div>
                {selected.audit.status !== 'Closed' ? (
                  <button type="button" className={btnPrimary} onClick={async () => {
                    await asetsService.closeAudit(selected.audit._id)
                    toast.success('Audit closed.')
                    await load()
                    await openAudit(selected.audit._id)
                  }}>Close audit</button>
                ) : null}
              </div>
              {selected.audit.status !== 'Closed' ? (
                <form className="flex gap-2" onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    await asetsService.scanAudit(selected.audit._id, { code: scanCode })
                    toast.success('Scan recorded.')
                    setScanCode('')
                    await openAudit(selected.audit._id)
                  } catch (error: any) {
                    toast.error(error?.response?.data?.message || 'Scan failed.')
                  }
                }}>
                  <input className={inputClass} placeholder="Scan asset ID / barcode / QR payload" value={scanCode} onChange={(e) => setScanCode(e.target.value)} />
                  <button type="submit" className={btnPrimary}>Scan</button>
                </form>
              ) : null}
              <div className="max-h-[480px] space-y-2 overflow-y-auto">
                {(selected.items || []).map((item: any) => (
                  <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-700">
                    <div>
                      <div className="font-medium">{item.assetId?.assetId} — {item.assetId?.name}</div>
                      <div className="text-xs text-slate-500">{item.expectedLocationId?.name || 'No expected location'}</div>
                    </div>
                    <select
                      title="State"
                      className={inputClass}
                      value={item.state}
                      disabled={selected.audit.status === 'Closed'}
                      onChange={async (e) => {
                        await asetsService.updateAuditItem(selected.audit._id, item._id, { state: e.target.value })
                        await openAudit(selected.audit._id)
                      }}
                    >
                      {['Verified', 'Missing', 'Damaged', 'Wrong Location', 'Not Found', 'Unverified'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsProcurement: React.FC = () => {
  const { vendors, categories, locations } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '', itemName: '', vendorId: '', categoryId: '', locationId: '', quantity: 1, unitCost: 0, trackingMode: 'individual', generateAssets: true, purchaseOrder: '',
  })
  const load = async () => setItems(await asetsService.listProcurement())
  useEffect(() => { void load().catch(() => toast.error('Failed to load procurement.')) }, [])

  return (
    <AsetsPageShell title="Procurement" subtitle="Capture acquisition details and generate assets or stock on receipt.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.createProcurement(form)
              toast.success('Procurement saved.')
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed.')
            }
          }}>
            <input className={inputClass} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <input className={inputClass} placeholder="Item name" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
            <select title="Vendor" className={inputClass} value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Vendor</option>
              {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
            <select title="Category" className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Category</option>
              {categories.filter((c) => !c.parentId).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select title="Location" className={inputClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">Receive into location</option>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
            <input type="number" className={inputClass} placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            <input type="number" className={inputClass} placeholder="Unit cost" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} />
            <select title="Tracking" className={inputClass} value={form.trackingMode} onChange={(e) => setForm({ ...form, trackingMode: e.target.value })}>
              <option value="individual">Individual assets</option>
              <option value="consumable">Consumable stock</option>
            </select>
            <button type="submit" className={btnPrimary}>Create request</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="text-sm">
                <div className="font-semibold">{row.title}</div>
                <div className="text-xs text-slate-500">{row.status} · qty {row.quantity} · {formatMoney(row.totalCost)}</div>
              </div>
              {row.status !== 'Received' ? (
                <button type="button" className={btnPrimary} onClick={async () => {
                  await asetsService.receiveProcurement(row._id)
                  toast.success('Received.')
                  await load()
                }}>Receive</button>
              ) : <AsetsStatusBadge status="RECEIVED" />}
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No procurement records." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsDisposals: React.FC = () => {
  const { assets } = useLookups()
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ assetId: '', reason: 'Beyond repair', method: 'Scrapped', residualValue: 0, approvedBy: '', notes: '' })
  const load = async () => setItems(await asetsService.listDisposals())
  useEffect(() => { void load().catch(() => toast.error('Failed to load disposals.')) }, [])

  return (
    <AsetsPageShell title="Disposal" subtitle="Formal disposal workflow. Historical records are retained.">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AsetsCard>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await asetsService.createDisposal(form)
              toast.success('Disposal submitted.')
              await load()
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed.')
            }
          }}>
            <select title="Asset" className={inputClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">Select asset</option>
              {assets.filter((a) => a.status !== 'DISPOSED').map((a) => <option key={a._id} value={a._id}>{a.assetId} — {a.name}</option>)}
            </select>
            <select title="Reason" className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {DISPOSAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input className={inputClass} placeholder="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Residual value" value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: Number(e.target.value) })} />
            <input className={inputClass} placeholder="Approved by (required to complete immediately)" value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} />
            <textarea className={inputClass} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button type="submit" className={btnPrimary}>Submit disposal</button>
          </form>
        </AsetsCard>
        <AsetsCard>
          {items.map((row) => (
            <div key={row._id} className="mb-3 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700">
              <div className="text-sm">
                <div className="font-semibold">{row.assetId?.assetId} — {row.reason}</div>
                <div className="text-xs text-slate-500">{row.status} · {formatDate(row.disposalDate)}</div>
              </div>
              {row.status === 'Pending' ? (
                <button type="button" className={btnPrimary} onClick={async () => {
                  await asetsService.approveDisposal(row._id, { approvedBy: 'admin' })
                  toast.success('Approved.')
                  await load()
                }}>Approve</button>
              ) : null}
            </div>
          ))}
          {!items.length ? <AsetsEmpty message="No disposal records." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export const AsetsReports: React.FC = () => {
  const reportTypes = [
    'register', 'by-category', 'by-location', 'by-department', 'by-custodian', 'valuation',
    'maintenance', 'warranty', 'transfers', 'audits', 'missing', 'damaged', 'disposal', 'procurement', 'stock', 'lifecycle',
  ]
  const [type, setType] = useState('register')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (reportType = type) => {
    setLoading(true)
    try {
      const data = await asetsService.getReport(reportType)
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load('register') }, [])

  return (
    <AsetsPageShell title="Reports" subtitle="Operational and valuation reports from live ASETS data.">
      <AsetsCard>
        <div className="flex flex-wrap gap-2">
          {reportTypes.map((reportType) => (
            <button
              key={reportType}
              type="button"
              className={type === reportType ? btnPrimary : btnSecondary}
              onClick={() => { setType(reportType); void load(reportType) }}
            >
              {reportType}
            </button>
          ))}
        </div>
      </AsetsCard>
      <AsetsCard className="!p-0 overflow-hidden">
        {loading ? <div className="p-8 text-sm text-slate-500">Loading report...</div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  {Object.keys(rows[0] || { info: '' }).slice(0, 8).map((key) => (
                    <th key={key} className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.slice(0, 200).map((row, index) => (
                  <tr key={row._id || index}>
                    {Object.keys(rows[0] || {}).slice(0, 8).map((key) => (
                      <td key={key} className="px-3 py-2">
                        {typeof row[key] === 'object' && row[key] !== null
                          ? (row[key].name || row[key].assetId || JSON.stringify(row[key]).slice(0, 80))
                          : String(row[key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <div className="p-8"><AsetsEmpty message="No rows for this report." /></div> : null}
          </div>
        )}
      </AsetsCard>
    </AsetsPageShell>
  )
}

export const AsetsSettings: React.FC = () => {
  const [form, setForm] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void asetsService.getSettings().then(setForm).catch(() => toast.error('Failed to load settings.'))
  }, [])

  if (!form) return <div className="p-6 text-sm text-slate-500">Loading settings...</div>

  return (
    <AsetsPageShell title="ASETS Settings" subtitle="Module defaults for IDs, alerts, approvals, and stock rules.">
      <AsetsCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Warranty alert days</label>
            <input type="number" className={inputClass} value={form.defaultWarrantyAlertDays || 30} onChange={(e) => setForm({ ...form, defaultWarrantyAlertDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Audit due days</label>
            <input type="number" className={inputClass} value={form.auditDueDays || 365} onChange={(e) => setForm({ ...form, auditDueDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Allow negative stock</label>
            <select title="Allow negative stock" className={inputClass} value={String(Boolean(form.allowNegativeStock))} onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.value === 'true' })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Require disposal approval</label>
            <select title="Disposal approval" className={inputClass} value={String(form.requireApprovalForDisposal !== false)} onChange={(e) => setForm({ ...form, requireApprovalForDisposal: e.target.value === 'true' })}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Require transfer approval</label>
            <select title="Transfer approval" className={inputClass} value={String(Boolean(form.requireApprovalForTransfer))} onChange={(e) => setForm({ ...form, requireApprovalForTransfer: e.target.value === 'true' })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className={`${btnPrimary} mt-4`}
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await asetsService.updateSettings(form)
              toast.success('Settings saved.')
            } catch (error: any) {
              toast.error(error?.response?.data?.message || 'Failed to save settings.')
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </AsetsCard>
    </AsetsPageShell>
  )
}
