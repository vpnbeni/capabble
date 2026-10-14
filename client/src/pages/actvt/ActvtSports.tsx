import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, CalendarRange, Dumbbell, MapPin, Pencil, Plus, Trash2, Trophy, Users } from 'lucide-react'
import api from '@/services/api'
import {
  Badge,
  Banner,
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
  TextArea,
  TextField,
} from '@/components/ui'
import { isLikelyColor, toneOf, toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/sports.css'

type FacilityRecord = {
  _id?: string
  name?: string
  facilityType?: string
  location?: string
  capacity?: string
  color?: string
  description?: string
}

type ActivityRecord = {
  _id?: string
  eventId?: string
  title?: string
  year?: string
  venue?: string
  facilityId?: string
  facilityName?: string
  startDate?: string
  endDate?: string
  events?: string
  results?: string
}

type CalendarActivityEvent = {
  _id?: string
  title?: string
  date?: string
  activityType?: string
  venue?: string
  incharge?: string
  description?: string
  status?: string
}

type SportsActivityItem = {
  eventId: string
  title: string
  plannedDate: string
  venue: string
  incharge: string
  description: string
  detail: ActivityRecord | null
}

type FacilityForm = {
  name: string
  color: string
}

type ActivityForm = {
  eventId: string
  title: string
  plannedDate: string
  year: string
  venue: string
  facilityId: string
  startDate: string
  endDate: string
  events: string
  results: string
}

const DEFAULT_FACILITIES = [
  { name: 'Badminton', facilityType: 'Court', color: '#0f766e' },
  { name: 'Table Tennis', facilityType: 'Court', color: '#1d4ed8' },
  { name: 'Basketball', facilityType: 'Court', color: '#b45309' },
  { name: 'Swimming', facilityType: 'Pool', color: '#0369a1' },
] as const

type ConfirmState = {
  title: string
  body: string
  actionLabel: string
  run: () => Promise<void>
}

const initialsOf = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'S'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

const guessFacilityType = (name: string) => {
  const text = name.trim().toLowerCase()
  if (text.includes('swim') || text.includes('pool')) return 'Pool'
  if (text.includes('gym')) return 'Gym'
  if (text.includes('track')) return 'Track'
  if (text.includes('field') || text.includes('football') || text.includes('cricket')) return 'Field'
  if (text.includes('ground')) return 'Ground'
  if (text.includes('hall')) return 'Indoor Hall'
  return 'Court'
}

const emptyFacilityForm = (): FacilityForm => ({
  name: '',
  color: '#0f766e',
})

const emptyActivityForm = (): ActivityForm => ({
  eventId: '',
  title: '',
  plannedDate: '',
  year: '',
  venue: '',
  facilityId: '',
  startDate: '',
  endDate: '',
  events: '',
  results: '',
})

const ActvtSports: React.FC = () => {
  const [facilities, setFacilities] = useState<FacilityRecord[]>([])
  const [activityDetails, setActivityDetails] = useState<ActivityRecord[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarActivityEvent[]>([])
  const [facilityForm, setFacilityForm] = useState<FacilityForm>(emptyFacilityForm)
  const [activityForm, setActivityForm] = useState<ActivityForm>(emptyActivityForm)
  const [editingFacility, setEditingFacility] = useState<FacilityRecord | null>(null)
  const [editingActivity, setEditingActivity] = useState<SportsActivityItem | null>(null)
  const [facilityQuery, setFacilityQuery] = useState('')
  const [activityQuery, setActivityQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingFacility, setSavingFacility] = useState(false)
  const [savingActivity, setSavingActivity] = useState(false)
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [facilityRes, activityRes, eventRes] = await Promise.all([
        api.get('/actvt/sports/facilities'),
        api.get('/actvt/sports'),
        api.get('/actvt/events'),
      ])
      let nextFacilities = (facilityRes.data?.data || []) as FacilityRecord[]

      const existingNames = new Set(
        nextFacilities.map((item) => String(item.name || '').trim().toLowerCase()).filter(Boolean)
      )
      const missingDefaults = DEFAULT_FACILITIES.filter(
        (item) => !existingNames.has(item.name.toLowerCase())
      )
      if (missingDefaults.length > 0) {
        await Promise.all(
          missingDefaults.map((item) =>
            api.post('/actvt/sports/facilities', {
              name: item.name,
              facilityType: item.facilityType,
              color: item.color,
              location: '',
              capacity: '',
              description: '',
            })
          )
        )
        const refreshed = await api.get('/actvt/sports/facilities')
        nextFacilities = (refreshed.data?.data || []) as FacilityRecord[]
      }

      setFacilities(nextFacilities)
      setActivityDetails((activityRes.data?.data || []) as ActivityRecord[])
      setCalendarEvents((eventRes.data?.data || []) as CalendarActivityEvent[])
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load sports data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleFacilities = useMemo(() => {
    const needle = facilityQuery.trim().toLowerCase()
    if (!needle) return facilities
    return facilities.filter((item) =>
      `${item.name || ''} ${item.facilityType || ''} ${item.location || ''} ${item.capacity || ''} ${item.description || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [facilities, facilityQuery])

  const sportsActivities = useMemo<SportsActivityItem[]>(() => {
    const detailByEventId = new Map<string, ActivityRecord>()
    activityDetails.forEach((item) => {
      const eventId = String(item.eventId || '').trim()
      if (eventId) detailByEventId.set(eventId, item)
    })

    return calendarEvents
      .filter((item) => String(item.activityType || '').trim().toLowerCase() === 'sports')
      .filter((item) => String(item.status || 'planned').trim().toLowerCase() === 'planned')
      .map((item) => {
        const eventId = String(item._id || '').trim()
        const fallbackDetail = activityDetails.find((detail) =>
          !detail.eventId
          && String(detail.title || '').trim().toLowerCase() === String(item.title || '').trim().toLowerCase()
          && String(detail.startDate || '').trim() === String(item.date || '').trim()
        ) || null
        return {
          eventId,
          title: String(item.title || 'Untitled activity'),
          plannedDate: String(item.date || ''),
          venue: String(item.venue || ''),
          incharge: String(item.incharge || ''),
          description: String(item.description || ''),
          detail: detailByEventId.get(eventId) || fallbackDetail,
        }
      })
      .sort((a, b) => String(a.plannedDate || '').localeCompare(String(b.plannedDate || '')))
  }, [activityDetails, calendarEvents])

  const visibleActivities = useMemo(() => {
    const needle = activityQuery.trim().toLowerCase()
    if (!needle) return sportsActivities
    return sportsActivities.filter((item) =>
      `${item.title || ''} ${item.plannedDate || ''} ${item.venue || ''} ${item.detail?.facilityName || ''} ${item.detail?.events || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [activityQuery, sportsActivities])

  const resetFacilityForm = () => {
    setFacilityForm(emptyFacilityForm())
    setEditingFacility(null)
    setFacilityDialogOpen(false)
  }

  const startAddFacility = () => {
    setFacilityForm(emptyFacilityForm())
    setEditingFacility(null)
    setFacilityDialogOpen(true)
  }

  const resetActivityForm = () => {
    setActivityForm(emptyActivityForm())
    setEditingActivity(null)
  }

  const startEditFacility = (item: FacilityRecord) => {
    setEditingFacility(item)
    setFacilityForm({
      name: String(item.name || ''),
      color: isLikelyColor(item.color || '') ? String(item.color) : '#0f766e',
    })
    setFacilityDialogOpen(true)
  }

  const startEditActivity = (item: SportsActivityItem) => {
    setEditingActivity(item)
    setActivityForm({
      eventId: item.eventId,
      title: String(item.title || ''),
      plannedDate: String(item.plannedDate || ''),
      year: String(item.detail?.year || new Date(item.plannedDate || Date.now()).getFullYear() || ''),
      venue: String(item.detail?.venue || item.venue || ''),
      facilityId: String(item.detail?.facilityId || ''),
      startDate: String(item.detail?.startDate || item.plannedDate || ''),
      endDate: String(item.detail?.endDate || item.plannedDate || ''),
      events: String(item.detail?.events || item.description || ''),
      results: String(item.detail?.results || ''),
    })
  }

  const handleSaveFacility = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!facilityForm.name.trim()) {
      toast.error('Facility name is required.')
      return
    }

    setSavingFacility(true)
    try {
      const name = facilityForm.name.trim()
      const payload = {
        name,
        facilityType: editingFacility?.facilityType || guessFacilityType(name),
        location: editingFacility?.location || '',
        capacity: editingFacility?.capacity || '',
        color: facilityForm.color.trim() || '#0f766e',
        description: editingFacility?.description || '',
      }

      if (editingFacility?._id) {
        await api.put(`/actvt/sports/facilities/${editingFacility._id}`, payload)
        toast.success('Facility updated.')
      } else {
        await api.post('/actvt/sports/facilities', payload)
        toast.success('Facility added.')
      }
      resetFacilityForm()
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save facility.'))
    } finally {
      setSavingFacility(false)
    }
  }

  const handleRemoveFacility = async (item: FacilityRecord) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/sports/facilities/${item._id}`)
      toast.success('Facility removed.')
      if (editingFacility?._id === item._id) resetFacilityForm()
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove facility.'))
    }
  }

  const handleSaveActivity = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activityForm.eventId || !editingActivity) {
      toast.error('Select a planned sports activity first.')
      return
    }

    const matchedFacility = facilities.find((item) => String(item._id) === activityForm.facilityId)

    setSavingActivity(true)
    try {
      const payload = {
        eventId: activityForm.eventId,
        title: activityForm.title.trim(),
        year: activityForm.year.trim(),
        venue: activityForm.venue.trim() || String(matchedFacility?.name || ''),
        facilityId: activityForm.facilityId,
        facilityName: String(matchedFacility?.name || ''),
        startDate: activityForm.startDate,
        endDate: activityForm.endDate,
        events: activityForm.events.trim(),
        results: activityForm.results.trim(),
      }

      if (editingActivity.detail?._id) {
        await api.put(`/actvt/sports/${editingActivity.detail._id}`, payload)
        toast.success('Sports details updated.')
      } else {
        await api.post('/actvt/sports', payload)
        toast.success('Sports details saved.')
      }
      resetActivityForm()
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save activity.'))
    } finally {
      setSavingActivity(false)
    }
  }

  const handleRemoveActivity = async (item: ActivityRecord) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/sports/${item._id}`)
      toast.success('Sports details cleared.')
      if (editingActivity?.detail?._id === item._id) resetActivityForm()
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove activity.'))
    }
  }

  const askRemoveFacility = (item: FacilityRecord) => {
    if (!item._id) return
    setConfirm({
      title: `Remove ${item.name || 'this facility'}?`,
      body: 'The facility is removed from the list. Sports activities that used it keep their saved venue.',
      actionLabel: 'Remove facility',
      run: () => handleRemoveFacility(item),
    })
  }

  const askClearActivity = (item: ActivityRecord) => {
    if (!item._id) return
    setConfirm({
      title: `Clear details for ${item.title || 'this activity'}?`,
      body: 'The facility, dates, plan and results saved here are removed. The activity stays on the Activity Board calendar.',
      actionLabel: 'Clear details',
      run: () => handleRemoveActivity(item),
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirming(true)
    try {
      await confirm.run()
    } finally {
      setConfirming(false)
      setConfirm(null)
    }
  }

  const facilityById = useMemo(() => {
    const map = new Map<string, { facility: FacilityRecord; index: number }>()
    facilities.forEach((facility, index) => {
      if (facility._id) map.set(String(facility._id), { facility, index })
    })
    return map
  }, [facilities])

  const detailsSavedCount = sportsActivities.filter((item) => item.detail?._id).length

  const facilityCountLabel = `${visibleFacilities.length} ${visibleFacilities.length === 1 ? 'facility' : 'facilities'}`
  const activityCountLabel = `${visibleActivities.length} planned ${visibleActivities.length === 1 ? 'activity' : 'activities'}`
  const activityDateLabel = (activity: SportsActivityItem) =>
    activity.detail?.startDate || activity.detail?.endDate
      ? `${activity.detail?.startDate || '—'} to ${activity.detail?.endDate || '—'}`
      : activity.plannedDate || 'Dates not set'

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Facilities" value={facilities.length} icon={Dumbbell} hint="Courts, pools and grounds" />
        <StatCard label="Planned sports activities" value={sportsActivities.length} icon={CalendarRange} hint="From the Activity Board" />
        <StatCard label="Details saved" value={detailsSavedCount} icon={Trophy} hint={`of ${sportsActivities.length} planned`} />
        <StatCard
          label="Needs details"
          value={Math.max(sportsActivities.length - detailsSavedCount, 0)}
          icon={Pencil}
          hint="No facility or plan yet"
        />
      </div>

      <Card title="Facilities" subtitle={facilityCountLabel}>
        <div className="asp-toolbar">
          <FilterBar
            search={{ placeholder: 'Search facilities', value: facilityQuery, onChange: setFacilityQuery }}
            actions={
              <Button variant="primary" icon={Plus} onClick={startAddFacility}>
                Add facility
              </Button>
            }
          />
        </div>

        {loading && facilities.length === 0 ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading facilities…
          </div>
        ) : visibleFacilities.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={facilityQuery.trim() ? 'No facilities match your search' : 'No sports facilities yet'}
            body={
              facilityQuery.trim()
                ? 'Try a different name or clear the search.'
                : 'Add facilities like badminton, table tennis, basketball and swimming to assign them to activities.'
            }
            action={
              facilityQuery.trim() ? (
                <Button onClick={() => setFacilityQuery('')}>Clear search</Button>
              ) : (
                <Button icon={Plus} onClick={startAddFacility}>
                  Add facility
                </Button>
              )
            }
          />
        ) : (
          <ul className="actvt-grid">
            {visibleFacilities.map((facility, index) => {
              const name = facility.name || 'Untitled facility'
              return (
                <li key={facility._id || facility.name}>
                  <article className="actvt-card" style={toneStyle(facility.color, index)}>
                    <div className="actvt-card__band" aria-hidden="true" />
                    <div className="actvt-card__logo" aria-hidden="true">
                      <span className="actvt-card__initials">{initialsOf(facility.name)}</span>
                    </div>
                    <div className="actvt-card__body">
                      <h3 className="actvt-card__name">{name}</h3>
                      <div className="actvt-card__meta">
                        <Badge tone="neutral" dot={false}>
                          {facility.facilityType || 'Facility'}
                        </Badge>
                      </div>
                      <p className="asp-facility__loc">{facility.location || 'No location set'}</p>
                      {facility.capacity ? (
                        <span className="asp-facility__cap">
                          <Icon icon={Users} size={12} />
                          {facility.capacity}
                        </span>
                      ) : null}
                    </div>
                    <div className="actvt-card__foot">
                      <span className="actvt-card__swatch">
                        <span className="actvt-tone-dot" aria-hidden="true" />
                        {toneOf(facility.color, index).toUpperCase()}
                      </span>
                      <span className="actvt-card__actions">
                        <Button
                          variant="tertiary"
                          size="sm"
                          icon={Pencil}
                          aria-label={`Edit ${name}`}
                          onClick={() => startEditFacility(facility)}
                        />
                        <Button
                          variant="tertiary"
                          size="sm"
                          icon={Trash2}
                          aria-label={`Remove ${name}`}
                          onClick={() => askRemoveFacility(facility)}
                        />
                      </span>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Planned sports activities" subtitle={activityCountLabel}>
        <div className="asp-toolbar">
          <Banner tone="info">
            Sports activities planned on the Activity Board calendar appear here automatically. Add details to assign a
            facility, refine dates and record the plan and results.
          </Banner>
          <FilterBar search={{ placeholder: 'Search activities', value: activityQuery, onChange: setActivityQuery }} />
        </div>

        {loading && calendarEvents.length === 0 ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading activities…
          </div>
        ) : visibleActivities.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={activityQuery.trim() ? 'No activities match your search' : 'No planned sports activities yet'}
            body={
              activityQuery.trim()
                ? 'Try a different title, date or venue.'
                : 'Plan a sports activity on the Activity Board calendar. It will appear here automatically.'
            }
            action={activityQuery.trim() ? <Button onClick={() => setActivityQuery('')}>Clear search</Button> : undefined}
          />
        ) : (
          <ul className="asp-activities">
            {visibleActivities.map((activity) => {
              const facilityEntry = activity.detail?.facilityId
                ? facilityById.get(String(activity.detail.facilityId))
                : undefined
              const facilityName = facilityEntry?.facility.name || activity.detail?.facilityName || ''
              const hasDetail = Boolean(activity.detail?._id)
              return (
                <li key={activity.eventId || activity.title}>
                  <article className="asp-activity">
                    <div className="asp-activity__head">
                      <div className="asp-activity__titles">
                        <h3 className="asp-activity__title">{activity.title || 'Untitled activity'}</h3>
                        <span className="asp-activity__sub">
                          {activity.plannedDate || 'No calendar date'}
                          {activity.detail?.year ? ` · ${activity.detail.year}` : ''}
                        </span>
                      </div>
                      <Badge tone={hasDetail ? 'success' : 'warning'}>{hasDetail ? 'Details saved' : 'Needs details'}</Badge>
                    </div>

                    <ul className="asp-activity__facts">
                      <li>
                        <Icon icon={MapPin} size={14} />
                        <span>{activity.detail?.venue || activity.venue || activity.detail?.facilityName || 'No venue'}</span>
                      </li>
                      <li>
                        <Icon icon={CalendarDays} size={14} />
                        <span className="asp-num">{activityDateLabel(activity)}</span>
                      </li>
                      {facilityName ? (
                        <li>
                          <span
                            className="asp-swatchname"
                            style={facilityEntry ? toneStyle(facilityEntry.facility.color, facilityEntry.index) : undefined}
                          >
                            {facilityEntry ? <span className="actvt-tone-dot" aria-hidden="true" /> : <Icon icon={Dumbbell} size={14} />}
                            <span>{facilityName}</span>
                          </span>
                        </li>
                      ) : null}
                    </ul>

                    {activity.detail?.events ? <p className="asp-activity__plan">{activity.detail.events}</p> : null}

                    <div className="asp-activity__foot">
                      <Button size="sm" icon={Pencil} onClick={() => startEditActivity(activity)}>
                        {hasDetail ? 'Edit details' : 'Add details'}
                      </Button>
                      {hasDetail ? (
                        <Menu
                          label={`More actions for ${activity.title}`}
                          items={[
                            {
                              label: 'Clear details',
                              icon: Trash2,
                              tone: 'danger',
                              onSelect: () => {
                                if (activity.detail) askClearActivity(activity.detail)
                              },
                            },
                          ]}
                        />
                      ) : null}
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Dialog
        open={facilityDialogOpen}
        onClose={resetFacilityForm}
        title={editingFacility ? `Edit ${editingFacility.name || 'facility'}` : 'Add facility'}
        description="The colour marks this facility on cards and activities."
        size="sm"
        footer={
          <>
            <Button onClick={resetFacilityForm}>Cancel</Button>
            <Button variant="primary" type="submit" form="asp-facility-form" loading={savingFacility}>
              {editingFacility ? 'Save facility' : 'Add facility'}
            </Button>
          </>
        }
      >
        <form id="asp-facility-form" className="asp-form" onSubmit={handleSaveFacility} noValidate>
          <TextField
            label="Facility name"
            required
            autoFocus
            value={facilityForm.name}
            onChange={(event) => setFacilityForm({ ...facilityForm, name: event.target.value })}
            placeholder="e.g. Badminton"
          />
          <div className="cb-field">
            <label className="cb-field__label" htmlFor="asp-facility-color-hex">
              Colour
            </label>
            <div className="actvt-colorfield">
              <input
                type="color"
                value={isLikelyColor(facilityForm.color) ? facilityForm.color : '#0f766e'}
                onChange={(event) => setFacilityForm({ ...facilityForm, color: event.target.value })}
                aria-label="Pick facility colour"
              />
              <TextField
                id="asp-facility-color-hex"
                value={facilityForm.color}
                onChange={(event) => setFacilityForm({ ...facilityForm, color: event.target.value })}
                placeholder="#0f766e"
                error={facilityForm.color.trim() && !isLikelyColor(facilityForm.color) ? 'Use a hex colour like #0f766e.' : undefined}
              />
            </div>
          </div>
        </form>
      </Dialog>

      <Sheet
        open={Boolean(editingActivity)}
        onClose={resetActivityForm}
        title={editingActivity?.detail?._id ? 'Edit sports details' : 'Add sports details'}
        description={editingActivity ? `${editingActivity.title}${editingActivity.plannedDate ? ` · ${editingActivity.plannedDate}` : ''}` : undefined}
        icon={Trophy}
        size="lg"
        onSubmit={handleSaveActivity}
        footer={
          <>
            {editingActivity?.detail?._id ? (
              <Button
                variant="tertiary"
                icon={Trash2}
                onClick={() => {
                  if (editingActivity.detail) askClearActivity(editingActivity.detail)
                }}
              >
                Clear details
              </Button>
            ) : null}
            <Button onClick={resetActivityForm}>Cancel</Button>
            <Button variant="primary" type="submit" loading={savingActivity} disabled={!activityForm.eventId}>
              {editingActivity?.detail?._id ? 'Save changes' : 'Save details'}
            </Button>
          </>
        }
      >
        <div className="asp-form">
          <div className="cb-form-grid">
            <Select
              label="Planned sports activity"
              value={activityForm.eventId}
              onChange={(event) => {
                const selected = sportsActivities.find((item) => item.eventId === event.target.value) || null
                if (selected) startEditActivity(selected)
                else resetActivityForm()
              }}
              options={sportsActivities.map((item) => ({
                value: item.eventId,
                label: `${item.title}${item.plannedDate ? ` · ${item.plannedDate}` : ''}`,
              }))}
            />
            <TextField label="Calendar date" value={activityForm.plannedDate} readOnly hint="Set on the Activity Board" />
            <TextField className="is-wide" label="Title" value={activityForm.title} readOnly />
            <TextField
              label="Year"
              value={activityForm.year}
              onChange={(event) => setActivityForm({ ...activityForm, year: event.target.value })}
              placeholder="Year"
              inputMode="numeric"
            />
            <Select
              label="Facility"
              value={activityForm.facilityId}
              onChange={(event) => setActivityForm({ ...activityForm, facilityId: event.target.value })}
              placeholder="No facility"
              options={facilities
                .filter((facility) => facility._id)
                .map((facility) => ({ value: String(facility._id), label: facility.name || 'Untitled facility' }))}
            />
            <TextField
              className="is-wide"
              label="Venue"
              value={activityForm.venue}
              onChange={(event) => setActivityForm({ ...activityForm, venue: event.target.value })}
              placeholder="Venue"
              hint="Leave blank to use the facility name."
            />
            <TextField
              label="Start date"
              type="date"
              value={activityForm.startDate}
              onChange={(event) => setActivityForm({ ...activityForm, startDate: event.target.value })}
            />
            <TextField
              label="End date"
              type="date"
              value={activityForm.endDate}
              onChange={(event) => setActivityForm({ ...activityForm, endDate: event.target.value })}
            />
          </div>
          <TextArea
            label="Activity plan"
            rows={4}
            value={activityForm.events}
            onChange={(event) => setActivityForm({ ...activityForm, events: event.target.value })}
            placeholder="Describe fixtures, rounds, team flow or event plan"
          />
          <TextArea
            label="Results and notes"
            rows={4}
            value={activityForm.results}
            onChange={(event) => setActivityForm({ ...activityForm, results: event.target.value })}
            placeholder="Capture outcomes, winners or execution notes"
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(confirm)}
        onClose={() => (confirming ? undefined : setConfirm(null))}
        tone="danger"
        size="sm"
        title={confirm?.title || ''}
        description={confirm?.body}
        footer={
          <>
            <Button onClick={() => setConfirm(null)} disabled={confirming}>
              Cancel
            </Button>
            <Button variant="danger" loading={confirming} onClick={() => void runConfirm()}>
              {confirm?.actionLabel || 'Confirm'}
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ActvtSports
