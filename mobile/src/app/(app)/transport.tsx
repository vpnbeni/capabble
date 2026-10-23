import { useRouter } from 'expo-router'
import { Bus, Phone } from 'lucide-react-native'
import { Linking, View } from 'react-native'

import { formatTime } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalBusLive, usePortalTransport } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { PortalBusLive } from '@/services/portalService'
import { space } from '@/theme/tokens'
import { Badge, Card, DetailList, EmptyState, Icon, ListRow, Screen, Text } from '@/ui'

const STALE_AFTER_SECONDS = 120
const EVENT_TEXT = { boarded: 'Got on the bus', dropped: 'Got off at the stop', absent: 'Marked absent on the bus' } as const
const EVENT_TONE = { boarded: 'success', dropped: 'info', absent: 'danger' } as const
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** Schools type the bus number as "7" or as "Bus 7"; show "Bus 7" either way. */
const busTitle = (busNo?: string) => {
  const value = String(busNo ?? '').trim()
  if (!value) return 'School bus'
  return /^bus\b/i.test(value) ? value : `Bus ${value}`
}

function liveBadge(live?: PortalBusLive) {
  if (!live?.active) return <Badge label="Not on the road" />
  const trip = live.trip
  if (!trip?.bus) return <Badge label="Waiting for location" tone="warning" />
  if (trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS) return <Badge label="Location is old" tone="warning" />
  return <Badge label={trip.direction === 'pickup' ? 'On the way to school' : 'On the way home'} tone="success" />
}

/** The school bus the child uses: whether it is on the road, the crew to call, the stops and today's marks. */
export default function TransportScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const transport = usePortalTransport(child?.studentId)
  const data = transport.data
  const live = usePortalBusLive(child?.studentId, Boolean(data?.usesSchoolTransport))
  const myStopId = data?.myStop?.id ?? live.data?.myStopId
  const call = (phone?: string) => (phone ? () => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`) : undefined)

  return (
    <Screen
      title="Transport"
      onBack={router.back}
      headerAction={<ChildSwitcher />}
      refreshing={transport.isRefetching}
      onRefresh={() => {
        transport.refetch()
        live.refetch()
      }}
    >
      {!child ? (
        <NoChild />
      ) : transport.isPending ? (
        <CardSkeleton rows={4} />
      ) : transport.isError ? (
        <LoadFailed what="Transport" error={transport.error} onRetry={transport.refetch} />
      ) : !data?.usesSchoolTransport ? (
        <Card>
          <EmptyState
            icon={Bus}
            title="Not using school transport"
            body={data?.commuteMode ? `The school has noted: ${data.commuteMode}.` : 'No school bus is assigned. Contact the school office to change this.'}
          />
        </Card>
      ) : (
        <>
          <Card title={busTitle(data.busNo)} subtitle={live.data?.route?.name} action={liveBadge(live.data)}>
            <View style={{ gap: space['space-3'] }}>
              {data.myStop ? (
                <Text variant="body-lg">{`${child.name.split(' ')[0]}'s stop is ${data.myStop.name}.`}</Text>
              ) : null}
              {live.data?.today?.length ? (
                <View style={{ gap: space['space-2'] }} accessibilityLabel="Today on the bus">
                  {live.data.today.map((mark) => (
                    <View key={`${mark.event}-${mark.at}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}>
                      <Badge label={EVENT_TEXT[mark.event]} tone={EVENT_TONE[mark.event]} />
                      <Text variant="small" tone="muted" numeric>
                        {clock(mark.at)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <DetailList items={[{ label: 'Vehicle number', value: data.vehicle?.registrationNumber }]} />
            </View>
          </Card>

          {data.vehicle?.driverName || data.vehicle?.conductorName ? (
            <Card title="Crew" flush>
              {data.vehicle?.driverName ? (
                <ListRow
                  primary={data.vehicle.driverName}
                  secondary={`Driver${data.vehicle.driverPhone ? ` · ${data.vehicle.driverPhone}` : ''}`}
                  divider={Boolean(data.vehicle.conductorName)}
                  onPress={call(data.vehicle.driverPhone)}
                  trailing={data.vehicle.driverPhone ? <Icon icon={Phone} size={20} /> : undefined}
                />
              ) : null}
              {data.vehicle?.conductorName ? (
                <ListRow
                  primary={data.vehicle.conductorName}
                  secondary={`Conductor${data.vehicle.conductorPhone ? ` · ${data.vehicle.conductorPhone}` : ''}`}
                  onPress={call(data.vehicle.conductorPhone)}
                  trailing={data.vehicle.conductorPhone ? <Icon icon={Phone} size={20} /> : undefined}
                />
              ) : null}
            </Card>
          ) : null}

          {(data.routes ?? []).map((route) => (
            <Card key={route.name} title={route.name} flush>
              {route.stops.map((stop, index) => {
                const mine = Boolean(stop.id && stop.id === myStopId) || stop.name === data.myStop?.name
                const times = [stop.pickupTime ? `Pickup ${formatTime(stop.pickupTime)}` : '', stop.dropTime ? `Drop ${formatTime(stop.dropTime)}` : '']
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <ListRow
                    key={`${stop.name}-${stop.pickupTime ?? index}`}
                    primary={stop.name}
                    secondary={[times, stop.landmark].filter(Boolean).join(' · ') || undefined}
                    lines={2}
                    divider={index < route.stops.length - 1}
                    trailing={mine ? <Badge label="Your stop" tone="info" dot={false} /> : undefined}
                  />
                )
              })}
            </Card>
          ))}
        </>
      )}
    </Screen>
  )
}
