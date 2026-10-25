import { useRouter } from 'expo-router'
import { Bus, Phone } from 'lucide-react-native'
import { Linking } from 'react-native'

import { formatTime } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalBusLive, usePortalTransport } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { PortalBusLive } from '@/services/portalService'
import { Avatar, Hero, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, type ListGroupItem } from '@/ui'

const STALE_AFTER_SECONDS = 120
const EVENT_TEXT = { boarded: 'Got on the bus', dropped: 'Got off at the stop', absent: 'Marked absent on the bus' } as const
const EVENT_TONE = { boarded: 'success', dropped: 'info', absent: 'danger' } as const
const EVENT_BADGE = { boarded: 'On board', dropped: 'Dropped', absent: 'Absent' } as const
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** Schools type the bus number as "7" or as "Bus 7"; show "Bus 7" either way. */
const busTitle = (busNo?: string) => {
  const value = String(busNo ?? '').trim()
  if (!value) return 'School bus'
  return /^bus\b/i.test(value) ? value : `Bus ${value}`
}

/** Where the bus is, in words: a trip with a fresh location is "Live". */
function liveState(live?: PortalBusLive): { label: string; live: boolean } {
  if (!live?.active) return { label: 'Not on the road', live: false }
  const trip = live.trip
  if (!trip?.bus) return { label: 'Waiting for location', live: false }
  if (trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS) return { label: 'Location is old', live: false }
  return { label: trip.direction === 'pickup' ? 'On the way to school' : 'On the way home', live: true }
}

/** The school bus the child uses: whether it is on the road, the child's stop, today's marks and the crew to call. */
export default function TransportScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const transport = usePortalTransport(child?.studentId)
  const data = transport.data
  const live = usePortalBusLive(child?.studentId, Boolean(data?.usesSchoolTransport))
  const myStopId = data?.myStop?.id ?? live.data?.myStopId
  const state = liveState(live.data)
  const name = child?.name.split(' ')[0] ?? ''
  const stops = (data?.routes ?? []).flatMap((route) => route.stops)
  const myStop = stops.find((stop) => (stop.id && stop.id === myStopId) || stop.name === data?.myStop?.name)
  const goingHome = live.data?.trip?.direction === 'drop'
  const stopTime = myStop ? (goingHome ? myStop.dropTime : myStop.pickupTime) || myStop.pickupTime || myStop.dropTime : undefined

  const crew = (person?: string, role?: string, phone?: string): ListGroupItem[] =>
    person
      ? [
          {
            title: person,
            subtitle: role,
            avatar: <Avatar name={person} size={36} />,
            accessory: phone ? (
              <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${person}`} onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)} />
            ) : undefined,
          },
        ]
      : []

  return (
    <MobileScreen
      refreshing={transport.isRefetching}
      onRefresh={() => {
        transport.refetch()
        live.refetch()
      }}
      nav={<NavBar title={data?.usesSchoolTransport ? busTitle(data.busNo) : 'Transport'} back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
    >
      {!child ? (
        <NoChild />
      ) : transport.isPending ? (
        <CardSkeleton rows={4} />
      ) : transport.isError ? (
        <LoadFailed what="Transport" error={transport.error} onRetry={transport.refetch} />
      ) : !data?.usesSchoolTransport ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Bus}
            title="Not using school transport"
            body={data?.commuteMode ? `The school has noted: ${data.commuteMode}.` : 'No school bus is assigned. Contact the school office to change this.'}
          />
        </Surface>
      ) : (
        <>
          <Hero
            tone={state.live ? 'strong' : 'soft'}
            icon={Bus}
            label={data.myStop ? `${name}'s stop` : busTitle(data.busNo)}
            value={stopTime ? formatTime(stopTime) : data.myStop?.name ?? busTitle(data.busNo)}
            detail={[data.myStop?.name && stopTime ? data.myStop.name : null, live.data?.route?.name].filter(Boolean).join(' · ') || undefined}
            meta={state.live ? 'Live' : state.label}
            ariaLabel={`${busTitle(data.busNo)}, ${state.label}${data.myStop ? `. ${name}'s stop is ${data.myStop.name}` : ''}${stopTime ? ` at ${formatTime(stopTime)}` : ''}`}
          />

          {live.data?.today?.length ? (
            <ListGroup
              header="Today on the bus"
              items={live.data.today.map((mark) => ({
                title: EVENT_TEXT[mark.event],
                subtitle: clock(mark.at),
                badge: { label: EVENT_BADGE[mark.event], tone: EVENT_TONE[mark.event] },
              }))}
            />
          ) : null}

          {data.vehicle?.driverName || data.vehicle?.conductorName ? (
            <ListGroup
              header="Crew"
              items={[
                ...crew(data.vehicle?.driverName, 'Driver', data.vehicle?.driverPhone),
                ...crew(data.vehicle?.conductorName, 'Conductor', data.vehicle?.conductorPhone),
              ]}
            />
          ) : null}

          {(data.routes ?? []).map((route) => (
            <ListGroup
              key={route.name}
              header={route.name}
              items={route.stops.map((stop) => {
                const mine = Boolean(stop.id && stop.id === myStopId) || stop.name === data.myStop?.name
                const times = [stop.pickupTime ? `Pickup ${formatTime(stop.pickupTime)}` : '', stop.dropTime ? `Drop ${formatTime(stop.dropTime)}` : '']
                  .filter(Boolean)
                  .join(' · ')
                return {
                  title: stop.name,
                  subtitle: [times, stop.landmark].filter(Boolean).join(' · ') || undefined,
                  lines: 2,
                  badge: mine ? { label: 'Your stop', tone: 'info' as const } : undefined,
                }
              })}
            />
          ))}

          {data.vehicle?.registrationNumber ? <ListGroup items={[{ title: 'Vehicle number', value: data.vehicle.registrationNumber }]} /> : null}
        </>
      )}
    </MobileScreen>
  )
}
