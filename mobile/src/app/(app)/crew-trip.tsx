import { useLocalSearchParams, useRouter } from 'expo-router'
import { Phone, UserX } from 'lucide-react-native'
import { useState } from 'react'
import { Linking } from 'react-native'

import { ApiError } from '@/lib/api'
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

/**
 * One trip's students, stop by stop. Tap a student to mark them on the bus (morning) or dropped at
 * their stop (afternoon); swipe for absent or to call the parent. "End trip" when the last stop is done.
 */
export default function CrewTripScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
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
      onSuccess: () => {
        haptic.success()
        setConfirm(false)
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
          {!running ? (
            <Callout tone="info" title={`This trip ended${trip.endedAt ? ` at ${formatClock(trip.endedAt)}` : ''}`}>
              Marks can&apos;t be changed after a trip ends.
            </Callout>
          ) : null}
          <Hero
            tone="soft"
            label={data.route?.name ?? 'Route'}
            value={pickup ? `${counts?.boarded ?? 0} of ${counts?.assigned ?? 0} on the bus` : `${counts?.dropped ?? 0} of ${counts?.assigned ?? 0} dropped`}
            detail={counts?.absent ? `${counts.absent} absent` : `Started ${formatClock(trip.startedAt)}`}
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
                        onPress={running && !markedMain ? () => record(student, main) : undefined}
                        actions={[
                          ...(running && !student.marks.absent ? [{ label: 'Absent', icon: UserX, tone: 'neutral' as const, onPress: () => record(student, 'absent') }] : []),
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
