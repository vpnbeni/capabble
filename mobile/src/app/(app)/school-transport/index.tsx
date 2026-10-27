import { useRouter } from 'expo-router'
import { Bus, Footprints, Phone, Route as RouteIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Linking } from 'react-native'

import { classLabel, formatDate, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { busTitle, many, type OwnWay, type Trip, type Vehicle } from '@/services/transportService'
import { useBuses, useOwnWay, useRiders, useRoutes, useTrips } from '@/staff/transportQueries'
import { ActionSheet, ChipRail, Hero, ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

type Show = 'today' | 'routes' | 'buses' | 'own'
type Call = { title: string; message?: string; people: { label: string; phone?: string }[] }

const STALE_AFTER_SECONDS = 120
const dial = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** "On the road" while the bus sends its location, "Location is old" when it stopped, "Done" after. */
const tripBadge = (trip: Trip) =>
  trip.status !== 'active'
    ? { label: 'Done', tone: 'neutral' as const }
    : trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS
      ? { label: 'Location is old', tone: 'warning' as const }
      : { label: 'On the road', tone: 'success' as const }

/** Insurance or fitness lapsing within 30 days, or lapsed. */
const papersDue = (vehicle: Vehicle, today: string) => {
  const soon = new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10)
  return [vehicle.insuranceExpiry, vehicle.fitnessExpiry].some((date) => date && date.slice(0, 10) <= soon)
}

/**
 * School transport for the office: today's trips (who is on board, the crew to call), routes with
 * their stops and students, the buses and their papers, and students who come on their own.
 * Setting routes and buses up stays on the website; the live map waits for the location build.
 */
export default function SchoolTransportScreen() {
  const router = useRouter()
  const today = schoolToday()
  const [show, setShow] = useState<Show>('today')
  const trips = useTrips()
  const routes = useRoutes()
  const riders = useRiders()
  const buses = useBuses(show === 'buses')
  const own = useOwnWay(show === 'own')
  const [call, setCall] = useState<Call | null>(null)

  const onRoad = (trips.data ?? []).filter((trip) => trip.status === 'active').length
  const riding = (riders.data ?? []).filter((row) => row.assignment)
  const countOn = (routeId: string) => riding.filter((row) => row.assignment?.routeId === routeId).length

  const callCrew = (vehicle: Pick<Vehicle, 'busNo' | 'driverName' | 'driverPhone' | 'conductorName'> & { conductorPhone?: string }) =>
    setCall({
      title: busTitle(vehicle.busNo),
      people: [
        { label: `Call ${vehicle.driverName || 'the driver'} (driver)`, phone: vehicle.driverPhone },
        { label: `Call ${vehicle.conductorName || 'the conductor'} (conductor)`, phone: vehicle.conductorPhone },
      ],
    })

  const callGuardian = (row: OwnWay) => (row.guardianPhone ? setCall({ title: row.name, message: row.commuteMode, people: [{ label: `Call the guardian (${row.guardianPhone})`, phone: row.guardianPhone }] }) : undefined)

  return (
    <MobileScreen
      refreshing={trips.isRefetching || routes.isRefetching}
      onRefresh={() => (trips.refetch(), routes.refetch(), riders.refetch(), buses.refetch(), own.refetch())}
      nav={<NavBar title="Transport" back={{ label: 'Back', onPress: router.back }} />}
      overlay={
        <ActionSheet
          open={Boolean(call)}
          onClose={() => setCall(null)}
          title={call?.title ?? ''}
          message={call?.message}
          actions={(call?.people ?? []).filter((person) => person.phone).map((person) => ({ label: person.label, icon: Phone, onSelect: () => (setCall(null), dial(person.phone!)) }))}
        />
      }
    >
      <Hero
        tone={onRoad ? 'soft' : 'surface'}
        icon={Bus}
        label="On the road now"
        value={String(onRoad)}
        detail={`${many(trips.data?.length ?? 0, 'trip')} today · ${many(riding.length, 'student')} on the bus`}
      />
      <ChipRail
        label="Show"
        value={show}
        onChange={setShow}
        items={[
          { id: 'today', label: 'Today', count: trips.data?.length },
          { id: 'routes', label: 'Routes', count: routes.data?.length },
          { id: 'buses', label: 'Buses' },
          { id: 'own', label: 'Own way' },
        ]}
      />
      {show === 'today' ? (
        trips.isPending ? (
          <CardSkeleton rows={3} />
        ) : trips.isError ? (
          <LoadFailed what="Today's trips" error={trips.error} onRetry={trips.refetch} />
        ) : trips.data.length ? (
          <ListGroup
            footer="Tap a trip to call its crew."
            items={trips.data.map((trip) => ({
              title: `${busTitle(trip.vehicle?.busNo)} · ${trip.direction === 'pickup' ? 'to school' : 'home'}`,
              subtitle: [
                trip.route?.name,
                `${trip.counts.boarded} of ${trip.counts.assigned} on board${trip.counts.dropped ? `, ${trip.counts.dropped} dropped` : ''}${trip.counts.absent ? `, ${trip.counts.absent} absent` : ''}`,
                `started ${clock(trip.startedAt)}`,
              ]
                .filter(Boolean)
                .join(' · '),
              badge: tripBadge(trip),
              icon: Bus,
              tile: 2,
              lines: 3,
              onPress: trip.vehicle ? () => callCrew(trip.vehicle!) : undefined,
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Bus} title="No trips yet today" body="A trip shows here when the crew starts it in the app." />
          </Surface>
        )
      ) : show === 'routes' ? (
        routes.isPending ? (
          <CardSkeleton rows={3} />
        ) : routes.isError ? (
          <LoadFailed what="Routes" error={routes.error} onRetry={routes.refetch} />
        ) : routes.data.length ? (
          <ListGroup
            items={routes.data.map((route) => ({
              title: route.name,
              subtitle: [route.vehicleId ? busTitle(route.vehicleId.busNo) : 'No bus', many(route.stops.length, 'stop'), many(countOn(route._id), 'student')].join(' · '),
              icon: RouteIcon,
              tile: 3,
              lines: 2,
              onPress: () => router.push({ pathname: '/school-transport/[id]', params: { id: route._id } }),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={RouteIcon} title="No routes yet" body="Routes and their stops are set up on the website." />
          </Surface>
        )
      ) : show === 'buses' ? (
        buses.isPending ? (
          <CardSkeleton rows={3} />
        ) : buses.isError ? (
          <LoadFailed what="Buses" error={buses.error} onRetry={buses.refetch} />
        ) : buses.data.length ? (
          <ListGroup
            footer="Tap a bus to call its crew."
            items={buses.data.map((vehicle) => ({
              title: busTitle(vehicle.busNo),
              subtitle: [
                vehicle.registrationNumber,
                vehicle.capacity ? `${vehicle.capacity} seats` : null,
                vehicle.driverName,
                vehicle.insuranceExpiry ? `insurance till ${formatDate(vehicle.insuranceExpiry)}` : null,
                vehicle.fitnessExpiry ? `fitness till ${formatDate(vehicle.fitnessExpiry)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              badge: vehicle.status !== 'active' ? { label: vehicle.status === 'maintenance' ? 'Being fixed' : 'Not running', tone: 'warning' as const } : papersDue(vehicle, today) ? { label: 'Papers due', tone: 'warning' as const } : undefined,
              icon: Bus,
              tile: 2,
              lines: 3,
              onPress: () => callCrew(vehicle),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Bus} title="No buses yet" body="Buses are added on the website." />
          </Surface>
        )
      ) : own.isPending ? (
        <CardSkeleton rows={3} />
      ) : own.isError ? (
        <LoadFailed what="Students who come on their own" error={own.error} onRetry={own.refetch} />
      ) : own.data.length ? (
        <ListGroup
          header={many(own.data.length, 'student')}
          items={own.data.map((row) => ({
            title: row.name,
            subtitle: [classLabel(row.className, row.section), row.commuteMode, row.notes].filter(Boolean).join(' · '),
            icon: Footprints,
            tile: 1,
            lines: 2,
            onPress: row.guardianPhone ? () => callGuardian(row) : () => router.push({ pathname: '/student/[id]', params: { id: row.studentId } }),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Footprints} title="Nobody listed" body="Students dropped by parents or coming on their own show here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
