import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Printer } from 'lucide-react'
import { useCpitlClasses } from '@/hooks/useCpitl'
import cpitlService from '@/services/cpitlService'
import { CpitlCard, CpitlEmpty, CpitlPageShell, Field, btnPrimary, errorMessage, inputClass } from '@/components/cpitl/CpitlUi'

const endOfMonthIso = () => {
  const d = new Date()
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const CpitlFeeSlips: React.FC = () => {
  const { data: classes = [], isLoading } = useCpitlClasses()
  const [cls, setCls] = useState('')
  const [section, setSection] = useState('')
  const [upto, setUpto] = useState(endOfMonthIso())
  const [busy, setBusy] = useState(false)
  const sections = classes.find((c) => c.class === cls)?.sections || []

  const generate = async () => {
    if (!cls) {
      toast.error('Select a class.')
      return
    }
    setBusy(true)
    try {
      await cpitlService.openClassSlips({ class: cls, section: section || undefined, upto: upto || undefined })
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not generate fee slips.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CpitlPageShell title="Fee Slips" subtitle="Print fee slips (parent and school copy) for all pending dues of a class or section">
      <CpitlCard className="max-w-3xl">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
        ) : classes.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Class">
                <select
                  className={inputClass}
                  value={cls}
                  onChange={(e) => {
                    setCls(e.target.value)
                    setSection('')
                  }}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.class} value={c.class}>
                      Class {c.class} ({c.count})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Section">
                <select className={inputClass} value={section} disabled={!cls} onChange={(e) => setSection(e.target.value)}>
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s.section} value={s.section}>
                      {s.section || '—'} ({s.count})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Include dues up to" hint="Installments due after this date are left out">
                <input type="date" className={inputClass} value={upto} onChange={(e) => setUpto(e.target.value)} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" className={btnPrimary} disabled={busy || !cls} onClick={generate}>
                <Printer className="h-4 w-4" /> {busy ? 'Preparing PDF…' : 'Generate slips'}
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Only students with an unpaid balance get a slip. Late fees are calculated as of today. For a single student, use “Fee slip” on the
              student's ledger.
            </p>
          </>
        ) : (
          <CpitlEmpty message="No students found in this session." />
        )}
      </CpitlCard>
    </CpitlPageShell>
  )
}

export default CpitlFeeSlips
