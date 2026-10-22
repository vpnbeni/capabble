import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarPlus, Plus, Search, Trash2, Users, X } from 'lucide-react'
import {
  Badge, Banner, Button, Checkbox, DataTable, Dialog, EmptyState, RadioGroup, Select, Sheet, Skeleton, Switch, TextArea, TextField,
  formatDayKey,
} from '@/components/ui'
import type { DataTableColumn } from '@/components/ui'
import {
  useAudienceOptions, useAudiencePreview, useCalendarEvent, useCreateEvent, useEventAction, usePeopleSearch, useUpdateEvent,
} from '@/hooks/useCalendar'
import {
  apiMessage,
  type AudienceOptions,
  type AudiencePreview,
  type EventCategory,
  type EventInput,
  type EventRole,
  type NotifyLevel,
  type PersonType,
  type ReminderPreset,
  type Scope,
  type ScopeType,
  type Segment,
  type SegmentStats,
} from '@/services/calendarService'
import {
  CATEGORY_LABELS, NOTIFY_LABELS, PERSON_LABELS, REMINDER_LABELS, ROLE_LABELS, SCOPE_LABELS, STATUS_LABELS,
} from './calendarUi'
import './calendar.css'

type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'
type Form = {
  title: string
  category: EventCategory
  allDay: boolean
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  venue: string
  description: string
  repeat: Repeat
  byDay: number[]
  until: string
  visibility: 'segments' | 'all_staff' | 'whole_school'
  critical: boolean
  circularNo: string
  when: 'now' | 'later'
  publishAt: string
  segments: Array<Segment & { key: string }>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WIDE_TYPES: ScopeType[] = ['all', 'role', 'house', 'route']
const SCOPES_FOR: Record<PersonType, ScopeType[]> = {
  parent: ['section', 'class', 'all', 'house', 'route', 'student', 'user'],
  student: ['section', 'class', 'all', 'house', 'route', 'student', 'user'],
  staff: ['section', 'classteacher', 'all', 'role', 'route', 'user'],
}
const SCOPE_TYPE_LABELS: Partial<Record<ScopeType, string>> = {
  section: 'Of these sections',
  class: 'Of these classes (all sections)',
  classteacher: 'Class teachers of these sections',
  all: 'Everyone',
  house: 'Of these houses',
  route: 'On these bus routes',
  role: 'With these roles',
  student: 'Of these students',
  user: 'These people',
}
const STAFF_SECTION_LABEL = 'Teachers of these sections'

const newKey = () => Math.random().toString(36).slice(2, 10)

const blankSegment = (personType: PersonType, scopeType: ScopeType = 'section'): Segment & { key: string } => ({
  key: newKey(),
  label: '',
  personType,
  scopes: scopeType === 'all' ? [{ type: 'all', value: '' }] : [],
  exclude: [],
  role: personType === 'staff' ? 'duty' : 'attendee',
  instructions: '',
  notify: 'now',
  email: false,
  reminders: personType === 'staff' ? [] : ['day_before_18'],
})

const blankForm = (date?: string): Form => ({
  title: '',
  category: 'other',
  allDay: true,
  startDate: date || '',
  endDate: '',
  startTime: '',
  endTime: '',
  venue: '',
  description: '',
  repeat: 'none',
  byDay: [],
  until: '',
  visibility: 'segments',
  critical: false,
  circularNo: '',
  when: 'now',
  publishAt: '',
  segments: [],
})

const scopeTypeOf = (segment: Segment): ScopeType => segment.scopes[0]?.type || (segment.personType === 'staff' ? 'section' : 'section')

const autoLabel = (segment: Segment) => {
  const who = PERSON_LABELS[segment.personType]
  const type = scopeTypeOf(segment)
  const names = segment.scopes.map((s) => s.label || s.value).filter(Boolean)
  if (type === 'all') return `All ${who.toLowerCase()}`
  if (type === 'classteacher') return `Class teachers of ${names.join(', ')}`
  if (segment.personType === 'staff' && type === 'section') return `Teachers of ${names.join(', ')}`
  return names.length ? `${who} of ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}` : who
}

const toInput = (form: Form): EventInput => ({
  title: form.title.trim(),
  description: form.description.trim(),
  category: form.category,
  allDay: form.allDay,
  startDate: form.startDate,
  endDate: form.endDate || form.startDate,
  startTime: form.allDay ? null : form.startTime || null,
  endTime: form.allDay ? null : form.endTime || null,
  venue: form.venue.trim(),
  recurrence: form.repeat === 'none'
    ? { freq: null }
    : { freq: form.repeat, interval: 1, byDay: form.repeat === 'weekly' ? form.byDay : [], until: form.until || null, skipNonWorking: true },
  visibility: form.visibility,
  critical: form.critical,
  circularNo: form.circularNo.trim(),
  segments: form.segments.map((segment) => ({ ...segment, label: segment.label.trim() || autoLabel(segment) })),
  publishAt: form.when === 'later' && form.publishAt ? new Date(form.publishAt).toISOString() : null,
})

/** A searchable picker for named people or students, adding scopes. */
const PeoplePicker: React.FC<{ personType: PersonType; by: 'user' | 'student'; onPick: (scope: Scope) => void }> = ({ personType, by, onPick }) => {
  const [q, setQ] = useState('')
  const { data = [], isFetching } = usePeopleSearch(q, personType, by === 'student' ? 'student' : undefined)
  return (
    <div className="cl-people">
      <TextField
        label={by === 'student' ? 'Find a student' : `Find ${personType === 'staff' ? 'a staff member' : `a ${personType}`}`}
        icon={Search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={by === 'student' ? 'Name or admission no.' : 'Name or email'}
        hint={q.trim().length < 2 ? 'Type at least 2 letters' : isFetching ? 'Searching…' : `${data.length} found`}
      />
      {data.length ? (
        <ul className="cl-people__results">
          {data.map((person) => (
            <li key={person.value}>
              <span>{person.label}</span>
              <Button size="sm" variant="tertiary" icon={Plus} onClick={() => onPick({ type: person.type, value: person.value, label: person.label })}>Add</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const SegmentEditor: React.FC<{
  segment: Segment & { key: string }
  index: number
  options?: AudienceOptions
  stats?: SegmentStats
  onChange: (segment: Segment & { key: string }) => void
  onRemove: () => void
}> = ({ segment, index, options, stats, onChange, onRemove }) => {
  const type = scopeTypeOf(segment)
  const wide = Boolean(options?.wide)
  const allowed = SCOPES_FOR[segment.personType].filter((t) => wide || !WIDE_TYPES.includes(t))
    .filter((t) => !options?.assignedOnly || ['section', 'classteacher', 'user'].includes(t))
  const set = (patch: Partial<Segment>) => onChange({ ...segment, ...patch })
  const has = (value: string) => segment.scopes.some((s) => s.value === value)
  const toggle = (scope: Scope) => set({
    scopes: has(scope.value) ? segment.scopes.filter((s) => s.value !== scope.value) : [...segment.scopes.filter((s) => s.type === scope.type), scope],
  })
  const choices: Array<{ value: string; label: string; hint?: string }> = (() => {
    if (!options) return []
    switch (type) {
      case 'section':
      case 'classteacher':
        return options.sections.map((s) => ({ value: s.key, label: `${s.className}-${s.section}`, hint: `${s.students}` }))
      case 'class': return options.classes.map((c) => ({ value: c, label: `Class ${c}` }))
      case 'house': return options.houses.map((h) => ({ value: h.id, label: h.name }))
      case 'route': return options.routes.map((r) => ({ value: r.id, label: r.name }))
      case 'role': return options.roles.map((r) => ({ value: r.key, label: r.name }))
      default: return []
    }
  })()

  return (
    <section className="cl-segment" aria-label={`Audience ${index + 1}`}>
      <div className="cl-segment__head">
        <div className="cl-segment__title">
          <span className="cb-strong">{segment.label.trim() || autoLabel(segment)}</span>
          {stats ? (
            <span className="cb-muted">
              {stats.people} reached{stats.noLogin ? ` · ${stats.noLogin} without a login` : ''}
            </span>
          ) : null}
        </div>
        <Button size="sm" variant="tertiary" icon={Trash2} aria-label="Remove this audience" onClick={onRemove} />
      </div>
      <div className="cb-form-grid">
        <Select
          label="Who"
          value={segment.personType}
          options={(['parent', 'student', 'staff'] as PersonType[]).map((p) => ({ value: p, label: PERSON_LABELS[p] }))}
          onChange={(e) => {
            const personType = e.target.value as PersonType
            onChange({ ...blankSegment(personType), key: segment.key, instructions: segment.instructions })
          }}
        />
        <Select
          label="Which ones"
          value={type}
          options={allowed.map((t) => ({ value: t, label: segment.personType === 'staff' && t === 'section' ? STAFF_SECTION_LABEL : SCOPE_TYPE_LABELS[t] || SCOPE_LABELS[t] }))}
          onChange={(e) => {
            const next = e.target.value as ScopeType
            set({ scopes: next === 'all' ? [{ type: 'all', value: '' }] : [] })
          }}
        />
      </div>
      {type === 'all' ? null : ['user', 'student'].includes(type) ? (
        <>
          <PeoplePicker personType={segment.personType} by={type === 'student' ? 'student' : 'user'} onPick={(scope) => !has(scope.value) && set({ scopes: [...segment.scopes, scope] })} />
          {segment.scopes.length ? (
            <ul className="cl-chips" aria-label="Chosen">
              {segment.scopes.map((scope) => (
                <li key={scope.value} className="cl-chip">
                  <span>{scope.label || scope.value}</span>
                  <button type="button" aria-label={`Remove ${scope.label || scope.value}`} onClick={() => set({ scopes: segment.scopes.filter((s) => s.value !== scope.value) })}>
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : !options ? <Skeleton height={64} /> : choices.length ? (
        <div className="cl-choices" role="group" aria-label={SCOPE_TYPE_LABELS[type] || ''}>
          {choices.map((choice) => (
            <Checkbox
              key={choice.value}
              label={choice.label}
              checked={has(choice.value)}
              onChange={() => toggle({ type, value: choice.value, label: choice.label })}
            />
          ))}
        </div>
      ) : (
        <p className="cb-muted">
          {type === 'section' || type === 'classteacher'
            ? (options.assignedOnly ? 'You have no classes assigned yet. Ask the office to assign your sections.' : 'No classes with students yet.')
            : 'Nothing to choose from yet.'}
        </p>
      )}
      <TextArea
        label="What they need to know or do"
        value={segment.instructions}
        maxLength={4000}
        rows={3}
        placeholder={segment.personType === 'staff' ? 'e.g. Gate duty from 7:45 am. Collect the attendance sheet from the office.' : 'e.g. Send your child in white uniform by 8 am. Pick up at 12:30.'}
        onChange={(e) => set({ instructions: e.target.value })}
        hint="Only this audience sees this."
      />
      <div className="cb-form-grid">
        <TextField label="Name for this audience (optional)" value={segment.label} maxLength={80} placeholder={autoLabel(segment)} onChange={(e) => set({ label: e.target.value })} />
        <Select
          label="Their part"
          value={segment.role}
          options={(Object.keys(ROLE_LABELS) as EventRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          onChange={(e) => set({ role: e.target.value as EventRole })}
        />
        <Select
          label="Tell them"
          value={segment.notify}
          options={(Object.keys(NOTIFY_LABELS) as NotifyLevel[]).map((n) => ({ value: n, label: NOTIFY_LABELS[n] }))}
          onChange={(e) => set({ notify: e.target.value as NotifyLevel, email: e.target.value === 'now' ? segment.email : false })}
        />
        <div className="cl-checks">
          <Checkbox
            label="Also send an email"
            description="From your school's email, or Capabble's if it isn't set up."
            checked={segment.email}
            disabled={segment.notify !== 'now'}
            onChange={(email) => set({ email })}
          />
          {(Object.keys(REMINDER_LABELS) as ReminderPreset[]).map((preset) => (
            <Checkbox
              key={preset}
              label={REMINDER_LABELS[preset]}
              checked={segment.reminders.includes(preset)}
              disabled={segment.notify === 'silent'}
              onChange={(on) => set({ reminders: on ? [...segment.reminders, preset] : segment.reminders.filter((r) => r !== preset) })}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

const previewColumns: DataTableColumn<SegmentStats>[] = [
  { key: 'label', header: 'Audience', mobile: 'title', render: (row) => row.label || PERSON_LABELS[row.personType] },
  { key: 'people', header: 'Reached', numeric: true, align: 'right', render: (row) => row.people },
  { key: 'noLogin', header: 'No login', numeric: true, align: 'right', render: (row) => row.noLogin || '—' },
  { key: 'noEmail', header: 'No email', numeric: true, align: 'right', mobile: 'hidden', render: (row) => row.noEmail || '—' },
]

const PreviewPanel: React.FC<{ preview?: AudiencePreview; loading: boolean; onRun: () => void; disabled: boolean }> = ({ preview, loading, onRun, disabled }) => (
  <div className="cl-preview">
    <div className="cl-preview__head">
      <div>
        <h4 className="cb-subhead">Who this reaches</h4>
        <p className="cb-muted">
          {preview
            ? `${preview.total} ${preview.total === 1 ? 'person' : 'people'}: ${Object.entries(preview.byKind).map(([k, n]) => `${n} ${PERSON_LABELS[k as PersonType].toLowerCase()}`).join(', ') || 'nobody yet'}.`
            : 'Check before you publish. People in more than one audience get one notice.'}
        </p>
      </div>
      <Button size="sm" icon={Users} loading={loading} disabled={disabled} onClick={onRun}>{preview ? 'Check again' : 'Check audience'}</Button>
    </div>
    {preview ? (
      <>
        <DataTable columns={previewColumns} rows={preview.segments} getRowKey={(row) => row.key} density="compact" />
        {preview.segments.some((s) => s.noLogin) ? (
          <Banner tone="warning" title="Some families or staff can't be reached in the app">
            They have no login yet. Give them a printed note, or add logins in Users and access.
          </Banner>
        ) : null}
        {preview.inSeveral ? <p className="cb-muted">{preview.inSeveral} {preview.inSeveral === 1 ? 'person is' : 'people are'} in more than one audience and will see each part.</p> : null}
      </>
    ) : null}
  </div>
)

/** Create or edit a calendar event: details, who it is for (with separate instructions each), and when to tell them. */
const EventComposer: React.FC<{ open: boolean; eventId: string | null; defaultDate?: string; onClose: () => void }> = ({ open, eventId, defaultDate, onClose }) => {
  const editing = Boolean(eventId)
  const { data: existing, isLoading } = useCalendarEvent(open ? eventId : null)
  const { data: options } = useAudienceOptions(open)
  const [form, setForm] = useState<Form>(() => blankForm(defaultDate))
  const [notifyMode, setNotifyMode] = useState<'affected' | 'everyone' | 'none'>('affected')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const preview = useAudiencePreview()
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const action = useEventAction()

  useEffect(() => {
    if (!open) return
    preview.reset()
    setErrors({})
    setNotifyMode('affected')
    if (!eventId) setForm(blankForm(defaultDate))
  }, [open, eventId, defaultDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!existing || !open) return
    setForm({
      title: existing.title,
      category: existing.category || 'other',
      allDay: existing.allDay !== false,
      startDate: existing.startDate,
      endDate: existing.endDate && existing.endDate !== existing.startDate ? existing.endDate : '',
      startTime: existing.startTime || '',
      endTime: existing.endTime || '',
      venue: existing.venue || '',
      description: existing.description || '',
      repeat: (existing.recurrence?.freq || 'none') as Repeat,
      byDay: existing.recurrence?.byDay || [],
      until: existing.recurrence?.until || '',
      visibility: existing.visibility || 'segments',
      critical: Boolean(existing.critical),
      circularNo: existing.circularNo || '',
      when: existing.publishAt && existing.status !== 'published' ? 'later' : 'now',
      publishAt: existing.publishAt ? new Date(existing.publishAt).toISOString().slice(0, 16) : '',
      segments: existing.segments.map((s) => ({ ...s, exclude: s.exclude || [], reminders: s.reminders || [] })),
    })
  }, [existing, open])

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))
  const status = existing?.status || 'draft'
  const isPublished = status === 'published'
  const canApprove = Boolean(options?.canApprove) && status === 'pending_approval' && !existing?.mine
  const familyReached = form.segments.some((s) => s.personType !== 'staff')
  const needsApproval = Boolean(options?.needsApprovalForFamilies) && familyReached
  const statsByKey = useMemo(() => new Map((preview.data?.segments || []).map((s) => [s.key, s])), [preview.data])
  const segmentsReady = form.segments.length > 0 && form.segments.every((s) => s.scopes.length > 0)

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = 'Give the event a name'
    if (!form.startDate) next.startDate = 'Choose the date'
    if (form.endDate && form.endDate < form.startDate) next.endDate = "The event can't end before it starts"
    if (!form.allDay && !form.startTime) next.startTime = 'Set a start time, or make it all day'
    if (form.repeat === 'weekly' && !form.byDay.length) next.byDay = 'Choose the days it repeats on'
    if (form.visibility === 'segments' && !form.segments.length) next.segments = 'Add at least one audience'
    if (form.segments.some((s) => !s.scopes.length)) next.segments = 'Choose who each audience is'
    if (form.when === 'later' && !form.publishAt) next.publishAt = 'Choose when to publish'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (publish: boolean) => {
    if (!validate()) {
      toast.error('Check the highlighted fields')
      return
    }
    const input = toInput(form)
    try {
      if (!editing) {
        const result = await create.mutateAsync({ ...input, publish })
        toast.success({
          published: 'Event published. People are being told now.',
          pending_approval: 'Sent to the principal for approval',
          scheduled: 'Event scheduled',
          draft: 'Draft saved',
        }[result.status as string] || 'Saved')
      } else {
        const result = await update.mutateAsync({ id: eventId as string, input: { ...input, notify: notifyMode } })
        if (publish && result.status === 'draft') {
          const done = (await action.mutateAsync({ type: 'publish', id: eventId as string, publishAt: input.publishAt })) as { status?: string }
          toast.success(done.status === 'pending_approval' ? 'Sent to the principal for approval' : done.status === 'scheduled' ? 'Event scheduled' : 'Event published')
        } else {
          toast.success(result.status === 'pending_approval' ? 'Changes sent to the principal for approval' : 'Changes saved')
        }
      }
      onClose()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not save the event. Try again.'))
    }
  }

  const approve = async () => {
    try {
      await action.mutateAsync({ type: 'approve', id: eventId as string })
      toast.success('Approved and published')
      onClose()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not approve the event.'))
    }
  }
  const reject = async () => {
    try {
      await action.mutateAsync({ type: 'reject', id: eventId as string, note: rejectNote })
      toast.success('Sent back with your note')
      setRejecting(false)
      onClose()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not send the event back.'))
    }
  }

  const addSegment = (personType: PersonType, scopeType: ScopeType = 'section') => set({ segments: [...form.segments, blankSegment(personType, scopeType)] })
  const busy = create.isPending || update.isPending || action.isPending
  const primaryLabel = form.when === 'later' ? 'Schedule' : needsApproval ? 'Send for approval' : 'Publish'

  const footer = canApprove ? (
    <>
      <Button variant="secondary" onClick={() => setRejecting(true)}>Send back</Button>
      <Button variant="primary" loading={busy} onClick={approve}>Approve and publish</Button>
    </>
  ) : isPublished ? (
    <>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Button variant="primary" loading={busy} onClick={() => save(false)}>Save changes</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" loading={busy && !form.when} onClick={() => save(false)}>Save draft</Button>
      <Button variant="primary" loading={busy} onClick={() => save(true)}>{primaryLabel}</Button>
    </>
  )

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        icon={CalendarPlus}
        size="xl"
        title={editing ? (canApprove ? 'Approve event' : 'Edit event') : 'New event'}
        description={editing && existing ? `${STATUS_LABELS[status].label}${existing.createdByName ? ` · added by ${existing.createdByName}` : ''}` : 'Each audience can get its own instructions.'}
        footer={footer}
      >
        {editing && isLoading ? <Skeleton height={400} /> : (
          <div className="cb-stack cl-composer">
            {existing?.rejectionNote && status === 'draft' ? <Banner tone="warning" title="Sent back by the principal">{existing.rejectionNote}</Banner> : null}
            {isPublished ? (
              <Banner tone="info" title="This event is published">
                Changes to the date, time, venue or instructions are sent to the people they affect.
              </Banner>
            ) : null}

            <section className="cb-form-section">
              <h4 className="cb-form-section__title">What and when</h4>
              <div className="cb-form-grid">
                <TextField label="Event name" required className="is-wide" value={form.title} maxLength={160} error={errors.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Annual Day" />
                <Select label="Type" value={form.category} options={(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} onChange={(e) => set({ category: e.target.value as EventCategory })} />
                <TextField label="Where" value={form.venue} maxLength={160} onChange={(e) => set({ venue: e.target.value })} placeholder="e.g. School auditorium" />
                <TextField label="Date" type="date" required value={form.startDate} error={errors.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                <TextField label="Ends on (for events over several days)" type="date" value={form.endDate} min={form.startDate} error={errors.endDate} onChange={(e) => set({ endDate: e.target.value })} />
                <Switch label="All day" checked={form.allDay} onChange={(allDay) => set({ allDay })} />
                {!form.allDay ? (
                  <div className="cb-form-grid">
                    <TextField label="Starts at" type="time" value={form.startTime} error={errors.startTime} onChange={(e) => set({ startTime: e.target.value })} />
                    <TextField label="Ends at" type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
                  </div>
                ) : <span />}
                <Select
                  label="Repeats"
                  value={form.repeat}
                  options={[{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Every school day' }, { value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month, same date' }]}
                  onChange={(e) => set({ repeat: e.target.value as Repeat, byDay: e.target.value === 'weekly' && !form.byDay.length && form.startDate ? [new Date(`${form.startDate}T00:00:00Z`).getUTCDay()] : form.byDay })}
                  hint={form.repeat !== 'none' ? 'Skips holidays and days off. Stops at the end of the session unless you set an end.' : undefined}
                />
                {form.repeat !== 'none' ? (
                  <TextField label="Repeat until (optional)" type="date" value={form.until} min={form.startDate} onChange={(e) => set({ until: e.target.value })} />
                ) : <span />}
                {form.repeat === 'weekly' ? (
                  <div className="is-wide cl-weekdays" role="group" aria-label="Repeats on">
                    {WEEKDAYS.map((label, day) => (
                      <Checkbox key={label} label={label} checked={form.byDay.includes(day)} onChange={(on) => set({ byDay: on ? [...form.byDay, day].sort() : form.byDay.filter((d) => d !== day) })} />
                    ))}
                    {errors.byDay ? <p className="cb-field__error">{errors.byDay}</p> : null}
                  </div>
                ) : null}
                <TextArea label="Details for everyone" className="is-wide" rows={3} value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} hint="Shown to everyone who can see the event. Put instructions for each group below." />
              </div>
            </section>

            <section className="cb-form-section">
              <h4 className="cb-form-section__title">Who it is for</h4>
              {options?.wide ? (
                <RadioGroup
                  label="Who can see it on their calendar"
                  orientation="horizontal"
                  value={form.visibility}
                  onChange={(value) => set({ visibility: value as Form['visibility'] })}
                  options={[
                    { value: 'segments', label: 'Only the audiences below' },
                    { value: 'all_staff', label: 'All staff, plus the audiences below' },
                    { value: 'whole_school', label: 'Everyone in the school' },
                  ]}
                />
              ) : null}
              {needsApproval && !editing ? (
                <Banner tone="info" title="The principal approves events for families">
                  When you publish, it goes to the principal first and reaches families once approved.
                </Banner>
              ) : null}
              {errors.segments ? <p className="cb-field__error" role="alert">{errors.segments}</p> : null}
              {form.segments.length ? (
                <div className="cb-stack">
                  {form.segments.map((segment, index) => (
                    <SegmentEditor
                      key={segment.key}
                      index={index}
                      segment={segment}
                      options={options}
                      stats={statsByKey.get(segment.key)}
                      onChange={(next) => set({ segments: form.segments.map((s) => (s.key === segment.key ? next : s)) })}
                      onRemove={() => set({ segments: form.segments.filter((s) => s.key !== segment.key) })}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={Users} title="No audience yet" body="Add the groups this event is for. Each can get its own instructions." />
              )}
              <div className="cl-add">
                <span className="cb-muted">Add:</span>
                <Button size="sm" icon={Plus} onClick={() => addSegment('parent')}>Parents</Button>
                <Button size="sm" icon={Plus} onClick={() => addSegment('student')}>Students</Button>
                <Button size="sm" icon={Plus} onClick={() => addSegment('staff', 'section')}>Teachers</Button>
                <Button size="sm" icon={Plus} onClick={() => addSegment('staff', 'classteacher')}>Class teachers</Button>
                {options?.wide ? <Button size="sm" icon={Plus} onClick={() => addSegment('staff', 'all')}>All staff</Button> : null}
                {options?.wide ? <Button size="sm" icon={Plus} onClick={() => addSegment('staff', 'route')}>Bus crew</Button> : null}
              </div>
              <PreviewPanel
                preview={preview.data}
                loading={preview.isPending}
                disabled={!segmentsReady}
                onRun={() => preview.mutate(toInput(form).segments, { onError: (error) => toast.error(apiMessage(error, 'Could not check the audience.')) })}
              />
            </section>

            <section className="cb-form-section">
              <h4 className="cb-form-section__title">Publishing</h4>
              <div className="cb-form-grid">
                {!isPublished ? (
                  <RadioGroup
                    label="When"
                    value={form.when}
                    onChange={(value) => set({ when: value as Form['when'] })}
                    options={[{ value: 'now', label: 'Publish now' }, { value: 'later', label: 'Publish later' }]}
                  />
                ) : (
                  <RadioGroup
                    label="Who hears about these changes"
                    value={notifyMode}
                    onChange={(value) => setNotifyMode(value as typeof notifyMode)}
                    options={[
                      { value: 'affected', label: 'Only people the change affects' },
                      { value: 'everyone', label: 'Everyone it reaches' },
                      { value: 'none', label: "Nobody (it's a small fix)" },
                    ]}
                  />
                )}
                {form.when === 'later' && !isPublished ? (
                  <TextField label="Publish on" type="datetime-local" value={form.publishAt} error={errors.publishAt} onChange={(e) => set({ publishAt: e.target.value })} />
                ) : <span />}
                <TextField label="Circular no. (optional)" value={form.circularNo} maxLength={60} onChange={(e) => set({ circularNo: e.target.value })} />
                <Switch
                  label="Important"
                  description="Marked on the calendar; reminders also go by email."
                  checked={form.critical}
                  onChange={(critical) => set({ critical })}
                />
              </div>
              {form.startDate ? <p className="cb-muted">On {formatDayKey(form.startDate, { weekday: 'long', month: 'long', year: true })}{form.endDate ? ` to ${formatDayKey(form.endDate, { weekday: 'long', month: 'long' })}` : ''}.</p> : null}
              {existing?.sendLog?.length ? (
                <div className="cl-sendlog">
                  <h4 className="cb-subhead">Sent so far</h4>
                  {existing.emails && Object.keys(existing.emails).length ? (
                    <p className="cb-muted">
                      Emails: {existing.emails.sent || 0} sent
                      {existing.emails.queued ? `, ${existing.emails.queued} waiting` : ''}
                      {existing.emails.capped ? ` (daily limit reached, the rest go tomorrow)` : ''}
                      {existing.emails.failed ? `, ${existing.emails.failed} failed` : ''}
                      {existing.emails.suppressed ? `, ${existing.emails.suppressed} skipped (address bounced before)` : ''}
                      {existing.emails.skipped ? `, ${existing.emails.skipped} not sent (no email account set up)` : ''}.
                    </p>
                  ) : null}
                  <ul>
                    {existing.sendLog.slice().reverse().slice(0, 6).map((run) => (
                      <li key={run._id}>
                        <Badge tone={run.status === 'failed' ? 'danger' : run.status === 'sent' ? 'success' : 'info'}>{run.status === 'sent' ? 'Sent' : run.status === 'failed' ? 'Failed' : 'Sending'}</Badge>
                        <span>{{ published: 'Published', changed: 'Change', cancelled: 'Cancellation', reminder: 'Reminder', added: 'Added people', removed: 'Removed people' }[run.change] || run.change}</span>
                        <span className="cb-muted">{run.notified} notified{run.emailsQueued ? ` · ${run.emailsQueued} emails` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </Sheet>
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Send this event back?"
        description="It goes back to the person who made it as a draft, with your note."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>Keep it waiting</Button>
            <Button variant="primary" loading={action.isPending} onClick={reject}>Send back</Button>
          </>
        )}
      >
        <TextArea label="Note for them" value={rejectNote} maxLength={500} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Please add the pick-up time for class 5." />
      </Dialog>
    </>
  )
}

export default EventComposer
