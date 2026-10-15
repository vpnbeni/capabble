import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimetable } from '@/contexts/TimetableContext'
import timetableService, {
  type GenerateResult,
  type ConflictReportEntry,
  type TimetableVersionSummary,
} from '@/services/timetableService'
import toast from 'react-hot-toast'
import {
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  CalendarClock,
  History,
  LayoutGrid,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Progress,
  StatCard,
  TextField,
  type DataTableColumn,
  type MenuItem,
  type Tone,
} from '@/components/ui'
import '@/components/timetable/generate.css'

/* ══════════════════════════════ Pre-flight types ══════════════════════════════ */

interface PreflightIssue {
  severity: 'error' | 'warning'
  message: string
  /** Where the issue gets fixed; the row links there. */
  fix?: { to: string; page: string }
}

const FIX_PAGES = {
  classes: { to: '/time-table/classes', page: 'Classes' },
  subjects: { to: '/time-table/subjects', page: 'Subjects' },
  teachers: { to: '/time-table/teachers', page: 'Teachers' },
  bellTimings: { to: '/time-table/bell-timings', page: 'Bell Timings' },
}

const distributionFix = (classId: string) => ({
  to: `/time-table/period-distribution?class=${encodeURIComponent(classId)}`,
  page: 'Period Distribution',
})

const departmentFix = (subject: string, classId: string) => ({
  to: `/time-table/departments?subject=${encodeURIComponent(subject)}&class=${encodeURIComponent(classId)}`,
  page: 'Departments',
})

interface PreflightStats {
  classCount: number
  subjectCount: number
  teacherCount: number
  totalPeriodSlots: number
  periodsPerWeek: number
  issues: PreflightIssue[]
}

/* ══════════════════════════════ Helpers ══════════════════════════════ */

const VERSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived:  { label: 'Archived',  tone: 'warning' },
}

const OVERALL_STATUS: Record<'error' | 'warning' | 'ok', { label: string; tone: Tone }> = {
  error:   { label: 'Errors to fix', tone: 'danger' },
  warning: { label: 'Ready with warnings', tone: 'warning' },
  ok:      { label: 'Ready', tone: 'success' },
}

const CONFLICT_TYPE: Record<string, string> = {
  underallocated: 'Under-allocated',
  teacher_overload: 'Teacher overload',
  unfilled: 'Unfilled',
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Date and time a version was generated, e.g. "07 Oct 2026, 10:42 am". */
const formatDateTime = (iso?: string) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const FillBar: React.FC<{ filled: number; total: number }> = ({ filled, total }) => {
  if (!total) return <span className="cb-subtle">—</span>
  const pct = Math.round((filled / total) * 100)
  const tone = pct === 100 ? 'success' : pct >= 80 ? 'warning' : 'danger'
  return (
    <Progress
      className="tg-fill"
      value={pct}
      tone={tone}
      size="sm"
      valueLabel={`${pct}%`}
      label={`${filled} of ${total}`}
    />
  )
}

type ConflictRowData = ConflictReportEntry & { rowKey: string }

/* ══════════════════════════════ Component ══════════════════════════════ */

const Generate: React.FC = () => {
  const navigate = useNavigate()
  const {
    classes,
    subjects,
    teachers,
    teacherSubjectAllocations,
    periodAllocation,
    periodsPerWeek,
    periodsPerDay,
    parallelSubjectPairs,
    rehydrate,
  } = useTimetable()

  const [generating, setGenerating] = useState(false)
  const [rehydrating, setRehydrating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [versionName, setVersionName] = useState('')

  // ── Versions state ───────────────────────────────────────────────────────
  const [versions, setVersions] = useState<TimetableVersionSummary[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true)
    try {
      const data = await timetableService.getVersions()
      setVersions(data)
    } catch {
      toast.error('Failed to load versions.')
    } finally {
      setVersionsLoading(false)
    }
  }, [])

  useEffect(() => { void loadVersions() }, [loadVersions])

  // ── Pre-flight analysis ──────────────────────────────────────────────────

  const preflight = useMemo<PreflightStats>(() => {
    const issues: PreflightIssue[] = []

    if (classes.length === 0) {
      issues.push({ severity: 'error', message: 'No classes configured. Add classes in the Classes page.', fix: FIX_PAGES.classes })
    }

    if (subjects.length === 0) {
      issues.push({ severity: 'error', message: 'No subjects configured. Add subjects in the Subjects page.', fix: FIX_PAGES.subjects })
    }

    if (teachers.length === 0) {
      issues.push({ severity: 'warning', message: 'No teachers configured. Periods will be generated without teacher assignments.', fix: FIX_PAGES.teachers })
    }

    if (periodsPerDay === 0) {
      issues.push({ severity: 'error', message: 'Bell timings are not configured. Set up Bell Timings first.', fix: FIX_PAGES.bellTimings })
    }

    // Build parallel-pair lookup: classNameLower → [[subjALower, subjBLower]]
    const parallelPairsByClass = new Map<string, [string, string][]>()
    parallelSubjectPairs.forEach((pair) => {
      const key = pair.className.trim().toLowerCase()
      if (!parallelPairsByClass.has(key)) parallelPairsByClass.set(key, [])
      parallelPairsByClass.get(key)!.push([
        pair.subjectA.trim().toLowerCase(),
        pair.subjectB.trim().toLowerCase(),
      ])
    })

    // Check subject-level issues per class
    classes.forEach((cls) => {
      const classAlloc = periodAllocation[cls.id] || {}

      if (Object.keys(classAlloc).length === 0) {
        issues.push({
          severity: 'error',
          message: `${cls.className} ${cls.section}: No period distribution set. Configure in Period Distribution.`,
          fix: distributionFix(cls.id),
        })
        return
      }

      // Subtract parallel-pair overlap (same logic as PeriodAllocation getRowTotal)
      // Only count subjects currently assigned to this class (cls.subjects) — not all
      // stored entries in periodAllocation, which may include stale subjects removed from the class.
      const classAllocLower: Record<string, number> = {}
      cls.subjects.forEach((subject) => {
        const k = subject.trim().toLowerCase()
        classAllocLower[k] = (classAllocLower[k] || 0) + (classAlloc[subject] || 0)
      })
      const rawTotal = cls.subjects.reduce((sum, subject) => sum + (classAlloc[subject] || 0), 0)
      const classPairs = parallelPairsByClass.get(cls.className.trim().toLowerCase()) || []
      let overlap = 0
      const seen = new Set<string>()
      classPairs.forEach(([a, b]) => {
        const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
        if (seen.has(pairKey)) return
        seen.add(pairKey)
        const cA = classAllocLower[a] || 0
        const cB = classAllocLower[b] || 0
        if (cA > 0 && cB > 0) overlap += Math.min(cA, cB)
      })
      const totalAllocated = rawTotal - overlap

      const totalAvailable = periodsPerWeek
      if (totalAllocated > totalAvailable) {
        issues.push({
          severity: 'warning',
          message: `${cls.className} ${cls.section}: Allocated ${totalAllocated} periods but only ${totalAvailable} available per week.`,
          fix: distributionFix(cls.id),
        })
      }
    })

    // Check teacher assignments
    const teacherAssignedSubjectKeys = new Set<string>()
    teacherSubjectAllocations.forEach((alloc) => {
      alloc.assignments.forEach((assignment) => {
        assignment.subjects.forEach((subj) => {
          teacherAssignedSubjectKeys.add(`${assignment.classId}::${subj.toLowerCase()}`)
        })
      })
    })

    classes.forEach((cls) => {
      const classAlloc = periodAllocation[cls.id] || {}
      Object.keys(classAlloc).forEach((subj) => {
        if ((classAlloc[subj] || 0) > 0) {
          const key = `${cls.id}::${subj.toLowerCase()}`
          if (!teacherAssignedSubjectKeys.has(key)) {
            issues.push({
              severity: 'warning',
              message: `${cls.className} ${cls.section} — "${subj}": No teacher assigned in Departments. Will be scheduled without teacher.`,
              fix: departmentFix(subj, cls.id),
            })
          }
        }
      })
    })

    return {
      classCount: classes.length,
      subjectCount: subjects.length,
      teacherCount: teachers.length,
      totalPeriodSlots: classes.length * 6 * periodsPerDay,
      periodsPerWeek,
      issues,
    }
  }, [classes, subjects, teachers, teacherSubjectAllocations, periodAllocation, periodsPerWeek, periodsPerDay])

  const hasErrors = preflight.issues.some((i) => i.severity === 'error')
  const hasWarnings = preflight.issues.some((i) => i.severity === 'warning')
  const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok'

  // ── Default version name ─────────────────────────────────────────────────

  useEffect(() => {
    if (!versionName) {
      const now = new Date()
      setVersionName(
        `v${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
      )
    }
  }, [])

  // ── Generate handler ─────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (hasErrors) {
      toast.error('Fix the errors above before generating.')
      return
    }

    setGenerating(true)
    setResult(null)

    try {
      const res = await timetableService.generate(versionName.trim() || undefined)
      setResult(res)
      void loadVersions()

      if (res.stats.conflictCount === 0) {
        toast.success('Timetable generated successfully — no conflicts!')
      } else {
        toast.success(
          `Timetable generated with ${res.stats.conflictCount} unresolved conflict(s). Review below.`
        )
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed. Please try again.'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  // ── Version action handlers ──────────────────────────────────────────────

  const handlePublish = async (id: string) => {
    setActionId(id)
    try {
      await timetableService.publishVersion(id)
      toast.success('Version published.')
      void loadVersions()
    } catch {
      toast.error('Failed to publish version.')
    } finally {
      setActionId(null)
    }
  }

  const handleArchive = async (id: string) => {
    setActionId(id)
    try {
      await timetableService.archiveVersion(id)
      toast.success('Version archived.')
      void loadVersions()
    } catch {
      toast.error('Failed to archive version.')
    } finally {
      setActionId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setPendingDelete(null)
    setActionId(id)
    try {
      await timetableService.deleteVersion(id)
      toast.success('Draft deleted.')
      void loadVersions()
    } catch {
      toast.error('Failed to delete version.')
    } finally {
      setActionId(null)
    }
  }

  const handleExportExcel = async (id: string, name: string) => {
    try {
      await timetableService.exportExcel(id, `timetable-${name.replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`)
    } catch {
      toast.error('Excel export failed.')
    }
  }

  // ── Derived view data ────────────────────────────────────────────────────

  const errorCount = preflight.issues.filter((i) => i.severity === 'error').length
  const warningCount = preflight.issues.filter((i) => i.severity === 'warning').length
  const overall = OVERALL_STATUS[overallStatus]

  const handleRecheck = async () => {
    setRehydrating(true)
    await rehydrate()
    setRehydrating(false)
  }

  const conflictRows: ConflictRowData[] = result
    ? result.conflictReport.map((entry, idx) => ({ ...entry, rowKey: `${entry.classId}-${entry.subjectName}-${idx}` }))
    : []

  const conflictColumns: DataTableColumn<ConflictRowData>[] = [
    { key: 'className', header: 'Class', mobile: 'title', render: (e) => <span className="tg-version-name">{e.className}</span> },
    { key: 'subjectName', header: 'Subject', mobile: 'subtitle' },
    {
      key: 'type',
      header: 'Type',
      mobile: 'aside',
      render: (e) => <Badge tone="warning">{CONFLICT_TYPE[e.type] ?? e.type}</Badge>,
    },
    {
      key: 'periods',
      header: 'Scheduled / expected',
      headerLabel: 'Scheduled / expected',
      numeric: true,
      render: (e) => `${e.actual} / ${e.expected}`,
    },
    { key: 'message', header: 'Details', render: (e) => <span className="cb-muted">{e.message}</span> },
  ]

  const versionMenuItems = (v: TimetableVersionSummary, busy: boolean): MenuItem[] => {
    const items: MenuItem[] = []
    if (v.status === 'draft') {
      items.push({ label: 'Publish version', icon: CheckCircle2, disabled: busy, onSelect: () => void handlePublish(v._id) })
    }
    if (v.status === 'published') {
      items.push({ label: 'Archive version', icon: Archive, disabled: busy, onSelect: () => void handleArchive(v._id) })
    }
    if (v.status === 'draft') {
      items.push({ divider: true })
      items.push({
        label: 'Delete draft',
        icon: Trash2,
        tone: 'danger',
        disabled: busy,
        onSelect: () => setPendingDelete({ id: v._id, name: v.name }),
      })
    }
    return items
  }

  const versionColumns: DataTableColumn<TimetableVersionSummary>[] = [
    { key: 'name', header: 'Name', mobile: 'title', render: (v) => <span className="tg-version-name">{v.name}</span> },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (v) => {
        const status = VERSION_STATUS[v.status] ?? VERSION_STATUS.draft
        return <Badge tone={status.tone}>{status.label}</Badge>
      },
    },
    { key: 'generatedAt', header: 'Generated', mobile: 'subtitle', render: (v) => formatDateTime(v.generatedAt) },
    {
      key: 'fill',
      header: 'Fill rate',
      render: (v) => {
        const stats = v.generationStats ?? { totalSlots: 0, filledSlots: 0 }
        return <FillBar filled={stats.filledSlots} total={stats.totalSlots} />
      },
    },
    {
      key: 'conflicts',
      header: 'Conflicts',
      render: (v) =>
        v.conflictCount > 0 ? (
          <Badge tone="warning">{plural(v.conflictCount, 'conflict', 'conflicts')}</Badge>
        ) : (
          <Badge tone="success">No conflicts</Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (v) => {
        const busy = actionId === v._id
        const items = versionMenuItems(v, busy)
        return (
          <span className="tg-row-actions">
            <Button
              variant="tertiary"
              size="sm"
              icon={Eye}
              aria-label={`View ${v.name} in class grid`}
              title="View in class grid"
              onClick={() => navigate('/time-table/class-wise')}
            />
            <Button
              variant="tertiary"
              size="sm"
              icon={Download}
              aria-label={`Download ${v.name} as Excel`}
              title="Download Excel"
              onClick={() => void handleExportExcel(v._id, v.name)}
            />
            {items.length > 0 ? <Menu label={`More actions for ${v.name}`} items={items} /> : null}
          </span>
        )
      },
    },
  ]

  const resultFull = result ? result.stats.filledSlots === result.stats.totalSlots : false
  const resultMetrics = result
    ? [
        {
          label: 'Filled slots',
          value: `${result.stats.filledSlots} / ${result.stats.totalSlots}`,
          status: resultFull ? { tone: 'success' as Tone, text: 'All filled' } : { tone: 'warning' as Tone, text: 'Gaps left' },
        },
        {
          label: 'Fill rate',
          value: result.stats.totalSlots
            ? `${Math.round((result.stats.filledSlots / result.stats.totalSlots) * 100)}%`
            : '—',
          status: resultFull ? { tone: 'success' as Tone, text: 'Complete' } : { tone: 'warning' as Tone, text: 'Incomplete' },
        },
        {
          label: 'Conflicts',
          value: result.stats.conflictCount,
          status:
            result.stats.conflictCount === 0
              ? { tone: 'success' as Tone, text: 'None' }
              : { tone: 'warning' as Tone, text: 'Needs review' },
        },
        {
          label: 'Duration',
          value: `${result.stats.durationMs} ms`,
          status: null,
        },
      ]
    : []

  return (
    <Page>
      <section className="cb-stats" aria-label="Configuration totals">
        <StatCard label="Classes" value={preflight.classCount} icon={LayoutGrid} hint="Class sections to schedule" />
        <StatCard label="Subjects" value={preflight.subjectCount} icon={BookOpen} hint="In the subject list" />
        <StatCard label="Teachers" value={preflight.teacherCount} icon={Users} hint="Available for assignment" />
        <StatCard
          label="Total slots"
          value={preflight.totalPeriodSlots}
          icon={CalendarClock}
          hint={`6 days × ${periodsPerDay} periods per class`}
        />
      </section>

      <div className="cb-grid-8-4">
        <Card
          className="tg-check-card"
          title="Configuration check"
          subtitle="Classes, subjects, period distribution and teacher assignments"
          action={
            <div className="tg-actions">
              <Badge tone={overall.tone}>{overall.label}</Badge>
              <Button
                size="sm"
                icon={RefreshCw}
                loading={rehydrating}
                onClick={() => void handleRecheck()}
                title="Re-fetch configuration from server and re-run checks"
              >
                {rehydrating ? 'Checking…' : 'Recheck'}
              </Button>
            </div>
          }
        >
          {preflight.issues.length > 0 ? (
            <>
              <div className="tg-issue-summary">
                {errorCount > 0 ? <Badge tone="danger">{plural(errorCount, 'error', 'errors')}</Badge> : null}
                {warningCount > 0 ? <Badge tone="warning">{plural(warningCount, 'warning', 'warnings')}</Badge> : null}
              </div>
              <ul className="tg-issues" aria-label="Configuration issues">
                {preflight.issues.map((issue, idx) => {
                  const content = (
                    <>
                      <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                        {issue.severity === 'error' ? 'Error' : 'Warning'}
                      </Badge>
                      <span className="tg-issue__text">{issue.message}</span>
                    </>
                  )
                  return (
                    <li key={idx} className="tg-issue">
                      {issue.fix ? (
                        <button
                          type="button"
                          className="tg-issue__link"
                          onClick={() => navigate(issue.fix!.to)}
                          title={`Fix in ${issue.fix.page}`}
                        >
                          {content}
                          <span className="tg-issue__go">
                            <span className="tg-issue__go-label">Fix in {issue.fix.page}</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </span>
                        </button>
                      ) : (
                        <div className="tg-issue__row">{content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <Banner tone="success" title="All configuration checks passed">
              Ready to generate.
            </Banner>
          )}
        </Card>

        <Card title="Generate timetable" subtitle="Each run saves a new draft you can view, publish or export.">
          <div className="tg-generate">
            <TextField
              id="version-name"
              label="Version name"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="e.g. Summer 2025-26 v1"
            />
            <Button
              variant="primary"
              icon={Sparkles}
              fullWidth
              loading={generating}
              disabled={hasErrors}
              onClick={() => void handleGenerate()}
            >
              {generating ? 'Generating…' : 'Generate timetable'}
            </Button>
            <p className="tg-generate__note">
              {hasErrors
                ? `Fix ${plural(errorCount, 'error', 'errors')} in the configuration check to generate.`
                : 'A constraint solver builds a clash-free timetable from your configuration.'}
            </p>
          </div>
        </Card>
      </div>

      {result ? (
        <Card
          className="tg-result-card"
          title={`Result · ${result.version.name}`}
          subtitle="Latest generation run"
          action={
            <div className="tg-actions">
              <Button size="sm" iconRight={ArrowRight} onClick={() => navigate('/time-table/class-wise')}>
                View class grid
              </Button>
              <Button size="sm" onClick={() => navigate('/time-table/teacher-wise')}>
                View teacher schedules
              </Button>
            </div>
          }
        >
          <div className="tg-metrics">
            {resultMetrics.map((m) => (
              <div key={m.label} className="tg-metric">
                <span className="tg-metric__label">{m.label}</span>
                <span className="tg-metric__value">{m.value}</span>
                {m.status ? <Badge tone={m.status.tone}>{m.status.text}</Badge> : null}
              </div>
            ))}
          </div>

          {conflictRows.length > 0 ? (
            <div className="tg-result-body">
              <div className="tg-conflicts__head">
                <Badge tone="warning">{plural(conflictRows.length, 'unresolved period', 'unresolved periods')}</Badge>
                These subjects did not get their full weekly allocation.
              </div>
              <div className="tg-conflicts">
                <DataTable
                  caption="Unresolved periods"
                  columns={conflictColumns}
                  rows={conflictRows}
                  getRowKey={(e) => e.rowKey}
                  maxHeight="360px"
                />
              </div>
              <Banner tone="info" title="Why conflicts happen">
                Teacher supply can&apos;t cover every subject demand across classes at the same time. Adjust period
                counts in Period distribution or teacher assignments in Departments, then generate again.
              </Banner>
            </div>
          ) : (
            <Banner tone="success" title="All periods scheduled">
              Zero conflicts in this version.
            </Banner>
          )}
        </Card>
      ) : null}

      <Card
        flush
        title="Saved versions"
        subtitle={versionsLoading ? 'Loading…' : plural(versions.length, 'version', 'versions')}
        action={
          <Button size="sm" icon={RefreshCw} loading={versionsLoading} onClick={() => void loadVersions()}>
            Refresh
          </Button>
        }
      >
        {versionsLoading && versions.length === 0 ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading versions…
          </div>
        ) : (
          <DataTable
            caption="Saved timetable versions"
            columns={versionColumns}
            rows={versions}
            getRowKey={(v) => v._id}
            loading={versionsLoading}
            empty={
              <EmptyState
                compact
                icon={History}
                title="No saved versions yet"
                body="Generate a timetable above to save your first draft version."
              />
            }
          />
        )}
      </Card>

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        tone="danger"
        size="sm"
        title={`Delete draft "${pendingDelete?.name ?? ''}"?`}
        description="The draft and its generated grid are removed. This can't be undone."
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>Keep draft</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete.id)
              }}
            >
              Delete draft
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default Generate
