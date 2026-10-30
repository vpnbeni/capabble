import { useRouter } from 'expo-router'
import { CalendarOff, ClipboardCheck, CloudOff } from 'lucide-react-native'

import { classLabel, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ClassRegister } from '@/services/staffService'
import { flushAttendanceQueue, registerKey, useAttendanceQueue, type QueuedRegister } from '@/staff/attendanceQueue'
import { useRegisters } from '@/staff/queries'
import { radius } from '@/theme/tokens'
import { Callout, Hero, ListGroup, MobileScreen, NavBar, Skeleton, StatusView, Surface, type ListGroupItem } from '@/ui'

/** "9:12 am" in the school's time zone, for a saved-at timestamp. */
const timeOf = (iso: string) =>
  formatTime(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)))

/** Teacher: today's registers, marked or not, each opening the roll call. Waiting ones show as saved on the phone. */
export default function RegistersScreen() {
  const router = useRouter()
  const today = schoolToday()
  const registers = useRegisters(today)
  const queue = useAttendanceQueue()
  const data = registers.data
  const waitingFor = (register: ClassRegister) => queue.find((entry) => entry.key === registerKey(today, register.className, register.section))

  const mine = (data?.registers ?? []).filter((register) => register.mine)
  const others = (data?.registers ?? []).filter((register) => !register.mine)
  // A login with no class of its own (office) works from the whole school's list.
  const primary = mine.length ? mine : others
  const secondary = mine.length ? others : []
  const done = primary.filter((register) => register.marked || waitingFor(register)).length
  const waiting = queue.filter((entry) => !entry.error && entry.date === today)
  const refused = queue.filter((entry) => entry.error)

  const open = (register: Pick<ClassRegister, 'className' | 'section'>) =>
    router.push({ pathname: '/roll-call', params: { className: register.className, section: register.section, date: today } })

  const row = (register: ClassRegister): ListGroupItem => {
    const queued: QueuedRegister | undefined = waitingFor(register)
    const status = queued
      ? { label: queued.error ? 'Not accepted' : 'Waiting to send', tone: queued.error ? ('danger' as const) : ('info' as const) }
      : register.marked
        ? { label: 'Marked', tone: 'success' as const }
        : { label: 'Not marked', tone: 'warning' as const }
    const subtitle = queued
      ? `Saved on this phone · ${queued.absent} absent`
      : register.marked
        ? `Marked at ${timeOf(register.markedAt as string)} · ${register.absent} absent`
        : `${register.students} ${register.students === 1 ? 'student' : 'students'}`
    return {
      title: classLabel(register.className, register.section),
      subtitle,
      icon: ClipboardCheck,
      tile: 5,
      badge: status,
      onPress: register.canMark ? () => open(register) : undefined,
    }
  }

  return (
    <MobileScreen
      tabs
      refreshing={registers.isRefetching}
      onRefresh={() => {
        registers.refetch()
        flushAttendanceQueue()
      }}
      nav={<NavBar large eyebrow={formatDayKey(today, { weekday: 'short' })} title="Attendance" />}
    >
      {refused.length ? (
        <Callout tone="danger" title={`${refused.length === 1 ? 'A register was' : `${refused.length} registers were`} not accepted`}>
          {`Open ${refused.map((entry) => classLabel(entry.className, entry.section)).join(', ')} to see why.`}
        </Callout>
      ) : null}
      {waiting.length ? (
        <Callout tone="info" icon={CloudOff} title={`${waiting.length === 1 ? '1 register' : `${waiting.length} registers`} saved on this phone`} action={{ label: 'Send now', onPress: () => flushAttendanceQueue() }}>
          {"They haven't reached school yet. They're sent by themselves when you're back online."}
        </Callout>
      ) : null}

      {registers.isPending ? (
        <>
          <Skeleton height={130} radius={radius['radius-xl']} />
          <CardSkeleton rows={3} />
        </>
      ) : registers.isError ? (
        // Offline before the list ever loaded: registers waiting on the phone are still listed above.
        <LoadFailed what="Today's registers" error={registers.error} onRetry={registers.refetch} />
      ) : data?.day && !data.day.working ? (
        <Hero tone="surface" icon={CalendarOff} label="No school today" value={data.day.label || 'Day off'} />
      ) : !primary.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={ClipboardCheck} title="No registers for you" body="Classes you teach or are in charge of show here. Ask the office if one is missing." />
        </Surface>
      ) : (
        <>
          <Hero
            label={mine.length ? 'Your registers today' : 'Registers today'}
            value={done === primary.length ? 'All marked' : `${primary.length - done} to mark`}
            detail={`${done} of ${primary.length} marked`}
            progress={Math.round((done / primary.length) * 100)}
            ariaLabel={`${done} of ${primary.length} registers marked today`}
          />
          <ListGroup header={mine.length ? 'Your classes' : 'Classes'} items={primary.map(row)} />
          {secondary.length ? <ListGroup header="Other classes" items={secondary.map(row)} /> : null}
        </>
      )}
    </MobileScreen>
  )
}
