import { useRouter } from 'expo-router'
import { NotebookPen } from 'lucide-react-native'
import { useState } from 'react'

import { formatDayKey, schoolToday } from '@/lib/format'
import type { PortalHomework } from '@/services/portalService'
import { type Tone } from '@/theme/tokens'
import { BottomSheet, DetailList, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, type ListGroupItem } from '@/ui'

import { ChildSwitcher } from './ChildSwitcher'
import { usePortal } from './PortalProvider'
import { usePortalHomework } from './queries'
import { CardSkeleton, LoadFailed, NoChild } from './states'

// Same words as the web portal (client/src/portal/pages/PortalHomework.tsx).
const SUBMISSION: Record<NonNullable<PortalHomework['submission']>['status'], { label: string; tone: Tone }> = {
  submitted: { label: 'Handed in', tone: 'success' },
  late: { label: 'Handed in late', tone: 'warning' },
  missing: { label: 'Not handed in', tone: 'danger' },
  excused: { label: 'Excused', tone: 'neutral' },
}

const statusOf = (work: PortalHomework, today: string): { label: string; tone: Tone } => {
  if (work.submission) return SUBMISSION[work.submission.status]
  if (work.dueDate === today) return { label: 'Due today', tone: 'warning' }
  if (work.dueDate > today) return { label: 'Due', tone: 'info' }
  return { label: 'Past', tone: 'neutral' }
}

/** Homework set for the child's class: what is due (soonest first), then the last two weeks. */
export function FamilyHomework() {
  const router = useRouter()
  const { child } = usePortal()
  const homework = usePortalHomework(child?.studentId)
  const [open, setOpen] = useState<PortalHomework | null>(null)
  const today = schoolToday()
  const data = homework.data ?? []
  const due = data.filter((work) => work.dueDate >= today && work.status === 'published')
  const earlier = data.filter((work) => !due.includes(work)).sort((a, b) => b.dueDate.localeCompare(a.dueDate))

  const row = (work: PortalHomework): ListGroupItem => ({
    title: work.title,
    subtitle: `${work.subjectName} · due ${work.dueDate === today ? 'today' : formatDayKey(work.dueDate, { weekday: 'short' })}`,
    icon: NotebookPen,
    tile: 4,
    badge: statusOf(work, today),
    lines: 2,
    onPress: () => setOpen(work),
  })

  return (
    <MobileScreen
      refreshing={homework.isRefetching}
      onRefresh={homework.refetch}
      nav={<NavBar title="Homework" back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
      overlay={
        <BottomSheet
          open={Boolean(open)}
          onClose={() => setOpen(null)}
          title={open?.title ?? ''}
          description={open ? `${open.subjectName} · due ${formatDayKey(open.dueDate, { weekday: 'long', month: 'long' })}` : undefined}
          footer={
            <MobileButton variant="gray" fullWidth onPress={() => setOpen(null)}>
              Done
            </MobileButton>
          }
        >
          {open ? (
            <DetailList
              items={[
                { label: 'Status', value: statusOf(open, today).label },
                { label: 'Set by', value: open.teacherName },
                { label: 'Set on', value: open.assignedDate ? formatDayKey(open.assignedDate, { weekday: 'short' }) : null },
                ...(open.instructions ? [{ label: 'Instructions', value: open.instructions, wide: true }] : []),
                ...(open.submission?.remark ? [{ label: "Teacher's note", value: open.submission.remark, wide: true }] : []),
              ]}
            />
          ) : null}
        </BottomSheet>
      }
    >
      {!child ? (
        <NoChild />
      ) : homework.isPending ? (
        <CardSkeleton rows={3} />
      ) : homework.isError ? (
        <LoadFailed what="Homework" error={homework.error} onRetry={homework.refetch} />
      ) : (
        <>
          {due.length ? (
            <ListGroup header="Due" items={due.map(row)} />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={NotebookPen} title="Nothing due" body="Homework the teachers set shows here until it is due." />
            </Surface>
          )}
          {earlier.length ? <ListGroup header="Last two weeks" items={earlier.map(row)} /> : null}
        </>
      )}
    </MobileScreen>
  )
}
