import { useRouter } from 'expo-router'
import { Megaphone } from 'lucide-react-native'
import { useMemo } from 'react'
import { View } from 'react-native'

import { dayKeyAdd, formatDate, formatDayKey, formatINR, formatTime, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { LAYER_ICON, LAYER_TILE, isForChild, needsReply } from '@/portal/calendarUi'
import { PORTAL_MODULES } from '@/portal/modules'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalCalendar, usePortalFees, usePortalNotices } from '@/portal/queries'
import { LoadFailed } from '@/portal/states'
import type { CalendarItem } from '@/services/calendarTypes'
import { useSession } from '@/session/SessionProvider'
import { radius, size, space } from '@/theme/tokens'
import { Avatar, Callout, Hero, ListGroup, MobileScreen, NavBar, Rail, RailCard, Section, ShortcutGrid, Skeleton } from '@/ui'

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there'

export default function HomeScreen() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  return session.user.kind === 'staff' ? <StaffHome /> : <FamilyHome />
}

function FamilyHome() {
  const router = useRouter()
  const session = useSession()
  const { homeQuery: home, child, has } = usePortal()
  const today = schoolToday()
  const school = home.data?.school
  const fees = usePortalFees(has('fees') ? child?.studentId : undefined)
  const calendar = usePortalCalendar(today, dayKeyAdd(today, 30), has('calendar'))
  const notices = usePortalNotices(has('notices'))
  const user = session.status === 'signedIn' ? session.user : null

  // The next things on the calendar for this child (or the whole family), soonest first.
  const coming = useMemo(() => {
    const items = (calendar.data?.items ?? [])
      .filter((item) => item.endDate >= today && item.status !== 'cancelled' && item.layer !== 'school_days')
      .filter((item) => !child || home.data?.kind !== 'parent' || isForChild(item, child.studentId))
    const seen = new Set<string>()
    return items
      .sort((a, b) => (a.startDate + (a.startTime ?? '')).localeCompare(b.startDate + (b.startTime ?? '')))
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
      .slice(0, 10)
  }, [calendar.data, today, child, home.data?.kind])

  const openItem = (item: CalendarItem) =>
    router.push(item.eventId ? { pathname: '/calendar', params: { event: item.eventId, date: item.occurrence ?? item.startDate } } : '/calendar')

  const shortcuts = PORTAL_MODULES.filter((module) => has(module.section)).map((module) => ({
    label: module.label,
    icon: module.icon,
    tile: module.tile,
    onPress: () => router.push(module.href),
  }))

  return (
    <MobileScreen
      tabs
      refreshing={home.isRefetching}
      onRefresh={() => {
        home.refetch()
        fees.refetch()
        calendar.refetch()
        notices.refetch()
      }}
      nav={
        <NavBar
          large
          eyebrow={school?.name ?? session.school?.name}
          title={`Hi, ${firstName(user?.displayName || user?.name)}`}
          leading={school ? <Avatar name={school.name} src={school.logoUrl} size={24} square /> : undefined}
          accessory={<ChildSwitcher />}
        />
      }
    >
      {home.isPending ? (
        <HomeSkeleton />
      ) : home.isError ? (
        <LoadFailed what="Your home page" error={home.error} onRetry={home.refetch} />
      ) : (
        <>
          {!child ? (
            <Callout tone="info" title="No child is linked to your login yet">
              Ask the school office to link your child. Their fees, attendance and calendar show here once linked.
            </Callout>
          ) : null}
          <FeesHero />
          {shortcuts.length ? <ShortcutGrid items={shortcuts} /> : null}
          {coming.length ? (
            <Rail title="Coming up" action={{ label: 'See all', onPress: () => router.push('/calendar') }}>
              {coming.map((item) => (
                <RailCard
                  key={item.id}
                  eyebrow={item.startDate === today ? 'Today' : item.startDate === dayKeyAdd(today, 1) ? 'Tomorrow' : formatDayKey(item.startDate, { weekday: 'short' })}
                  title={item.title}
                  meta={[item.allDay || !item.startTime ? 'All day' : formatTime(item.startTime), item.venue].filter(Boolean).join(' · ')}
                  icon={LAYER_ICON[item.layer]}
                  tile={LAYER_TILE[item.layer]}
                  badge={needsReply(item, today) ? { label: 'Reply', tone: 'warning' } : undefined}
                  onPress={() => openItem(item)}
                />
              ))}
            </Rail>
          ) : null}
          {notices.data?.length ? (
            <Section title="From school" action={{ label: 'See all', onPress: () => router.push('/notices') }}>
              <ListGroup
                items={notices.data.slice(0, 3).map((notice) => ({
                  title: notice.title,
                  subtitle: formatDate(notice.circularDate),
                  icon: Megaphone,
                  tile: 1,
                  onPress: () => router.push({ pathname: '/notice/[id]', params: { id: notice._id } }),
                }))}
              />
            </Section>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}

/** The one big fact on Home: what is still due, when fees are on and something is owed. */
function FeesHero() {
  const router = useRouter()
  const { child, has } = usePortal()
  const fees = usePortalFees(has('fees') ? child?.studentId : undefined)
  const data = fees.data
  if (!child || !data || data.totals.balance <= 0) return null

  const owing = data.demands.filter((demand) => demand.balance > 0 && demand.status !== 'paid' && demand.status !== 'waived')
  const overdue = owing.some((demand) => demand.isOverdue)
  const next = [...owing].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const paidShare = data.totals.demanded > 0 ? Math.round((data.totals.paid / data.totals.demanded) * 100) : 0
  const name = firstName(child.name)

  return (
    <Hero
      tone={overdue ? 'strong' : 'soft'}
      label={overdue ? 'Fees overdue' : next ? `Due ${formatDate(next.dueDate)}` : 'Fees due'}
      value={formatINR(data.totals.balance)}
      detail={`${name}'s fees still due this session`}
      meta={`${paidShare}% paid`}
      progress={paidShare}
      ariaLabel={`${overdue ? 'Fees overdue' : 'Fees due'}: ${formatINR(data.totals.balance)} for ${name}, ${paidShare}% paid this session`}
      action={{ label: 'See fees', onPress: () => router.push('/fees') }}
    />
  )
}

function HomeSkeleton() {
  return (
    <>
      <Skeleton height={150} radius={radius['radius-xl']} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3].map((tile) => (
          <View key={tile} style={{ alignItems: 'center', gap: 6 }}>
            <Skeleton width={size['tile-size']} height={size['tile-size']} radius={radius['radius-tile']} />
            <Skeleton width={52} height={10} />
          </View>
        ))}
      </View>
      <View style={{ gap: space['space-3'] }}>
        <Skeleton width={120} height={20} />
        <Skeleton height={128} radius={radius['radius-xl']} />
      </View>
    </>
  )
}

function StaffHome() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  const roles = session.user.roles.map((role) => role.name).join(', ') || 'Staff'

  return (
    <MobileScreen tabs nav={<NavBar large eyebrow={session.school.name} title={`Hi, ${firstName(session.user.displayName || session.user.name)}`} />}>
      <Callout tone="info" title="The staff app is being built">
        Attendance, your timetable and the calendar come to the app next. Use the website for everything else until then.
      </Callout>
      <ListGroup header="Signed in as" items={[{ title: session.user.displayName || session.user.name || 'Staff', subtitle: roles }]} />
    </MobileScreen>
  )
}
