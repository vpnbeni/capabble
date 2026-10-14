import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore, Copy, FileStack, FileEdit, Layers, Plus, SearchX, Users, ExternalLink } from 'lucide-react'
import { useFeeStructures, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { FeeStructure } from '@/services/cpitlService'
import StructureArchiveDialog from '@/components/cpitl/StructureArchiveDialog'
import {
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  StatCard,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
} from '@/components/ui'
import cpitlBulkService from '@/services/cpitlBulkService'
import { CpitlBadge, FREQUENCY_LABELS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/fees.css'

type View = 'current' | 'active' | 'draft' | 'archived'

const MAX_CLASS_CHIPS = 4

const frequencySummary = (structure: FeeStructure) => {
  const order = ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time']
  const used = new Set(structure.components.map((c) => c.frequency))
  return order.filter((f) => used.has(f as never)).map((f) => FREQUENCY_LABELS[f]).join(', ')
}

const CpitlFeeStructures: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: structures = [], isLoading } = useFeeStructures()
  const [target, setTarget] = useState<FeeStructure | null>(null)
  const [view, setView] = useState<View>('current')
  const [search, setSearch] = useState('')

  const duplicate = async (structure: FeeStructure) => {
    try {
      const copy = await cpitlService.duplicateStructure(structure._id)
      toast.success('Structure duplicated as draft.')
      invalidate()
      navigate(`/cpitl/fee-structures/${copy._id}`)
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const open = (structure: FeeStructure) => navigate(`/cpitl/fee-structures/${structure._id}`)
  const create = () => navigate('/cpitl/fee-structures/new')

  const counts = useMemo(() => {
    const active = structures.filter((s) => s.status === 'active').length
    const draft = structures.filter((s) => s.status === 'draft').length
    const archived = structures.filter((s) => s.status === 'archived').length
    const students = structures.filter((s) => s.status !== 'archived').reduce((sum, s) => sum + (s.assignedCount || 0), 0)
    return { active, draft, archived, current: structures.length - archived, students }
  }, [structures])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return structures
      .filter((s) => (view === 'current' ? s.status !== 'archived' : s.status === view))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          s.applicableClasses.some((c) => c.toLowerCase().includes(q))
      )
  }, [structures, view, search])

  // Bulk archive / restore. Selection clears when the status view or the search changes.
  const getStructureId = useCallback((s: FeeStructure) => s._id, [])
  const bulk = useRowSelection(rows, getStructureId, {
    resetKey: `${view}|${search}`,
    rowLabel: (s) => `Select ${s.name}`,
  })
  const toArchive = bulk.selectedRows.filter((s) => s.status !== 'archived')
  const toRestore = bulk.selectedRows.filter((s) => s.status === 'archived')
  const archiveStudents = toArchive.reduce((sum, s) => sum + (s.assignedCount || 0), 0)
  const [bulkBusy, setBulkBusy] = useState<'' | 'archive' | 'restore'>('')
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)

  const runBulk = async (action: 'archive' | 'restore') => {
    const targets = action === 'archive' ? toArchive : toRestore
    if (!targets.length) return
    setBulkBusy(action)
    try {
      const ids = targets.map((s) => s._id)
      const result = action === 'archive' ? await cpitlBulkService.archiveStructures(ids) : await cpitlBulkService.restoreStructures(ids)
      setArchiveConfirmOpen(false)
      bulk.clear()
      invalidate()
      const label = action === 'archive' ? 'Archive structures' : 'Restore structures'
      if (result.failed.length) setBulkResult({ ...result, action: label, noun: 'structures' })
      else toast.success(`${result.succeeded} ${result.succeeded === 1 ? 'structure' : 'structures'} ${action === 'archive' ? 'archived' : 'restored'}.`)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy('')
    }
  }

  const columns: DataTableColumn<FeeStructure>[] = [
    {
      key: 'name',
      header: 'Structure',
      mobile: 'title',
      render: (s) => (
        <div className="cf-name">
          <span className="cf-name__primary">{s.name}</span>
          <span className="cf-name__secondary">{s.description || `${s.components.length} fee heads`}</span>
        </div>
      ),
    },
    {
      key: 'classes',
      header: 'Applies to',
      render: (s) =>
        s.applicableClasses.length ? (
          <span className="cf-classes" title={s.applicableClasses.join(', ')}>
            {s.applicableClasses.slice(0, MAX_CLASS_CHIPS).map((cls) => (
              <span key={cls} className="cf-class">
                {cls}
              </span>
            ))}
            {s.applicableClasses.length > MAX_CLASS_CHIPS ? (
              <span className="cf-class cf-class--more">+{s.applicableClasses.length - MAX_CLASS_CHIPS}</span>
            ) : null}
          </span>
        ) : (
          <span className="cb-subtle">No classes selected</span>
        ),
    },
    {
      key: 'heads',
      header: 'Fee heads',
      mobile: 'hidden',
      render: (s) => (
        <div className="cf-name">
          <span>
            {s.components.length} head{s.components.length === 1 ? '' : 's'}
          </span>
          <span className="cf-name__secondary">{frequencySummary(s) || '—'}</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Annual per student',
      headerLabel: 'Annual per student',
      align: 'right',
      numeric: true,
      render: (s) => (
        <div className="cf-money">
          <span className="cf-money__value">{inr(s.annualTotal)}</span>
          {s.annualTotalWithOptional > s.annualTotal ? (
            <span className="cf-money__hint">up to {inr(s.annualTotalWithOptional)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'right',
      numeric: true,
      render: (s) => s.assignedCount.toLocaleString('en-IN'),
    },
    {
      key: 'version',
      header: 'Version',
      mobile: 'hidden',
      render: (s) => (
        <div className="cf-name">
          <span>v{s.version}</span>
          <span className="cf-name__secondary">{fmtDate(s.updatedAt)}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', mobile: 'aside', render: (s) => <CpitlBadge status={s.status} /> },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      width: 48,
      align: 'right',
      interactive: true,
      mobile: 'hidden',
      render: (s) => (
        <Menu
          label={`Actions for ${s.name}`}
          items={[
            { label: 'Open structure', icon: ExternalLink, onSelect: () => open(s) },
            { label: 'Duplicate as draft', icon: Copy, onSelect: () => void duplicate(s) },
            { divider: true },
            s.status === 'archived'
              ? { label: 'Restore structure', icon: ArchiveRestore, onSelect: () => setTarget(s) }
              : { label: 'Archive structure', icon: Archive, tone: 'danger', onSelect: () => setTarget(s) },
          ]}
        />
      ),
    },
  ]

  const chips = [
    { id: 'current', label: 'In use', count: counts.current, active: view === 'current' },
    { id: 'active', label: 'Active', count: counts.active, active: view === 'active' },
    { id: 'draft', label: 'Draft', count: counts.draft, active: view === 'draft' },
    { id: 'archived', label: 'Archived', count: counts.archived, active: view === 'archived' },
  ]

  let empty: React.ReactNode
  if (!structures.length) {
    empty = (
      <EmptyState
        icon={FileStack}
        title="No fee structures yet"
        body="Create one per class group, for example “Primary (I–V)” or “Senior Secondary Science”."
        action={
          <Button variant="primary" icon={Plus} onClick={create}>
            Add fee structure
          </Button>
        }
      />
    )
  } else if (search.trim()) {
    empty = (
      <EmptyState
        icon={SearchX}
        title="No structures match your search"
        body="Try a different name or class."
        action={<Button onClick={() => setSearch('')}>Clear search</Button>}
        compact
      />
    )
  } else if (view === 'current' || view === 'active') {
    empty = (
      <EmptyState
        icon={FileStack}
        title={view === 'active' ? 'No active fee structures' : 'No fee structures in use'}
        body={
          counts.archived
            ? 'Add a new structure, or restore one from Archived.'
            : 'Add a structure and assign it to classes to make it active.'
        }
        compact
      />
    )
  } else {
    empty = (
      <EmptyState
        icon={FileStack}
        title={view === 'draft' ? 'No draft structures' : 'No archived structures'}
        body={view === 'draft' ? 'New and duplicated structures stay in draft until assigned.' : 'Archived structures show up here.'}
        compact
      />
    )
  }

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Active structures" value={counts.active} icon={Layers} hint="Assigned to students" />
        <StatCard label="Drafts" value={counts.draft} icon={FileEdit} hint="Not yet assigned" />
        <StatCard label="Students covered" value={counts.students.toLocaleString('en-IN')} icon={Users} hint="Across structures in use" />
        <StatCard label="Archived" value={counts.archived} icon={Archive} hint="Read-only" />
      </div>

      <Card flush className="cf-list-card">
        <div className="cf-toolbar">
          <FilterBar
            search={{ placeholder: 'Search structures or classes', value: search, onChange: setSearch }}
            chips={chips}
            chipsLabel="Structure status"
            onChipClick={(id) => setView(id as View)}
            actions={
              <>
                <Button icon={Layers} onClick={() => navigate('/cpitl/settings')}>
                  Manage fee heads
                </Button>
                <Button variant="primary" icon={Plus} onClick={create}>
                  Add fee structure
                </Button>
              </>
            }
          />
        </div>
        {bulk.count > 0 ? (
          <div className="cf-bulk">
            <BulkBar count={bulk.count} noun="structure" onClear={bulk.clear} busy={Boolean(bulkBusy)}>
              {toArchive.length > 0 ? (
                <Button size="sm" variant="danger" icon={Archive} disabled={Boolean(bulkBusy)} onClick={() => setArchiveConfirmOpen(true)}>
                  Archive {toArchive.length}
                </Button>
              ) : null}
              {toRestore.length > 0 ? (
                <Button size="sm" icon={ArchiveRestore} loading={bulkBusy === 'restore'} disabled={Boolean(bulkBusy)} onClick={() => runBulk('restore')}>
                  Restore {toRestore.length}
                </Button>
              ) : null}
            </BulkBar>
          </div>
        ) : null}
        {isLoading ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading fee structures…
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(s) => s._id}
            onRowClick={open}
            selection={bulk.selection}
            caption="Fee structures"
            empty={empty}
          />
        )}
      </Card>

      <StructureArchiveDialog
        structure={target}
        mode={target?.status === 'archived' ? 'restore' : 'archive'}
        onClose={() => setTarget(null)}
      />

      <Dialog
        open={archiveConfirmOpen}
        onClose={() => (bulkBusy === 'archive' ? undefined : setArchiveConfirmOpen(false))}
        tone="danger"
        size="sm"
        title={`Archive ${toArchive.length} ${toArchive.length === 1 ? 'structure' : 'structures'}?`}
        description={
          archiveStudents > 0
            ? `They can no longer be assigned. The ${archiveStudents.toLocaleString('en-IN')} ${archiveStudents === 1 ? 'student' : 'students'} already on them keep their dues. You can restore them later.`
            : 'They can no longer be assigned. You can restore them later.'
        }
        footer={
          <>
            <Button onClick={() => setArchiveConfirmOpen(false)} disabled={bulkBusy === 'archive'}>
              Keep structures
            </Button>
            <Button variant="danger" icon={Archive} loading={bulkBusy === 'archive'} onClick={() => runBulk('archive')}>
              Archive {toArchive.length}
            </Button>
          </>
        }
      >
        <ul className="cf-bulk-list">
          {toArchive.map((s) => (
            <li key={s._id}>
              <span>{s.name}</span>
              <span className="cb-subtle">
                {s.assignedCount.toLocaleString('en-IN')} {s.assignedCount === 1 ? 'student' : 'students'}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>

      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </Page>
  )
}

export default CpitlFeeStructures
