import React from 'react'
import { GraduationCap } from 'lucide-react'
import { Badge, Card, DataTable, EmptyState, Page, PageHeader, type DataTableColumn } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalResults } from '../usePortal'
import type { PortalResult } from '../portalService'
import { LoadFailed, NoChild } from './shared'

type SubjectRow = PortalResult['subjects'][number]

const columns: DataTableColumn<SubjectRow>[] = [
  {
    key: 'subject',
    header: 'Subject',
    mobile: 'title',
    render: (row) => (
      <>
        {row.name}
        {row.role === 'additional' ? <> <Badge tone="neutral" dot={false}>Additional</Badge></> : null}
      </>
    ),
  },
  { key: 'marks', header: 'Marks', numeric: true, mobile: 'subtitle', render: (row) => `${row.marksObtained} / ${row.maxMarks}` },
  { key: 'grade', header: 'Grade', mobile: 'aside', render: (row) => row.grade || '—' },
]

/** Marks for exams the school has published to families. */
const PortalResults: React.FC = () => {
  const { child } = usePortal()
  const { data = [], isLoading, isError } = usePortalResults(child?.studentId)

  if (!child) return <Page><NoChild /></Page>

  return (
    <Page>
      <PageHeader title="Results" subtitle={child.name} />
      {isError ? <LoadFailed what="Results" /> : null}
      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <EmptyState icon={GraduationCap} title="No results published yet" body="Marks appear here once the school publishes an exam's results." />
        </Card>
      ) : null}
      {[...data].reverse().map((exam) => (
        <Card
          key={exam.examId}
          flush
          title={exam.examName}
          subtitle={`${exam.total} / ${exam.maxTotal} · ${exam.percentage}%`}
          action={exam.grade ? <Badge tone="neutral" dot={false}>Grade {exam.grade}</Badge> : undefined}
        >
          <DataTable columns={columns} rows={exam.subjects} getRowKey={(row) => row.name} />
        </Card>
      ))}
    </Page>
  )
}

export default PortalResults
