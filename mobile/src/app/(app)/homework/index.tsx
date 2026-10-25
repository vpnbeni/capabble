import { useLocalSearchParams, useRouter } from 'expo-router'
import { NotebookPen } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { FamilyHomework } from '@/portal/FamilyHomework'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Homework, HomeworkStatus } from '@/services/homeworkService'
import { useSession } from '@/session/SessionProvider'
import { useHomeworkList, useHomeworkStatus } from '@/staff/queries'
import { type Tone } from '@/theme/tokens'
import { ActionBar, ActionSheet, ListGroup, MobileScreen, NavBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

// Same words and tones as the website (client/src/components/acdmc/AcdmcUi.tsx).
const STATUS: Record<HomeworkStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'info' },
  closed: { label: 'Closed', tone: 'success' },
}

type View = 'due' | 'drafts' | 'past'

export default function HomeworkScreen() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  return session.user.kind === 'staff' ? <StaffHomework /> : <FamilyHomework />
}

/** Homework for the teacher's classes (or one class): what is due, drafts, and what has passed. */
function StaffHomework() {
  const router = useRouter()
  const toast = useToast()
  const { className = '', section = '' } = useLocalSearchParams<{ className?: string; section?: string }>()
  const today = schoolToday()
  const list = useHomeworkList(className, section, dayKeyAdd(today, -30))
  const setStatus = useHomeworkStatus()
  const [view, setView] = useState<View>('due')
  const [open, setOpen] = useState<Homework | null>(null)

  const items = list.data ?? []
  const due = items.filter((work) => work.status === 'published' && work.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const drafts = items.filter((work) => work.status === 'draft')
  const past = items.filter((work) => work.status === 'closed' || (work.status === 'published' && work.dueDate < today))
  const shown = view === 'due' ? due : view === 'drafts' ? drafts : past
  const oneClass = Boolean(className && section)

  const change = async (work: Homework, status: HomeworkStatus) => {
    setOpen(null)
    try {
      await setStatus.mutateAsync({ id: work._id, status })
      haptic.success()
      toast(status === 'published' ? 'Homework published' : 'Homework closed')
    } catch (error) {
      haptic.error()
      toast(error instanceof Error ? error.message : "That didn't save. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title={oneClass ? `Homework · ${classLabel(className, section)}` : 'Homework'} back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        <ActionBar
          icon={NotebookPen}
          summary={oneClass ? classLabel(className, section) : 'Homework'}
          detail={due.length ? `${due.length} due` : 'Nothing due'}
          label="Post homework"
          onPress={() => router.push({ pathname: '/homework/new', params: oneClass ? { className, section } : {} })}
        />
      }
      overlay={
        <ActionSheet
          open={Boolean(open)}
          onClose={() => setOpen(null)}
          title={open?.title ?? ''}
          message={open ? `${classLabel(open.className, open.section)} · ${open.subjectName} · due ${formatDayKey(open.dueDate, { weekday: 'short' })}` : undefined}
          actions={
            open
              ? [
                  {
                    label: 'Edit homework',
                    onSelect: () => {
                      setOpen(null)
                      router.push({ pathname: '/homework/new', params: { id: open._id } })
                    },
                  },
                  ...(open.status === 'draft' ? [{ label: 'Publish homework', onSelect: () => change(open, 'published') }] : []),
                  ...(open.status === 'published' ? [{ label: 'Close homework', onSelect: () => change(open, 'closed') }] : []),
                ]
              : []
          }
        />
      }
    >
      <SegmentedControl
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'due', label: due.length ? `Due ${due.length}` : 'Due' },
          { value: 'drafts', label: drafts.length ? `Drafts ${drafts.length}` : 'Drafts' },
          { value: 'past', label: 'Past' },
        ]}
      />
      {list.isPending ? (
        <CardSkeleton rows={4} />
      ) : list.isError ? (
        <LoadFailed what="Homework" error={list.error} onRetry={list.refetch} />
      ) : shown.length ? (
        <ListGroup
          items={shown.map((work) => ({
            title: work.title,
            subtitle: [oneClass ? null : classLabel(work.className, work.section), work.subjectName, `due ${formatDayKey(work.dueDate, { weekday: 'short' })}`]
              .filter(Boolean)
              .join(' · '),
            icon: NotebookPen,
            tile: 4 as const,
            badge: STATUS[work.status],
            onPress: () => setOpen(work),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={NotebookPen}
            title={view === 'due' ? 'No homework due' : view === 'drafts' ? 'No drafts' : 'Nothing in the last 30 days'}
            body={view === 'due' ? 'Homework you post shows here until its due date.' : 'Drafts saved on the website show here to publish.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
