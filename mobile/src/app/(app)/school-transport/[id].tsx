import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRightLeft, Bus, Phone, UserRound } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { SHIFT_LABELS, busTitle, many, type Rider, type Shift } from '@/services/transportService'
import { useAssignRider, useBuses, useRemoveRider, useRiders, useRoutes } from '@/staff/transportQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, SegmentedControl, StatusView, Surface, Text, Timeline, haptic, useToast } from '@/ui'

const sortStops = <T extends { sequence: number }>(stops: T[]) => [...stops].sort((a, b) => a.sequence - b.sequence)

/**
 * One route: its bus and crew, the stops in order with pickup and drop times, and the students at
 * each stop. Tap a student to open their record (guardian calls are there), move them to another
 * route or stop, or take them off the bus.
 */
export default function TransportRouteScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('trnst.transport.write')
  const { id } = useLocalSearchParams<{ id: string }>()
  const routes = useRoutes()
  const riders = useRiders()
  const assign = useAssignRider()
  const remove = useRemoveRider()
  const route = routes.data?.find((row) => row._id === id)
  const bus = useBuses().data?.find((row) => row._id === route?.vehicleId?._id)
  const [calling, setCalling] = useState(false)
  const [open, setOpen] = useState<Rider | null>(null)
  const [changing, setChanging] = useState<Rider | null>(null)
  const [toRoute, setToRoute] = useState('')
  const [toStop, setToStop] = useState('')
  const [shift, setShift] = useState<Shift>('both')
  const [step, setStep] = useState<'route' | 'stop'>('stop')
  const [confirmRemove, setConfirmRemove] = useState<Rider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onRoute = (riders.data ?? []).filter((row) => row.assignment?.routeId === id)
  const stops = route ? sortStops(route.stops) : []
  const target = routes.data?.find((row) => row._id === toRoute)
  const atStop = (stopId: string | null) => onRoute.filter((row) => (row.assignment?.stopId ?? null) === stopId)
  const noStop = onRoute.filter((row) => !stops.some((stop) => stop._id === row.assignment?.stopId))

  const startChange = (rider: Rider) => {
    setOpen(null)
    setChanging(rider)
    setToRoute(rider.assignment?.routeId ?? id)
    setToStop(rider.assignment?.stopId ?? '')
    setShift(rider.assignment?.shift ?? 'both')
    setStep('stop')
    setError(null)
  }

  const saveChange = async () => {
    if (!changing || !toRoute) return
    try {
      await assign.mutateAsync({ studentId: changing.studentId, routeId: toRoute, stopId: toStop || null, shift })
      haptic.success()
      const stopName = target?.stops.find((stop) => stop._id === toStop)?.name
      toast(`${changing.name}: ${target?.name ?? 'route'}${stopName ? `, ${stopName}` : ''}`)
      setChanging(null)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const doRemove = async () => {
    if (!confirmRemove) return
    const rider = confirmRemove
    setConfirmRemove(null)
    try {
      await remove.mutateAsync(rider.studentId)
      haptic.medium()
      toast(`${rider.name} is off the bus`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It didn't save. Try again.", 'danger')
    }
  }

  const riderRows = (rows: Rider[]) =>
    rows.map((row) => ({
      title: row.name,
      subtitle: [classLabel(row.className, row.section), row.rollNumber, row.assignment && row.assignment.shift !== 'both' ? SHIFT_LABELS[row.assignment.shift] : null].filter(Boolean).join(' · '),
      icon: UserRound,
      tile: 1 as const,
      onPress: () => setOpen(row),
    }))

  return (
    <MobileScreen
      refreshing={routes.isRefetching || riders.isRefetching}
      onRefresh={() => (routes.refetch(), riders.refetch())}
      nav={<NavBar title={route?.code || 'Route'} back={{ label: 'Transport', onPress: router.back }} />}
      overlay={
        <>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.name ?? ''}
            message={open ? [classLabel(open.className, open.section), open.assignment?.stopName].filter(Boolean).join(' · ') : undefined}
            actions={
              open
                ? [
                    { label: 'Open their record', icon: UserRound, onSelect: () => (setOpen(null), router.push({ pathname: '/student/[id]', params: { id: open.studentId } })) },
                    ...(canWrite
                      ? [
                          { label: 'Change route or stop', icon: ArrowRightLeft, onSelect: () => startChange(open) },
                          { label: 'Take off the bus', tone: 'danger' as const, onSelect: () => (setOpen(null), setConfirmRemove(open)) },
                        ]
                      : []),
                  ]
                : []
            }
          />
          <ActionSheet
            open={calling}
            onClose={() => setCalling(false)}
            title={busTitle(bus?.busNo)}
            actions={[
              ...(bus?.driverPhone ? [{ label: `Call ${bus.driverName || 'the driver'} (driver)`, icon: Phone, onSelect: () => (setCalling(false), Linking.openURL(`tel:${bus.driverPhone!.replace(/\s+/g, '')}`)) }] : []),
              ...(bus?.conductorPhone ? [{ label: `Call ${bus.conductorName || 'the conductor'} (conductor)`, icon: Phone, onSelect: () => (setCalling(false), Linking.openURL(`tel:${bus.conductorPhone!.replace(/\s+/g, '')}`)) }] : []),
            ]}
          />
          <ActionSheet
            open={Boolean(confirmRemove)}
            onClose={() => setConfirmRemove(null)}
            title={`Take ${confirmRemove?.name ?? 'this student'} off the bus?`}
            message="They are no longer on any route."
            actions={[{ label: 'Take off the bus', tone: 'danger', onSelect: doRemove }]}
          />
          <BottomSheet
            open={Boolean(changing)}
            onClose={() => (step === 'route' ? setStep('stop') : setChanging(null))}
            detent="large"
            title={step === 'route' ? 'Route' : `Move ${changing?.name ?? ''}`}
            footer={
              step === 'route' ? undefined : (
                <MobileButton fullWidth loading={assign.isPending} onPress={saveChange}>
                  Save
                </MobileButton>
              )
            }
          >
            {step === 'route' ? (
              <OptionList
                label="Route"
                value={toRoute}
                onChange={(value) => (setToRoute(value), setToStop(''), setStep('stop'))}
                options={(routes.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.vehicleId ? busTitle(row.vehicleId.busNo) : undefined }))}
              />
            ) : (
              <View style={{ gap: space['space-4'] }}>
                {error ? (
                  <Callout tone="danger" title="Not saved">
                    {error}
                  </Callout>
                ) : null}
                <ListGroup items={[{ title: 'Route', value: target?.name ?? 'Choose', lines: 2, onPress: () => setStep('route') }]} />
                <SegmentedControl
                  label="Rides"
                  value={shift}
                  onChange={setShift}
                  options={[
                    { value: 'both', label: 'Both' },
                    { value: 'pickup', label: 'Morning' },
                    { value: 'drop', label: 'Afternoon' },
                  ]}
                />
                <OptionList
                  label="Stop"
                  header="Stop"
                  value={toStop}
                  onChange={setToStop}
                  options={[{ value: '', label: 'No stop yet' }, ...sortStops(target?.stops ?? []).map((stop) => ({ value: stop._id, label: stop.name, meta: [stop.pickupTime, stop.dropTime].filter(Boolean).join(' · ') || undefined }))]}
                />
              </View>
            )}
          </BottomSheet>
        </>
      }
    >
      {routes.isPending ? (
        <CardSkeleton rows={4} />
      ) : routes.isError || !route ? (
        <LoadFailed what="The route" error={routes.error} onRetry={routes.refetch} />
      ) : (
        <>
          <View style={{ gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Text variant="m-section" accessibilityRole="header">
              {route.name}
            </Text>
            <Text variant="m-subhead" tone="muted">
              {[SHIFT_LABELS[route.shift], route.distanceKm ? `${route.distanceKm} km` : null, many(onRoute.length, 'student')].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {route.vehicleId ? (
            <ListGroup
              items={[
                {
                  title: busTitle(route.vehicleId.busNo),
                  subtitle: [route.vehicleId.registrationNumber, route.vehicleId.driverName, route.vehicleId.capacity ? `${onRoute.length} of ${route.vehicleId.capacity} seats` : null].filter(Boolean).join(' · '),
                  icon: Bus,
                  tile: 2,
                  lines: 2,
                  onPress: bus?.driverPhone || bus?.conductorPhone ? () => setCalling(true) : undefined,
                },
              ]}
              footer={bus?.driverPhone || bus?.conductorPhone ? 'Tap the bus to call its crew.' : undefined}
            />
          ) : (
            <Callout tone="warning" title="No bus on this route">
              Give it a bus on the website.
            </Callout>
          )}
          {stops.length ? (
            <Surface>
              <Timeline
                items={stops.map((stop) => ({
                  time: stop.pickupTime || '—',
                  title: stop.name,
                  detail: [stop.landmark, stop.dropTime ? `back ${stop.dropTime}` : null, atStop(stop._id).length ? many(atStop(stop._id).length, 'student') : null].filter(Boolean).join(' · '),
                  state: 'upcoming' as const,
                }))}
              />
            </Surface>
          ) : null}
          {riders.isPending ? (
            <CardSkeleton rows={3} />
          ) : riders.isError ? (
            <LoadFailed what="Students on the route" error={riders.error} onRetry={riders.refetch} />
          ) : onRoute.length ? (
            <>
              {stops
                .filter((stop) => atStop(stop._id).length)
                .map((stop) => (
                  <ListGroup key={stop._id} header={`${stop.name} · ${atStop(stop._id).length}`} items={riderRows(atStop(stop._id))} />
                ))}
              {noStop.length ? <ListGroup header={`No stop yet · ${noStop.length}`} items={riderRows(noStop)} /> : null}
            </>
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={UserRound} title="No students on this route" body="Put a student on the bus from their stop on another route, or on the website." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
