import { useRouter } from 'expo-router'
import { Bus, Footprints, Pencil, Phone, Route as RouteIcon } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Linking } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { busTitle, many, type OwnWay, type Trip, type Vehicle, type VehicleRecord } from '@/services/transportService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useBuses, useOwnWay, useRiders, useRoutes, useSaveRoute, useSaveVehicle, useTrips } from '@/staff/transportQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, ChipRail, Hero, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

type Show = 'today' | 'routes' | 'buses' | 'own'
type Call = { title: string; message?: string; people: { label: string; phone?: string }[] }

const STALE_AFTER_SECONDS = 120
const BUS_FIELDS: RecordField[] = [
  { key: 'busNo', label: 'Bus number', kind: 'text', placeholder: '7', required: true },
  { key: 'registrationNumber', label: 'Registration', kind: 'text', placeholder: 'HR 14 AB 1234', required: true },
  { key: 'capacity', label: 'Seats', kind: 'number', placeholder: '40' },
  { key: 'driverName', label: 'Driver (optional)', kind: 'text' },
  { key: 'driverPhone', label: 'Driver’s phone (optional)', kind: 'text' },
  { key: 'conductorName', label: 'Conductor (optional)', kind: 'text' },
  { key: 'conductorPhone', label: 'Conductor’s phone (optional)', kind: 'text' },
  { key: 'vehicleType', label: 'Kind', kind: 'choice', options: ['Bus', 'Mini Bus', 'Van', 'Winger', 'Car', 'Auto', 'Other'].map((value) => ({ value, label: value })) },
  {
    key: 'status',
    label: 'Running',
    kind: 'choice',
    options: [
      { value: 'active', label: 'Running' },
      { value: 'maintenance', label: 'Being fixed' },
      { value: 'inactive', label: 'Not running' },
    ],
  },
  { key: 'insuranceExpiry', label: 'Insurance till', kind: 'date' },
  { key: 'fitnessExpiry', label: 'Fitness till', kind: 'date' },
]
const ROUTE_FIELDS: RecordField[] = [
  { key: 'name', label: 'Name', kind: 'text', placeholder: 'Sector 6 and Old City', required: true },
  { key: 'code', label: 'Short code (optional)', kind: 'text', placeholder: 'R1' },
]
const busValues = (bus?: VehicleRecord): RecordValues =>
  Object.fromEntries(
    BUS_FIELDS.map((field) => [
      field.key,
      bus?.[field.key as keyof VehicleRecord] == null
        ? field.key === 'vehicleType'
          ? 'Bus'
          : field.key === 'status'
            ? 'active'
            : ''
        : String(bus[field.key as keyof VehicleRecord]).slice(0, field.kind === 'date' ? 10 : undefined),
    ]),
  )

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
 * The transport office adds and changes buses and routes (a route's stops on its page); the live
 * map waits for the location build.
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
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('trnst.transport.write')
  const saveVehicle = useSaveVehicle()
  const saveRoute = useSaveRoute()
  const [busSheet, setBusSheet] = useState<{ bus?: VehicleRecord } | null>(null)
  const [busMenu, setBusMenu] = useState<VehicleRecord | null>(null)
  const [addingRoute, setAddingRoute] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busInitial = useMemo(() => busValues(busSheet?.bus), [busSheet])
  const routeInitial = useMemo<RecordValues>(() => ({ name: '', code: '' }), [])

  // A bus save sends the whole bus back: the record as loaded, then what was typed.
  const doSaveBus = async (_: RecordValues, all: RecordValues) => {
    try {
      await saveVehicle.mutateAsync({ ...(busSheet?.bus ?? {}), ...all, capacity: Number(all.capacity) || 40, insuranceExpiry: all.insuranceExpiry || null, fitnessExpiry: all.fitnessExpiry || null })
      haptic.success()
      setBusSheet(null)
      toast(busSheet?.bus ? 'Bus saved' : `${busTitle(all.busNo)} added`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The bus wasn't saved. Try again.")
    }
  }

  const doAddRoute = async (_: RecordValues, all: RecordValues) => {
    try {
      const route = await saveRoute.mutateAsync({ input: { name: all.name, code: all.code, shift: 'both', vehicleId: null, stops: [] } })
      haptic.success()
      setAddingRoute(false)
      router.push({ pathname: '/school-transport/[id]', params: { id: route._id } })
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The route wasn't added. Try again.")
    }
  }

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

  const callGuardian = (row: OwnWay) =>
    row.guardianPhone ? setCall({ title: row.name, message: row.commuteMode, people: [{ label: `Call the guardian (${row.guardianPhone})`, phone: row.guardianPhone }] }) : undefined

  return (
    <MobileScreen
      refreshing={trips.isRefetching || routes.isRefetching}
      onRefresh={() => (trips.refetch(), routes.refetch(), riders.refetch(), buses.refetch(), own.refetch())}
      nav={<NavBar title="Transport" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canWrite && show === 'buses' ? (
          <ActionBar icon={Bus} summary={many(buses.data?.length ?? 0, 'bus', 'buses')} detail="Seats, crew and papers" label="Add a bus" onPress={() => (setError(null), setBusSheet({}))} />
        ) : canWrite && show === 'routes' ? (
          <ActionBar
            icon={RouteIcon}
            summary={many(routes.data?.length ?? 0, 'route')}
            detail="Stops in order, with their times"
            label="Add a route"
            onPress={() => (setError(null), setAddingRoute(true))}
          />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet
            open={Boolean(busSheet)}
            onClose={() => setBusSheet(null)}
            title={busSheet?.bus ? busTitle(busSheet.bus.busNo) : 'Add a bus'}
            fields={BUS_FIELDS}
            initial={busInitial}
            isNew={!busSheet?.bus}
            saving={saveVehicle.isPending}
            error={error}
            onSave={doSaveBus}
          />
          <RecordSheet
            open={addingRoute}
            onClose={() => setAddingRoute(false)}
            title="Add a route"
            fields={ROUTE_FIELDS}
            initial={routeInitial}
            isNew
            saving={saveRoute.isPending}
            error={error}
            onSave={doAddRoute}
          />
          <ActionSheet
            open={Boolean(busMenu)}
            onClose={() => setBusMenu(null)}
            title={busMenu ? busTitle(busMenu.busNo) : ''}
            actions={
              busMenu
                ? [
                    { label: 'Call the crew', icon: Phone, onSelect: () => (setBusMenu(null), callCrew(busMenu)) },
                    { label: 'Edit bus', icon: Pencil, onSelect: () => (setBusMenu(null), setError(null), setBusSheet({ bus: busMenu })) },
                  ]
                : []
            }
          />
          <ActionSheet
            open={Boolean(call)}
            onClose={() => setCall(null)}
            title={call?.title ?? ''}
            message={call?.message}
            actions={(call?.people ?? []).filter((person) => person.phone).map((person) => ({ label: person.label, icon: Phone, onSelect: () => (setCall(null), dial(person.phone!)) }))}
          />
        </>
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
            <StatusView compact kind="empty" icon={RouteIcon} title="No routes yet" body={canWrite ? 'Add a route, then its stops in order.' : 'Routes the school sets up show here.'} />
          </Surface>
        )
      ) : show === 'buses' ? (
        buses.isPending ? (
          <CardSkeleton rows={3} />
        ) : buses.isError ? (
          <LoadFailed what="Buses" error={buses.error} onRetry={buses.refetch} />
        ) : buses.data.length ? (
          <ListGroup
            footer={canWrite ? 'Tap a bus to call its crew or change it.' : 'Tap a bus to call its crew.'}
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
              badge:
                vehicle.status !== 'active'
                  ? { label: vehicle.status === 'maintenance' ? 'Being fixed' : 'Not running', tone: 'warning' as const }
                  : papersDue(vehicle, today)
                    ? { label: 'Papers due', tone: 'warning' as const }
                    : undefined,
              icon: Bus,
              tile: 2,
              lines: 3,
              onPress: () => (canWrite ? setBusMenu(vehicle) : callCrew(vehicle)),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Bus} title="No buses yet" body={canWrite ? 'Add the school’s buses with their crew.' : 'The school’s buses show here.'} />
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
