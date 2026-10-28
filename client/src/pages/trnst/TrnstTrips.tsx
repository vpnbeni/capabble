import React, { useMemo, useState } from 'react'
import { CalendarDays, Route as RouteIcon } from 'lucide-react'
import {
  Badge,
  Card,
  DataTable,
  DetailList,
  EmptyState,
  FilterBar,
  Page,
  Sheet,
  Skeleton,
  TextField,
  formatTime,
  type DataTableColumn,
} from '@/components/ui'
import TransportMap from '@/components/trnst/TransportMap'
import { DIRECTION_LABEL, Entity, LiveBadge } from '@/components/trnst/TrnstUi'
import { useTrip, useTrips } from '@/hooks/useTrnst'
import type { TripDetail, TripSummary } from '@/services/trnstService'

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const clock = (iso?: string | null) => {
  if (!iso) return '—'
  const date = new Date(iso)
  return formatTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)
}

const EVENT_BADGE: Record<TripDetail['boarding'][number]['event'], { label: string; tone: 'success' | 'info' | 'danger' }> = {
  boarded: { label: 'Boarded', tone: 'success' },
  dropped: { label: 'Dropped', tone: 'info' },
  absent: { label: 'Absent', tone: 'danger' },
}

const END_LABEL: Record<string, string> = { crew: 'Ended by the crew', stale: 'Ended: no location for 3 hours', admin: 'Ended by the office' }

const TripStatus: React.FC<{ trip: TripSummary }> = ({ trip }) =>
  trip.status === 'active' ? <LiveBadge seconds={trip.staleSeconds} /> : <Badge tone="neutral">Ended</Badge>

const TrnstTrips: React.FC = () => {
  const [date, setDate] = useState(todayKey)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const { data, isLoading } = useTrips(date)
  const detail = useTrip(openId)
  const trips = data?.trips || []

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return trips
    return trips.filter((trip) =>
      [trip.vehicle?.busNo, trip.vehicle?.registrationNumber, trip.route?.code, trip.route?.name, trip.startedByName]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    )
  }, [trips, search])

  const columns: DataTableColumn<TripSummary>[] = [
    {
      key: 'route',
      header: 'Route',
      mobile: 'title',
      render: (trip) => (
        <Entity
          primary={`${trip.route?.code || ''} · ${trip.route?.name || 'Route removed'}`}
          secondary={trip.vehicle ? `Bus ${trip.vehicle.busNo} · ${trip.vehicle.registrationNumber}` : undefined}
        />
      ),
    },
    { key: 'direction', header: 'Trip', mobile: 'subtitle', render: (trip) => DIRECTION_LABEL[trip.direction] },
    { key: 'time', header: 'Time', mobile: 'hidden', render: (trip) => `${clock(trip.startedAt)} – ${trip.endedAt ? clock(trip.endedAt) : 'now'}` },
    {
      key: 'students',
      header: 'Students',
      numeric: true,
      render: (trip) =>
        trip.direction === 'pickup' ? `${trip.counts.boarded} of ${trip.counts.assigned}` : `${trip.counts.dropped} of ${trip.counts.assigned}`,
    },
    { key: 'crew', header: 'Started by', mobile: 'hidden', render: (trip) => trip.startedByName || '—' },
    { key: 'status', header: 'Status', mobile: 'aside', render: (trip) => <TripStatus trip={trip} /> },
  ]

  const trip = detail.data
  const boardingColumns: DataTableColumn<TripDetail['boarding'][number]>[] = [
    { key: 'student', header: 'Student', mobile: 'title', render: (row) => <Entity primary={row.name} secondary={`Class ${row.className}-${row.section} · ${row.rollNumber}`} /> },
    { key: 'time', header: 'Time', mobile: 'subtitle', render: (row) => `${clock(row.at)} · ${row.method === 'scan' ? 'ID card' : 'Marked by hand'}` },
    { key: 'event', header: 'Status', mobile: 'aside', render: (row) => <Badge tone={EVENT_BADGE[row.event].tone}>{EVENT_BADGE[row.event].label}</Badge> },
  ]

  return (
    <Page>
      <Card flush className="tr-records">
        <div className="tr-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search bus, route or crew', value: search, onChange: setSearch, label: 'Search trips' }}
            filters={
              <TextField
                size="sm"
                type="date"
                aria-label="Trip date"
                value={date}
                max={todayKey()}
                onChange={(event) => setDate(event.target.value || todayKey())}
              />
            }
          />
        </div>
        <DataTable
          caption="Trips"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          onRowClick={(row) => setOpenId(row._id)}
          loading={isLoading}
          loadingLabel="Loading trips…"
          empty={
            <EmptyState
              icon={CalendarDays}
              title={trips.length ? 'No trips match this search' : 'No trips on this day'}
              body={trips.length ? 'Try another bus or route.' : 'Trips are recorded when the bus crew starts one on their phone.'}
            />
          }
        />
      </Card>

      <Sheet
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        size="xl"
        icon={RouteIcon}
        title={trip ? `${trip.route?.code || ''} · ${trip.route?.name || ''} · ${DIRECTION_LABEL[trip.direction]}` : 'Trip'}
        description={trip ? `${trip.serviceDate} · ${trip.vehicle ? `Bus ${trip.vehicle.busNo}` : ''}` : undefined}
      >
        {!trip ? (
          <div className="cb-skeleton-stack">
            <Skeleton height={280} />
            <Skeleton height={120} />
          </div>
        ) : (
          <div className="cb-stack">
            <DetailList
              columns={3}
              items={[
                { label: 'Started', value: `${clock(trip.startedAt)}${trip.startedByName ? ` by ${trip.startedByName}` : ''}` },
                { label: 'Ended', value: trip.status === 'active' ? 'On the road' : `${clock(trip.endedAt)}${trip.endReason ? ` · ${END_LABEL[trip.endReason] || ''}` : ''}` },
                {
                  label: trip.direction === 'pickup' ? 'Boarded' : 'Dropped',
                  value: `${trip.direction === 'pickup' ? trip.counts.boarded : trip.counts.dropped} of ${trip.counts.assigned}${trip.counts.absent ? ` · ${trip.counts.absent} absent` : ''}`,
                },
              ]}
            />
            <TransportMap
              label="Route driven on this trip"
              className="tr-map--short"
              stops={trip.route?.stops}
              roadPath={trip.route?.roadPath?.polyline}
              trail={trip.trail}
              buses={trip.status === 'active' && trip.lastLocation
                ? [{ id: trip._id, lat: trip.lastLocation.lat, lng: trip.lastLocation.lng, heading: trip.lastLocation.heading, label: trip.vehicle?.busNo || 'Bus', vehicleType: trip.vehicle?.vehicleType }]
                : []}
              fitKey={trip._id}
            />
            {trip.trail.length === 0 ? <p className="cb-muted">No location was received on this trip.</p> : null}
            <DataTable
              caption="Boarding log"
              columns={boardingColumns}
              rows={trip.boarding}
              getRowKey={(row) => `${row.studentId}-${row.event}`}
              empty={<EmptyState compact title="No student was marked on this trip" body="The crew marks students by scanning ID cards or from the list." />}
            />
          </div>
        )}
      </Sheet>
    </Page>
  )
}

export default TrnstTrips
