import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Printer, Users } from 'lucide-react'
import { Banner, Button, Card, EmptyState, Page, Select, TextField } from '@/components/ui'
import { useCpitlClasses } from '@/hooks/useCpitl'
import cpitlService from '@/services/cpitlService'
import { errorMessage } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/collection.css'

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
  const classRow = classes.find((c) => c.class === cls)
  const sections = classRow?.sections || []
  const studentCount = section ? sections.find((s) => s.section === section)?.count ?? 0 : classRow?.count ?? 0

  const generate = async (event?: React.FormEvent) => {
    event?.preventDefault()
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
    <Page>
      {isLoading ? (
        <Card className="cc-slips">
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading classes…
          </div>
        </Card>
      ) : classes.length ? (
        <form onSubmit={generate} noValidate className="cc-slips">
          <Card
            title="Print class fee slips"
            subtitle="Parent and school copy for every pending due in a class or section."
            footer={
              <div className="cc-slips__foot">
                <span className="cc-slips__count" aria-live="polite">
                  {cls ? (
                    <>
                      <strong>{studentCount}</strong> {studentCount === 1 ? 'student' : 'students'} in {section ? `Class ${cls}-${section}` : `Class ${cls}`}
                    </>
                  ) : (
                    'Pick a class to print its slips.'
                  )}
                </span>
                <Button type="submit" variant="primary" icon={Printer} loading={busy} disabled={!cls}>
                  {busy ? 'Preparing PDF…' : 'Generate slips'}
                </Button>
              </div>
            }
          >
            <div className="cb-form-grid cb-form-grid--3">
              <Select
                label="Class"
                required
                value={cls}
                placeholder="Select class"
                options={classes.map((c) => ({ value: c.class, label: `Class ${c.class} (${c.count})` }))}
                onChange={(e) => {
                  setCls(e.target.value)
                  setSection('')
                }}
              />
              <Select
                label="Section"
                value={section}
                disabled={!cls}
                placeholder="All sections"
                options={sections.map((s) => ({ value: s.section, label: `${s.section || '—'} (${s.count})` }))}
                onChange={(e) => setSection(e.target.value)}
              />
              <TextField
                label="Include dues up to"
                type="date"
                value={upto}
                hint="Installments due after this date are left out"
                onChange={(e) => setUpto(e.target.value)}
              />
            </div>
          </Card>
        </form>
      ) : (
        <Card className="cc-slips">
          <EmptyState icon={Users} title="No students found in this session." body="Add students to the session, then come back to print their fee slips." />
        </Card>
      )}

      {!isLoading && classes.length ? (
        <Banner tone="info" className="cc-slips">
          Only students with an unpaid balance get a slip. Late fees are calculated as of today. For a single student, use “Fee slip” on the
          student's ledger.
        </Banner>
      ) : null}
    </Page>
  )
}

export default CpitlFeeSlips
