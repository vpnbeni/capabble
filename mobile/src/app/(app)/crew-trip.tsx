import { useLocalSearchParams, useRouter } from 'expo-router'
import { Info, MapPin, Phone, UserX } from 'lucide-react-native'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AppState, Linking } from 'react-native'

import { ApiError } from '@/lib/api'
import { isSharing, startSharing, stopSharing, type ShareResult } from '@/lib/busLocation'
import { classLabel, formatClock, formatTime } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { DIRECTION_LABELS, type BoardingEvent, type RosterStudent } from '@/services/crewService'
import { useEndTrip, useMarkStudent, useRoster } from '@/staff/crewQueries'
import { ActionBar, Callout, Dialog, Hero, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, SwipeRow, haptic, useToast } from '@/ui'

/** What happened to a student on this trip, as a short line: "On the bus 7:02 am", "Absent". */
const statusOf = (student: RosterStudent) => {
  const { boarded, dropped, absent } = student.marks
  if (absent) return 'Absent today'
  if (dropped) return `Dropped ${formatClock(dropped.at)}`
  if (boarded) return `On the bus ${formatClock(boarded.at)}`
  return undefined
}

type Sharing = ShareResult | 'checking' | 'stopped'

/** Why families can't see the bus, and the one thing that fixes it. */
const SHARING_HELP: Record<Exclude<Sharing, 'sharing' | 'checking'>, { title: string; body: string; action: 'share' | 'settings' }> = {
  stopped: { title: "Families can't see the bus yet", body: 'Share the location from this phone for the rest of the trip.', action: 'share' },
  denied: { title: 'Allow location to share the bus', body: 'Capabble needs your location while you run a trip.', action: 'settings' },
  'background-denied': {
    title: 'Choose "Allow all the time"',
    body: 'So the bus stays on the map with the screen locked: Permissions → Location → Allow all the time.',
    action: 'settings',
  },
  off: { title: "Your phone's location is off", body: 'Turn on location, then share it.', action: 'share' },
}

/**
 * One trip's students, stop by stop. Tap a student to mark them on the bus (morning) or dropped at
 * their stop (afternoon); swipe for absent or to call the parent. "End trip" when the last stop is done.
 */
export default function CrewTripScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id, bus } = useLocalSearchParams<{ id: string; bus?: string }>()
  const roster = useRoster(id)
  const mark = useMarkStudent()
  const end = useEndTrip()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const data = roster.data
  const trip = data?.trip
  const pickup = trip?.direction === 'pickup'
  const running = trip?.status === 'active'
  const main: BoardingEvent = pickup ? 'boarded' : 'dropped'
  const all = (data?.stops ?? []).flatMap((group) => group.students)
  const left = all.filter((student) => !student.marks[main] && !student.marks.absent).length
  const counts = data?.counts

  // Whether this phone is sending the bus's location. Rechecked when the driver comes back from Settings;
  // an ended trip stops sharing.
  const tripId = trip?._id
  const sharingQuery = useQuery({
    queryKey: ['bus-sharing', tripId, running],
    queryFn: async () => {
      if (!running) {
        if (await isSharing(tripId as string)) await stopSharing()
        return false
      }
      return isSharing(tripId as string)
    },
    enabled: Boolean(tripId),
    staleTime: 0,
  })
  const recheck = sharingQuery.refetch
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') recheck()
    })
    return () => subscription.remove()
  }, [recheck])
  const [refused, setRefused] = useState<ShareResult | null>(null)
  const [asking, setAsking] = useState(false)
  const sharing: Sharing = sharingQuery.data ? 'sharing' : sharingQuery.isPending || asking ? 'checking' : refused && refused !== 'sharing' ? refused : 'stopped'
  const share = async () => {
    if (!tripId) return
    setAsking(true)
    setRefused(await startSharing(tripId, bus || 'the bus').catch(() => 'off' as const))
    await recheck()
    setAsking(false)
  }
  const help = running && sharing !== 'sharing' && sharing !== 'checking' ? SHARING_HELP[sharing] : null

  const openStudent = (student: RosterStudent) =>
    trip && router.push({ pathname: '/crew-student', params: { tripId: trip._id, studentId: student.studentId } })

  const record = (student: RosterStudent, event: BoardingEvent) => {
    if (!trip || !running) return
    setError(null)
    mark.mutate(
      { tripId: trip._id, studentId: student.studentId, event },
      {
        onSuccess: () => {
          haptic.success()
          const first = student.name.split(' ')[0]
          toast(event === 'absent' ? `${first} marked absent` : event === 'boarded' ? `${first} is on the bus` : `${first} dropped`)
        },
        onError: (failure) => {
          haptic.error()
          setError(failure instanceof ApiError ? failure.message : `${student.name} wasn't marked. Try again.`)
        },
      },
    )
  }

  const finish = () =>
    trip &&
    end.mutate(trip._id, {
      onSuccess: async () => {
        haptic.success()
        setConfirm(false)
        await stopSharing().catch(() => undefined)
        router.back()
      },
      onError: (failure) => {
        haptic.error()
        setConfirm(false)
        setError(failure instanceof ApiError ? failure.message : "The trip didn't end. Try again.")
      },
    })

  return (
    <MobileScreen
      refreshing={roster.isRefetching}
      onRefresh={roster.refetch}
      nav={<NavBar title={trip ? DIRECTION_LABELS[trip.direction] : 'Trip'} back={{ label: 'Today', onPress: router.back }} />}
      actionBar={
        running ? (
          <ActionBar
            summary={left ? `${left} still to mark` : 'Everyone marked'}
            detail={data?.route?.name}
            label="End trip"
            onPress={() => setConfirm(true)}
          />
        ) : undefined
      }
      overlay={
        <Dialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={`End the ${pickup ? 'morning pickup' : 'afternoon drop'}?`}
          description={left ? `${left} ${left === 1 ? 'student is' : 'students are'} not marked. They stay unmarked for today.` : 'Every student is marked.'}
          footer={
            <>
              <MobileButton variant="gray" onPress={() => setConfirm(false)}>
                Not yet
              </MobileButton>
              <MobileButton loading={end.isPending} onPress={finish}>
                End trip
              </MobileButton>
            </>
          }
        />
      }
    >
      {roster.isPending ? (
        <CardSkeleton rows={5} />
      ) : roster.isError ? (
        <LoadFailed what="This trip" error={roster.error} onRetry={roster.refetch} />
      ) : !data || !trip ? null : (
        <>
          {error ? <Callout tone="danger" title={error} /> : null}
          {help ? (
            <Callout
              tone="warning"
              icon={MapPin}
              title={help.title}
              action={help.action === 'settings' ? { label: 'Open settings', onPress: () => Linking.openSettings() } : { label: 'Share location', onPress: share }}
            >
              {help.body}
            </Callout>
          ) : null}
          {!running ? (
            <Callout tone="info" title={`This trip ended${trip.endedAt ? ` at ${formatClock(trip.endedAt)}` : ''}`}>
              Marks can&apos;t be changed after a trip ends.
            </Callout>
          ) : null}
          <Hero
            tone="soft"
            label={data.route?.name ?? 'Route'}
            value={pickup ? `${counts?.boarded ?? 0} of ${counts?.assigned ?? 0} on the bus` : `${counts?.dropped ?? 0} of ${counts?.assigned ?? 0} dropped`}
            detail={[counts?.absent ? `${counts.absent} absent` : `Started ${formatClock(trip.startedAt)}`, running && sharing === 'sharing' ? 'Location shared' : null]
              .filter(Boolean)
              .join(' · ')}
            progress={counts?.assigned ? (((pickup ? counts.boarded : counts.dropped) + counts.absent) / counts.assigned) * 100 : 0}
          />
          {!all.length ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" title="No students on this route" body="The transport in-charge puts students on a route and stop." />
            </Surface>
          ) : (
            (pickup ? data.stops : [...data.stops].reverse()).map((group) => {
              const time = pickup ? group.stop.pickupTime : group.stop.dropTime
              return group.students.length ? (
                <ListGroup key={group.stop.id || 'none'} header={[group.stop.name, time ? formatTime(time) : null].filter(Boolean).join(' · ')}>
                  {group.students.map((student, index) => {
                    const markedMain = Boolean(student.marks[main])
                    return (
                      <SwipeRow
                        key={student.studentId}
                        divider={index > 0}
                        unread={running && !markedMain && !student.marks.absent}
                        title={student.name}
                        subtitle={statusOf(student) ?? `Class ${classLabel(student.className, student.section)} · tap when ${pickup ? 'on the bus' : 'dropped'}`}
                        // Tap marks a student still to mark; a marked one (or any after the trip) opens their page.
                        onPress={running && !markedMain ? () => record(student, main) : () => openStudent(student)}
                        actions={[
                          ...(running && !student.marks.absent ? [{ label: 'Absent', icon: UserX, tone: 'neutral' as const, onPress: () => record(student, 'absent') }] : []),
                          { label: 'Details', icon: Info, tone: 'neutral' as const, onPress: () => openStudent(student) },
                          ...(student.guardianPhone ? [{ label: 'Call parent', icon: Phone, tone: 'accent' as const, onPress: () => Linking.openURL(`tel:${student.guardianPhone}`) }] : []),
                        ]}
                      />
                    )
                  })}
                </ListGroup>
              ) : null
            })
          )}
        </>
      )}
    </MobileScreen>
  )
}
