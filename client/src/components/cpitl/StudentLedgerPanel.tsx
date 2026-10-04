import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, BadgePercent, ExternalLink, IndianRupee, Plus, Printer, Receipt, Trash2, XCircle } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useCapitalSettings, useFeeHeads, useFeeStructures, useInvalidateCpitl, useStudentAccount } from '@/hooks/useCpitl'
import cpitlService, { ConcessionRule, FeePayment, StudentAccount } from '@/services/cpitlService'
import CollectPaymentModal from './CollectPaymentModal'
import {
  CpitlBadge,
  CpitlCard,
  CpitlEmpty,
  Field,
  MODE_LABELS,
  btnGhost,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fmtDate,
  inputClass,
  inr,
  tableHead,
} from './CpitlUi'

const AccountSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; data: StudentAccount; onSaved: () => void }> = ({
  isOpen,
  onClose,
  data,
  onSaved,
}) => {
  const { data: heads = [] } = useFeeHeads()
  const { data: settings } = useCapitalSettings()
  const { data: structures = [] } = useFeeStructures()
  const [concessions, setConcessions] = useState<ConcessionRule[]>([])
  const [optional, setOptional] = useState<string[]>([])
  const [opening, setOpening] = useState(0)
  const [structureId, setStructureId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setConcessions(data.account?.concessions || [])
    setOptional((data.account?.optedOptionalHeads || []).map(String))
    setOpening(data.account?.openingBalance || 0)
    setStructureId(data.account?.structureId || '')
  }, [isOpen, data])

  const selectedStructure = structures.find((s) => s._id === structureId)
  const optionalHeads = (selectedStructure?.components || []).filter((c) => c.isOptional)
  const headByCode = useMemo(() => new Map(heads.map((h) => [h.code, h])), [heads])

  const addPreset = (presetName: string) => {
    const preset = settings?.concessionPresets.find((p) => p.name === presetName)
    if (!preset) return
    const head = preset.feeHeadCode ? headByCode.get(preset.feeHeadCode) : null
    setConcessions((prev) => [...prev, { name: preset.name, type: preset.type, value: preset.value, feeHead: head?._id || null, reason: '' }])
  }

  const update = (i: number, patch: Partial<ConcessionRule>) => setConcessions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const save = async () => {
    setSaving(true)
    try {
      const res = await cpitlService.updateStudentAccount(data.student._id, {
        concessions: concessions.map((c) => ({ ...c, feeHead: c.feeHead || null, value: Number(c.value) })),
        optedOptionalHeads: optional,
        openingBalance: Number(opening) || 0,
        structureId: structureId || null,
      })
      toast.success(res?.message || 'Fee account updated.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Fee account — ${data.student.name}`} size="xl">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Fee structure">
            <select className={inputClass} value={structureId} onChange={(e) => setStructureId(e.target.value)}>
              <option value="">— None —</option>
              {structures
                .filter((s) => s.status !== 'archived' || s._id === structureId)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} (v{s.version})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Previous session arrears (₹)" hint="Added as a 'Previous dues' installment">
            <input type="number" min={0} className={inputClass} value={opening} onChange={(e) => setOpening(Number(e.target.value))} />
          </Field>
        </div>

        {optionalHeads.length ? (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Optional services</h4>
            <div className="mt-2 flex flex-wrap gap-3">
              {optionalHeads.map((c) => (
                <label key={c.feeHead} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={optional.includes(String(c.feeHead))}
                    onChange={(e) =>
                      setOptional((prev) => (e.target.checked ? [...prev, String(c.feeHead)] : prev.filter((x) => x !== String(c.feeHead))))
                    }
                  />
                  {c.name} <span className="text-slate-400">{inr(c.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Concessions</h4>
            <div className="flex flex-wrap gap-1.5">
              {(settings?.concessionPresets || []).map((p) => (
                <button key={p.name} type="button" className={btnGhost} onClick={() => addPreset(p.name)}>
                  <Plus className="h-3 w-3" /> {p.name}
                </button>
              ))}
              <button
                type="button"
                className={btnGhost}
                onClick={() => setConcessions((prev) => [...prev, { name: 'Custom', type: 'percent', value: 0, feeHead: null, reason: '' }])}
              >
                <Plus className="h-3 w-3" /> Custom
              </button>
            </div>
          </div>
          {concessions.length ? (
            <div className="mt-3 space-y-2">
              {concessions.map((c, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <Field label="Name" className="col-span-6 md:col-span-2">
                    <input className={inputClass} value={c.name || ''} onChange={(e) => update(i, { name: e.target.value })} />
                  </Field>
                  <Field label="Applies to" className="col-span-6 md:col-span-3">
                    <select className={inputClass} value={c.feeHead || ''} onChange={(e) => update(i, { feeHead: e.target.value || null })}>
                      <option value="">All fee heads</option>
                      {heads.map((h) => (
                        <option key={h._id} value={h._id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Type" className="col-span-4 md:col-span-2">
                    <select className={inputClass} value={c.type} onChange={(e) => update(i, { type: e.target.value as ConcessionRule['type'] })}>
                      <option value="percent">Percent</option>
                      <option value="flat">Flat ₹ / installment</option>
                    </select>
                  </Field>
                  <Field label={c.type === 'percent' ? '%' : '₹'} className="col-span-3 md:col-span-1">
                    <input type="number" min={0} className={inputClass} value={c.value} onChange={(e) => update(i, { value: Number(e.target.value) })} />
                  </Field>
                  <Field label="Reason / approval" className="col-span-4 md:col-span-3">
                    <input className={inputClass} value={c.reason || ''} onChange={(e) => update(i, { reason: e.target.value })} />
                  </Field>
                  <div className="col-span-1 flex justify-end pb-1">
                    <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => setConcessions((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No concessions.</p>
          )}
        </div>

        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Saving recalculates unpaid installments only. Installments with payments are not changed.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save & recalculate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const StudentLedgerPanel: React.FC<{ studentId: string; showProfileLink?: boolean }> = ({ studentId, showProfileLink }) => {
  const { data, isLoading, isError } = useStudentAccount(studentId)
  const invalidate = useInvalidateCpitl()
  const [collectOpen, setCollectOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
  if (isError || !data) return <CpitlEmpty message="Could not load this student's fee account." />

  const { student, account, structure, demands, payments } = data
  const totals = account?.totals
  const overdue = demands.filter((d) => d.isOverdue && d.status !== 'waived').reduce((s, d) => s + d.balance, 0)
  const lateFeeDue = demands.reduce((s, d) => s + (d.lateFeeDue || 0), 0)

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      const res = (await fn()) as { message?: string } | undefined
      if (res?.message) toast.success(res.message)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const cancelReceipt = (payment: FeePayment) => {
    const reason = window.prompt(`Cancel receipt ${payment.receiptNo}? Enter a reason:`)
    if (!reason?.trim()) return
    act(`cancel-${payment._id}`, () => cpitlService.cancelPayment(payment._id, reason))
  }

  return (
    <div className="space-y-5">
      <CpitlCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{student.name}</h3>
              {showProfileLink ? (
                <Link to={`/cpitl/students/${student._id}`} className="text-slate-400 hover:text-indigo-600" title="Open full ledger">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            <p className="text-sm text-slate-500">
              Class {student.class}
              {student.section ? `-${student.section}` : ''} · Roll {student.rollNumber} · {student.fatherName}
              {student.guardianPhone ? ` · ${student.guardianPhone}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {structure ? (
                <>
                  <Link to={`/cpitl/fee-structures/${structure._id}`} className="font-medium text-indigo-600 hover:underline">
                    {structure.name}
                  </Link>{' '}
                  v{account?.structureVersion}
                  {structure.isOutdated ? <span className="ml-1 text-amber-600">(structure updated to v{structure.version})</span> : null}
                </>
              ) : (
                'No fee structure assigned'
              )}
              {account?.concessions?.length ? ` · ${account.concessions.length} concession(s)` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setSettingsOpen(true)}>
              <BadgePercent className="h-4 w-4" /> Concessions & services
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy === 'slip' || !totals?.balance}
              onClick={() => act('slip', () => cpitlService.openStudentSlip(student._id))}
            >
              <Printer className="h-4 w-4" /> Fee slip
            </button>
            <button type="button" className={btnPrimary} disabled={!totals?.balance} onClick={() => setCollectOpen(true)}>
              <IndianRupee className="h-4 w-4" /> Collect
            </button>
          </div>
        </div>

        {totals ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Session fee', value: totals.demanded, hint: totals.concession > 0 ? `after ${inr(totals.concession)} concession` : undefined },
              { label: 'Paid', value: totals.paid, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Balance', value: totals.balance },
              { label: 'Overdue', value: overdue, tone: overdue > 0 ? 'text-rose-600 dark:text-rose-400' : '', hint: lateFeeDue > 0 ? `+ ${inr(lateFeeDue)} late fee` : undefined },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={`text-lg font-semibold tabular-nums text-slate-900 dark:text-white ${s.tone || ''}`}>{inr(s.value)}</p>
                {s.hint ? <p className="text-[11px] text-slate-400">{s.hint}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </CpitlCard>

      <CpitlCard title="Installments">
        {demands.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-5 py-2.5">Installment</th>
                  <th className="px-3 py-2.5">Due date</th>
                  <th className="px-3 py-2.5">Heads</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {demands.map((d) => (
                  <tr key={d._id} className={d.status === 'waived' ? 'opacity-50' : ''}>
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{d.label}</td>
                    <td className={`px-3 py-2.5 ${d.isOverdue ? 'text-rose-600' : ''}`}>{fmtDate(d.dueDate)}</td>
                    <td className="max-w-xs px-3 py-2.5 text-xs text-slate-500">
                      {d.lines.map((l) => `${l.name}${l.concession > 0 ? ` (−${inr(l.concession)})` : ''}`).join(', ')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(d.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{d.paid > 0 ? inr(d.paid) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {d.balance > 0 && d.status !== 'waived' ? inr(d.balance) : '—'}
                      {d.lateFeeDue > 0 ? <div className="text-[11px] text-rose-500">+{inr(d.lateFeeDue)} late</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <CpitlBadge status={d.isOverdue && d.status !== 'waived' ? 'overdue' : d.status} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {d.paid === 0 ? (
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy === `waive-${d._id}`}
                          onClick={() => act(`waive-${d._id}`, () => cpitlService.waiveDemand(d._id, d.status !== 'waived'))}
                        >
                          {d.status === 'waived' ? 'Restore' : 'Waive'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CpitlEmpty message={account ? 'No installments yet.' : 'This student has no fee account. Assign a fee structure from Fee Structures, or set one via “Concessions & services”.'} />
        )}
      </CpitlCard>

      <CpitlCard title="Payments">
        {payments.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {payments.map((p) => (
              <li key={p._id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                      p.status === 'cancelled' ? 'bg-rose-50 text-rose-500 dark:bg-rose-900/30' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                    }`}
                  >
                    {p.status === 'cancelled' ? <XCircle className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </span>
                  <div>
                    <div className={`font-semibold tabular-nums ${p.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                      {inr(p.total, { decimals: true })}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-500 no-underline">{p.receiptNo}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(p.date)} · {MODE_LABELS[p.mode]}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.collectedBy?.name ? ` · by ${p.collectedBy.name}` : ''}
                    </div>
                    <div className="text-xs text-slate-400">{[...new Set(p.allocations.map((a) => a.periodLabel))].join(', ')}</div>
                    {p.status === 'cancelled' ? (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-rose-600">
                        <AlertTriangle className="h-3 w-3" /> Cancelled: {p.cancellation?.reason}
                      </div>
                    ) : null}
                    {p.cheque?.status ? (
                      <div className="mt-1 flex items-center gap-1.5 text-xs">
                        <CpitlBadge status={p.cheque.status} label={`Cheque ${p.cheque.status}`} />
                        {p.cheque.status === 'pending' && p.status === 'valid' ? (
                          <>
                            <button type="button" className={btnGhost} onClick={() => act(`chq-${p._id}`, () => cpitlService.updateChequeStatus(p._id, 'cleared'))}>
                              Mark cleared
                            </button>
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => {
                                if (window.confirm('Mark as bounced? The receipt will be cancelled and dues restored.')) {
                                  act(`chq-${p._id}`, () => cpitlService.updateChequeStatus(p._id, 'bounced'))
                                }
                              }}
                            >
                              Bounced
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className={btnGhost} onClick={() => act(`rcpt-${p._id}`, () => cpitlService.openReceipt(p))}>
                    <Printer className="h-3.5 w-3.5" /> Receipt
                  </button>
                  {p.status === 'valid' ? (
                    <button type="button" className={`${btnGhost} text-rose-600`} disabled={busy === `cancel-${p._id}`} onClick={() => cancelReceipt(p)}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CpitlEmpty message="No payments yet." />
        )}
      </CpitlCard>

      <CollectPaymentModal isOpen={collectOpen} onClose={() => setCollectOpen(false)} data={data} onCollected={invalidate} />
      <AccountSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} data={data} onSaved={invalidate} />
    </div>
  )
}

export default StudentLedgerPanel
