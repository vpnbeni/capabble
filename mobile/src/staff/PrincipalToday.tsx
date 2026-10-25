import { useRouter } from 'expo-router'
import { ClipboardCheck, ListChecks, Users, Wallet } from 'lucide-react-native'

import { formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { LoadFailed } from '@/portal/states'
import { useSession } from '@/session/SessionProvider'
import { radius } from '@/theme/tokens'
import { MobileScreen, NavBar, Section, Skeleton, StatTiles, StatusView, Surface, useToast, type StatTile } from '@/ui'

import { ApprovalList, useApprovals } from './approvals'
import { useAttendanceGlance, useFeesGlance, useRegisters } from './queries'
import { TodayMeetings } from './TodayMeetings'
import { openWebsite, useStaff } from './useStaff'

/**
 * The principal's glance: four numbers, each opening its list, then what waits for a decision.
 * Read-only apart from approvals. Design system: ScreensStaff · Principal glance.
 */
export function PrincipalToday() {
  const router = useRouter()
  const toast = useToast()
  const session = useSession()
  const staff = useStaff()
  const today = schoolToday()
  const seesStudents = staff.canUse('attnd_student_attendance')
  const seesStaff = staff.canUse('attnd_staff_attendance')
  const seesFees = staff.canUse('cpitl_dashboard')
  const attendance = useAttendanceGlance(today, seesStudents || seesStaff)
  const registers = useRegisters(today, seesStudents)
  const fees = useFeesGlance(seesFees)
  const approvals = useApprovals()

  const tiles: StatTile[] = []
  const day = attendance.data?.today
  if (seesStudents && attendance.data) {
    const { students } = attendance.data
    const notMarked = (registers.data?.registers ?? []).filter((register) => !register.marked).length
    tiles.push({
      label: 'Present today',
      value: day && !day.working ? 'No school' : students.strength ? `${Math.round((students.todayPresent / students.strength) * 1000) / 10}%` : '—',
      detail: day && !day.working ? day.label || 'Day off' : notMarked ? `${notMarked} ${notMarked === 1 ? 'class' : 'classes'} not marked` : 'All registers marked',
      tone: day?.working && notMarked ? 'warning' : undefined,
      icon: ClipboardCheck,
      tile: 5,
      onPress: () => router.push('/school-attendance'),
    })
  }
  if (seesFees && fees.data) {
    const month = today.slice(0, 7)
    const thisMonth = fees.data.byMonth.find((entry) => entry.month === month)?.amount ?? 0
    tiles.push({
      label: 'Fees this month',
      value: formatINR(thisMonth, { compact: true }),
      detail: fees.data.payments.today ? `${formatINR(fees.data.payments.today, { compact: true })} today` : `${Math.round(fees.data.totals.collectionRate)}% of the year collected`,
      icon: Wallet,
      tile: 3,
      onPress: () => router.push('/fee-collection'),
    })
  }
  if (approvals.enabled) {
    const events = approvals.items.filter((item) => item.kind === 'event').length
    const meetings = approvals.items.length - events
    tiles.push({
      label: 'Approvals',
      value: String(approvals.items.length),
      detail: approvals.items.length ? [events ? `${events} ${events === 1 ? 'event' : 'events'}` : null, meetings ? `${meetings} ${meetings === 1 ? 'meeting' : 'meetings'}` : null].filter(Boolean).join(' · ') : 'Nothing waiting',
      icon: ListChecks,
      tile: 4,
      onPress: () => router.push('/approvals'),
    })
  }
  if (seesStaff && attendance.data) {
    const { staff: team } = attendance.data
    tiles.push({
      label: 'Staff absent',
      value: day && !day.working ? '—' : String(team.todayAbsent),
      detail: `of ${team.strength} staff${team.todayHalfDay ? ` · ${team.todayHalfDay} half day` : ''}`,
      tone: day?.working && team.todayAbsent ? 'danger' : undefined,
      icon: Users,
      tile: 2,
      onPress: () => openWebsite('/attnd/staff-attendance'),
    })
  }

  const loading = ((seesStudents || seesStaff) && attendance.isPending) || (seesFees && fees.isPending)

  return (
    <MobileScreen
      tabs
      refreshing={attendance.isRefetching || fees.isRefetching || approvals.isRefetching}
      onRefresh={() => {
        if (seesStudents || seesStaff) attendance.refetch()
        if (seesStudents) registers.refetch()
        if (seesFees) fees.refetch()
        approvals.refetch()
      }}
      nav={<NavBar large eyebrow={formatDayKey(today, { weekday: 'short' })} title={session.status === 'signedIn' ? session.school.name : 'Today'} />}
    >
      {loading ? (
        <Skeleton height={220} radius={radius['radius-xl']} />
      ) : attendance.isError && fees.isError ? (
        <LoadFailed what="Today's numbers" error={attendance.error} onRetry={() => {
          attendance.refetch()
          fees.refetch()
        }} />
      ) : tiles.length ? (
        <StatTiles items={tiles} />
      ) : null}

      {approvals.enabled ? (
        <Section title="Waiting for you" action={approvals.items.length > 3 ? { label: 'See all', onPress: () => router.push('/approvals') } : undefined}>
          {approvals.isPending ? (
            <Skeleton height={140} radius={radius['radius-xl']} />
          ) : approvals.items.length ? (
            <ApprovalList items={approvals.items.slice(0, 3)} onDone={(message, tone) => toast(message, tone)} />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={ListChecks} title="Nothing waiting for you" body="Events from teachers and meeting requests show here to approve." />
            </Surface>
          )}
        </Section>
      ) : null}
      <TodayMeetings />
    </MobileScreen>
  )
}
