import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Printer, Search, Users, Wallet } from 'lucide-react'
import { Avatar, Badge, BulkBar, Button, Card, Checkbox, EmptyState, Page, Select, TextField, cx, useRowSelection } from '@/components/ui'
import { useCpitlClasses, useFeeStudents } from '@/hooks/useCpitl'
import StudentLedgerPanel from '@/components/cpitl/StudentLedgerPanel'
import { errorMessage, inr } from '@/components/cpitl/CpitlUi'
import cpitlBulkService from '@/services/cpitlBulkService'
import '@/components/cpitl/collection.css'

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
  // ?class=4th&section=Rose (e.g. from the fee dashboard) opens with that class listed.
  const [cls, setCls] = useState(() => params.get('class') || '')
  const [section, setSection] = useState(() => params.get('section') || '')
  const selected = params.get('student') || ''
  const debouncedQ = useDebounced(q)
  const { data: classes = [] } = useCpitlClasses()
  const searching = Boolean(debouncedQ.trim() || cls)
  const { data: students = [], isFetching } = useFeeStudents({ q: debouncedQ.trim() || undefined, class: cls || undefined, section: section || undefined }, searching)
  const sections = classes.find((c) => c.class === cls)?.sections || []
  const withDues = students.filter((s) => (s.dueNow || 0) > 0).length

  // Bulk fee slips: only students with a fee plan can be ticked; cleared when the search changes.
  const getStudentId = useCallback((s: (typeof students)[number]) => s._id, [])
  const hasFeePlan = useCallback((s: (typeof students)[number]) => Boolean(s.accountId), [])
  const bulk = useRowSelection(students, getStudentId, {
    resetKey: `${debouncedQ}|${cls}|${section}`,
    isSelectable: hasFeePlan,
  })
  const selectableCount = students.filter(hasFeePlan).length
  const [printing, setPrinting] = useState(false)
  const printSlips = async () => {
    setPrinting(true)
    try {
      await cpitlBulkService.printStudentSlips(bulk.selectedIds)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setPrinting(false)
    }
  }

  // Keep the class filter in the address so back/refresh return to the same list.
  const select = (id: string) => {
    const next: Record<string, string> = {}
    if (cls) next.class = cls
    if (cls && section) next.section = section
    if (id) next.student = id
    setParams(next)
  }

  return (
    <Page>
      <div className={cx('cc-collect', selected && 'has-selection')}>
        <Card flush className="cc-finder">
          <div className="cc-finder__search" role="search">
            <TextField
              aria-label="Search students"
              icon={Search}
              type="search"
              placeholder="Name, roll no., father, phone"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cc-finder__filters">
              <Select
                aria-label="Class"
                size="sm"
                value={cls}
                placeholder="All classes"
                options={classes.map((c) => ({ value: c.class, label: `Class ${c.class}` }))}
                onChange={(e) => {
                  setCls(e.target.value)
                  setSection('')
                }}
              />
              <Select
                aria-label="Section"
                size="sm"
                value={section}
                disabled={!cls}
                placeholder="All sections"
                options={sections.map((s) => ({ value: s.section, label: s.section || '—' }))}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
          </div>

          {searching && students.length ? (
            <>
              <div className="cc-finder__meta" aria-live="polite">
                {selectableCount > 0 ? (
                  <Checkbox
                    className="cc-finder__all"
                    label="Select all"
                    checked={bulk.allSelected}
                    indeterminate={!bulk.allSelected && bulk.count > 0}
                    onChange={() => bulk.toggleAll()}
                  />
                ) : null}
                <span>
                  {students.length} {students.length === 1 ? 'student' : 'students'}
                </span>
                <span>{withDues} with dues</span>
              </div>
              {bulk.count > 0 ? (
                <div className="cc-finder__bulk">
                  <BulkBar count={bulk.count} noun="student" onClear={bulk.clear} busy={printing}>
                    <Button size="sm" icon={Printer} loading={printing} disabled={printing} onClick={printSlips}>
                      Print fee slips
                    </Button>
                  </BulkBar>
                </div>
              ) : null}
            </>
          ) : null}

          {!searching ? (
            <div className="cc-finder__state">
              <EmptyState icon={Search} compact title="Find a student" body="Type a name, roll number, father's name or phone, or pick a class." />
            </div>
          ) : isFetching && !students.length ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Searching…
            </div>
          ) : students.length ? (
            <ul className="cc-finder__list" aria-label="Students">
              {students.map((s) => {
                const dueNow = s.dueNow || 0
                const balance = s.totals?.balance || 0
                return (
                  <li key={s._id} className={cx('cc-result-row', bulk.selection.isSelected(s) && 'is-checked')}>
                    {s.accountId ? (
                      <Checkbox
                        className="cc-result__check"
                        aria-label={`Select ${s.name}`}
                        checked={bulk.selection.isSelected(s)}
                        onChange={() => bulk.toggle(s)}
                      />
                    ) : (
                      <span className="cc-result__check" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      onClick={() => select(s._id)}
                      aria-current={selected === s._id ? 'true' : undefined}
                      className={cx('cc-result', selected === s._id && 'is-on')}
                    >
                      <Avatar name={s.name} size="sm" />
                      <span className="cc-result__text">
                        <span className="cc-result__name">{s.name}</span>
                        <span className="cc-result__meta">
                          {s.class}
                          {s.section ? `-${s.section}` : ''} · Roll {s.rollNumber}
                          {s.fatherName ? ` · ${s.fatherName}` : ''}
                        </span>
                      </span>
                      <span className="cc-result__due">
                        {!s.accountId ? (
                          <Badge tone="neutral">No fee plan</Badge>
                        ) : dueNow > 0 ? (
                          <>
                            <span className="cc-result__amount">{inr(dueNow)}</span>
                            <span className="cc-result__label">Due</span>
                          </>
                        ) : balance > 0 ? (
                          <Badge tone="success" title={`${inr(balance)} falls due later in the session`}>Up to date</Badge>
                        ) : (
                          <Badge tone="success">Paid up</Badge>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="cc-finder__state">
              <EmptyState icon={Users} compact title="No students match." body="Check the spelling or clear the class filter." />
            </div>
          )}
        </Card>

        <div className="cc-ledger">
          {selected ? (
            <>
              <Button variant="tertiary" size="sm" icon={Search} className="cc-finder__back" onClick={() => select('')}>
                Change student
              </Button>
              <StudentLedgerPanel studentId={selected} showProfileLink />
            </>
          ) : (
            <Card>
              <EmptyState
                icon={Wallet}
                title="No student selected."
                body="Search by name or pick a class, then choose a student to see dues and collect fee."
              />
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}

export default CpitlCollection
