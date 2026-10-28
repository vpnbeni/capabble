import { useRouter } from 'expo-router'
import { ShieldCheck } from 'lucide-react-native'

import { schoolToday } from '@/lib/format'
import { ListGroup, Section } from '@/ui'

import { useStaffCalendar } from './queries'
import { useStaff } from './useStaff'

/**
 * Today's exam duties (invigilation rooms, centre duties) on Today, from the calendar's
 * "My duties" layer. Shows nothing on days without one.
 */
export function TodayDuties() {
  const router = useRouter()
  const staff = useStaff()
  const today = schoolToday()
  const on = Boolean(staff.user?.teacher) && (staff.featureOn('duties') || staff.featureOn('exmcl_duties'))
  const calendar = useStaffCalendar(today, today, on)
  const duties = (calendar.data?.items ?? []).filter((item) => item.layer === 'duties' && item.startDate <= today && item.endDate >= today)
  if (!on || !duties.length) return null

  return (
    <Section title="Your duties today">
      <ListGroup
        items={duties.map((duty) => ({
          title: duty.title,
          subtitle: duty.detail || undefined,
          icon: ShieldCheck,
          tile: 6 as const,
          onPress: () => router.push({ pathname: '/calendar', params: { date: today } }),
        }))}
      />
    </Section>
  )
}
