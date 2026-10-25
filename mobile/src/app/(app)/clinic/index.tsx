import { useRouter } from 'expo-router'
import { HeartPulse } from 'lucide-react-native'

import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ClinicVisit } from '@/services/clinicService'
import { useClinicVisits } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ListGroup, MobileScreen, NavBar, StatusView, Surface, type ListGroupItem } from '@/ui'

/** Clinic visits: today's first, then the last 30 days. Tap one to add what was done. */
export default function ClinicScreen() {
  const router = useRouter()
  const staff = useStaff()
  const canLog = staff.can('mdcl.clinic.write')
  const visits = useClinicVisits()
  const today = schoolToday()
  const since = dayKeyAdd(today, -30)
  const all = [...(visits.data ?? [])].sort((a, b) => (b.date + (b.createdAt ?? '')).localeCompare(a.date + (a.createdAt ?? '')))
  const todays = all.filter((visit) => visit.date === today)
  const earlier = all.filter((visit) => visit.date !== today && visit.date >= since)

  const row = (visit: ClinicVisit): ListGroupItem => ({
    title: visit.studentName,
    subtitle: [visit.className ? classLabel(visit.className, visit.section) : null, visit.complaint].filter(Boolean).join(' · '),
    value: visit.date === today ? undefined : formatDayKey(visit.date),
    icon: HeartPulse,
    tile: 5,
    lines: 2,
    onPress: canLog ? () => router.push({ pathname: '/clinic/visit', params: { id: visit._id } }) : undefined,
  })

  return (
    <MobileScreen
      refreshing={visits.isRefetching}
      onRefresh={visits.refetch}
      nav={<NavBar title="Clinic" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canLog ? (
          <ActionBar
            icon={HeartPulse}
            summary={todays.length ? `${todays.length} ${todays.length === 1 ? 'visit' : 'visits'} today` : 'No visits today'}
            label="Log a visit"
            onPress={() => router.push('/clinic/visit')}
          />
        ) : undefined
      }
    >
      {visits.isPending ? (
        <CardSkeleton rows={4} />
      ) : visits.isError ? (
        <LoadFailed what="Clinic visits" error={visits.error} onRetry={visits.refetch} />
      ) : !todays.length && !earlier.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={HeartPulse} title="No clinic visits in the last 30 days" body="Visits you log show here." />
        </Surface>
      ) : (
        <>
          {todays.length ? <ListGroup header="Today" items={todays.map(row)} /> : null}
          {earlier.length ? <ListGroup header="Last 30 days" items={earlier.map(row)} /> : null}
        </>
      )}
    </MobileScreen>
  )
}
