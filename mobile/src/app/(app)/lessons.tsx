import { useRouter } from 'expo-router'
import { BookOpen, Check } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { LessonPlan } from '@/services/lessonService'
import { useLessonPlans, useLessonStatus } from '@/staff/queries'
import { useTheme } from '@/theme/ThemeProvider'
import type { Tone } from '@/theme/tokens'
import { ActionSheet, BottomSheet, DetailList, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Surface, WeekStrip, haptic, useToast, type WeekDay } from '@/ui'

// Same words as the website's Academics → Lesson plans.
const STATUS: Record<LessonPlan['status'], { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  planned: { label: 'Planned', tone: 'info' },
  published: { label: 'Planned', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay()
const weekStart = (key: string) => dayKeyAdd(key, -((weekdayOf(key) + 6) % 7))

/**
 * A teacher's lesson plans a week at a time: what each lesson covers, and "Mark taught" after
 * class (which moves the syllabus coverage on). Plans are written on the website (a long form).
 */
export default function LessonPlansScreen() {
  const router = useRouter()
  const toast = useToast()
  const { colors } = useTheme()
  const today = schoolToday()
  const [selected, setSelected] = useState(today)
  const monday = weekStart(selected)
  const plans = useLessonPlans(monday, dayKeyAdd(monday, 6))
  const setStatus = useLessonStatus()
  const [open, setOpen] = useState<LessonPlan | null>(null)
  const [detail, setDetail] = useState<LessonPlan | null>(null)
  const [taught, setTaught] = useState<LessonPlan | null>(null)
  const [note, setNote] = useState('')
  const items = plans.data ?? []
  const day = items.filter((plan) => plan.date === selected)

  const week: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = dayKeyAdd(monday, index)
    return { date, weekday: WEEKDAYS[weekdayOf(date)], day: Number(date.slice(8)), today: date === today, dots: items.some((plan) => plan.date === date) ? [colors.accent] : undefined }
  })

  const change = async (plan: LessonPlan, status: 'delivered' | 'cancelled' | 'planned', deliveryNote?: string) => {
    try {
      await setStatus.mutateAsync({ id: plan._id, status, note: deliveryNote })
      haptic.success()
      toast(status === 'delivered' ? 'Marked taught' : status === 'cancelled' ? 'Lesson cancelled' : 'Back to planned')
      setTaught(null)
      setNote('')
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={plans.isRefetching}
      onRefresh={plans.refetch}
      nav={<NavBar title="Lesson plans" back={{ label: 'Back', onPress: router.back }} />}
      overlay={
        <>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.title ?? ''}
            message={open ? `${classLabel(open.className, open.section)} · ${open.subjectName}` : undefined}
            actions={
              open
                ? [
                    { label: 'See the plan', icon: BookOpen, onSelect: () => (setOpen(null), setDetail(open)) },
                    ...(open.status !== 'delivered' && open.status !== 'cancelled' ? [{ label: 'Mark taught', icon: Check, onSelect: () => (setOpen(null), setTaught(open)) }] : []),
                    ...(open.status === 'delivered' || open.status === 'cancelled' ? [{ label: 'Back to planned', onSelect: () => (setOpen(null), change(open, 'planned')) }] : []),
                    ...(open.status !== 'cancelled' && open.status !== 'delivered' ? [{ label: 'Cancel lesson', tone: 'danger' as const, onSelect: () => (setOpen(null), change(open, 'cancelled')) }] : []),
                  ]
                : []
            }
          />
          <BottomSheet
            open={Boolean(taught)}
            onClose={() => setTaught(null)}
            title="Mark taught"
            description={taught ? `${taught.title} · ${classLabel(taught.className, taught.section)}` : undefined}
            footer={
              <MobileButton fullWidth loading={setStatus.isPending} onPress={() => taught && change(taught, 'delivered', note.trim())}>
                Mark taught
              </MobileButton>
            }
          >
            <MobileTextField label="How it went (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="Finished the exercise; revise 4.3 next time" />
          </BottomSheet>
          <BottomSheet open={Boolean(detail)} onClose={() => setDetail(null)} detent="large" title={detail?.title ?? ''} description={detail ? `${classLabel(detail.className, detail.section)} · ${detail.subjectName} · ${formatDayKey(detail.date, { weekday: 'short' })}` : undefined}>
            {detail ? (
              <DetailList
                items={[
                  { label: 'Topic', value: detail.topic, wide: true },
                  { label: 'Objectives', value: detail.objectives, wide: true },
                  { label: 'Activities', value: detail.activities, wide: true },
                  { label: 'Resources', value: detail.resources, wide: true },
                  { label: 'Assessment', value: detail.assessment, wide: true },
                  ...(detail.deliveryNote ? [{ label: 'How it went', value: detail.deliveryNote, wide: true }] : []),
                ]}
              />
            ) : null}
          </BottomSheet>
        </>
      }
    >
      <WeekStrip days={week} value={selected} onChange={setSelected} onWeekChange={(delta) => setSelected(dayKeyAdd(monday, delta * 7))} label="Day" />
      {plans.isPending ? (
        <CardSkeleton rows={3} />
      ) : plans.isError ? (
        <LoadFailed what="Lesson plans" error={plans.error} onRetry={plans.refetch} />
      ) : day.length ? (
        <ListGroup
          items={day.map((plan) => ({
            title: plan.title,
            subtitle: [classLabel(plan.className, plan.section), plan.subjectName, plan.periods && plan.periods > 1 ? `${plan.periods} periods` : null].filter(Boolean).join(' · '),
            lines: 2,
            icon: BookOpen,
            tile: 4,
            badge: STATUS[plan.status],
            onPress: () => setOpen(plan),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={BookOpen} title={`No lessons planned for ${selected === today ? 'today' : formatDayKey(selected, { weekday: 'short' })}`} body="Plans written on the website show here on their day." />
        </Surface>
      )}
    </MobileScreen>
  )
}
