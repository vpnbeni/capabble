import { useRouter } from 'expo-router'
import { Bus, CircleCheck } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { startSharing } from '@/lib/busLocation'
import { formatClock, formatDayKey, formatTime, schoolTimeNow, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { DIRECTION_LABELS, type CrewRoute, type CrewTrip, type CrewVehicle, type Direction } from '@/services/crewService'
import { busTitle } from '@/services/transportService'
import { ActionBar, Callout, Hero, ListGroup, MobileScreen, NavBar, Section, StatusView, Surface, Timeline, haptic } from '@/ui'

import { useCrew, useStartTrip } from './crewQueries'
import { useBell } from './useBell'
import { useStaff } from './useStaff'

const firstName = (name?: string) => String(name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(' ')[0] || 'there'

/** The trips a route runs, morning first. */
const directionsOf = (route: CrewRoute): Direction[] =>
  route.shift === 'morning' ? ['pickup'] : route.shift === 'afternoon' ? ['drop'] : ['pickup', 'drop']

/**
 * A driver's or conductor's day: the trip on the road now, else the next one to start, the route's
 * stops with their times, and today's finished trips. Families are told when a trip starts and when
 * their child is marked; sharing the bus's location waits for the location build.
 */
export function DriverToday() {
  const router = useRouter()
  const bell = useBell()
  const { user } = useStaff()
  const crew = useCrew()
  const start = useStartTrip()
  const [error, setError] = useState<string | null>(null)
  const today = formatDayKey(schoolToday(), { weekday: 'short' })
  const vehicles = crew.data?.vehicles ?? []
  const trips = crew.data?.trips ?? []
  const active = trips.find((trip) => trip.status === 'active')
  const done = (routeId: string, direction: Direction) =>
    trips.some((trip) => trip.routeId === routeId && trip.direction === direction && trip.status !== 'active')

  // What to start next: before 11 am the morning pickup, after it the afternoon drop, skipping trips already run today.
  const preferred: Direction = schoolTimeNow() < '11:00' ? 'pickup' : 'drop'
  const choices = vehicles.flatMap((vehicle) =>
    vehicle.routes.flatMap((route) => directionsOf(route).map((direction) => ({ vehicle, route, direction, done: done(route._id, direction) }))),
  )
  const next = active
    ? null
    : (choices.find((choice) => !choice.done && choice.direction === preferred) ?? choices.find((choice) => !choice.done) ?? null)
  const routeOf = (trip: CrewTrip) => vehicles.flatMap((vehicle) => vehicle.routes).find((route) => route._id === trip.routeId)
  const activeRoute = active ? routeOf(active) : undefined
  const shownRoute = activeRoute ?? next?.route ?? vehicles[0]?.routes[0]
  const shownDirection: Direction = active?.direction ?? next?.direction ?? preferred
  const finished = trips.filter((trip) => trip.status !== 'active')

  const busOf = (trip: CrewTrip) => busTitle(vehicles.find((vehicle) => vehicle._id === trip.vehicleId)?.busNo)
  const open = (trip: CrewTrip) => router.push({ pathname: '/crew-trip', params: { id: trip._id, bus: busOf(trip) } })
  const begin = (routeId: string, direction: Direction) => {
    setError(null)
    start.mutate(
      { routeId, direction },
      {
        onSuccess: async (trip) => {
          haptic.success()
          // Asks for location the first time; the trip screen says what to do if it was refused.
          await startSharing(trip._id, busOf(trip)).catch(() => undefined)
          open(trip)
        },
        onError: (failure) => {
          haptic.error()
          setError(failure instanceof ApiError ? failure.message : "The trip didn't start. Try again.")
        },
      },
    )
  }

  return (
    <MobileScreen
      tabs
      refreshing={crew.isRefetching}
      onRefresh={crew.refetch}
      nav={<NavBar large eyebrow={today} title={`Hi, ${firstName(user?.displayName || user?.name)}`} actions={[bell]} />}
      actionBar={
        next ? (
          <ActionBar
            summary={DIRECTION_LABELS[next.direction]}
            detail={`${next.route.name} · ${busTitle(next.vehicle.busNo)}`}
            label={start.isPending ? 'Starting…' : 'Start trip'}
            icon={Bus}
            onPress={() => !start.isPending && begin(next.route._id, next.direction)}
          />
        ) : undefined
      }
    >
      {crew.isPending ? (
        <CardSkeleton rows={4} />
      ) : crew.isError ? (
        <LoadFailed what="Your bus" error={crew.error} onRetry={crew.refetch} />
      ) : !vehicles.length ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Bus}
            title="You're not on a bus yet"
            body="Ask the transport in-charge to add you as the driver or conductor of a bus."
          />
        </Surface>
      ) : (
        <>
          {error ? <Callout tone="danger" title={error} /> : null}
          {active ? (
            <Hero
              tone="strong"
              icon={Bus}
              label={`${DIRECTION_LABELS[active.direction]} · on the road`}
              value={activeRoute?.name ?? 'Your trip'}
              detail={`Started ${formatClock(active.startedAt)}`}
              action={{ label: 'Mark students', onPress: () => open(active) }}
            />
          ) : !next ? (
            <Hero tone="soft" icon={CircleCheck} label="Today" value="All trips done" detail="See you tomorrow." />
          ) : null}
          {vehicles.map((vehicle) => (
            <VehicleTrips key={vehicle._id} vehicle={vehicle} active={active} done={done} onStart={begin} onOpen={open} trips={trips} busy={start.isPending} />
          ))}
          {shownRoute ? (
            <Section title={`Stops · ${shownDirection === 'pickup' ? 'morning' : 'afternoon'}`}>
              <Surface>
                <Timeline
                  items={(shownDirection === 'pickup' ? shownRoute.stops : [...shownRoute.stops].reverse()).map((stop) => {
                    const time = shownDirection === 'pickup' ? stop.pickupTime : stop.dropTime
                    return { time: time ? formatTime(time) : '—', title: stop.name, detail: stop.landmark || undefined, state: 'upcoming' as const }
                  })}
                />
              </Surface>
            </Section>
          ) : null}
          {finished.length ? (
            <ListGroup
              header="Done today"
              items={finished.map((trip) => ({
                title: DIRECTION_LABELS[trip.direction],
                subtitle: [routeOf(trip)?.name, trip.endedAt ? `ended ${formatClock(trip.endedAt)}` : null].filter(Boolean).join(' · '),
                icon: CircleCheck,
                tile: 4 as const,
                onPress: () => open(trip),
              }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}

/** One bus: each route's trips, to start (or open while on the road). */
function VehicleTrips({
  vehicle,
  active,
  trips,
  done,
  onStart,
  onOpen,
  busy,
}: {
  vehicle: CrewVehicle
  active?: CrewTrip
  trips: CrewTrip[]
  done: (routeId: string, direction: Direction) => boolean
  onStart: (routeId: string, direction: Direction) => void
  onOpen: (trip: CrewTrip) => void
  busy: boolean
}) {
  if (!vehicle.routes.length) {
    return <ListGroup header={`${busTitle(vehicle.busNo)} · ${vehicle.registrationNumber}`} items={[{ title: 'No route on this bus yet', subtitle: 'Ask the transport in-charge to give it one.' }]} />
  }
  return (
    <ListGroup
      header={`${busTitle(vehicle.busNo)} · ${vehicle.registrationNumber}`}
      footer="While a trip is on, families see the bus on the map and get a notification when it starts and when you mark their child."
      items={vehicle.routes.flatMap((route) =>
        directionsOf(route).map((direction) => {
          const running = active && active.routeId === route._id && active.direction === direction
          const finished = done(route._id, direction)
          const last = trips.find((trip) => trip.routeId === route._id && trip.direction === direction)
          return {
            title: `${DIRECTION_LABELS[direction]} · ${route.name}`,
            subtitle: running ? 'On the road now' : finished ? 'Done today' : active ? 'Start it after this trip ends' : `${route.stops.length} stops`,
            badge: running ? { label: 'On the road', tone: 'info' as const } : finished ? { label: 'Done', tone: 'success' as const } : undefined,
            lines: 2 as const,
            onPress: running || finished ? () => last && onOpen(last) : active || busy ? undefined : () => onStart(route._id, direction),
          }
        }),
      )}
    />
  )
}
