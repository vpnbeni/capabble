import React, { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, LayoutGrid } from 'lucide-react'
import { useTimetable, type TimetableClass } from '@/contexts/TimetableContext'
import { Badge, Banner, Button, Card, EmptyState, Page, StatCard, cx } from '@/components/ui'
import '@/components/timetable/distribution.css'

/* ══════════════════════════════ Helpers ══════════════════════════════ */

/** Build a stable key from a class's subject list (sorted, joined) */
const subjectSetKey = (subjects: string[]) => [...subjects].sort().join('||')

/** Group classes by their subject set */
interface ClassGroup {
  key: string
  subjects: string[]
  classes: TimetableClass[]
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

type AllocationKind = 'full' | 'short' | 'over' | 'empty'

/** Row status in words: matches the old colour rule (equal = ok, anything else needs attention). */
const allocationStatus = (
  total: number,
  periodsPerWeek: number
): { kind: AllocationKind; tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string } => {
  if (total === periodsPerWeek) return { kind: 'full', tone: 'success', label: 'Fully allocated' }
  if (total === 0) return { kind: 'empty', tone: 'neutral', label: 'Not started' }
  if (total < periodsPerWeek) return { kind: 'short', tone: 'warning', label: `${periodsPerWeek - total} short` }
  return { kind: 'over', tone: 'danger', label: `${total - periodsPerWeek} over` }
}

const PeriodAllocation: React.FC = () => {
  const {
    isHydrated,
    classes,
    parallelSubjectPairs,
    periodsPerWeek,
    periodAllocation,
    setPeriodCount,
  } = useTimetable()

  // Group classes by subject set
  const groups: ClassGroup[] = useMemo(() => {
    const map = new Map<string, ClassGroup>()
    classes.forEach((cls) => {
      if (cls.subjects.length === 0) return // skip classes with no subjects
      const key = subjectSetKey(cls.subjects)
      if (!map.has(key)) {
        map.set(key, { key, subjects: [...cls.subjects].sort(), classes: [] })
      }
      map.get(key)!.classes.push(cls)
    })
    return Array.from(map.values())
  }, [classes])

  // Classes without subjects
  const unassigned = useMemo(() => classes.filter((c) => c.subjects.length === 0), [classes])

  const parallelPairsByClass = useMemo(() => {
    const map = new Map<string, Array<[string, string]>>()
    parallelSubjectPairs.forEach((pair) => {
      const classKey = pair.className.trim().toLowerCase()
      if (!classKey) return
      const subjectA = pair.subjectA.trim().toLowerCase()
      const subjectB = pair.subjectB.trim().toLowerCase()
      if (!subjectA || !subjectB || subjectA === subjectB) return

      if (!map.has(classKey)) {
        map.set(classKey, [])
      }
      map.get(classKey)!.push([subjectA, subjectB])
    })
    return map
  }, [parallelSubjectPairs])

  const parallelSubjectsByClass = useMemo(() => {
    const map = new Map<string, Set<string>>()
    parallelSubjectPairs.forEach((pair) => {
      const classKey = pair.className.trim().toLowerCase()
      if (!classKey) return
      const subjectA = pair.subjectA.trim().toLowerCase()
      const subjectB = pair.subjectB.trim().toLowerCase()
      if (!subjectA || !subjectB) return

      if (!map.has(classKey)) {
        map.set(classKey, new Set<string>())
      }
      const subjectSet = map.get(classKey)!
      subjectSet.add(subjectA)
      subjectSet.add(subjectB)
    })
    return map
  }, [parallelSubjectPairs])

  /** Get period count for a class-subject cell */
  const getCount = (classId: string, subject: string): number => {
    return periodAllocation[classId]?.[subject] ?? 0
  }

  /** Get row total for a class */
  const getRowTotal = (cls: TimetableClass): number => {
    const alloc = periodAllocation[cls.id] || {}
    const countsBySubject = new Map<string, number>()

    cls.subjects.forEach((subject) => {
      countsBySubject.set(subject.trim().toLowerCase(), alloc[subject] || 0)
    })

    let total = 0
    countsBySubject.forEach((value) => {
      total += value
    })

    const classKey = cls.className.trim().toLowerCase()
    const classPairs = parallelPairsByClass.get(classKey) || []
    const seenPairs = new Set<string>()
    let overlap = 0

    classPairs.forEach(([subjectA, subjectB]) => {
      const pairKey = subjectA < subjectB ? `${subjectA}|${subjectB}` : `${subjectB}|${subjectA}`
      if (seenPairs.has(pairKey)) return
      seenPairs.add(pairKey)

      const countA = countsBySubject.get(subjectA) || 0
      const countB = countsBySubject.get(subjectB) || 0
      if (countA <= 0 || countB <= 0) return

      overlap += Math.min(countA, countB)
    })

    return Math.max(0, total - overlap)
  }

  /** Handle cell value change */
  const handleCellChange = (classId: string, subject: string, value: string) => {
    const num = value === '' ? 0 : parseInt(value, 10)
    if (isNaN(num) || num < 0) return
    setPeriodCount(classId, subject, num)
  }

  const navigate = useNavigate()
  const goToClasses = () => navigate('/time-table/classes')

  // Deep link from the Generate configuration check: ?class=<id> scrolls to that row and focuses it.
  const [searchParams] = useSearchParams()
  const targetClassId = searchParams.get('class')
  useEffect(() => {
    if (!isHydrated || !targetClassId) return
    const row = document.querySelector<HTMLTableRowElement>(`tr[data-class-id="${CSS.escape(targetClassId)}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
  }, [isHydrated, targetClassId])

  // Summary across every class that has subjects (computed in render; no hooks below this line).
  const allocatedClasses = groups.flatMap((group) => group.classes)
  const summary = allocatedClasses.reduce(
    (acc, cls) => {
      const status = allocationStatus(getRowTotal(cls), periodsPerWeek)
      acc[status.kind] += 1
      return acc
    },
    { full: 0, short: 0, over: 0, empty: 0 } as Record<AllocationKind, number>
  )
  const fullPct = allocatedClasses.length > 0 ? Math.round((summary.full / allocatedClasses.length) * 100) : 0

  if (!isHydrated) {
    return (
      <Page width="full">
        <Card flush>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading period distribution …
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page width="full">
      <div className="cb-stack">
        {allocatedClasses.length > 0 ? (
          <div className="cb-stats">
            <StatCard
              label="Sections to plan"
              value={allocatedClasses.length}
              hint={`${plural(groups.length, 'subject group', 'subject groups')} · ${periodsPerWeek} periods a week`}
            />
            <StatCard
              label="Fully allocated"
              value={summary.full}
              hint={`${fullPct}% of sections`}
              progress={fullPct}
              progressTone="success"
            />
            <StatCard label="Short of periods" value={summary.short + summary.empty} hint={`${summary.empty} not started`} />
            <StatCard label="Over-allocated" value={summary.over} hint="More periods than the week has" />
          </div>
        ) : null}

        {/* ── Unassigned classes notice ── */}
        {unassigned.length > 0 && groups.length > 0 ? (
          <Banner tone="warning" title={`${plural(unassigned.length, 'section has', 'sections have')} no subjects`}>
            They are not shown below. Assign subjects on the{' '}
            <a href="#/time-table/classes">Classes</a> page to distribute their periods.
          </Banner>
        ) : null}

        {/* ── Empty states ── */}
        {groups.length === 0 && unassigned.length === 0 ? (
          <Card>
            <EmptyState
              icon={LayoutGrid}
              title="There are no classes to distribute periods for"
              body="Add classes and give them subjects on the Classes page, then come back to set periods per subject."
              action={
                <Button variant="primary" icon={ArrowRight} onClick={goToClasses}>
                  Go to classes
                </Button>
              }
            />
          </Card>
        ) : null}

        {groups.length === 0 && unassigned.length > 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title={`${plural(unassigned.length, 'section has', 'sections have')} no subjects yet`}
              body="Assign subjects to each class on the Classes page, then come back to set periods per subject."
              action={
                <Button variant="primary" icon={ArrowRight} onClick={goToClasses}>
                  Assign subjects
                </Button>
              }
            />
          </Card>
        ) : null}

        {/* ── Group cards ── */}
        {groups.map((group, groupIdx) => {
          const groupLabel = Array.from(
            new Set(group.classes.map((c) => c.className))
          ).join(', ')
          const groupClassKeys = new Set(group.classes.map((item) => item.className.trim().toLowerCase()))
          const isGroupParallelSubject = (subject: string) => {
            const subjectKey = subject.trim().toLowerCase()
            for (const classKey of groupClassKeys) {
              if (parallelSubjectsByClass.get(classKey)?.has(subjectKey)) {
                return true
              }
            }
            return false
          }
          const hasParallel = group.subjects.some((subj) => isGroupParallelSubject(subj))
          const groupStatuses = group.classes.map((cls) => allocationStatus(getRowTotal(cls), periodsPerWeek))
          const groupFull = groupStatuses.filter((status) => status.kind === 'full').length
          const groupOver = groupStatuses.filter((status) => status.kind === 'over').length
          const groupShort = group.classes.length - groupFull - groupOver

          return (
            <Card
              key={group.key}
              flush
              className="tpd-card"
              title={`Group ${groupIdx + 1} · Classes ${groupLabel}`}
              subtitle={`${plural(group.classes.length, 'section', 'sections')} · ${plural(group.subjects.length, 'subject', 'subjects')}`}
              action={
                <div className="tpd-actions">
                  {groupFull === group.classes.length ? (
                    <Badge tone="success">All sections allocated</Badge>
                  ) : (
                    <>
                      {groupOver > 0 ? <Badge tone="danger">{groupOver} over</Badge> : null}
                      {groupShort > 0 ? <Badge tone="warning">{groupShort} short</Badge> : null}
                      {groupFull > 0 ? <Badge tone="success">{groupFull} allocated</Badge> : null}
                    </>
                  )}
                </div>
              }
            >
              {hasParallel ? (
                <p className="tpd-legend">
                  <span className="tpd-swatch" aria-hidden="true" />
                  Parallel subjects run in the same period, so their shared periods count once in the total.
                </p>
              ) : null}
              <div className="tpd-scroll">
                <table className="tpd-grid">
                  <caption className="cb-visually-hidden">
                    Periods per subject for classes {groupLabel}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="tpd-sticky">Class and section</th>
                      {group.subjects.map((subj) => {
                        const parallel = isGroupParallelSubject(subj)
                        return (
                          <th key={subj} scope="col" className={parallel ? 'is-parallel' : undefined}>
                            <span className="tpd-colhead">
                              <span className="tpd-colhead__name">{subj}</span>
                              {parallel ? <span className="tpd-colhead__meta">Parallel</span> : null}
                            </span>
                          </th>
                        )
                      })}
                      <th scope="col" className="tpd-end tpd-totalhead">Total per week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.classes.map((cls, rowIdx) => {
                      const rowTotal = getRowTotal(cls)
                      const status = allocationStatus(rowTotal, periodsPerWeek)

                      return (
                        <tr
                          key={cls.id}
                          data-class-id={cls.id}
                          className={cls.id === targetClassId ? 'is-target' : undefined}
                        >
                          <th scope="row" className="tpd-sticky">
                            <span className="tpd-rowlabel">
                              <span className="tpd-sr is-num">{rowIdx + 1}</span>
                              <span className="tpd-rowlabel__text">
                                <span className="tpd-rowlabel__name">
                                  {cls.className}
                                  {cls.section ? ` – ${cls.section}` : ''}
                                </span>
                              </span>
                            </span>
                          </th>
                          {group.subjects.map((subj) => {
                            const val = getCount(cls.id, subj)
                            const classKey = cls.className.trim().toLowerCase()
                            const isParallel = parallelSubjectsByClass.get(classKey)?.has(subj.trim().toLowerCase()) || false
                            return (
                              <td key={subj} className={isParallel ? 'is-parallel' : undefined}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  className={cx('tpd-num', val > 0 && 'is-filled')}
                                  value={val || ''}
                                  min={0}
                                  placeholder="0"
                                  aria-label={`${subj} periods for ${cls.className} ${cls.section}`}
                                  onChange={(e) => handleCellChange(cls.id, subj, e.target.value)}
                                />
                              </td>
                            )
                          })}
                          <td className="tpd-end tpd-totalcell">
                            <span className="tpd-total">
                              <span className="tpd-total__count">
                                {rowTotal} <span>/ {periodsPerWeek}</span>
                              </span>
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })}
      </div>
    </Page>
  )
}

export default PeriodAllocation
