import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { formatMoney } from '@/constants/asetsConstants'
import { AsetsCard, AsetsEmpty, AsetsPageShell, AsetsStatusBadge } from '@/components/asets/AsetsUi'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b']

const AsetsDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setData(await asetsService.getDashboard())
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load ASETS dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading asset dashboard...</div>
  }

  if (!data) {
    return (
      <AsetsPageShell title="ASETS Overview">
        <AsetsEmpty message="Unable to load dashboard data." />
      </AsetsPageShell>
    )
  }

  const kpis = [
    { label: 'Total Assets', value: data.kpis.totalAssets },
    { label: 'In Use', value: data.kpis.inUse },
    { label: 'In Stock', value: data.kpis.inStock },
    { label: 'Under Maintenance', value: data.kpis.underMaintenance },
    { label: 'Damaged', value: data.kpis.damaged },
    { label: 'Lost', value: data.kpis.lost },
    { label: 'Asset Value', value: formatMoney(data.kpis.assetValue) },
    { label: 'Due for Audit', value: data.kpis.assetsDueForAudit },
  ]

  const statusChart = Object.entries(data.byStatus || {}).map(([name, value]) => ({
    name: String(name).replace(/_/g, ' '),
    value,
  }))

  return (
    <AsetsPageShell
      title="Asset Overview"
      subtitle="Know what the school owns, where it is, who has it, and what needs attention."
      actions={
        <>
          <Link to="/asets/assets" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            All Assets
          </Link>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
            Refresh
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map((kpi) => (
          <AsetsCard key={kpi.label} className="!p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</div>
            <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{kpi.value}</div>
          </AsetsCard>
        ))}
      </div>

      {data.alerts?.length ? (
        <AsetsCard>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Alerts</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.alerts.map((alert: any) => (
              <div key={alert.type} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                {alert.message}
              </div>
            ))}
          </div>
        </AsetsCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <AsetsCard>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Lifecycle status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChart}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AsetsCard>

        <AsetsCard>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">By category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.byCategory || []} dataKey="count" nameKey="name" outerRadius={90} label>
                  {(data.byCategory || []).map((_: any, index: number) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </AsetsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">By location</h3>
          <div className="space-y-2">
            {(data.byLocation || []).slice(0, 8).map((row: any) => (
              <div key={String(row._id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/40">
                <span className="truncate text-slate-700 dark:text-slate-200">{row.name || row.path || 'Unassigned'}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{row.count}</span>
              </div>
            ))}
            {!data.byLocation?.length ? <AsetsEmpty message="No location distribution yet." /> : null}
          </div>
        </AsetsCard>

        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Condition overview</h3>
          <div className="space-y-2">
            {(data.byCondition || []).map((row: any) => (
              <div key={row._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/40">
                <span>{row._id}</span>
                <span className="font-semibold">{row.count}</span>
              </div>
            ))}
          </div>
        </AsetsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AsetsCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recently added</h3>
            <Link to="/asets/assets" className="text-xs font-semibold text-indigo-600">View all</Link>
          </div>
          <div className="space-y-2">
            {(data.recentlyAdded || []).map((asset: any) => (
              <Link key={asset._id} to={`/asets/assets/${asset._id}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900/40">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{asset.name}</div>
                  <div className="text-xs text-slate-500">{asset.assetId}</div>
                </div>
                <AsetsStatusBadge status={asset.status} />
              </Link>
            ))}
          </div>
        </AsetsCard>

        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Maintenance due</h3>
          <div className="space-y-2">
            {(data.maintenanceDue || []).map((row: any) => (
              <div key={row._id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-700">
                <div className="font-medium text-slate-900 dark:text-white">{row.assetId?.name || 'Asset'}</div>
                <div className="text-xs text-slate-500">{row.issue} · {row.status}</div>
              </div>
            ))}
            {!data.maintenanceDue?.length ? <AsetsEmpty message="No maintenance items need attention." /> : null}
          </div>
        </AsetsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold">Recent allocations</h3>
          {(data.recentAllocations || []).slice(0, 5).map((row: any) => (
            <div key={row._id} className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {row.assetId?.assetId} → {row.toLocationId?.name || 'Location'}
            </div>
          ))}
          {!data.recentAllocations?.length ? <AsetsEmpty message="No allocations yet." /> : null}
        </AsetsCard>
        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold">Warranty alerts</h3>
          {(data.warrantySoon || []).map((row: any) => (
            <div key={row._id} className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {row.assetId} · ends {new Date(row.warranty?.endDate).toLocaleDateString('en-GB')}
            </div>
          ))}
          {!data.warrantySoon?.length ? <AsetsEmpty message="No warranties expiring soon." /> : null}
        </AsetsCard>
        <AsetsCard>
          <h3 className="mb-3 text-sm font-semibold">Low stock</h3>
          {(data.lowStock || []).map((row: any) => (
            <div key={row._id} className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {row.name}: {row.quantityOnHand}/{row.reorderLevel}
            </div>
          ))}
          {!data.lowStock?.length ? <AsetsEmpty message="Stock levels look healthy." /> : null}
        </AsetsCard>
      </div>
    </AsetsPageShell>
  )
}

export default AsetsDashboard
