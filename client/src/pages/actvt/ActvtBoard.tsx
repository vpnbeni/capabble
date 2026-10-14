import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Medal,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Trophy,
} from 'lucide-react'
import api from '@/services/api'
import { CALENDAR_WEEKDAY_LABELS, isCalendarSunday } from '@/constants/calendarDayMetadata'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  FilterBar,
  Icon,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  Tabs,
  TextArea,
  TextField,
  cx,
  formatDate,
  type Tone,
} from '@/components/ui'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/board.css'

type BoardTab = 'overview' | 'calendar' | 'scores' | 'criteria'

type ActivityEvent = {
  _id?: string
  title?: string
  date?: string
  monthKey?: string
  activityType?: string
  scopeType?: string
  houseName?: string
  clubName?: string
  venue?: string
  incharge?: string
  description?: string
  status?: string
  criteriaId?: string
  criteriaTitle?: string
}

type CriteriaRecord = {
  _id?: string
  title?: string
  activityType?: string
  maxMarks?: number
  criteria?: string
  notes?: string
}

type HouseOption = {
  _id?: string
  name?: string
  color?: string
}

type PointsEntry = {
  _id?: string
  title?: string
  date?: string
  houseId?: string
  houseName?: string
  houseColor?: string
  points?: number
  category?: string
  notes?: string
}

type Standing = {
  houseId: string
  houseName: string
  houseColor: string
  totalPoints: number
  entries: number
  rank: number
}

type EventForm = {
  title: string
  date: string
  activityType: string
  scopeType: string
  houseName: string
  clubName: string
  venue: string
  incharge: string
  description: string
  status: string
  criteriaId: string
}

type CriteriaForm = {
  title: string
  activityType: string
  maxMarks: string
  criteria: string
  notes: string
}

type PointsForm = {
  title: string
  date: string
  houseId: string
  points: string
  category: string
  notes: string
  eventId: string
}

type PendingDelete =
  | { kind: 'event'; item: ActivityEvent }
  | { kind: 'criteria'; item: CriteriaRecord }
  | { kind: 'points'; item: PointsEntry }

const ACTIVITY_TYPES = [
  'General',
  'Debate',
  'Quiz',
  'Sports',
  'Cultural',
  'Literary',
  'Science',
  'Art',
  'Other',
]

/**
 * Activity types are a fixed app palette, not entity data: each maps to a chart token
 * in a fixed order (General and Other stay neutral). The type name is always shown too.
 */
const typeToneClass = (type = '') => {
  const index = ACTIVITY_TYPES.indexOf(type || 'General')
  if (index <= 0 || index === ACTIVITY_TYPES.length - 1) return 'ab-type--neutral'
  return `ab-type--${((index - 1) % 6) + 1}`
}

const COMPETITION_TYPE_OPTIONS = [
  { value: 'school', label: 'Whole school' },
  { value: 'inter-house', label: 'Inter-house' },
  { value: 'club', label: 'Club' },
]

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_TONE: Record<string, Tone> = {
  planned: 'info',
  completed: 'success',
  cancelled: 'danger',
}

const statusLabel = (status = 'planned') =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label || status

const normalizeScopeType = (value = '') => {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'house') return 'inter-house'
  if (text === 'club') return 'club'
  return 'school'
}

const allHousesLabel = (houses: HouseOption[]) => {
  const names = houses
    .map((house) => String(house.name || '').trim())
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'All houses'
}

const emptyEventForm = (date = ''): EventForm => ({
  title: '',
  date,
  activityType: 'General',
  scopeType: 'school',
  houseName: '',
  clubName: '',
  venue: '',
  incharge: '',
  description: '',
  status: 'planned',
  criteriaId: '',
})

const emptyCriteriaForm = (): CriteriaForm => ({
  title: '',
  activityType: 'General',
  maxMarks: '100',
  criteria: '',
  notes: '',
})

const emptyPointsForm = (): PointsForm => ({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  houseId: '',
  points: '',
  category: 'Inter-house',
  notes: '',
  eventId: '',
})

const monthKeyFromDate = (value: string) => {
  if (!value || value.length < 7) return ''
  return value.slice(0, 7)
}

const formatMonthLabel = (year: number, monthIndex: number) =>
  new Date(year, monthIndex, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })

/** YYYY-MM-DD read as a local date (avoids the UTC shift of `new Date('2026-10-14')`). */
const formatDayKey = (value = '', opts: { year?: boolean } = {}) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return value ? String(value) : 'No date'
  return formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), opts)
}

const errorText = (error: any, fallback: string) =>
  String(error?.response?.data?.message || error?.message || fallback)

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const TypeTag: React.FC<{ type?: string }> = ({ type }) => (
  <span className={cx('ab-typetag', typeToneClass(type))}>
    <span className="ab-typetag__dot" aria-hidden="true" />
    {type || 'General'}
  </span>
)

const ActvtBoard: React.FC = () => {
  const location = useLocation()
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [tab, setTab] = useState<BoardTab>(() => (location.pathname.endsWith('/calendar') ? 'calendar' : 'overview'))
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [criteriaList, setCriteriaList] = useState<CriteriaRecord[]>([])
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [recentPoints, setRecentPoints] = useState<PointsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const [filterMonth, setFilterMonth] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [query, setQuery] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm(selectedDate))
  const [editingEventId, setEditingEventId] = useState('')
  const [eventSheetOpen, setEventSheetOpen] = useState(false)
  const [criteriaForm, setCriteriaForm] = useState<CriteriaForm>(emptyCriteriaForm())
  const [editingCriteriaId, setEditingCriteriaId] = useState('')
  const [criteriaSheetOpen, setCriteriaSheetOpen] = useState(false)
  const [pointsForm, setPointsForm] = useState<PointsForm>(emptyPointsForm())
  const [pointsSheetOpen, setPointsSheetOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`

  const load = async () => {
    setLoading(true)
    try {
      const [eventsRes, criteriaRes, housesRes, rankingRes] = await Promise.all([
        api.get('/actvt/events'),
        api.get('/actvt/criteria'),
        api.get('/actvt/houses'),
        api.get('/actvt/ranking'),
      ])
      setEvents((eventsRes.data?.data || []) as ActivityEvent[])
      setCriteriaList((criteriaRes.data?.data || []) as CriteriaRecord[])
      setHouses((housesRes.data?.data || []) as HouseOption[])
      setStandings((rankingRes.data?.data?.standings || []) as Standing[])
      setRecentPoints((rankingRes.data?.data?.recent || []) as PointsEntry[])
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to load activity board.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const monthOptions = useMemo(() => {
    const keys = new Set<string>()
    events.forEach((item) => {
      const key = item.monthKey || monthKeyFromDate(String(item.date || ''))
      if (key) keys.add(key)
    })
    keys.add(monthKey)
    return Array.from(keys).sort().reverse()
  }, [events, monthKey])

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return events
      .filter((item) => {
        const key = item.monthKey || monthKeyFromDate(String(item.date || ''))
        if (filterMonth && key !== filterMonth) return false
        if (filterType !== 'all' && String(item.activityType || 'General') !== filterType) return false
        if (filterStatus !== 'all' && String(item.status || 'planned') !== filterStatus) return false
        if (!needle) return true
        return `${item.title || ''} ${item.venue || ''} ${item.houseName || ''} ${item.clubName || ''} ${item.activityType || ''}`
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  }, [events, filterMonth, filterType, filterStatus, query])

  const monthEvents = useMemo(
    () =>
      events
        .filter((item) => {
          const key = item.monthKey || monthKeyFromDate(String(item.date || ''))
          return key === monthKey
        })
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
    [events, monthKey]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>()
    monthEvents.forEach((item) => {
      const key = String(item.date || '')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    })
    return map
  }, [monthEvents])

  const selectedDayEvents = useMemo(
    () => events.filter((item) => String(item.date || '') === selectedDate),
    [events, selectedDate]
  )

  const monthTypes = useMemo(() => {
    const seen = new Set<string>()
    monthEvents.forEach((item) => seen.add(String(item.activityType || 'General')))
    return ACTIVITY_TYPES.filter((type) => seen.has(type)).concat(
      Array.from(seen).filter((type) => !ACTIVITY_TYPES.includes(type))
    )
  }, [monthEvents])

  const calendarCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
    const cells: Array<{ day: number | null; dateKey: string }> = []
    for (let i = 0; i < startPad; i += 1) cells.push({ day: null, dateKey: '' })
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`
      cells.push({ day, dateKey })
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, dateKey: '' })
    return cells
  }, [cursor.year, cursor.month, monthKey])

  const stats = useMemo(() => {
    const planned = events.filter((item) => (item.status || 'planned') === 'planned').length
    const completed = events.filter((item) => item.status === 'completed').length
    const cancelled = events.filter((item) => item.status === 'cancelled').length
    return { total: events.length, planned, completed, cancelled }
  }, [events])

  const houseMap = useMemo(() => {
    const map = new Map<string, HouseOption>()
    houses.forEach((house) => map.set(String(house._id), house))
    return map
  }, [houses])

  /** A house's own colour: the one saved on the score, else the house record's. */
  const houseColorOf = (houseId?: string, stored?: string) => stored || houseMap.get(String(houseId))?.color || ''
  const houseIndexOf = (houseId?: string) => Math.max(0, houses.findIndex((house) => String(house._id) === String(houseId)))

  const resetEventForm = (date = selectedDate) => {
    setEditingEventId('')
    setEventForm(emptyEventForm(date))
  }

  const openNewEvent = (date = selectedDate) => {
    resetEventForm(date)
    setEventSheetOpen(true)
  }

  const closeEventSheet = () => {
    setEventSheetOpen(false)
    setEditingEventId('')
  }

  const handleDayClick = (dateKey: string) => {
    if (!dateKey) return
    setSelectedDate(dateKey)
    resetEventForm(dateKey)
    setTab('calendar')
  }

  const handleEditEvent = (item: ActivityEvent) => {
    const normalizedScopeType = normalizeScopeType(String(item.scopeType || 'school'))
    setEditingEventId(String(item._id || ''))
    setSelectedDate(String(item.date || selectedDate))
    setEventForm({
      title: String(item.title || ''),
      date: String(item.date || selectedDate),
      activityType: String(item.activityType || 'General'),
      scopeType: normalizedScopeType,
      houseName: normalizedScopeType === 'inter-house' ? allHousesLabel(houses) : String(item.houseName || ''),
      clubName: String(item.clubName || ''),
      venue: String(item.venue || ''),
      incharge: String(item.incharge || ''),
      description: String(item.description || ''),
      status: String(item.status || 'planned'),
      criteriaId: String(item.criteriaId || ''),
    })
    setEventSheetOpen(true)
  }

  const handleSaveEvent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!eventForm.title.trim()) {
      toast.error('Activity title is required.')
      return
    }
    if (!eventForm.date) {
      toast.error('Please choose a date.')
      return
    }

    const matchedCriteria = criteriaList.find((item) => String(item._id) === eventForm.criteriaId)

    setSaving(true)
    try {
      const payload = {
        ...eventForm,
        scopeType: normalizeScopeType(eventForm.scopeType),
        title: eventForm.title.trim(),
        monthKey: monthKeyFromDate(eventForm.date),
        houseName: normalizeScopeType(eventForm.scopeType) === 'inter-house' ? allHousesLabel(houses) : '',
        clubName: eventForm.scopeType === 'club' ? eventForm.clubName.trim() : '',
        criteriaId: eventForm.criteriaId,
        criteriaTitle: matchedCriteria?.title || '',
      }

      if (editingEventId) {
        await api.put(`/actvt/events/${editingEventId}`, payload)
        toast.success('Activity updated.')
      } else {
        await api.post('/actvt/events', payload)
        toast.success('Activity saved.')
      }
      resetEventForm(eventForm.date)
      setEventSheetOpen(false)
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to save activity.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveEvent = async (item: ActivityEvent) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/events/${item._id}`)
      toast.success('Activity removed.')
      if (editingEventId === item._id) resetEventForm()
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to remove activity.'))
    }
  }

  const openNewCriteria = () => {
    setEditingCriteriaId('')
    setCriteriaForm(emptyCriteriaForm())
    setCriteriaSheetOpen(true)
  }

  const closeCriteriaSheet = () => {
    setCriteriaSheetOpen(false)
    setEditingCriteriaId('')
    setCriteriaForm(emptyCriteriaForm())
  }

  const handleSaveCriteria = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!criteriaForm.title.trim()) {
      toast.error('Criteria title is required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: criteriaForm.title.trim(),
        activityType: criteriaForm.activityType,
        maxMarks: Number(criteriaForm.maxMarks) || 100,
        criteria: criteriaForm.criteria.trim(),
        notes: criteriaForm.notes.trim(),
      }
      if (editingCriteriaId) {
        await api.put(`/actvt/criteria/${editingCriteriaId}`, payload)
        toast.success('Criteria updated.')
      } else {
        await api.post('/actvt/criteria', payload)
        toast.success('Criteria saved.')
      }
      setCriteriaForm(emptyCriteriaForm())
      setEditingCriteriaId('')
      setCriteriaSheetOpen(false)
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to save criteria.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEditCriteria = (item: CriteriaRecord) => {
    setEditingCriteriaId(String(item._id || ''))
    setCriteriaForm({
      title: String(item.title || ''),
      activityType: String(item.activityType || 'General'),
      maxMarks: String(item.maxMarks ?? 100),
      criteria: String(item.criteria || ''),
      notes: String(item.notes || ''),
    })
    setCriteriaSheetOpen(true)
  }

  const handleRemoveCriteria = async (item: CriteriaRecord) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/criteria/${item._id}`)
      toast.success('Criteria removed.')
      if (editingCriteriaId === item._id) {
        setEditingCriteriaId('')
        setCriteriaForm(emptyCriteriaForm())
      }
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to remove criteria.'))
    }
  }

  const openNewPoints = () => {
    setPointsForm(emptyPointsForm())
    setPointsSheetOpen(true)
  }

  const handleSavePoints = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pointsForm.title.trim()) {
      toast.error('Activity title is required.')
      return
    }
    if (!pointsForm.houseId) {
      toast.error('Please select a house.')
      return
    }
    const pointsValue = Number(pointsForm.points)
    if (!pointsForm.points.trim() || !Number.isFinite(pointsValue)) {
      toast.error('Enter a valid points value.')
      return
    }

    const house = houseMap.get(pointsForm.houseId)
    setSaving(true)
    try {
      await api.post('/actvt/points', {
        title: pointsForm.title.trim(),
        date: pointsForm.date,
        eventId: pointsForm.eventId,
        houseId: pointsForm.houseId,
        houseName: house?.name || '',
        houseColor: house?.color || '',
        points: pointsValue,
        category: pointsForm.category.trim() || 'Inter-house',
        notes: pointsForm.notes.trim(),
      })
      toast.success('House score recorded.')
      setPointsForm(emptyPointsForm())
      setPointsSheetOpen(false)
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to save score.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePoints = async (item: PointsEntry) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/points/${item._id}`)
      toast.success('Score entry removed.')
      await load()
    } catch (error: any) {
      toast.error(errorText(error, 'Failed to remove score.'))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setRemoving(true)
    try {
      if (pendingDelete.kind === 'event') await handleRemoveEvent(pendingDelete.item)
      if (pendingDelete.kind === 'criteria') await handleRemoveCriteria(pendingDelete.item)
      if (pendingDelete.kind === 'points') await handleRemovePoints(pendingDelete.item)
    } finally {
      setRemoving(false)
      setPendingDelete(null)
    }
  }

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  const maxPoints = Math.max(...standings.map((item) => item.totalPoints), 1)
  const scopeType = normalizeScopeType(eventForm.scopeType)
  const hasFilters = Boolean(query.trim() || filterMonth || filterType !== 'all' || filterStatus !== 'all')

  const loadingState = (label: string) => (
    <div className="cb-table-state" role="status">
      <span className="cb-spinner" aria-hidden="true" />
      {label}
    </div>
  )

  const eventMeta = (item: ActivityEvent, withType = false) =>
    [
      formatDayKey(item.date),
      withType ? item.activityType || 'General' : '',
      item.venue || '',
      normalizeScopeType(item.scopeType) === 'inter-house' ? 'Inter-house' : '',
      normalizeScopeType(item.scopeType) === 'club' && item.clubName ? item.clubName : '',
      item.criteriaTitle ? `Criteria: ${item.criteriaTitle}` : '',
    ]
      .filter(Boolean)
      .join(' · ')

  const eventRow = (item: ActivityEvent, opts: { showType?: boolean } = {}) => (
    <li key={item._id} className="ab-row">
      <button type="button" className="ab-row__open" onClick={() => handleEditEvent(item)}>
        <span className="ab-row__head">
          <span className="ab-row__title">{item.title || 'Untitled activity'}</span>
          <Badge tone={STATUS_TONE[item.status || 'planned'] || 'neutral'}>{statusLabel(item.status || 'planned')}</Badge>
          {opts.showType ? <TypeTag type={item.activityType} /> : null}
        </span>
        <span className="ab-row__meta">{eventMeta(item, !opts.showType)}</span>
      </button>
      <Menu
        label={`Actions for ${item.title || 'activity'}`}
        items={[
          { label: 'Edit activity', icon: Pencil, onSelect: () => handleEditEvent(item) },
          { divider: true },
          { label: 'Remove activity', icon: Trash2, tone: 'danger', onSelect: () => setPendingDelete({ kind: 'event', item }) },
        ]}
      />
    </li>
  )

  const deleteCopy = (() => {
    if (!pendingDelete) return { title: '', body: '', action: '' }
    const name = pendingDelete.item.title || 'Untitled'
    if (pendingDelete.kind === 'event')
      return { title: 'Remove activity?', body: `“${name}” will be removed from the board and calendar.`, action: 'Remove activity' }
    if (pendingDelete.kind === 'criteria')
      return { title: 'Remove criteria?', body: `“${name}” will be removed. Activities keep the criteria name they were saved with.`, action: 'Remove criteria' }
    return { title: 'Remove score entry?', body: `“${name}” will be removed and the house standings recalculated.`, action: 'Remove entry' }
  })()

  return (
    <Page width="full" className="ab-page">
      <Tabs
        label="Activity board sections"
        value={tab}
        onChange={(id) => setTab(id as BoardTab)}
        items={[
          { id: 'overview', label: 'Overview' },
          { id: 'calendar', label: 'Calendar' },
          { id: 'scores', label: 'House scores' },
          { id: 'criteria', label: 'Judgement criteria', count: criteriaList.length || undefined },
        ]}
      />

      {tab === 'overview' ? (
        <div className="cb-stack">
          <div className="cb-stats">
            <StatCard label="All activities" value={stats.total} icon={ClipboardList} />
            <StatCard label="Planned" value={stats.planned} icon={CalendarClock} />
            <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} />
            <StatCard label="Cancelled" value={stats.cancelled} icon={CalendarX2} />
          </div>

          <Card
            flush
            title="Activity records"
            subtitle={loading ? undefined : `${plural(filteredEvents.length, 'activity', 'activities')}${hasFilters ? ' match the filters' : ''}`}
          >
            <FilterBar
              className="ab-filterbar"
              search={{ placeholder: 'Search activities', value: query, onChange: setQuery }}
              filters={
                <>
                  <Select
                    size="sm"
                    aria-label="Month"
                    value={filterMonth}
                    onChange={(event) => setFilterMonth(event.target.value)}
                    options={[
                      { value: '', label: 'All months' },
                      ...monthOptions.map((key) => {
                        const [year, month] = key.split('-')
                        return { value: key, label: formatMonthLabel(Number(year), Number(month) - 1) }
                      }),
                    ]}
                  />
                  <Select
                    size="sm"
                    aria-label="Activity type"
                    value={filterType}
                    onChange={(event) => setFilterType(event.target.value)}
                    options={[{ value: 'all', label: 'All types' }, ...ACTIVITY_TYPES]}
                  />
                  <Select
                    size="sm"
                    aria-label="Status"
                    value={filterStatus}
                    onChange={(event) => setFilterStatus(event.target.value)}
                    options={[{ value: 'all', label: 'All statuses' }, ...STATUS_OPTIONS]}
                  />
                </>
              }
              actions={
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openNewEvent(selectedDate)}>
                  Plan activity
                </Button>
              }
            />
            {loading && events.length === 0 ? (
              loadingState('Loading activities…')
            ) : filteredEvents.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No activities match these filters"
                  body="Clear the search or pick another month, type or status."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        setQuery('')
                        setFilterMonth('')
                        setFilterType('all')
                        setFilterStatus('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No activities planned yet"
                  body="Plan a debate, sports meet or club event to see it here and on the calendar."
                />
              )
            ) : (
              <ul className="ab-list ab-list--flush">{filteredEvents.map((item) => eventRow(item, { showType: true }))}</ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'calendar' ? (
        <div className="cb-grid-8-4">
          <Card
            title={formatMonthLabel(cursor.year, cursor.month)}
            subtitle={loading ? 'Loading…' : plural(monthEvents.length, 'activity', 'activities')}
            action={
              <div className="ab-calnav">
                <Button size="sm" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>
                  Today
                </Button>
                <div className="ab-stepper" role="group" aria-label="Month">
                  <button type="button" className="ab-stepper__btn" aria-label="Previous month" title="Previous month" onClick={() => shiftMonth(-1)}>
                    <Icon icon={ChevronLeft} size={16} />
                  </button>
                  <button type="button" className="ab-stepper__btn" aria-label="Next month" title="Next month" onClick={() => shiftMonth(1)}>
                    <Icon icon={ChevronRight} size={16} />
                  </button>
                </div>
              </div>
            }
          >
            <div className="ab-cal" role="grid" aria-label={`Activities in ${formatMonthLabel(cursor.year, cursor.month)}`}>
              <div className="ab-cal__weekdays" role="row">
                {CALENDAR_WEEKDAY_LABELS.map((day, index) => (
                  <div key={day} role="columnheader" className={cx('ab-cal__weekday', isCalendarSunday(index) && 'is-sunday')}>
                    {day}
                  </div>
                ))}
              </div>
              <div className="ab-cal__grid">
                {calendarCells.map((cell, index) => {
                  if (!cell.day) return <div key={`empty-${index}`} className="ab-cal__cell is-empty" aria-hidden="true" />
                  const dayEvents = eventsByDate.get(cell.dateKey) || []
                  const selected = cell.dateKey === selectedDate
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      role="gridcell"
                      aria-selected={selected}
                      aria-label={`${formatDayKey(cell.dateKey)}, ${plural(dayEvents.length, 'activity', 'activities')}`}
                      onClick={() => handleDayClick(cell.dateKey)}
                      className={cx(
                        'ab-cal__cell',
                        selected && 'is-selected',
                        cell.dateKey === todayKey && 'is-today',
                        isCalendarSunday(index % 7) && 'is-sunday'
                      )}
                    >
                      <span className="ab-cal__day">{cell.day}</span>
                      <span className="ab-cal__chips">
                        {dayEvents.slice(0, 2).map((item) => (
                          <span
                            key={item._id}
                            className={cx('ab-cal__chip', typeToneClass(item.activityType), item.status === 'cancelled' && 'is-cancelled')}
                          >
                            {item.title}
                          </span>
                        ))}
                        {dayEvents.length > 2 ? <span className="ab-cal__more">+{dayEvents.length - 2} more</span> : null}
                      </span>
                      {dayEvents.length > 0 ? (
                        <span className="ab-cal__dots" aria-hidden="true">
                          {dayEvents.slice(0, 3).map((item) => (
                            <span key={item._id} className={cx('ab-cal__dot', typeToneClass(item.activityType))} />
                          ))}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
            {monthTypes.length > 0 ? (
              <ul className="ab-legend" aria-label="Activity types this month">
                {monthTypes.map((type) => (
                  <li key={type}>
                    <TypeTag type={type} />
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <div className="cb-stack">
            <Card
              title={formatDayKey(selectedDate)}
              subtitle={selectedDate === todayKey ? 'Today' : plural(selectedDayEvents.length, 'activity', 'activities')}
              action={
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openNewEvent(selectedDate)}>
                  Plan activity
                </Button>
              }
              flush
            >
              {selectedDayEvents.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="Nothing planned on this day" body="Plan an activity for this date, or pick another day." />
              ) : (
                <ul className="ab-list ab-list--flush">{selectedDayEvents.map((item) => eventRow(item, { showType: true }))}</ul>
              )}
            </Card>

            <Card title="This month" subtitle={formatMonthLabel(cursor.year, cursor.month)} flush>
              {loading && events.length === 0 ? (
                loadingState('Loading activities…')
              ) : monthEvents.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="No activities this month" body="Pick a day on the calendar to plan one." />
              ) : (
                <ul className="ab-list ab-list--flush">{monthEvents.map((item) => eventRow(item))}</ul>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'scores' ? (
        <div className="cb-grid-6-6">
          <Card
            title="Live standings"
            subtitle="Total points by house"
            action={
              <Button variant="primary" size="sm" icon={Plus} onClick={openNewPoints}>
                Record score
              </Button>
            }
          >
            {loading && standings.length === 0 ? (
              loadingState('Loading standings…')
            ) : standings.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No house scores recorded yet"
                body={houses.length === 0 ? 'Add houses first, then record scores here.' : 'Record a score to start the standings.'}
              />
            ) : (
              <ol className="ab-standings">
                {standings.map((item, index) => (
                  <li
                    key={item.houseId}
                    className="ab-standing"
                    style={toneStyle(houseColorOf(item.houseId, item.houseColor), houseIndexOf(item.houseId) || index)}
                  >
                    <div className="ab-standing__head">
                      <span className="ab-standing__rank is-num">#{item.rank}</span>
                      <span className="actvt-tone-dot" aria-hidden="true" />
                      <span className="ab-standing__name">{item.houseName}</span>
                      <span className="ab-standing__pts is-num">
                        {item.totalPoints} <span>pts</span>
                      </span>
                    </div>
                    <div
                      className="ab-standing__track"
                      role="progressbar"
                      aria-label={`${item.houseName} points`}
                      aria-valuemin={0}
                      aria-valuemax={maxPoints}
                      aria-valuenow={item.totalPoints}
                    >
                      <div className="ab-standing__fill" style={{ width: `${Math.max(6, (item.totalPoints / maxPoints) * 100)}%` }} />
                    </div>
                    <span className="ab-standing__entries">{plural(item.entries || 0, 'entry', 'entries')}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Recent score entries" flush>
            {loading && recentPoints.length === 0 ? (
              loadingState('Loading entries…')
            ) : recentPoints.length === 0 ? (
              <EmptyState compact icon={Medal} title="No score entries yet" body="Entries appear here as you record house scores." />
            ) : (
              <ul className="ab-list ab-list--flush">
                {recentPoints.map((item) => (
                  <li key={item._id} className="ab-row" style={toneStyle(houseColorOf(item.houseId, item.houseColor), houseIndexOf(item.houseId))}>
                    <div className="ab-row__open is-static">
                      <span className="ab-row__head">
                        <span className="ab-row__title">{item.title || 'Untitled entry'}</span>
                        <span className="ab-points is-num">
                          {Number(item.points || 0) > 0 ? '+' : ''}
                          {item.points ?? 0} pts
                        </span>
                      </span>
                      <span className="ab-row__meta">
                        <span className="ab-house">
                          <span className="actvt-tone-dot" aria-hidden="true" />
                          {item.houseName || 'House'}
                        </span>
                        {[formatDayKey(item.date), item.category || ''].filter(Boolean).map((part) => ` · ${part}`)}
                      </span>
                    </div>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={Trash2}
                      aria-label={`Remove score entry ${item.title || ''}`}
                      onClick={() => setPendingDelete({ kind: 'points', item })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'criteria' ? (
        <Card
          title="Judgement criteria"
          subtitle="Scoring and judging sheets you can link to activities"
          action={
            <Button variant="primary" size="sm" icon={Plus} onClick={openNewCriteria}>
              Add criteria
            </Button>
          }
        >
          {loading && criteriaList.length === 0 ? (
            loadingState('Loading criteria…')
          ) : criteriaList.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No judgement criteria yet"
              body="Define scoring sheets for debates, sports, cultural events and more, then link them when you plan an activity."
            />
          ) : (
            <ul className="ab-criteria">
              {criteriaList.map((item) => {
                const lines = String(item.criteria || '')
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                return (
                  <li key={item._id} className="ab-crit">
                    <div className="ab-crit__head">
                      <div className="ab-crit__titles">
                        <p className="ab-crit__title">{item.title}</p>
                        <p className="ab-crit__meta">
                          <TypeTag type={item.activityType} />
                          <span className="is-num">Max {item.maxMarks ?? 100} marks</span>
                        </p>
                      </div>
                      <Menu
                        label={`Actions for ${item.title || 'criteria'}`}
                        items={[
                          { label: 'Edit criteria', icon: Pencil, onSelect: () => handleEditCriteria(item) },
                          { divider: true },
                          { label: 'Remove criteria', icon: Trash2, tone: 'danger', onSelect: () => setPendingDelete({ kind: 'criteria', item }) },
                        ]}
                      />
                    </div>
                    {lines.length > 0 ? (
                      <ol className="ab-crit__points">
                        {lines.map((line, lineIndex) => (
                          <li key={`${lineIndex}-${line}`}>{line}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="ab-crit__none">No judgement points listed.</p>
                    )}
                    {item.notes ? <p className="ab-crit__notes">{item.notes}</p> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {/* ---------- Plan / edit activity ---------- */}
      <Sheet
        open={eventSheetOpen}
        onClose={closeEventSheet}
        icon={CalendarDays}
        title={editingEventId ? 'Edit activity' : 'Plan activity'}
        description={editingEventId ? 'Changes show on the board and calendar.' : 'Add an activity to the school calendar.'}
        onSubmit={handleSaveEvent}
        footer={
          <>
            {editingEventId ? (
              <Button
                variant="danger"
                icon={Trash2}
                className="ab-sheet-left"
                onClick={() => {
                  const item = events.find((entry) => String(entry._id) === editingEventId)
                  if (item) setPendingDelete({ kind: 'event', item })
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button onClick={closeEventSheet}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {editingEventId ? 'Save changes' : 'Add to calendar'}
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField
            label="Title"
            required
            value={eventForm.title}
            onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
            placeholder="e.g. Inter-house debate"
          />
          <div className="cb-form-grid">
            <TextField
              label="Date"
              type="date"
              required
              value={eventForm.date}
              onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
            />
            <Select
              label="Status"
              value={eventForm.status}
              onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
              options={STATUS_OPTIONS}
            />
            <Select
              label="Type"
              value={eventForm.activityType}
              onChange={(e) => setEventForm({ ...eventForm, activityType: e.target.value })}
              options={ACTIVITY_TYPES}
            />
            <Select
              label="Competition type"
              value={eventForm.scopeType}
              onChange={(e) => {
                const nextScopeType = normalizeScopeType(e.target.value)
                setEventForm({
                  ...eventForm,
                  scopeType: nextScopeType,
                  houseName: nextScopeType === 'inter-house' ? allHousesLabel(houses) : '',
                  clubName: nextScopeType === 'club' ? eventForm.clubName : '',
                })
              }}
              options={COMPETITION_TYPE_OPTIONS}
            />
          </div>
          {scopeType === 'inter-house' ? (
            <TextField label="Participating houses" value={eventForm.houseName} placeholder="All houses" readOnly hint="Every house takes part." />
          ) : null}
          {scopeType === 'club' ? (
            <TextField
              label="Club"
              value={eventForm.clubName}
              onChange={(e) => setEventForm({ ...eventForm, clubName: e.target.value })}
              placeholder="Club name"
            />
          ) : null}
          <Select
            label="Judgement criteria"
            value={eventForm.criteriaId}
            onChange={(e) => setEventForm({ ...eventForm, criteriaId: e.target.value })}
            options={[
              { value: '', label: 'None' },
              ...criteriaList.map((item) => ({
                value: String(item._id || ''),
                label: `${item.title} (${item.activityType || 'General'})`,
              })),
            ]}
          />
          <div className="cb-form-grid">
            <TextField label="Venue" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} />
            <TextField
              label="In charge"
              value={eventForm.incharge}
              onChange={(e) => setEventForm({ ...eventForm, incharge: e.target.value })}
            />
          </div>
          <TextArea
            label="Description"
            rows={3}
            value={eventForm.description}
            onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
          />
        </div>
      </Sheet>

      {/* ---------- Record house score ---------- */}
      <Sheet
        open={pointsSheetOpen}
        onClose={() => setPointsSheetOpen(false)}
        icon={Medal}
        title="Record score"
        description="Points are added to the house's total in the live standings."
        onSubmit={handleSavePoints}
        footer={
          <>
            <Button onClick={() => setPointsSheetOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>
              Record score
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField
            label="Title"
            required
            value={pointsForm.title}
            onChange={(e) => setPointsForm({ ...pointsForm, title: e.target.value })}
            placeholder="e.g. Debate 1st place"
          />
          <Select
            label="Linked activity"
            value={pointsForm.eventId}
            onChange={(e) => {
              const eventId = e.target.value
              const matched = events.find((item) => String(item._id) === eventId)
              setPointsForm({
                ...pointsForm,
                eventId,
                title: pointsForm.title || String(matched?.title || ''),
                date: matched?.date || pointsForm.date,
                category: matched?.activityType || pointsForm.category,
              })
            }}
            options={[
              { value: '', label: 'None' },
              ...events.map((item) => ({
                value: String(item._id || ''),
                label: `${item.title} · ${formatDayKey(item.date)}`,
              })),
            ]}
            hint="Fills in the title, date and category."
          />
          <Select
            label="House"
            required
            value={pointsForm.houseId}
            onChange={(e) => setPointsForm({ ...pointsForm, houseId: e.target.value })}
            placeholder="Select house"
            options={houses.map((house) => ({ value: String(house._id || ''), label: house.name || 'Unnamed house' }))}
            hint={houses.length === 0 ? 'No houses yet. Add houses in Activities first.' : undefined}
          />
          {pointsForm.houseId ? (
            <span
              className="ab-house ab-house--picked"
              style={toneStyle(houseMap.get(pointsForm.houseId)?.color, houseIndexOf(pointsForm.houseId))}
            >
              <span className="actvt-tone-dot" aria-hidden="true" />
              {houseMap.get(pointsForm.houseId)?.name}
            </span>
          ) : null}
          <div className="cb-form-grid">
            <TextField
              label="Date"
              type="date"
              value={pointsForm.date}
              onChange={(e) => setPointsForm({ ...pointsForm, date: e.target.value })}
            />
            <TextField
              label="Points"
              type="number"
              required
              inputMode="numeric"
              value={pointsForm.points}
              onChange={(e) => setPointsForm({ ...pointsForm, points: e.target.value })}
            />
          </div>
          <TextField
            label="Category"
            value={pointsForm.category}
            onChange={(e) => setPointsForm({ ...pointsForm, category: e.target.value })}
            placeholder="Inter-house, debate, sports"
          />
          <TextArea
            label="Notes"
            rows={3}
            value={pointsForm.notes}
            onChange={(e) => setPointsForm({ ...pointsForm, notes: e.target.value })}
            placeholder="Performance notes or placement"
          />
        </div>
      </Sheet>

      {/* ---------- Add / edit judgement criteria ---------- */}
      <Sheet
        open={criteriaSheetOpen}
        onClose={closeCriteriaSheet}
        icon={Scale}
        title={editingCriteriaId ? 'Edit criteria' : 'Add criteria'}
        description="A judging sheet you can link when planning an activity."
        onSubmit={handleSaveCriteria}
        footer={
          <>
            <Button onClick={closeCriteriaSheet}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {editingCriteriaId ? 'Save changes' : 'Save criteria'}
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField
            label="Title"
            required
            value={criteriaForm.title}
            onChange={(e) => setCriteriaForm({ ...criteriaForm, title: e.target.value })}
            placeholder="e.g. Debate judging sheet"
          />
          <div className="cb-form-grid">
            <Select
              label="Activity type"
              value={criteriaForm.activityType}
              onChange={(e) => setCriteriaForm({ ...criteriaForm, activityType: e.target.value })}
              options={ACTIVITY_TYPES}
            />
            <TextField
              label="Max marks"
              type="number"
              inputMode="numeric"
              value={criteriaForm.maxMarks}
              onChange={(e) => setCriteriaForm({ ...criteriaForm, maxMarks: e.target.value })}
            />
          </div>
          <TextArea
            label="Judgement points"
            hint="One point per line."
            rows={6}
            value={criteriaForm.criteria}
            onChange={(e) => setCriteriaForm({ ...criteriaForm, criteria: e.target.value })}
            placeholder={'Content and research\nDelivery and confidence\nRebuttal\nTeamwork'}
          />
          <TextArea
            label="Notes"
            rows={2}
            value={criteriaForm.notes}
            onChange={(e) => setCriteriaForm({ ...criteriaForm, notes: e.target.value })}
          />
        </div>
      </Sheet>

      {/* ---------- Confirm removal ---------- */}
      <Dialog
        open={Boolean(pendingDelete)}
        onClose={removing ? undefined : () => setPendingDelete(null)}
        tone="danger"
        size="sm"
        title={deleteCopy.title}
        description={deleteCopy.body}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)} disabled={removing}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={async () => {
                const wasEditingEvent = pendingDelete?.kind === 'event' && pendingDelete.item._id === editingEventId
                await confirmDelete()
                if (wasEditingEvent) closeEventSheet()
              }}
            >
              {deleteCopy.action}
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ActvtBoard
