import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, MapPinned } from 'lucide-react'
import { Button, Card, EmptyState, Page, Skeleton, StatCard } from '@/components/ui'
import TransportMap, { type MapBus } from '@/components/trnst/TransportMap'
import { DIRECTION_LABEL, Entity, LiveBadge, STALE_AFTER_SECONDS } from '@/components/trnst/TrnstUi'
import { useLiveBuses } from '@/hooks/useTrnst'
import { runsForward } from '@capabble/shared/roadPath'

const TrnstLive: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useLiveBuses()
  const [focused, setFocused] = useState<string | null>(null)
  const trips = data?.trips || []

  const buses = useMemo<MapBus[]>(
    () =>
      trips
        .filter((trip) => trip.lastLocation)
        .map((trip) => ({
          id: trip._id,
          lat: trip.lastLocation!.lat,
          lng: trip.lastLocation!.lng,
          heading: trip.lastLocation!.heading,
          label: trip.vehicle?.busNo || trip.route?.code || 'Bus',
          vehicleType: trip.vehicle?.vehicleType,
          roadPath: trip.route?.roadPath?.polyline ?? null,
          stale: (trip.staleSeconds ?? 0) > STALE_AFTER_SECONDS,
          onClick: () => setFocused(trip._id),
        })),
    [trips]
  )
  const focusedTrip = trips.find((trip) => trip._id === focused)
  const onBoard = trips.reduce((sum, trip) => sum + (trip.direction === 'pickup' ? trip.counts.boarded : trip.counts.assigned - trip.counts.dropped - trip.counts.absent), 0)
  const quiet = trips.filter((trip) => trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS).length

  if (isLoading) {
    return (
      <Page>
        <section className="cb-stats">
          {[0, 1, 2].map((key) => <StatCard key={key} label="" value={<Skeleton width={48} height={28} />} />)}
        </section>
        <Skeleton height={420} />
      </Page>
    )
  }

  return (
    <Page>
      <section className="cb-stats" aria-label="Buses on the road">
        <StatCard label="Buses on a trip" value={trips.length} icon={Bus} />
        <StatCard label="Students on board" value={Math.max(0, onBoard)} hint="Marked by the bus crew" />
        <StatCard label="Not reporting" value={quiet} hint={quiet ? 'No location in the last 2 min' : 'Every bus is sending its location'} />
      </section>

      <div className="cb-grid-8-4">
        <Card
          title={focusedTrip ? `${focusedTrip.vehicle?.busNo ? `Bus ${focusedTrip.vehicle.busNo}` : 'Bus'} · ${focusedTrip.route?.name || ''}` : 'Map'}
          subtitle={focusedTrip ? 'Following this bus. Drag the map to look around.' : 'Updates every 10 seconds.'}
          action={focusedTrip ? <Button size="sm" variant="tertiary" onClick={() => setFocused(null)}>Show all buses</Button> : undefined}
        >
          <TransportMap
            label="Buses on the road"
            className="tr-map--tall"
            buses={buses}
            stops={focusedTrip?.route?.stops}
            roadPath={focusedTrip?.route?.roadPath?.polyline}
            roadForward={focusedTrip ? runsForward(focusedTrip.route?.stops || [], focusedTrip.direction) : undefined}
            followBusId={focused || undefined}
            fitKey={focused || `all-${buses.length}`}
          />
        </Card>

        <Card title="On the road" flush>
          {trips.length ? (
            <ul className="tr-list">
              {trips.map((trip) => (
                <li key={trip._id}>
                  <button
                    type="button"
                    className="tr-list__row"
                    aria-pressed={focused === trip._id}
                    onClick={() => setFocused(trip._id)}
                  >
                    <Entity
                      primary={`${trip.vehicle?.busNo ? `Bus ${trip.vehicle.busNo}` : 'Bus'} · ${trip.route?.code || ''} ${trip.route?.name || ''}`}
                      secondary={`${DIRECTION_LABEL[trip.direction]} · ${trip.direction === 'pickup'
                        ? `${trip.counts.boarded} of ${trip.counts.assigned} boarded`
                        : `${trip.counts.dropped} of ${trip.counts.assigned} dropped`}`}
                    />
                    <LiveBadge seconds={trip.staleSeconds} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={MapPinned}
              title="No bus on a trip right now"
              body="A bus shows here once its driver or conductor starts a trip on the Bus crew screen."
              action={<Button size="sm" onClick={() => navigate('/trnst/trips')}>See today's trips</Button>}
            />
          )}
        </Card>
      </div>
    </Page>
  )
}

export default TrnstLive
