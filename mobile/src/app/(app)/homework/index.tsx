import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'

import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { FamilyHomework } from '@/portal/FamilyHomework'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Homework, HomeworkStatus, WorkKind } from '@/services/homeworkService'
import { useSession } from '@/session/SessionProvider'
import { useHomeworkList, useHomeworkStatus } from '@/staff/queries'
import { WORK } from '@/staff/workUi'
import { type Tone } from '@/theme/tokens'
import { ActionBar, ActionSheet, ChipRail, ListGroup, MobileScreen, NavBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

// Same words and tones as the website (client/src/components/acdmc/AcdmcUi.tsx).
const STATUS: Record<HomeworkStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'info' },
  closed: { label: 'Closed', tone: 'success' },
}

type View = 'due' | 'drafts' | 'past'

const dayOf = (work: Homework) => work.date || work.dueDate

export default function HomeworkScreen() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  return session.user.kind === 'staff' ? <StaffHomework /> : <FamilyHomework />
}

/**
 * Homework, assignments and quizzes for the teacher's classes (or one class): what is due, drafts,
 * and what has passed. Each opens its submissions to tick off and mark.
 */
function StaffHomework() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ className?: string; section?: string; kind?: WorkKind }>()
  const { className = '', section = '' } = params
  const [kind, setKind] = useState<WorkKind>(params.kind && WORK[params.kind] ? params.kind : 'homework')
  const words = WORK[kind]
  const today = schoolToday()
  const list = useHomeworkList(className, section, dayKeyAdd(today, -30), kind)
  const setStatus = useHomeworkStatus(kind)
  const [view, setView] = useState<View>('due')
  const [open, setOpen] = useState<Homework | null>(null)

  const items = list.data ?? []
  const due = items.filter((work) => work.status === 'published' && dayOf(work) >= today).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))
  const drafts = items.filter((work) => work.status === 'draft')
  const past = items.filter((work) => work.status === 'closed' || (work.status === 'published' && dayOf(work) < today))
  const shown = view === 'due' ? due : view === 'drafts' ? drafts : past
  const oneClass = Boolean(className && section)

  const change = async (work: Homework, status: HomeworkStatus) => {
    setOpen(null)
    try {
      await setStatus.mutateAsync({ id: work._id, status })
      haptic.success()
      toast(`${words.title === 'Homework' ? 'Homework' : words.one[0].toUpperCase() + words.one.slice(1)} ${status === 'published' ? 'published' : 'closed'}`)
    } catch (error) {
      haptic.error()
      toast(error instanceof Error ? error.message : "That didn't save. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title={oneClass ? `${words.title} · ${classLabel(className, section)}` : words.title} back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        words.post ? (
          <ActionBar
            icon={words.icon}
            summary={oneClass ? classLabel(className, section) : words.title}
            detail={due.length ? `${due.length} due` : 'Nothing due'}
            label={words.post}
            onPress={() => router.push({ pathname: '/homework/new', params: { kind, ...(oneClass ? { className, section } : {}) } })}
          />
        ) : undefined
      }
      overlay={
        <ActionSheet
          open={Boolean(open)}
          onClose={() => setOpen(null)}
          title={open?.title ?? ''}
          message={open ? `${classLabel(open.className, open.section)} · ${open.subjectName} · ${kind === 'quiz' ? 'on' : 'due'} ${formatDayKey(dayOf(open), { weekday: 'short' })}` : undefined}
          actions={
            open
              ? [
                  ...(open.status !== 'draft'
                    ? [
                        {
                          label: kind === 'homework' ? 'Check who did it' : 'Check and mark',
                          onSelect: () => {
                            setOpen(null)
                            router.push({ pathname: '/homework/check', params: { kind, id: open._id } })
                          },
                        },
                      ]
                    : []),
                  ...(words.post
                    ? [
                        {
                          label: `Edit ${words.one}`,
                          onSelect: () => {
                            setOpen(null)
                            router.push({ pathname: '/homework/new', params: { kind, id: open._id } })
                          },
                        },
                      ]
                    : []),
                  ...(open.status === 'draft' ? [{ label: `Publish ${words.one}`, onSelect: () => change(open, 'published') }] : []),
                  ...(open.status === 'published' ? [{ label: `Close ${words.one}`, onSelect: () => change(open, 'closed') }] : []),
                ]
              : []
          }
        />
      }
    >
      <ChipRail
        label="Kind of work"
        value={kind}
        onChange={(next) => {
          setKind(next)
          setView('due')
        }}
        items={(Object.keys(WORK) as WorkKind[]).map((id) => ({ id, label: WORK[id].title }))}
      />
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
        <LoadFailed what={words.title} error={list.error} onRetry={list.refetch} />
      ) : shown.length ? (
        <ListGroup
          items={shown.map((work) => ({
            title: work.title,
            subtitle: [
              oneClass ? null : classLabel(work.className, work.section),
              work.subjectName,
              `${kind === 'quiz' ? 'on' : 'due'} ${formatDayKey(dayOf(work), { weekday: 'short' })}`,
              work.status !== 'draft' && work.summary?.total ? `${work.summary.turnedIn} of ${work.summary.total} turned in` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            lines: 2,
            icon: words.icon,
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
            icon={words.icon}
            title={view === 'due' ? `No ${kind === 'homework' ? 'homework' : words.title.toLowerCase()} due` : view === 'drafts' ? 'No drafts' : 'Nothing in the last 30 days'}
            body={
              kind === 'quiz'
                ? 'Quizzes are written with their questions on the website; they show here to check and mark.'
                : view === 'due'
                  ? kind === 'homework'
                    ? 'Homework you post shows here until its due date.'
                    : 'Assignments you set show here until their due date.'
                  : 'Drafts saved on the website show here to publish.'
            }
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
