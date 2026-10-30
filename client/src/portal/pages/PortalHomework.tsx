import React from 'react'
import { BookOpenCheck } from 'lucide-react'
import { Badge, Card, DataTable, EmptyState, Page, PageHeader, formatDayKey, type DataTableColumn, type Tone } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalHomework } from '../usePortal'
import type { PortalHomework as Homework } from '../portalService'
import { LoadFailed, NoChild } from './shared'

/** Today in the school's time zone, as a day key. */
const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

const SUBMISSION: Record<NonNullable<Homework['submission']>['status'], { label: string; tone: Tone }> = {
  submitted: { label: 'Handed in', tone: 'success' },
  late: { label: 'Handed in late', tone: 'warning' },
  missing: { label: 'Not handed in', tone: 'danger' },
  excused: { label: 'Excused', tone: 'neutral' },
}

/** The child's own mark when the teacher has recorded one; otherwise when it is due. */
export const homeworkStatus = (work: Homework, today: string): { label: string; tone: Tone } => {
  if (work.submission) return SUBMISSION[work.submission.status]
  if (work.dueDate === today) return { label: 'Due today', tone: 'warning' }
  if (work.dueDate > today) return { label: 'Due', tone: 'info' }
  return { label: 'Past', tone: 'neutral' }
}

const columns = (today: string): DataTableColumn<Homework>[] => [
  { key: 'due', header: 'Due', mobile: 'subtitle', render: (work) => formatDayKey(work.dueDate, { weekday: 'short' }) },
  {
    key: 'title',
    header: 'Homework',
    mobile: 'title',
    wrap: true,
    render: (work) => (
      <>
        <div className="cb-strong">{work.title}</div>
        {work.instructions ? <div className="cb-muted">{work.instructions}</div> : null}
        {work.submission?.remark ? <div className="cb-subtle">{`Teacher: ${work.submission.remark}`}</div> : null}
      </>
    ),
  },
  { key: 'subject', header: 'Subject', mobile: 'subtitle', render: (work) => [work.subjectName, work.teacherName].filter(Boolean).join(' · ') },
  {
    key: 'status',
    header: 'Status',
    mobile: 'aside',
    render: (work) => {
      const status = homeworkStatus(work, today)
      return <Badge tone={status.tone}>{status.label}</Badge>
    },
  },
]

/** Homework set for the child's class: what is due, then the last two weeks. */
const PortalHomework: React.FC = () => {
  const { child } = usePortal()
  const { data = [], isLoading, isError } = usePortalHomework(child?.studentId)
  if (!child) return <Page><NoChild /></Page>

  const today = schoolToday()
  const due = data.filter((work) => work.dueDate >= today && work.status === 'published')
  const earlier = data.filter((work) => !due.includes(work)).sort((a, b) => b.dueDate.localeCompare(a.dueDate))

  return (
    <Page>
      <PageHeader title="Homework" subtitle={child.name} />
      {isError ? <LoadFailed what="Homework" /> : null}
      {!isLoading && !isError ? (
        <div className="cb-stack">
          <Card title="Due" flush>
            <DataTable
              columns={columns(today)}
              rows={due}
              getRowKey={(work) => work.id}
              empty={<EmptyState compact icon={BookOpenCheck} title="Nothing due" body="Homework the teachers set shows here until it is due." />}
            />
          </Card>
          {earlier.length ? (
            <Card title="Last two weeks" flush>
              <DataTable columns={columns(today)} rows={earlier} getRowKey={(work) => work.id} />
            </Card>
          ) : null}
        </div>
      ) : null}
    </Page>
  )
}

export default PortalHomework
