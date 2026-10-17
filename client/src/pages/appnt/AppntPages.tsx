import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Pencil,
  Plus,
  SearchX,
  UserCheck,
  UserRoundPlus,
  X,
} from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  Checkbox,
  Combobox,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Menu,
  Page,
  Pagination,
  Progress,
  Select,
  Sheet,
  StatCard,
  TextField,
  formatTime,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useAppntHosts,
  useAppntReport,
  useAppntSettings,
  useAppntToday,
  useAppointmentAction,
  useAppointments,
  useMyHost,
  useSaveAppntSettings,
  useSaveHost,
  useStaffOptions,
} from '@/hooks/useAppnt'
import type { Appointment, AppointmentAction, AppointmentHost, AppointmentStatus, HostPayload, ReportRow } from '@/services/appntService'
import {
  AppointmentSheet,
  AvailabilityFields,
  BookAppointmentSheet,
  HostRulesFields,
  P,
  ReasonDialog,
  RescheduleDialog,
  StatusBadge,
  VISITOR_LABEL,
  addDays,
  availabilityError,
  dayLabel,
  describeHours,
  errorCode,
  errorMessage,
  nextAction,
  timeRange,
  toAvailabilityDraft,
  todayKey,
  visitorDetail,
  type AvailabilityDraft,
} from '@/components/appnt/AppntUi'

const ACTION_DONE: Partial<Record<AppointmentAction, string>> = {
  confirm: 'Confirmed.',
  'check-in': 'Checked in.',
  complete: 'Marked as completed.',
  'no-show': 'Marked as no-show.',
}

/** Shared row menu, detail sheet and dialogs for any appointment table. */
const useAppointmentActions = () => {
  const act = useAppointmentAction()
  const [open, setOpen] = useState<Appointment | null>(null)
  const [moving, setMoving] = useState<Appointment | null>(null)
  const [reason, setReason] = useState<{ appointment: Appointment; action: 'decline' | 'cancel' } | null>(null)

  const run = async (a: Appointment, action: AppointmentAction) => {
    try {
      await act.mutateAsync({ id: a._id, action })
      toast.success(ACTION_DONE[action] || 'Saved.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const menu = (a: Appointment): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'Open', icon: CalendarDays, onSelect: () => setOpen(a) }]
    if (!a.canAct) return items
    const primary = nextAction(a)
    if (primary) items.push({ label: primary.label, icon: primary.action === 'check-in' ? UserCheck : CalendarCheck, onSelect: () => run(a, primary.action) })
    if (a.status === 'requested') items.push({ label: 'Decline', icon: X, onSelect: () => setReason({ appointment: a, action: 'decline' }) })
    if (a.status === 'requested' || a.status === 'confirmed') items.push({ label: 'Move', icon: CalendarClock, onSelect: () => setMoving(a) })
    if (a.status === 'confirmed' && a.date <= todayKey()) items.push({ label: 'Mark no-show', icon: Clock3, onSelect: () => run(a, 'no-show') })
    if (a.status === 'confirmed') items.push({ divider: true }, { label: 'Cancel appointment', icon: X, tone: 'danger', onSelect: () => setReason({ appointment: a, action: 'cancel' }) })
    return items
  }

  const overlays = (
    <>
      <AppointmentSheet
        appointment={open}
        onClose={() => setOpen(null)}
        onReschedule={(a) => { setOpen(null); setMoving(a) }}
        onReason={(a, action) => { setOpen(null); setReason({ appointment: a, action }) }}
      />
      <RescheduleDialog appointment={moving} onClose={() => setMoving(null)} />
      <ReasonDialog target={reason} onClose={() => setReason(null)} />
    </>
  )

  return { menu, overlays, openAppointment: setOpen, run }
}

const timeColumn = (showDate: boolean): DataTableColumn<Appointment> => ({
  key: 'time',
  header: showDate ? 'When' : 'Time',
  width: showDate ? 150 : 120,
  mobile: 'subtitle',
  render: (a) => (
    <span className="ap-time">
      <strong>{showDate ? dayLabel(a.date) : formatTime(a.startTime)}</strong>
      <span>{showDate ? timeRange(a) : `until ${formatTime(a.endTime)}`}</span>
    </span>
  ),
})

const visitorColumn: DataTableColumn<Appointment> = {
  key: 'visitor',
  header: 'Visitor',
  mobile: 'title',
  wrap: true,
  render: (a) => <Entity primary={a.visitor.name} secondary={visitorDetail(a)} />,
}

const hostColumn: DataTableColumn<Appointment> = {
  key: 'host',
  header: 'Meeting with',
  render: (a) => (
    <span className="ap-host">
      {a.hostName}
      {a.hostAbsent ? <Badge tone="warning">Absent today</Badge> : null}
    </span>
  ),
}

const actionsColumn = (menu: (a: Appointment) => MenuItem[]): DataTableColumn<Appointment> => ({
  key: 'actions',
  header: '',
  headerLabel: 'Actions',
  interactive: true,
  width: 48,
  render: (a) => <Menu items={menu(a)} label={`Actions for ${a.visitor.name}`} />,
})

// ── Today ───────────────────────────────────────────────────────────────────

export const AppntToday: React.FC = () => {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canBook = can([P.book, P.manage, P.host])
  const canWalkIn = can([P.book, P.manage])
  const [searchParams, setSearchParams] = useSearchParams()
  const [date, setDate] = useState(todayKey())
  const [booking, setBooking] = useState<'book' | 'walk-in' | null>(null)
  const today = useAppntToday(date)
  const { menu, overlays, openAppointment, run } = useAppointmentActions()

  useEffect(() => {
    if (searchParams.get('book') !== '1') return
    searchParams.delete('book')
    setSearchParams(searchParams, { replace: true })
    if (canBook) setBooking('book')
  }, [searchParams, setSearchParams, canBook])

  const data = today.data
  const items = data?.items || []
  const isToday = date === todayKey()
  const hostView = data?.isHostView

  const columns = useMemo<DataTableColumn<Appointment>[]>(() => [
    timeColumn(false),
    visitorColumn,
    ...(hostView ? [] : [hostColumn]),
    { key: 'purpose', header: 'Purpose', mobile: 'hidden', render: (a) => a.purpose },
    {
      key: 'next',
      header: '',
      headerLabel: 'Next step',
      interactive: true,
      mobile: 'hidden',
      render: (a) => {
        const primary = nextAction(a)
        return primary ? <Button size="sm" onClick={() => run(a, primary.action)}>{primary.label}</Button> : null
      },
    },
    { key: 'status', header: 'Status', mobile: 'aside', render: (a) => <StatusBadge status={a.status} /> },
    actionsColumn(menu),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hostView])

  return (
    <Page>
      <div className="cb-stack">
        <div className="cb-stats">
          <StatCard label={isToday ? 'Booked today' : `Booked ${dayLabel(date)}`} value={data?.total ?? '…'} icon={CalendarDays} />
          <StatCard label="Waiting now" value={data?.waiting ?? '…'} hint="Checked in, not yet seen" icon={UserCheck} />
          <StatCard label="Requests to answer" value={data?.pendingRequests ?? '…'} hint="From parents and staff" icon={Inbox} />
          <StatCard
            label="Next"
            value={data?.next ? formatTime(data.next.startTime) : '—'}
            hint={data?.next ? `${data.next.visitorName}${hostView ? '' : ` with ${data.next.hostName}`}` : isToday ? 'Nothing else today' : 'Shown for today only'}
            icon={Clock3}
          />
        </div>

        {data && data.pendingRequests > 0 ? (
          <Banner tone="warning" title={`${data.pendingRequests} meeting ${data.pendingRequests === 1 ? 'request is' : 'requests are'} waiting for an answer`}>
            <Button size="sm" variant="tertiary" onClick={() => navigate('/appnt/appointments?status=requested')}>Review requests</Button>
          </Banner>
        ) : null}

        <Card
          flush
          title={hostView ? 'My appointments' : 'Schedule'}
          subtitle={dayLabel(date)}
          action={
            <div className="ap-toolbar">
              <div className="ap-toolbar__date">
                <Button size="sm" variant="tertiary" icon={ChevronLeft} aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} />
                <TextField size="sm" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} />
                <Button size="sm" variant="tertiary" icon={ChevronRight} aria-label="Next day" onClick={() => setDate(addDays(date, 1))} />
                {!isToday ? <Button size="sm" variant="tertiary" onClick={() => setDate(todayKey())}>Today</Button> : null}
              </div>
              <div className="ap-toolbar__actions">
                {canWalkIn ? <Button size="sm" icon={UserRoundPlus} onClick={() => setBooking('walk-in')}>Walk-in</Button> : null}
                {canBook ? <Button size="sm" variant="primary" icon={CalendarPlus} onClick={() => setBooking('book')}>Book appointment</Button> : null}
              </div>
            </div>
          }
        >
          <DataTable
            caption={`Appointments on ${dayLabel(date)}`}
            columns={columns}
            rows={items}
            getRowKey={(a) => a._id}
            onRowClick={openAppointment}
            loading={today.isLoading}
            loadingLabel="Loading appointments"
            empty={
              today.isError ? (
                <EmptyState icon={CalendarDays} title="Couldn't load appointments" body={errorMessage(today.error)} />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title={isToday ? 'No appointments today' : `No appointments on ${dayLabel(date)}`}
                  body={canBook ? 'Book one, or check in someone who has walked in.' : 'Parent, visitor and staff appointments will appear here.'}
                  action={canBook ? <Button variant="primary" icon={CalendarPlus} onClick={() => setBooking('book')}>Book appointment</Button> : undefined}
                />
              )
            }
          />
        </Card>
      </div>

      <BookAppointmentSheet open={booking !== null} walkIn={booking === 'walk-in'} defaultDate={date >= todayKey() ? date : todayKey()} onClose={() => setBooking(null)} />
      {overlays}
    </Page>
  )
}

// ── All appointments ────────────────────────────────────────────────────────

type When = 'upcoming' | 'today' | 'week' | 'past' | ''

const rangeFor = (when: When) => {
  const today = todayKey()
  if (when === 'today') return { from: today, to: today }
  if (when === 'upcoming') return { from: today, to: '' }
  if (when === 'week') return { from: today, to: addDays(today, 6) }
  if (when === 'past') return { from: '', to: addDays(today, -1) }
  return { from: '', to: '' }
}

const STATUS_CHIPS: Array<{ id: AppointmentStatus | ''; label: string }> = [
  { id: '', label: 'All' },
  { id: 'requested', label: 'Requests' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'checked_in', label: 'Checked in' },
  { id: 'completed', label: 'Completed' },
  { id: 'no_show', label: 'No-show' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'declined', label: 'Declined' },
]

export const AppntList: React.FC = () => {
  const { can } = usePermissions()
  const canBook = can([P.book, P.manage, P.host])
  const seeAll = can(P.view)
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [status, setStatus] = useState<AppointmentStatus | ''>((searchParams.get('status') as AppointmentStatus) || '')
  const [when, setWhen] = useState<When>(searchParams.get('q') || searchParams.get('status') ? '' : 'upcoming')
  const [hostId, setHostId] = useState('')
  const [page, setPage] = useState(1)
  const [booking, setBooking] = useState(false)
  const hosts = useAppntHosts(false, seeAll)
  const range = rangeFor(when)
  const params = { q, status, hostId, from: range.from, to: range.to, sort: when === 'upcoming' || when === 'week' || when === 'today' ? 'upcoming' as const : 'recent' as const, page, limit: 25 }
  const list = useAppointments(params)
  const { menu, overlays, openAppointment } = useAppointmentActions()

  useEffect(() => {
    if (!searchParams.get('q') && !searchParams.get('status')) return
    searchParams.delete('q')
    searchParams.delete('status')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])
  useEffect(() => setPage(1), [q, status, when, hostId])

  const columns = useMemo<DataTableColumn<Appointment>[]>(() => [
    timeColumn(true),
    visitorColumn,
    ...(seeAll ? [hostColumn] : []),
    { key: 'purpose', header: 'Purpose', mobile: 'hidden', render: (a) => a.purpose },
    { key: 'ref', header: 'Ref.', mobile: 'hidden', render: (a) => <span className="cb-subtle is-num">{a.refNo}</span> },
    { key: 'status', header: 'Status', mobile: 'aside', render: (a) => <StatusBadge status={a.status} /> },
    actionsColumn(menu),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [seeAll])

  const counts = list.data?.counts || {}
  const total = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0)
  const items = list.data?.items || []
  const pagination = list.data?.pagination
  const hasFilters = Boolean(q || status || hostId || when)

  return (
    <Page>
      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Search name, phone, student or ref. no.' }}
            chips={STATUS_CHIPS
              .filter((chip) => chip.id === '' || chip.id === status || (counts[chip.id] || 0) > 0)
              .map((chip) => ({ id: chip.id, label: chip.label, count: chip.id ? counts[chip.id] || 0 : total, active: status === chip.id }))}
            onChipClick={(id) => setStatus(id as AppointmentStatus | '')}
            filters={
              <div className="ap-filters">
                <Select
                  size="sm"
                  aria-label="When"
                  options={[
                    { value: 'upcoming', label: 'Upcoming' },
                    { value: 'today', label: 'Today' },
                    { value: 'week', label: 'Next 7 days' },
                    { value: 'past', label: 'Past' },
                    { value: '', label: 'Any date' },
                  ]}
                  value={when}
                  onChange={(e) => setWhen(e.target.value as When)}
                />
                {seeAll && (hosts.data?.length || 0) > 1 ? (
                  <Select
                    size="sm"
                    aria-label="Meeting with"
                    placeholder="Everyone"
                    options={(hosts.data || []).map((host) => ({ value: host._id, label: host.displayName }))}
                    value={hostId}
                    onChange={(e) => setHostId(e.target.value)}
                  />
                ) : null}
              </div>
            }
            actions={canBook ? <Button variant="primary" size="sm" icon={CalendarPlus} onClick={() => setBooking(true)}>Book appointment</Button> : undefined}
          />
        </CardToolbar>
        <DataTable
          caption="Appointments"
          columns={columns}
          rows={items}
          getRowKey={(a) => a._id}
          onRowClick={openAppointment}
          loading={list.isLoading || (list.isFetching && !items.length)}
          loadingLabel="Loading appointments"
          empty={
            hasFilters ? (
              <EmptyState icon={SearchX} title="No appointments match these filters" body="Clear a filter or search for something else." />
            ) : (
              <EmptyState icon={CalendarDays} title="No appointments yet" body="Booked meetings and parent requests will appear here." />
            )
          }
          footer={pagination && pagination.total > 0 ? (
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
          ) : undefined}
        />
      </Card>
      <BookAppointmentSheet open={booking} onClose={() => setBooking(false)} />
      {overlays}
    </Page>
  )
}

// ── Hosts ───────────────────────────────────────────────────────────────────

type HostDraft = AvailabilityDraft & {
  _id?: string
  teacherId: string
  displayName: string
  title: string
  email: string
  requiresApproval: boolean
  parentBookable: boolean
  parentVisibility: 'all' | 'linked'
  isActive: boolean
}

const toHostDraft = (host?: AppointmentHost): HostDraft => ({
  ...toAvailabilityDraft(host),
  _id: host?._id,
  teacherId: host?.teacher || '',
  displayName: host?.displayName || '',
  title: host?.title || '',
  email: host?.email || '',
  requiresApproval: host?.requiresApproval ?? true,
  parentBookable: host?.parentBookable ?? false,
  parentVisibility: host?.parentVisibility || 'all',
  isActive: host?.isActive ?? true,
})

const HostSheet: React.FC<{ host: AppointmentHost | 'new' | null; onClose: () => void }> = ({ host, onClose }) => {
  const isNew = host === 'new'
  const [draft, setDraft] = useState<HostDraft>(toHostDraft())
  const [error, setError] = useState('')
  const staff = useStaffOptions(isNew)
  const save = useSaveHost()
  useEffect(() => {
    if (!host) return
    setDraft(toHostDraft(host === 'new' ? undefined : host))
    setError('')
  }, [host])

  const pickStaff = (id: string) => {
    const person = (staff.data || []).find((row) => row._id === id)
    setDraft((d) => ({ ...d, teacherId: id, displayName: person?.name || '', title: person?.designation || '', email: person?.email || '' }))
  }

  const submit = async () => {
    if (isNew && !draft.teacherId) return setError('Choose a staff member')
    if (!draft.displayName.trim()) return setError('Enter a name')
    const problem = availabilityError(draft)
    if (problem) return setError(problem)
    setError('')
    const { _id, teacherId, ...rest } = draft
    const payload: HostPayload = { ...rest, displayName: rest.displayName.trim(), ...(isNew ? { teacherId } : {}) }
    try {
      await save.mutateAsync({ id: _id, payload })
      toast.success(isNew ? `${payload.displayName} can now take appointments.` : 'Saved.')
      onClose()
    } catch (err) {
      setError(errorMessage(err, "Couldn't save."))
    }
  }

  return (
    <Sheet
      open={Boolean(host)}
      onClose={onClose}
      size="lg"
      icon={UserCheck}
      title={isNew ? 'Add someone who takes appointments' : `Edit ${draft.displayName}`}
      description={isNew ? 'Only the people added here can be booked. Give their login the Appointment host role so they can see their own appointments.' : undefined}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{isNew ? 'Add' : 'Save changes'}</Button>
        </>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Person</h3>
        {isNew ? (
          <Combobox
            label="Staff member"
            required
            options={(staff.data || []).filter((row) => !row.isHost).map((row) => ({ value: row._id, label: row.name, meta: [row.designation, row.employeeId].filter(Boolean).join(' · ') }))}
            value={draft.teacherId}
            onChange={pickStaff}
            placeholder={staff.isLoading ? 'Loading…' : 'Search staff by name'}
          />
        ) : null}
        <div className="cb-form-grid">
          <TextField label="Name shown to visitors" required value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
          <TextField label="Title" hint="For example, Principal or Class teacher 7-A" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <TextField label="Email" type="email" hint="Gets new requests and changes" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </div>
        {!isNew ? (
          <Checkbox
            label="Taking appointments"
            description="Turn off to hide them from booking. Existing appointments stay."
            checked={draft.isActive}
            onChange={(checked) => setDraft({ ...draft, isActive: checked })}
          />
        ) : null}
      </div>
      <AvailabilityFields value={draft} onChange={(next) => setDraft({ ...draft, ...next })} />
      <HostRulesFields value={draft} onChange={(patch) => setDraft({ ...draft, ...patch } as HostDraft)} />
    </Sheet>
  )
}

export const AppntHosts: React.FC = () => {
  const { can } = usePermissions()
  const canEdit = can(P.settings)
  const hosts = useAppntHosts(canEdit)
  const [editing, setEditing] = useState<AppointmentHost | 'new' | null>(null)
  const rows = hosts.data || []

  const columns: DataTableColumn<AppointmentHost>[] = [
    { key: 'name', header: 'Name', mobile: 'title', render: (h) => <Entity primary={h.displayName} secondary={h.title} /> },
    { key: 'hours', header: 'Hours', wrap: true, mobile: 'subtitle', render: (h) => describeHours(h.weeklyAvailability) },
    { key: 'length', header: 'Meeting', mobile: 'hidden', render: (h) => `${h.slotMinutes} min` },
    {
      key: 'parents',
      header: 'Parent requests',
      mobile: 'hidden',
      render: (h) => (h.parentBookable
        ? <Badge tone="info" dot={false}>{h.parentVisibility === 'linked' ? 'Own students' : 'All parents'}</Badge>
        : <span className="cb-subtle">Front desk only</span>),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (h) => {
        if (!h.isActive) return <Badge tone="neutral">Not taking</Badge>
        if (h.absentToday) return <Badge tone="warning">Absent today</Badge>
        return <Badge tone="success">Taking</Badge>
      },
    },
    ...(canEdit ? [{
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      interactive: true,
      width: 48,
      render: (h: AppointmentHost) => <Menu items={[{ label: 'Edit', icon: Pencil, onSelect: () => setEditing(h) }]} label={`Actions for ${h.displayName}`} />,
    }] : []),
  ]

  return (
    <Page>
      <Card
        flush
        title="Who takes appointments"
        subtitle="Only these people can be booked. Everyone else, including teachers, stays off the booking list."
        action={canEdit ? <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add person</Button> : undefined}
      >
        <DataTable
          caption="People who take appointments"
          columns={columns}
          rows={rows}
          getRowKey={(h) => h._id}
          onRowClick={canEdit ? (h) => setEditing(h) : undefined}
          loading={hosts.isLoading}
          loadingLabel="Loading"
          empty={
            <EmptyState
              icon={UserCheck}
              title="Nobody is taking appointments yet"
              body="Add the principal first, then any teacher or staff member parents should be able to meet."
              action={canEdit ? <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add person</Button> : undefined}
            />
          }
        />
      </Card>
      {canEdit ? <HostSheet host={editing} onClose={() => setEditing(null)} /> : null}
    </Page>
  )
}

// ── My availability ─────────────────────────────────────────────────────────

export const AppntAvailability: React.FC = () => {
  const me = useMyHost()
  const save = useSaveHost()
  const [draft, setDraft] = useState<AvailabilityDraft | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (me.data) setDraft(toAvailabilityDraft(me.data))
  }, [me.data])

  if (me.isLoading) return <Page><Card><div className="cb-table-state"><span className="cb-spinner" /> Loading</div></Card></Page>
  if (me.isError || !me.data || !draft) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={errorCode(me.error) === 'not_a_host' ? "You're not taking appointments yet" : "Couldn't load your hours"}
            body={errorCode(me.error) === 'not_a_host' ? 'Ask the principal or an administrator to add you under Who takes appointments.' : errorMessage(me.error)}
          />
        </Card>
      </Page>
    )
  }

  const submit = async () => {
    const problem = availabilityError(draft)
    if (problem) return setError(problem)
    setError('')
    try {
      await save.mutateAsync({ payload: draft, mine: true })
      toast.success('Your hours are saved.')
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your hours."))
    }
  }

  return (
    <Page>
      <form
        className="ap-settings"
        onSubmit={(event) => { event.preventDefault(); submit() }}
      >
        <Card
          title="When people can book you"
          subtitle={`${me.data.displayName}${me.data.title ? ` · ${me.data.title}` : ''}. Teaching periods are kept free automatically when the timetable is set up.`}
          footer={<div className="cb-card-actions"><Button type="submit" variant="primary" loading={save.isPending}>Save hours</Button></div>}
        >
          {error ? <Banner tone="danger">{error}</Banner> : null}
          {!me.data.isActive ? <Banner tone="warning" title="You're not taking appointments right now">An administrator has paused your bookings.</Banner> : null}
          <AvailabilityFields value={draft} onChange={setDraft} />
        </Card>
      </form>
    </Page>
  )
}

// ── Reports ─────────────────────────────────────────────────────────────────

const BreakdownCard: React.FC<{ title: string; rows: ReportRow[]; label?: (name: string) => string }> = ({ title, rows, label = (n) => n }) => {
  const max = Math.max(1, ...rows.map((row) => row.total))
  return (
    <Card title={title}>
      {rows.length ? (
        <div className="cb-progress-list">
          {rows.map((row) => (
            <Progress
              key={row.name}
              label={label(row.name)}
              value={row.total}
              max={max}
              valueLabel={`${row.total} · ${row.completed} met${row.noShow ? ` · ${row.noShow} no-show` : ''}`}
            />
          ))}
        </div>
      ) : <EmptyState compact icon={CalendarDays} title="No appointments in this period" />}
    </Card>
  )
}

export const AppntReports: React.FC = () => {
  const [to, setTo] = useState(todayKey())
  const [from, setFrom] = useState(addDays(todayKey(), -29))
  const report = useAppntReport(from, to)
  const r = report.data
  const cancelled = (r?.status.cancelled || 0) + (r?.status.declined || 0)
  return (
    <Page>
      <div className="cb-stack">
        <Card>
          <div className="ap-report-range">
            <TextField size="sm" label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <TextField size="sm" label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </Card>
        <div className="cb-stats">
          <StatCard label="Appointments" value={r?.total ?? '…'} icon={CalendarDays} />
          <StatCard label="Met" value={r?.status.completed ?? '…'} icon={CalendarCheck} />
          <StatCard label="No-show rate" value={r ? `${r.noShowRate}%` : '…'} hint="Of meetings that were due" icon={Clock3} />
          <StatCard label="Cancelled or declined" value={r ? cancelled : '…'} icon={X} />
        </div>
        <div className="cb-grid-6-6">
          <BreakdownCard title="By person" rows={r?.byHost || []} />
          <BreakdownCard title="By purpose" rows={r?.byPurpose || []} />
        </div>
        <BreakdownCard title="By visitor" rows={r?.byVisitorType || []} label={(name) => VISITOR_LABEL[name as keyof typeof VISITOR_LABEL] || name} />
      </div>
    </Page>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

export const AppntSettings: React.FC = () => {
  const settings = useAppntSettings()
  const save = useSaveAppntSettings()
  const [draft, setDraft] = useState(settings.data)
  const [newPurpose, setNewPurpose] = useState('')
  useEffect(() => { if (settings.data) setDraft(settings.data) }, [settings.data])

  if (!draft) return <Page><Card><div className="cb-table-state"><span className="cb-spinner" /> Loading</div></Card></Page>

  const addPurpose = () => {
    const value = newPurpose.trim()
    if (!value || draft.purposes.some((p) => p.toLowerCase() === value.toLowerCase())) return
    setDraft({ ...draft, purposes: [...draft.purposes, value] })
    setNewPurpose('')
  }

  const submit = async () => {
    if (!draft.purposes.length) return toast.error('Keep at least one purpose.')
    try {
      await save.mutateAsync(draft)
      toast.success('Settings saved.')
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save settings."))
    }
  }

  return (
    <Page>
      <form className="ap-settings" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <Card
          title="Appointment settings"
          footer={<div className="cb-card-actions"><Button type="submit" variant="primary" loading={save.isPending}>Save settings</Button></div>}
        >
          <div className="cb-form-section">
            <h3 className="cb-form-section__title">Family portal</h3>
            <Checkbox
              label="Parents can request meetings in the family portal"
              description="Only with people you allow under Who takes appointments."
              checked={draft.allowParentRequests}
              onChange={(checked) => setDraft({ ...draft, allowParentRequests: checked })}
            />
            <div className="cb-form-grid cb-form-grid--3">
              <Select
                label="Notice needed"
                options={[0, 2, 4, 12, 24, 48, 72].map((h) => ({ value: String(h), label: h === 0 ? 'None' : h < 24 ? `${h} hours` : `${h / 24} ${h === 24 ? 'day' : 'days'}` }))}
                value={String(draft.minNoticeHours)}
                onChange={(e) => setDraft({ ...draft, minNoticeHours: Number(e.target.value) })}
              />
              <Select
                label="Bookable up to"
                options={[7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} days ahead` }))}
                value={String(draft.maxAdvanceDays)}
                onChange={(e) => setDraft({ ...draft, maxAdvanceDays: Number(e.target.value) })}
              />
              <Select
                label="Open requests per parent"
                options={[1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: String(n) }))}
                value={String(draft.maxOpenRequestsPerParent)}
                onChange={(e) => setDraft({ ...draft, maxOpenRequestsPerParent: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="cb-form-section">
            <h3 className="cb-form-section__title">Purposes</h3>
            <ul className="ap-purposes" aria-label="Purposes">
              {draft.purposes.map((purpose) => (
                <li key={purpose} className="ap-purpose">
                  {purpose}
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={X}
                    aria-label={`Remove ${purpose}`}
                    onClick={() => setDraft({ ...draft, purposes: draft.purposes.filter((p) => p !== purpose) })}
                  />
                </li>
              ))}
            </ul>
            <div className="ap-purpose-add">
              <TextField
                label="Add a purpose"
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPurpose() } }}
              />
              <Button icon={Plus} onClick={addPurpose} disabled={!newPurpose.trim()}>Add</Button>
            </div>
          </div>
          <div className="cb-form-section">
            <h3 className="cb-form-section__title">Email</h3>
            <Checkbox
              label="Email visitors and hosts when a meeting is booked, changed or cancelled"
              description="Needs the school's email to be set up. Appointments work without it."
              checked={draft.emailNotifications}
              onChange={(checked) => setDraft({ ...draft, emailNotifications: checked })}
            />
          </div>
        </Card>
      </form>
    </Page>
  )
}
