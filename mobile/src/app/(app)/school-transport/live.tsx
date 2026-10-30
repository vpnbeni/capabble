import { runsForward } from '@capabble/shared/roadPath'
import { useRouter } from 'expo-router'
import { Bus, Phone } from 'lucide-react-native'
import { Fragment } from 'react'
import { Linking } from 'react-native'

import { BusMap } from '@/components/BusMap'
import { formatClock } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { busTitle, type LiveTrip } from '@/services/transportService'
import { useLiveTrips } from '@/staff/transportQueries'
import { ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

// Same as the family screen: a bus that sent nothing for 2 minutes is drawn as old.
const STALE_AFTER_SECONDS = 120

const isStale = (trip: LiveTrip) => !trip.lastLocation || trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS

const whereText = (trip: LiveTrip) => {
  if (!trip.lastLocation) return 'Waiting for location'
  return isStale(trip) ? `Location is old (${formatClock(trip.lastLocation.at)})` : `Live · ${formatClock(trip.lastLocation.at)}`
}

/** Every bus on a trip now, each on its own map along its route, with the driver to call. */
export default function LiveBusesScreen() {
  const router = useRouter()
  const live = useLiveTrips()
  const trips = live.data ?? []

  return (
    <MobileScreen refreshing={live.isRefetching} onRefresh={live.refetch} nav={<NavBar title="Buses on the road" back={{ label: 'Transport', onPress: router.back }} />}>
      {live.isPending ? (
        <CardSkeleton rows={3} />
      ) : live.isError ? (
        <LoadFailed what="Buses on the road" error={live.error} onRetry={live.refetch} />
      ) : !trips.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Bus} title="No bus is on the road" body="A bus shows here when its crew starts a trip in the app." />
        </Surface>
      ) : (
        trips.map((trip) => {
          const bus = busTitle(trip.vehicle?.busNo)
          const stops = trip.route?.stops ?? []
          const phone = trip.vehicle?.driverPhone
          return (
            <Fragment key={trip._id}>
              <ListGroup
                header={`${bus} · ${trip.direction === 'pickup' ? 'to school' : 'home'}`}
                footer={`${trip.route?.name ?? 'Route'} · ${trip.counts.boarded} of ${trip.counts.assigned} on board · started ${formatClock(trip.startedAt)}`}
                items={[
                  {
                    title: whereText(trip),
                    subtitle: trip.vehicle?.driverName ? `Driver ${trip.vehicle.driverName}` : undefined,
                    accessory: phone ? (
                      <MobileButton
                        variant="tinted"
                        size="medium"
                        icon={Phone}
                        aria-label={`Call ${trip.vehicle?.driverName || 'the driver'}`}
                        onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)}
                      />
                    ) : undefined,
                  },
                ]}
              />
              <Surface padded={false}>
                <BusMap
                  height={240}
                  accessibilityLabel={`Map showing ${bus} on ${trip.route?.name ?? 'its route'}`}
                  stops={stops}
                  roadPath={trip.route?.roadPath?.polyline}
                  forward={runsForward(stops, trip.direction)}
                  bus={trip.lastLocation ?? null}
                  vehicleType={trip.vehicle?.vehicleType}
                  label={trip.vehicle?.busNo || 'Bus'}
                  stale={isStale(trip)}
                />
              </Surface>
            </Fragment>
          )
        })
      )}
    </MobileScreen>
  )
}
