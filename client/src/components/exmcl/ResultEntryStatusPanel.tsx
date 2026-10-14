import React, { useMemo, useState } from 'react'
import { ListChecks, PencilLine, Users } from 'lucide-react'
import type { ResultClassSectionStatus, ResultSubjectStatus } from '@/services/exmclResultService'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Entity,
  Menu,
  Progress,
  Sheet,
  type DataTableColumn,
  type Tone,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/result.css'

type ResultEntryStatusPanelProps = {
  loading: boolean
  rows: ResultClassSectionStatus[]
  selectedClass: string
  selectedSection: string
  onSelectClassSection: (className: string, section: string) => void
}

const STATUS: Record<ResultSubjectStatus, { tone: Tone; label: string; bar: 'success' | 'info' | 'accent' }> = {
  complete: { tone: 'success', label: 'Complete', bar: 'success' },
  partial: { tone: 'info', label: 'In progress', bar: 'info' },
  pending: { tone: 'neutral', label: 'Not started', bar: 'accent' },
}

const pct = (filled: number, total: number) => (total > 0 ? Math.round((filled / total) * 100) : 0)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const ResultEntryStatusPanel: React.FC<ResultEntryStatusPanelProps> = ({
  loading,
  rows,
  selectedClass,
  selectedSection,
  onSelectClassSection,
}) => {
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const summary = useMemo(() => {
    const pendingCells = rows.reduce((sum, row) => sum + row.pendingCells, 0)
    const totalCells = rows.reduce((sum, row) => sum + row.totalCells, 0)
    return {
      complete: rows.filter((row) => row.overallStatus === 'complete').length,
      partial: rows.filter((row) => row.overallStatus === 'partial').length,
      pending: rows.filter((row) => row.overallStatus === 'pending').length,
      pendingSubjects: rows.reduce(
        (sum, row) => sum + row.subjects.filter((subject) => subject.status !== 'complete').length,
        0
      ),
      pendingCells,
      totalCells,
      filledCells: totalCells - pendingCells,
    }
  }, [rows])

  const keyOf = (row: ResultClassSectionStatus) => `${row.class}-${row.section}`
  const detail = rows.find((row) => keyOf(row) === detailKey) || null

  const openSheet = (row: ResultClassSectionStatus) => {
    setDetailKey(null)
    onSelectClassSection(row.class, row.section)
  }

  const columns: DataTableColumn<ResultClassSectionStatus>[] = [
    {
      key: 'section',
      header: 'Class',
      mobile: 'title',
      render: (row) => {
        const isOpen = sameText(selectedClass, row.class) && sameText(selectedSection, row.section)
        return (
          <Entity
            primary={`Class ${row.class}-${row.section}`}
            secondary={isOpen ? 'Open in the marks sheet' : `${plural(row.studentCount, 'student')} · ${plural(row.subjectCount, 'subject')}`}
          />
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (row) => <Badge tone={STATUS[row.overallStatus].tone}>{STATUS[row.overallStatus].label}</Badge>,
    },
    {
      key: 'filled',
      header: 'Entered',
      width: 200,
      mobile: 'subtitle',
      render: (row) => (
        <Progress
          value={pct(row.filledCells, row.totalCells)}
          tone={STATUS[row.overallStatus].bar}
          size="sm"
          valueLabel={`${row.filledCells} of ${row.totalCells}`}
          className="ex-status__bar"
        />
      ),
    },
    {
      key: 'pending',
      header: 'Subjects left',
      mobile: 'hidden',
      render: (row) => {
        const names = row.subjects.filter((subject) => subject.status !== 'complete').map((subject) => subject.subjectName)
        if (row.subjects.length === 0) return <span className="cb-muted">No subjects set up</span>
        if (names.length === 0) return <span className="cb-muted">None</span>
        return (
          <span className="ex-status__pending" title={names.join(', ')}>
            {names.join(', ')}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (row) => (
        <Menu
          label={`Actions for Class ${row.class}-${row.section}`}
          items={[
            { label: 'Open marks sheet', icon: PencilLine, onSelect: () => openSheet(row) },
            { label: 'See subject progress', icon: ListChecks, onSelect: () => setDetailKey(keyOf(row)) },
          ]}
        />
      ),
    },
  ]

  return (
    <Card
      flush
      title="Entry status by section"
      subtitle="Marks still to enter for this exam, by class, section and subject"
    >
      {loading ? (
        <CardLoading label="Loading entry status…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active students yet"
          body="Add students in Students to track marks entry by class and section."
        />
      ) : (
        <>
          <div className="ex-status__summary">
            <Progress
              value={pct(summary.filledCells, summary.totalCells)}
              label="Marks entered across all sections"
              valueLabel={`${summary.filledCells} of ${summary.totalCells}`}
            />
            <div className="ex-status__counts">
              <Badge tone="success">{summary.complete} complete</Badge>
              <Badge tone="info">{summary.partial} in progress</Badge>
              <Badge tone="neutral">{summary.pending} not started</Badge>
              <span className="cb-muted">{plural(summary.pendingSubjects, 'subject')} still open</span>
            </div>
          </div>
          <DataTable
            caption="Entry status by section"
            columns={columns}
            rows={rows}
            getRowKey={keyOf}
            onRowClick={(row) => setDetailKey(keyOf(row))}
          />
        </>
      )}

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetailKey(null)}
        title={detail ? `Class ${detail.class}-${detail.section}` : ''}
        description={
          detail
            ? `${plural(detail.studentCount, 'student')} · ${detail.filledCells} of ${detail.totalCells} marks entered`
            : undefined
        }
        icon={ListChecks}
        footer={
          <>
            <Button onClick={() => setDetailKey(null)}>Close</Button>
            <Button variant="primary" icon={PencilLine} onClick={() => detail && openSheet(detail)}>
              Open marks sheet
            </Button>
          </>
        }
      >
        {detail ? (
          detail.subjects.length === 0 ? (
            <EmptyState
              compact
              icon={ListChecks}
              title="No subjects set up for this class"
              body="Add subjects in Subjects, or assign them to students."
            />
          ) : (
            <div className="cb-progress-list">
              {detail.subjects.map((subject) => (
                <div key={subject.subjectId} className="ex-status__subject">
                  <Progress
                    value={pct(subject.filledCount, subject.studentCount)}
                    tone={STATUS[subject.status].bar}
                    label={subject.subjectName}
                    valueLabel={`${subject.filledCount} of ${subject.studentCount}`}
                  />
                  <Badge tone={STATUS[subject.status].tone}>
                    {subject.pendingCount > 0 ? `${subject.pendingCount} to enter` : 'Complete'}
                  </Badge>
                </div>
              ))}
            </div>
          )
        ) : null}
      </Sheet>
    </Card>
  )
}

export default ResultEntryStatusPanel
