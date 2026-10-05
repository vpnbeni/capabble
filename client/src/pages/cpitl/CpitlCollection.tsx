import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useCpitlClasses, useFeeStudents } from '@/hooks/useCpitl'
import StudentLedgerPanel from '@/components/cpitl/StudentLedgerPanel'
import { CpitlCard, CpitlEmpty, CpitlPageShell, inputClass, inr } from '@/components/cpitl/CpitlUi'

const useDebounced = <T,>(value: T, delay = 300) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const CpitlCollection: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('')
  const [section, setSection] = useState('')
  const selected = params.get('student') || ''
  const debouncedQ = useDebounced(q)
  const { data: classes = [] } = useCpitlClasses()
  const searching = Boolean(debouncedQ.trim() || cls)
  const { data: students = [], isFetching } = useFeeStudents({ q: debouncedQ.trim() || undefined, class: cls || undefined, section: section || undefined }, searching)
  const sections = classes.find((c) => c.class === cls)?.sections || []

  const select = (id: string) => setParams(id ? { student: id } : {})

  return (
    <CpitlPageShell title="Fee Collection" subtitle="Find a student, review dues and record a payment">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 xl:col-span-3">
          <CpitlCard className="lg:sticky lg:top-4">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                className={`${inputClass} !mt-0 pl-9`}
                placeholder="Name, roll no., father, phone"
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                className={`${inputClass} mt-0`}
                value={cls}
                onChange={(e) => {
                  setCls(e.target.value)
                  setSection('')
                }}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.class} value={c.class}>
                    Class {c.class}
                  </option>
                ))}
              </select>
              <select className={`${inputClass} mt-0`} value={section} disabled={!cls} onChange={(e) => setSection(e.target.value)}>
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s.section} value={s.section}>
                    {s.section || '—'}
                  </option>
                ))}
              </select>
            </div>

            <div className="-mx-5 mt-4 max-h-[60vh] overflow-y-auto border-t border-slate-100 dark:border-slate-700">
              {!searching ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Search by name or pick a class.</p>
              ) : isFetching && !students.length ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Searching…</p>
              ) : students.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {students.map((s) => {
                    const balance = s.totals?.balance || 0
                    return (
                      <li key={s._id}>
                        <button
                          type="button"
                          onClick={() => select(s._id)}
                          className={`flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left transition ${
                            selected === s._id ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{s.name}</div>
                            <div className="truncate text-xs text-slate-500">
                              {s.class}
                              {s.section ? `-${s.section}` : ''} · {s.rollNumber}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs">
                            {!s.accountId ? (
                              <span className="text-slate-400">No fee plan</span>
                            ) : balance > 0 ? (
                              <span className="font-semibold tabular-nums text-amber-600">{inr(balance)}</span>
                            ) : (
                              <span className="font-medium text-emerald-600">Paid up</span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No students found.</p>
              )}
            </div>
          </CpitlCard>
        </div>

        <div className="lg:col-span-8 xl:col-span-9">
          {selected ? <StudentLedgerPanel studentId={selected} showProfileLink /> : <CpitlEmpty message="Select a student to see their fee ledger." />}
        </div>
      </div>
    </CpitlPageShell>
  )
}

export default CpitlCollection
