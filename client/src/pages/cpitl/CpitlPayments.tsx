import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Printer } from 'lucide-react'
import { useCpitlClasses, useFeePayments } from '@/hooks/useCpitl'
import cpitlService from '@/services/cpitlService'
import { CpitlBadge, CpitlCard, CpitlEmpty, CpitlPageShell, MODE_LABELS, btnGhost, errorMessage, fmtDate, inputClass, inr, tableHead } from '@/components/cpitl/CpitlUi'

const isoDaysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const CpitlPayments: React.FC = () => {
  const { data: classes = [] } = useCpitlClasses()
  const [filters, setFilters] = useState({ from: isoDaysAgo(0), to: isoDaysAgo(0), mode: '', class: '', status: '', q: '' })
  const { data, isLoading } = useFeePayments(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
  const items = data?.items || []
  const set = (patch: Partial<typeof filters>) => setFilters((prev) => ({ ...prev, ...patch }))

  const presets = [
    { label: 'Today', from: isoDaysAgo(0) },
    { label: '7 days', from: isoDaysAgo(6) },
    { label: '30 days', from: isoDaysAgo(29) },
  ]

  return (
    <CpitlPageShell title="Receipts" subtitle="Day book of all fee receipts">
      <CpitlCard>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ from: p.from, to: isoDaysAgo(0) })}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  filters.from === p.from && filters.to === isoDaysAgo(0)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                    : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className={`${inputClass} !mt-0 !w-[9.5rem] shrink-0`}
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              className={`${inputClass} !mt-0 !w-[9.5rem] shrink-0`}
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>

          <select
            className={`${inputClass} !mt-0 !w-auto shrink-0`}
            value={filters.mode}
            onChange={(e) => set({ mode: e.target.value })}
          >
            <option value="">All modes</option>
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} !mt-0 !w-auto shrink-0`}
            value={filters.class}
            onChange={(e) => set({ class: e.target.value })}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.class} value={c.class}>
                Class {c.class}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} !mt-0 !w-auto shrink-0`}
            value={filters.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="">Valid & cancelled</option>
            <option value="valid">Valid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <input
            className={`${inputClass} !mt-0 min-w-[12rem] flex-1 !w-auto`}
            placeholder="Receipt no. / student"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>

        <div className="mt-4 flex gap-6 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900/40">
          <div>
            <span className="text-slate-500">Receipts</span> <span className="ml-1 font-semibold tabular-nums">{data?.summary.count ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-500">Collected</span> <span className="ml-1 font-semibold tabular-nums">{inr(data?.summary.total, { decimals: true })}</span>
          </div>
        </div>

        <div className="-mx-5 mt-4 overflow-x-auto">
          {isLoading ? (
            <div className="mx-5 h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
          ) : items.length ? (
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-5 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Mode</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((p) => (
                  <tr key={p._id} className={p.status === 'cancelled' ? 'text-slate-400' : ''}>
                    <td className="px-5 py-2.5 font-mono text-xs">{p.receiptNo}</td>
                    <td className="px-3 py-2.5">{fmtDate(p.date)}</td>
                    <td className="px-3 py-2.5">
                      <Link to={`/cpitl/students/${p.student}`} className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white">
                        {p.studentSnapshot?.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {p.studentSnapshot?.class}
                        {p.studentSnapshot?.section ? `-${p.studentSnapshot.section}` : ''} · {p.studentSnapshot?.rollNumber}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {MODE_LABELS[p.mode]}
                      {p.reference ? <div className="text-xs text-slate-400">{p.reference}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(p.total, { decimals: true })}</td>
                    <td className="px-3 py-2.5">
                      <CpitlBadge status={p.status} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => cpitlService.openReceipt(p).catch(async (error) => toast.error(await errorMessage(error)))}
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mx-5">
              <CpitlEmpty message="No receipts for these filters." />
            </div>
          )}
        </div>
      </CpitlCard>
    </CpitlPageShell>
  )
}

export default CpitlPayments
