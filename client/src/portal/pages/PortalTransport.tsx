import React from 'react'
import { Bus } from 'lucide-react'
import { Badge, Card, DataTable, DetailList, EmptyState, Page, PageHeader, formatTime, type DataTableColumn } from '@/components/ui'
import TransportMap from '@/components/trnst/TransportMap'
import { STALE_AFTER_SECONDS, agoLabel, distanceLabel, distanceMeters } from '@/components/trnst/TrnstUi'
import { usePortal } from '../PortalContext'
import { usePortalBusLive, usePortalTransport } from '../usePortal'
import type { PortalBusLive, PortalTransport as Transport } from '../portalService'
import { LoadFailed, NoChild } from './shared'

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

const EVENT_TEXT = { boarded: 'Got on the bus', dropped: 'Got off at the stop', absent: 'Marked absent on the bus' } as const
const EVENT_TONE = { boarded: 'success', dropped: 'info', absent: 'danger' } as const

/** The bus on the map while it is on a trip, and what the crew marked today. */
const WhereIsTheBus: React.FC<{ live: PortalBusLive; childName: string }> = ({ live, childName }) => {
  const trip = live.trip
  const bus = trip?.bus
  const myStop = live.stops?.find((stop) => stop.id === live.myStopId)
  const stale = trip ? trip.staleSeconds === null || trip.staleSeconds > STALE_AFTER_SECONDS : false
  const away = bus && myStop && typeof myStop.lat === 'number' && typeof myStop.lng === 'number'
    ? distanceMeters(bus, { lat: myStop.lat, lng: myStop.lng as number })
    : null
  const firstName = childName.split(' ')[0] || childName

  const status = !live.active
    ? <Badge tone="neutral">Not on the road</Badge>
    : !bus
      ? <Badge tone="warning">Waiting for location</Badge>
      : stale
        ? <Badge tone="warning">Last seen {agoLabel(trip?.staleSeconds)}</Badge>
        : <Badge tone="success">On the way</Badge>

  return (
    <Card
      title="Where's the bus"
      subtitle={live.route ? `${live.busNo ? `Bus ${live.busNo} · ` : ''}${live.route.name}` : undefined}
      action={status}
    >
      <div className="cb-stack">
        {live.active && trip ? (
          <>
            <TransportMap
              label="School bus location"
              stops={live.stops}
              myStopId={live.myStopId}
              buses={bus ? [{ id: 'bus', lat: bus.lat, lng: bus.lng, heading: bus.heading, label: live.busNo || 'Bus', stale }] : []}
              followBusId="bus"
            />
            <p className="cb-muted">
              {trip.direction === 'pickup' ? 'On the way to school' : 'On the way home'}
              {away !== null && myStop ? ` · about ${distanceLabel(away)} from ${myStop.name} in a straight line` : ''}
              {bus ? ` · updated ${agoLabel(trip.staleSeconds)}` : ' · the bus has started; its location appears once the phone finds a GPS signal'}
            </p>
          </>
        ) : (
          <p className="cb-muted">
            The bus shows here while it is on a trip.
            {myStop ? ` ${firstName}'s stop is ${myStop.name}${myStop.pickupTime ? `, pickup ${formatTime(myStop.pickupTime)}` : ''}${myStop.dropTime ? `, drop ${formatTime(myStop.dropTime)}` : ''}.` : ''}
          </p>
        )}
        {live.today?.length ? (
          <ul className="pt-bus-events" aria-label="Today on the bus">
            {live.today.map((mark) => (
              <li key={`${mark.event}-${mark.at}`}>
                <Badge tone={EVENT_TONE[mark.event]}>{EVENT_TEXT[mark.event]}</Badge>
                <span className="pt-bus-events__time">{clock(mark.at)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  )
}

type Stop = NonNullable<Transport['routes']>[number]['stops'][number]

const stopColumns: DataTableColumn<Stop>[] = [
  { key: 'name', header: 'Stop', mobile: 'title', render: (row) => row.name },
  { key: 'landmark', header: 'Landmark', mobile: 'subtitle', render: (row) => row.landmark || '—' },
  { key: 'pickup', header: 'Pickup', mobile: 'aside', render: (row) => (row.pickupTime ? formatTime(row.pickupTime) : '—') },
  { key: 'drop', header: 'Drop', mobile: 'hidden', render: (row) => (row.dropTime ? formatTime(row.dropTime) : '—') },
]

/** The school bus the student uses, its crew and stops. */
const PortalTransport: React.FC = () => {
  const { child } = usePortal()
  const { data, isLoading, isError } = usePortalTransport(child?.studentId)
  const live = usePortalBusLive(child?.studentId, Boolean(data?.usesSchoolTransport))

  if (!child) return <Page><NoChild /></Page>

  return (
    <Page>
      <PageHeader title="Transport" subtitle={child.name} />
      {isError ? <LoadFailed what="Transport" /> : null}
      {!isLoading && data && !data.usesSchoolTransport ? (
        <Card>
          <EmptyState
            icon={Bus}
            title="Not using school transport"
            body={data.commuteMode ? `The school has noted: ${data.commuteMode}.` : 'No school bus is assigned. Contact the school office to change this.'}
          />
        </Card>
      ) : null}
      {data?.usesSchoolTransport ? (
        <>
          {live.data?.assigned ? <WhereIsTheBus live={live.data} childName={child.name} /> : null}
          <Card title={`Bus ${data.busNo}`}>
            <DetailList
              columns={2}
              items={[
                { label: 'Vehicle number', value: data.vehicle?.registrationNumber || '—' },
                { label: 'Driver', value: data.vehicle?.driverName ? `${data.vehicle.driverName}${data.vehicle.driverPhone ? ` · ${data.vehicle.driverPhone}` : ''}` : '—' },
                { label: 'Conductor', value: data.vehicle?.conductorName ? `${data.vehicle.conductorName}${data.vehicle.conductorPhone ? ` · ${data.vehicle.conductorPhone}` : ''}` : '—' },
              ]}
            />
          </Card>
          {(data.routes || []).map((route) => (
            <Card key={route.name} flush title={route.name}>
              <DataTable columns={stopColumns} rows={route.stops} getRowKey={(row) => `${row.name}-${row.pickupTime}`} />
            </Card>
          ))}
        </>
      ) : null}
    </Page>
  )
}

export default PortalTransport
