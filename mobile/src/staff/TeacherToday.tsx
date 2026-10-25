import { useRouter } from 'expo-router'
import { CalendarOff, Clock, ClipboardCheck } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { classLabel, formatDayKey, formatTime, minutesBetween, schoolTimeNow, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ClassRegister, MyPeriod } from '@/services/staffService'
import { radius, space } from '@/theme/tokens'
import { Callout, Hero, MobileScreen, NavBar, Section, Skeleton, StatusView, Surface, Timeline, type TimelineItem } from '@/ui'

import { useMyTimetable, useRegisters } from './queries'
import { useStaff } from './useStaff'

/** The school clock, ticking every 30 s so "now" and "in 12 min" stay true while the screen is open. */
function useSchoolNow() {
  const [now, setNow] = useState(schoolTimeNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(schoolTimeNow()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

// "I" or "3" → "Period I"; "1st" → "1st period"; anything longer is the school's own name for it.
const periodName = (label: string) =>
  /^[0-9IVXivx]{1,4}$/.test(label) ? `Period ${label}` : /^\d+(st|nd|rd|th)$/i.test(label) ? `${label} period` : label
const classTitle = (period: MyPeriod) => [classLabel(period.className, period.section), period.subject].filter(Boolean).join(' · ')
const sameSection = (register: ClassRegister, period: MyPeriod) =>
  classLabel(register.className, register.section) === classLabel(period.className, period.section)

/**
 * A teacher's day: the next class as the Hero, registers still to mark, and the day's periods.
 * Design system: ScreensStaff · Teacher · Today.
 */
export function TeacherToday() {
  const router = useRouter()
  const { canUse, can } = useStaff()
  const today = schoolToday()
  const now = useSchoolNow()
  const showTimetable = canUse('timetable_class_wise') || canUse('timetable_teacher_wise') || canUse('timetable_classes')
  const showRegisters = canUse('attnd_student_attendance') && can('attnd.students.write')
  const timetable = useMyTimetable(today, today, true)
  const registers = useRegisters(today, showRegisters)

  const day = timetable.data?.days[0]
  const periods = day?.periods ?? []
  const classes = periods.filter((period) => period.kind === 'class')
  const current = classes.find((period) => period.start <= now && now < period.end)
  const next = classes.find((period) => period.start > now)
  const offToday = day ? !day.working : registers.data?.day?.working === false
  const dayOffName = day?.label || registers.data?.day?.label || 'Day off'

  // Own registers first; a whole-school login (office) with no class of its own sees none here.
  const toMark = (registers.data?.registers ?? []).filter((register) => register.mine && register.canMark && !register.marked)
  const unmarkedFor = (period?: MyPeriod) => (period ? toMark.find((register) => sameSection(register, period)) : undefined)
  const openRollCall = (register?: Pick<ClassRegister, 'className' | 'section'>) =>
    router.push(register ? { pathname: '/roll-call', params: { className: register.className, section: register.section, date: today } } : '/registers')

  const timelineItems: TimelineItem[] = periods
    .filter((period) => period.kind !== 'break')
    .map((period) => {
      const state = now >= period.end ? 'done' : now >= period.start ? 'current' : 'upcoming'
      const register = period.kind === 'class' ? unmarkedFor(period) : undefined
      return {
        time: formatTime(period.start),
        title: period.kind === 'class' ? classTitle(period) : 'Free period',
        detail: period.label ? periodName(period.label) : undefined,
        state,
        badge: register ? { label: 'Not marked', tone: 'warning' as const } : undefined,
      }
    })

  return (
    <MobileScreen
      tabs
      refreshing={timetable.isRefetching || registers.isRefetching}
      onRefresh={() => {
        timetable.refetch()
        if (showRegisters) registers.refetch()
      }}
      nav={<NavBar large eyebrow={formatDayKey(today, { weekday: 'short' })} title="Today" />}
    >
      {timetable.isPending ? (
        <>
          <Skeleton height={150} radius={radius['radius-xl']} />
          <View style={{ gap: space['space-3'] }}>
            <Skeleton width={120} height={20} />
            <CardSkeleton rows={4} />
          </View>
        </>
      ) : offToday ? (
        <Hero tone="surface" icon={CalendarOff} label="No school today" value={dayOffName} />
      ) : (
        <NextClassHero now={now} current={current} next={next} classesToday={classes.length} unmarked={unmarkedFor(current ?? next)} onMark={openRollCall} />
      )}

      {!offToday && toMark.length ? (
        <Callout
          tone="warning"
          icon={ClipboardCheck}
          title={
            toMark.length === 1
              ? `${classLabel(toMark[0].className, toMark[0].section)} register not marked`
              : `${toMark.length} registers not marked`
          }
          action={{ label: 'Mark', onPress: () => openRollCall(toMark.length === 1 ? toMark[0] : undefined) }}
        >
          {toMark.length === 1
            ? "Today's attendance is still open."
            : toMark.map((register) => classLabel(register.className, register.section)).join(', ')}
        </Callout>
      ) : null}
      {registers.isError ? <LoadFailed what="Your registers" error={registers.error} onRetry={registers.refetch} /> : null}

      {timetable.isError ? (
        <LoadFailed what="Your periods" error={timetable.error} onRetry={timetable.refetch} />
      ) : timetable.data && !timetable.data.teacher && showTimetable ? (
        <Callout tone="info" title="Your login isn't linked to the timetable">
          Ask the school office to link your login to your staff record. Your periods show here once it is.
        </Callout>
      ) : !offToday && timetable.data?.teacher && !classes.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarOff} title="No classes for you today" body="Your periods show here on days you teach." />
        </Surface>
      ) : timelineItems.length ? (
        <Section title="Your periods">
          <Surface>
            <Timeline compact items={timelineItems} />
          </Surface>
        </Section>
      ) : null}
    </MobileScreen>
  )
}

function NextClassHero({
  now,
  current,
  next,
  classesToday,
  unmarked,
  onMark,
}: {
  now: string
  current?: MyPeriod
  next?: MyPeriod
  classesToday: number
  unmarked?: ClassRegister
  onMark: (register: ClassRegister) => void
}) {
  const action = unmarked ? { label: 'Mark attendance', onPress: () => onMark(unmarked) } : undefined

  if (current) {
    const left = minutesBetween(now, current.end)
    return (
      <Hero
        icon={Clock}
        label={`Now · ${classTitle(current)}`}
        value={`${left} min left`}
        detail={`${current.label ? `${periodName(current.label)} · ` : ''}until ${formatTime(current.end)}`}
        ariaLabel={`Now: ${classTitle(current)}, ${left} minutes left, until ${formatTime(current.end)}`}
        action={action}
      />
    )
  }
  if (next) {
    const wait = minutesBetween(now, next.start)
    const value = wait <= 60 ? `${wait} min` : formatTime(next.start)
    return (
      <Hero
        icon={Clock}
        label={`Next · ${classTitle(next)}`}
        value={value}
        detail={`${next.label ? `${periodName(next.label)} · ` : ''}${formatTime(next.start)} to ${formatTime(next.end)}`}
        ariaLabel={`Next: ${classTitle(next)}, ${wait <= 60 ? `in ${wait} minutes` : `at ${formatTime(next.start)}`}`}
        action={action}
      />
    )
  }
  if (!classesToday) return null
  return (
    <Hero
      tone="surface"
      icon={Clock}
      label="Classes today"
      value={String(classesToday)}
      detail="All done for today."
    />
  )
}
