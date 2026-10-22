import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Bus, CheckCircle2, MapPinOff, Play, Square, Undo2, XCircle } from 'lucide-react'
import trnstService, {
  type BoardingEvent,
  type BoardingResult,
  type CrewTrip,
  type CrewVehicle,
  type RosterStudent,
  type TripDirection,
} from '@/services/trnstService'
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  MetricTile,
  MetricTiles,
  Page,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  Tabs,
  TextField,
} from '@/components/ui'
import CardScanner from '@/components/trnst/CardScanner'
import { DIRECTION_LABEL, LiveBadge, errorMessage, secondsSince, vehicleName } from '@/components/trnst/TrnstUi'
import { trnstKeys, useCrewMe, useRoster } from '@/hooks/useTrnst'
import { useTripTracker } from '@/hooks/useTripTracker'
import { usePermissions } from '@/hooks/usePermissions'
import { MyCalendarCard } from '@/components/calendar/MyCalendarCards'

const EVENT_LABEL: Record<BoardingEvent, string> = { boarded: 'Boarded', dropped: 'Dropped', absent: 'Absent' }
const EVENT_TONE: Record<BoardingEvent, 'success' | 'info' | 'danger'> = { boarded: 'success', dropped: 'info', absent: 'danger' }

const clock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''

const shareKey = (tripId: string) => `capabble.trnst.share.${tripId}`
const readShare = (tripId: string) => {
  try {
    return window.localStorage.getItem(shareKey(tripId)) !== 'off'
  } catch {
    return true
  }
}

/** The status a student has on this trip, most decisive first. */
const studentStatus = (student: RosterStudent): BoardingEvent | null =>
  (['dropped', 'boarded', 'absent'] as BoardingEvent[]).find((event) => student.marks[event]) || null

// ---------------------------------------------------------------------------
// Start a trip
// ---------------------------------------------------------------------------

const StartTrip: React.FC<{ vehicles: CrewVehicle[]; todayTrips: CrewTrip[]; onStarted: () => void }> = ({ vehicles, todayTrips, onStarted }) => {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?._id || '')
  const vehicle = vehicles.find((item) => item._id === vehicleId) || vehicles[0]
  const [routeId, setRouteId] = useState(vehicle?.routes[0]?._id || '')
  const [direction, setDirection] = useState<TripDirection>(new Date().getHours() < 12 ? 'pickup' : 'drop')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setRouteId(vehicle?.routes[0]?._id || '')
  }, [vehicle?._id])

  const start = async () => {
    if (!routeId) return
    setStarting(true)
    try {
      await trnstService.startTrip(routeId, direction)
      onStarted()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not start the trip.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="cb-stack">
      <Card title="Start a trip" subtitle="The bus shows on the parents' map until you end the trip.">
        <div className="cb-stack tr-crew__form">
          {vehicles.length > 1 ? (
            <Select
              label="Bus"
              value={vehicle?._id || ''}
              onChange={(event) => setVehicleId(event.target.value)}
              options={vehicles.map((item) => ({ value: item._id, label: `${vehicleName(item)} · ${item.registrationNumber}` }))}
            />
          ) : (
            <p className="cb-strong">{vehicle ? `${vehicleName(vehicle)} · ${vehicle.registrationNumber}` : ''}</p>
          )}
          {vehicle?.routes.length ? (
            <Select
              label="Route"
              value={routeId}
              onChange={(event) => setRouteId(event.target.value)}
              options={vehicle.routes.map((route) => ({ value: route._id, label: `${route.code} · ${route.name}` }))}
            />
          ) : (
            <Banner tone="warning">No route uses this bus yet. Ask the transport office to attach it to a route.</Banner>
          )}
          <SegmentedControl
            label="Trip"
            fullWidth
            value={direction}
            onChange={(value) => setDirection(value as TripDirection)}
            options={[
              { value: 'pickup', label: 'Pickup (to school)' },
              { value: 'drop', label: 'Drop (from school)' },
            ]}
          />
          <Button size="lg" fullWidth variant="primary" icon={Play} loading={starting} disabled={!routeId} onClick={() => void start()}>
            Start trip
          </Button>
        </div>
      </Card>

      {todayTrips.length ? (
        <Card title="Today's trips">
          <ul className="tr-list">
            {todayTrips.map((trip) => {
              const route = vehicles.flatMap((item) => item.routes).find((item) => item._id === trip.routeId)
              return (
                <li key={trip._id} className="tr-list__row tr-list__row--static">
                  <span>{route ? `${route.code} · ${route.name}` : 'Route'} · {DIRECTION_LABEL[trip.direction]}</span>
                  <span className="cb-muted">{clock(trip.startedAt)} – {clock(trip.endedAt || undefined)}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// On a trip
// ---------------------------------------------------------------------------

const ScanResult: React.FC<{ result: { ok: boolean; title: string; detail: string; photo?: string | null } }> = ({ result }) => (
  <div className={result.ok ? 'tr-scan-result is-ok' : 'tr-scan-result is-bad'} role="status" aria-live="polite">
    <span className="tr-scan-result__icon" aria-hidden="true">{result.ok ? <CheckCircle2 size={28} /> : <XCircle size={28} />}</span>
    {result.photo ? <Avatar name={result.title} src={result.photo} size="lg" /> : null}
    <span className="tr-scan-result__text">
      <span className="tr-scan-result__title">{result.title}</span>
      <span className="tr-scan-result__detail">{result.detail}</span>
    </span>
  </div>
)

const OnTrip: React.FC<{ trip: CrewTrip; vehicle?: CrewVehicle; onEnded: () => void }> = ({ trip, vehicle, onEnded }) => {
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const canOperate = can('trnst.trips.operate')
  const canMark = can('trnst.boarding.mark')
  const [share, setShare] = useState(() => canOperate && readShare(trip._id))
  const tracker = useTripTracker(trip._id, share, onEnded)
  const roster = useRoster(trip._id)
  const [tab, setTab] = useState<'scan' | 'list'>('scan')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; title: string; detail: string; photo?: string | null } | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const [, tick] = useState(0)

  // Re-render every 10 s so "sent 20 s ago" stays true.
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const route = vehicle?.routes.find((item) => item._id === trip.routeId)
  const markEvent: BoardingEvent = trip.direction === 'pickup' ? 'boarded' : 'dropped'
  const counts = roster.data?.counts

  const toggleShare = (value: boolean) => {
    setShare(value)
    try {
      window.localStorage.setItem(shareKey(trip._id), value ? 'on' : 'off')
    } catch {
      // Private mode: the switch still works for this visit.
    }
  }

  const refreshRoster = () => queryClient.invalidateQueries({ queryKey: trnstKeys.roster(trip._id) })

  const showMarked = (data: BoardingResult) => {
    setResult({
      ok: true,
      title: data.student.name,
      detail: data.duplicate
        ? `Already marked ${EVENT_LABEL[data.event].toLowerCase()} · Class ${data.student.className}-${data.student.section}`
        : `${EVENT_LABEL[data.event]} ${clock(data.at)} · Class ${data.student.className}-${data.student.section}`,
      photo: data.student.profileImage,
    })
  }

  const scan = async (value: string) => {
    const text = value.trim()
    if (!text) return
    try {
      const data = await trnstService.markBoarding(trip._id, { token: text, event: markEvent, method: 'scan' })
      showMarked(data)
      void refreshRoster()
    } catch (error: any) {
      const body = error?.response?.data
      setResult({
        ok: false,
        title: body?.student?.name || (body?.errorCode === 'not_on_route' ? 'Not on this bus' : 'Card not accepted'),
        detail: body?.message || 'Try again or mark the student from the list.',
        photo: body?.student?.profileImage,
      })
      if (navigator.vibrate) navigator.vibrate([80, 60, 80])
    }
  }

  const mark = async (student: RosterStudent, event: BoardingEvent) => {
    setBusy(`${student.studentId}-${event}`)
    try {
      await trnstService.markBoarding(trip._id, { studentId: student.studentId, event, method: 'manual' })
      await refreshRoster()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not mark the student.'))
    } finally {
      setBusy(null)
    }
  }

  const unmark = async (student: RosterStudent, event: BoardingEvent) => {
    setBusy(`${student.studentId}-${event}`)
    try {
      await trnstService.unmarkBoarding(trip._id, student.studentId, event)
      await refreshRoster()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not undo the mark.'))
    } finally {
      setBusy(null)
    }
  }

  const end = async () => {
    setEnding(true)
    try {
      await trnstService.endTrip(trip._id)
      toast.success('Trip ended. The bus is off the parents\' map.')
      setConfirmEnd(false)
      onEnded()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not end the trip.'))
    } finally {
      setEnding(false)
    }
  }

  const sentSeconds = tracker.lastSentAt ? Math.round((Date.now() - tracker.lastSentAt) / 1000) : secondsSince(trip.lastLocation?.at)

  return (
    <div className="cb-stack">
      <Card
        title={`${route ? `${route.code} · ${route.name}` : 'Trip'} · ${DIRECTION_LABEL[trip.direction]}`}
        subtitle={`${vehicle ? vehicleName(vehicle) : 'Bus'} · started ${clock(trip.startedAt)}`}
        action={share ? <LiveBadge seconds={sentSeconds} /> : <Badge tone="neutral">Not sharing</Badge>}
      >
        <div className="cb-stack">
          {canOperate ? (
            <Switch
              checked={share}
              onChange={toggleShare}
              label="Share this phone's location"
              description="Turn off on the second phone if the driver and conductor both have the trip open."
            />
          ) : null}
          {share && tracker.status === 'denied' ? <Banner tone="danger" title="Location is blocked">{tracker.message}</Banner> : null}
          {share && tracker.status === 'unsupported' ? <Banner tone="danger">{tracker.message}</Banner> : null}
          {share && (tracker.status === 'starting' || tracker.status === 'error') ? (
            <Banner tone="info">{tracker.message || 'Looking for a GPS signal…'}</Banner>
          ) : null}
          {share && tracker.status === 'tracking' ? (
            <p className="cb-muted">
              Keep this screen open during the trip. Location stops if the phone is locked or you switch apps.
              {tracker.queued > 1 ? ` ${tracker.queued} points waiting for the network.` : ''}
              {tracker.wakeLock === 'unsupported' ? ' This phone may turn its screen off: keep it awake in the display settings.' : ''}
            </p>
          ) : null}
          {counts ? (
            <MetricTiles>
              <MetricTile label="On this route" value={counts.assigned} />
              <MetricTile label={trip.direction === 'pickup' ? 'Boarded' : 'Dropped'} value={trip.direction === 'pickup' ? counts.boarded : counts.dropped} />
              <MetricTile label="Absent" value={counts.absent} />
            </MetricTiles>
          ) : null}
          {canOperate ? (
            <Button variant="secondary" icon={Square} fullWidth onClick={() => setConfirmEnd(true)}>
              End trip
            </Button>
          ) : null}
        </div>
      </Card>

      {canMark ? (
        <Card flush>
          <div className="tr-records__toolbar">
            <Tabs
              variant="segmented"
              value={tab}
              onChange={(value) => setTab(value as 'scan' | 'list')}
              items={[
                { id: 'scan', label: 'Scan ID cards' },
                { id: 'list', label: 'Student list', count: counts?.assigned },
              ]}
            />
          </div>
          {tab === 'scan' ? (
            <div className="tr-crew__scan">
              {result ? <ScanResult result={result} /> : null}
              <CardScanner onCode={(text) => void scan(text)} />
              <form
                className="tr-crew__code"
                onSubmit={(event) => {
                  event.preventDefault()
                  void scan(code)
                  setCode('')
                  codeInput.current?.focus()
                }}
              >
                <TextField
                  ref={codeInput}
                  label="Card scanner or code"
                  hint="A handheld scanner types here by itself."
                  value={code}
                  autoComplete="off"
                  onChange={(event) => setCode(event.target.value)}
                />
                <Button type="submit" disabled={!code.trim()}>Mark</Button>
              </form>
            </div>
          ) : (
            <div className="tr-crew__roster">
              {roster.isLoading ? (
                <div className="cb-skeleton-stack"><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></div>
              ) : !roster.data?.counts.assigned ? (
                <EmptyState compact title="No students on this route" body="The transport office assigns students to routes and stops." />
              ) : (
                roster.data.stops.filter((group) => group.students.length).map((group) => (
                  <section key={group.stop.id || 'none'} className="tr-crew__stop">
                    <h3 className="tr-crew__stop-title">
                      {group.stop.name}
                      {trip.direction === 'pickup' && group.stop.pickupTime ? <span className="cb-muted"> · {group.stop.pickupTime}</span> : null}
                      {trip.direction === 'drop' && group.stop.dropTime ? <span className="cb-muted"> · {group.stop.dropTime}</span> : null}
                    </h3>
                    <ul className="tr-list">
                      {group.students.map((student) => {
                        const status = studentStatus(student)
                        return (
                          <li key={student.studentId} className="tr-crew__student">
                            <Avatar name={student.name} src={student.profileImage || undefined} size="md" />
                            <span className="tr-crew__student-name">
                              <span className="cb-strong">{student.name}</span>
                              <span className="cb-muted">Class {student.className}-{student.section}</span>
                            </span>
                            {status ? (
                              <span className="tr-crew__student-actions">
                                <Badge tone={EVENT_TONE[status]}>{EVENT_LABEL[status]} {clock(student.marks[status]?.at)}</Badge>
                                <Button
                                  size="sm"
                                  variant="tertiary"
                                  icon={Undo2}
                                  aria-label={`Undo ${EVENT_LABEL[status].toLowerCase()} for ${student.name}`}
                                  loading={busy === `${student.studentId}-${status}`}
                                  onClick={() => void unmark(student, status)}
                                />
                              </span>
                            ) : (
                              <span className="tr-crew__student-actions">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  loading={busy === `${student.studentId}-${markEvent}`}
                                  onClick={() => void mark(student, markEvent)}
                                >
                                  {EVENT_LABEL[markEvent]}
                                </Button>
                                <Button
                                  size="sm"
                                  loading={busy === `${student.studentId}-absent`}
                                  onClick={() => void mark(student, 'absent')}
                                >
                                  Absent
                                </Button>
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          )}
        </Card>
      ) : null}

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        size="sm"
        title="End this trip?"
        description={`The bus leaves the parents' map.${counts && trip.direction === 'drop' && counts.assigned - counts.dropped - counts.absent > 0
          ? ` ${counts.assigned - counts.dropped - counts.absent} student${counts.assigned - counts.dropped - counts.absent === 1 ? ' is' : 's are'} not marked dropped yet.`
          : ''}`}
        footer={
          <>
            <Button onClick={() => setConfirmEnd(false)} disabled={ending}>Keep going</Button>
            <Button variant="primary" loading={ending} onClick={() => void end()}>End trip</Button>
          </>
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

const TrnstCrew: React.FC = () => {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useCrewMe()
  const refresh = () => queryClient.invalidateQueries({ queryKey: trnstKeys.crewMe() })

  const activeTrip = useMemo(() => data?.trips.find((trip) => trip.status === 'active') || null, [data])
  const vehicleOfTrip = data?.vehicles.find((vehicle) => vehicle._id === activeTrip?.vehicleId)
  const todayTrips = (data?.trips || []).filter((trip) => trip.status === 'ended')

  return (
    <Page>
      <div className="tr-crew">
        {isLoading ? (
          <div className="cb-skeleton-stack"><Skeleton height={64} /><Skeleton height={240} /></div>
        ) : error ? (
          <Card>
            <EmptyState compact icon={MapPinOff} title="Could not load your bus" body={errorMessage(error, 'Check the network and try again.')} action={<Button size="sm" onClick={() => void refresh()}>Try again</Button>} />
          </Card>
        ) : !data?.vehicles.length ? (
          <Card>
            <EmptyState
              icon={Bus}
              title="You are not on a bus yet"
              body="Ask the transport office to set you as the driver or conductor of a vehicle. Then your trips show here."
            />
          </Card>
        ) : activeTrip ? (
          <OnTrip key={activeTrip._id} trip={activeTrip} vehicle={vehicleOfTrip} onEnded={() => void refresh()} />
        ) : (
          <StartTrip vehicles={data.vehicles} todayTrips={todayTrips} onStarted={() => void refresh()} />
        )}
        {/* School days, closures and duties for the crew too; hidden during a trip to keep the screen clear. */}
        {!activeTrip && !isLoading ? <div className="cl-crew-card"><MyCalendarCard title="Coming up" days={3} limit={5} /></div> : null}
      </div>
    </Page>
  )
}

export default TrnstCrew
