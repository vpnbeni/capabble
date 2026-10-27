import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { CalendarPlus } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CATEGORY_LABELS } from '@/portal/calendarUi'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { EventCategory, ResponseType } from '@/services/calendarTypes'
import { segmentForSave, type EventDetail, type EventPatch } from '@/services/eventService'
import { useEventDetail, useUpdateEvent } from '@/staff/eventQueries'
import { useAudienceOptions, useCreateEvent } from '@/staff/queries'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  SlotPicker,
  StatusView,
  Surface,
  Switch,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

// Teachers' events: no holidays or duties (those are the office's).
const CATEGORIES: EventCategory[] = ['ptm', 'exam', 'celebration', 'sports', 'trip', 'meeting', 'health', 'deadline', 'other']

const REPLIES: { value: ResponseType; label: string; meta: string }[] = [
  { value: 'none', label: 'No reply', meta: 'Families only see it' },
  { value: 'acknowledge', label: 'Mark as seen', meta: 'Each family taps Seen' },
  { value: 'rsvp', label: 'Coming or not', meta: 'Yes, no or maybe, with how many' },
  { value: 'consent', label: 'Consent', meta: 'Give or decline, for each child' },
]

// Times every half hour across the school day.
const TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = 7 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`
})

type Sheet = 'date' | 'start' | 'end' | 'type' | 'reply' | null

/** The phone edits an event's classes only when it is one audience of families picked by class. */
const simpleAudience = (event: EventDetail, known: Set<string>) =>
  event.visibility === 'segments' &&
  event.segments.length === 1 &&
  event.segments[0].personType === 'parent' &&
  event.segments[0].scopes.every((scope) => scope.type === 'section' && known.has(scope.value))

/**
 * Create an event for the families of the classes a teacher teaches. It is published at once
 * when the login may; otherwise it goes to the principal for approval first. With `?id=` it edits
 * that event: only what changed is sent, and families hear about a change when asked to.
 * Design system: a gap in "Mobile coverage" (Create event); the layout follows Apply for leave.
 */
export default function NewEventScreen() {
  const router = useRouter()
  const toast = useToast()
  const options = useAudienceOptions()
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const existing = useEventDetail(id)
  const editing = Boolean(id)
  const saving = create.isPending || update.isPending
  const today = schoolToday()
  const titleRef = useRef<MobileTextFieldRef>(null)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(dayKeyAdd(today, 1))
  const [allDay, setAllDay] = useState(true)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [category, setCategory] = useState<EventCategory>('ptm')
  const [venue, setVenue] = useState('')
  const [sections, setSections] = useState<string[]>([])
  const [reply, setReply] = useState<ResponseType>('none')
  const [instructions, setInstructions] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [errors, setErrors] = useState<{ title?: string; classes?: string; form?: string }>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)
  const [tell, setTell] = useState(true)
  const [loaded, setLoaded] = useState(false)

  const data = options.data
  const original = existing.data
  const known = new Set((data?.sections ?? []).map((section) => section.key))
  const audienceEditable = !original || simpleAudience(original, known)
  const segment = original?.segments[0]

  // Editing: start from the event as it is, once both it and this login's classes have loaded
  // (set while rendering, once, as React suggests for state that starts from loaded data).
  if (original && data && !loaded) {
    setTitle(original.title)
    setDate(original.startDate)
    setAllDay(original.allDay)
    if (original.startTime) setStart(original.startTime)
    if (original.endTime) setEnd(original.endTime)
    setCategory(original.category)
    setVenue(original.venue ?? '')
    if (segment && simpleAudience(original, new Set(data.sections.map((section) => section.key)))) {
      setSections(segment.scopes.map((scope) => scope.value))
      setReply(segment.response ?? 'none')
      setInstructions(segment.instructions ?? '')
    }
    setLoaded(true)
  }

  const patch = (): EventPatch => {
    if (!original) return {}
    const next: EventPatch = {}
    if (title.trim() !== original.title) next.title = title.trim()
    if (category !== original.category) next.category = category
    if (venue.trim() !== (original.venue ?? '')) next.venue = venue.trim()
    if (date !== original.startDate) {
      next.startDate = date
      // A one-day event stays one day; a longer one keeps its length.
      const span = Math.round((Date.parse(original.endDate) - Date.parse(original.startDate)) / 86_400_000)
      next.endDate = dayKeyAdd(date, Math.max(0, span))
    }
    if (allDay !== original.allDay) next.allDay = allDay
    const startTime = allDay ? null : start
    const endTime = allDay ? null : end
    if (startTime !== (original.startTime ?? null)) next.startTime = startTime
    if (endTime !== (original.endTime ?? null)) next.endTime = endTime
    if (segment && audienceEditable) {
      const before = segment.scopes.map((scope) => scope.value).sort().join(',')
      const changed = before !== [...sections].sort().join(',') || reply !== (segment.response ?? 'none') || instructions.trim() !== (segment.instructions ?? '')
      if (changed) {
        next.segments = [
          {
            ...segmentForSave(segment),
            label: `Families of ${forText}`.slice(0, 80),
            scopes: chosen.map((section) => ({ type: 'section', value: section.key, label: classLabel(section.className, section.section) })),
            instructions: instructions.trim(),
            response: reply,
          },
        ]
      }
    }
    return next
  }


  const needsApproval = data?.needsApprovalForFamilies ?? true
  const chosen = (data?.sections ?? []).filter((section) => sections.includes(section.key))
  const forText = chosen.length ? chosen.map((section) => classLabel(section.className, section.section)).join(', ') : 'No class chosen'
  const whenText = `${formatDayKey(date, { weekday: 'short' })}${allDay ? '' : ` · ${formatTime(start)}`}`

  const changes = editing ? Object.keys(patch()).length : 0
  const dirty = !done && (editing ? loaded && changes > 0 : Boolean(title || venue || instructions || sections.length))
  const allowLeaving = usePreventRemove(dirty && !saving, ({ repeat }) => setLeaving(() => repeat))

  const submit = async () => {
    const problems: typeof errors = {}
    if (!title.trim()) problems.title = 'Enter a title, such as "PTM for Class 7-A"'
    if (audienceEditable && !sections.length) problems.classes = 'Choose at least one class whose families should see it'
    setErrors(problems)
    if (problems.title) {
      titleRef.current?.focus()
      haptic.error()
      return
    }
    if (problems.classes) {
      haptic.error()
      return
    }
    if (editing && original) {
      const next = patch()
      if (!Object.keys(next).length) {
        router.back()
        return
      }
      try {
        const result = await update.mutateAsync({ id: original.id, patch: { ...next, notify: original.status === 'published' && tell ? 'affected' : 'none' } })
        haptic.success()
        setDone(true)
        allowLeaving()
        toast(result.status === 'pending_approval' ? 'Changes sent to the principal for approval' : 'Changes saved')
        router.back()
      } catch (error) {
        haptic.error()
        setErrors({ form: error instanceof ApiError ? error.message : "The changes didn't save. Check your connection and try again." })
      }
      return
    }
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        description: '',
        category,
        allDay,
        startDate: date,
        endDate: date,
        startTime: allDay ? null : start,
        endTime: allDay ? null : end,
        venue: venue.trim(),
        visibility: 'segments',
        segments: [
          {
            label: `Families of ${forText}`.slice(0, 80),
            personType: 'parent',
            scopes: chosen.map((section) => ({ type: 'section', value: section.key, label: classLabel(section.className, section.section) })),
            instructions: instructions.trim(),
            response: reply,
            notify: 'now',
          },
        ],
        publish: true,
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(result.status === 'pending_approval' ? 'Sent to the principal for approval' : 'Event published')
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "The event didn't save. Check your connection and try again." })
    }
  }

  const sheetBody = () => {
    switch (sheet) {
      case 'date':
        return (
          <MonthPicker
            value={date}
            today={today}
            min={today}
            onChange={(value) => {
              setDate(value)
              setSheet(null)
            }}
          />
        )
      case 'start':
      case 'end':
        return (
          <SlotPicker
            label={sheet === 'start' ? 'Starts' : 'Ends'}
            value={sheet === 'start' ? start : end}
            slots={TIMES.map((time) => ({ value: time, label: formatTime(time), taken: sheet === 'end' && time <= start }))}
            onChange={(value) => {
              if (sheet === 'start') {
                setStart(value)
                if (end <= value) setEnd(TIMES[Math.min(TIMES.indexOf(value) + 2, TIMES.length - 1)])
              } else setEnd(value)
              setSheet(null)
            }}
          />
        )
      case 'type':
        return (
          <OptionList
            label="Type"
            value={category}
            onChange={(value) => {
              setCategory(value)
              setSheet(null)
            }}
            options={(CATEGORIES.includes(category) ? CATEGORIES : [category, ...CATEGORIES]).map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
          />
        )
      case 'reply':
        return (
          <OptionList
            label="Families reply"
            value={reply}
            onChange={(value) => {
              setReply(value)
              setSheet(null)
            }}
            options={REPLIES}
          />
        )
      default:
        return null
    }
  }

  const SHEET_TITLES: Record<Exclude<Sheet, null>, string> = {
    date: 'Date',
    start: 'Starts',
    end: 'Ends',
    type: 'Type',
    reply: 'Families reply',
  }

  return (
    <MobileScreen
      nav={<NavBar title={editing ? 'Edit event' : 'New event'} back={{ label: editing ? 'Event' : 'Calendar', onPress: () => router.back() }} />}
      actionBar={
        editing ? (
          loaded && changes ? (
            <ActionBar
              icon={CalendarPlus}
              summary={title.trim() || 'Event'}
              detail={`${changes} ${changes === 1 ? 'change' : 'changes'} · ${whenText}`}
              label={saving ? 'Saving…' : 'Save changes'}
              onPress={submit}
            />
          ) : undefined
        ) : data && data.sections.length ? (
          <ActionBar
            icon={CalendarPlus}
            summary={title.trim() || 'New event'}
            detail={`${whenText} · ${chosen.length ? forText : 'choose classes'}`}
            label={saving ? 'Sending…' : needsApproval ? 'Send for approval' : 'Publish event'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet ? SHEET_TITLES[sheet] : ''}>
            {sheetBody()}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title={editing ? 'Discard your changes?' : 'Discard this event?'}
            message={editing ? 'The event stays as it was.' : "It hasn't been sent yet."}
            actions={[{ label: editing ? 'Discard changes' : 'Discard event', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {options.isPending || (editing && existing.isPending) ? (
        <CardSkeleton rows={4} />
      ) : options.isError ? (
        <LoadFailed what="Your classes" error={options.error} onRetry={options.refetch} />
      ) : editing && (existing.isError || !original) ? (
        <LoadFailed what="The event" error={existing.error} onRetry={existing.refetch} />
      ) : !editing && !data?.sections.length ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={CalendarPlus}
            title="No classes to send to"
            body="Events go to the families of classes you teach. Ask the office to add your classes to your login."
          />
        </Surface>
      ) : (
        <>
          {errors.form ? (
            <Callout tone="danger" title={editing ? "The changes weren't saved" : "The event wasn't sent"}>
              {errors.form}
            </Callout>
          ) : editing ? (
            needsApproval && original?.status === 'published' ? (
              <Callout tone="info" title="Changes go to the principal">
                A new date, time or classes waits for approval before families see it.
              </Callout>
            ) : null
          ) : needsApproval ? (
            <Callout tone="info" title="The principal approves it first">
              Families see it once the principal approves. You get a notification either way.
            </Callout>
          ) : null}

          <View style={{ gap: space['space-4'] }}>
            <MobileTextField
              ref={titleRef}
              label="Title"
              value={title}
              onChangeText={setTitle}
              error={errors.title}
              placeholder="PTM for Class 7-A"
              returnKeyType="next"
              maxLength={160}
            />
            <MobileTextField label="Venue (optional)" value={venue} onChangeText={setVenue} placeholder="Room 12" maxLength={160} />
          </View>

          <ListGroup
            header="When"
            items={[
              { title: 'Date', value: formatDayKey(date, { weekday: 'short' }), onPress: () => setSheet('date') },
              { title: 'All day', accessory: <Switch label="All day" value={allDay} onChange={setAllDay} /> },
              ...(allDay
                ? []
                : [
                    { title: 'Starts', value: formatTime(start), onPress: () => setSheet('start') },
                    { title: 'Ends', value: formatTime(end), onPress: () => setSheet('end') },
                  ]),
            ]}
          />

          <ListGroup
            header="Details"
            items={[
              { title: 'Type', value: CATEGORY_LABELS[category], onPress: () => setSheet('type') },
              ...(audienceEditable ? [{ title: 'Families reply', value: REPLIES.find((entry) => entry.value === reply)?.label, onPress: () => setSheet('reply') }] : []),
            ]}
          />

          {audienceEditable ? (
          <OptionList
            multiple
            header="For the families of"
            footer={errors.classes}
            label="Classes"
            value={sections}
            onChange={(value) => {
              setSections(value)
              if (value.length) setErrors((current) => ({ ...current, classes: undefined }))
            }}
            options={(data?.sections ?? []).map((section) => ({
              value: section.key,
              label: classLabel(section.className, section.section),
              meta: `${section.students} ${section.students === 1 ? 'student' : 'students'}`,
            }))}
          />
          ) : (
            <ListGroup
              header="For"
              footer="Who it's for, their replies and instructions stay as they are."
              items={(original?.segments ?? []).map((entry) => ({ title: entry.label || 'Audience', lines: 2 }))}
            />
          )}

          {audienceEditable ? (
            <MobileTextField
              label="What families should know (optional)"
              hint="What to bring, where to come, who to meet."
              value={instructions}
              onChangeText={setInstructions}
              multiline
              maxLength={4000}
            />
          ) : null}

          {editing && original?.status === 'published' ? (
            <ListGroup
              footer={tell ? 'Families get a notification about what changed.' : 'The calendar changes quietly.'}
              items={[{ title: 'Tell families about the change', lines: 2, accessory: <Switch label="Tell families about the change" value={tell} onChange={setTell} /> }]}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
