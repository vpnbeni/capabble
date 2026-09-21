import React from 'react'
import { statusBadgeClass } from '@/constants/asetsConstants'

export const AsetsStatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadgeClass(status || '')}`}>
    {(status || '—').replace(/_/g, ' ')}
  </span>
)

export const AsetsPageShell: React.FC<{
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}> = ({ title, subtitle, actions, children }) => (
  <div className="space-y-6 p-6">
    {(title || actions) && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {title ? <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    )}
    {children}
  </div>
)

export const AsetsCard: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
    {children}
  </section>
)

export const AsetsEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
    {message}
  </div>
)

export const AsetsQrPanel: React.FC<{ assetId: string; qrPayload?: string }> = ({ assetId, qrPayload }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan-ready identity</div>
    <div className="mt-2 font-mono text-sm font-semibold text-slate-900 dark:text-white">{assetId}</div>
    <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
      <div className="text-center">
        <div className="mx-auto mb-2 grid h-16 w-16 grid-cols-4 gap-0.5">
          {Array.from({ length: 16 }).map((_, index) => (
            <div
              key={index}
              className={`rounded-[1px] ${[0, 1, 2, 4, 8, 10, 12, 13, 14].includes(index) ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-600'}`}
            />
          ))}
        </div>
        <div className="max-w-[180px] truncate font-mono text-[10px] text-slate-500">{qrPayload || `asets://asset/${assetId}`}</div>
      </div>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Barcode / QR payload resolves via ASETS lookup and audit scan APIs.</p>
  </div>
)

export const inputClass =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white'

export const btnPrimary =
  'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'

export const btnSecondary =
  'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
