import { usePreventRemove, useRouter } from 'expo-router'
import { CalendarPlus } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CATEGORY_LABELS } from '@/portal/calendarUi'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { EventCategory, ResponseType } from '@/services/calendarTypes'
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

/**
 * Create an event for the families of the classes a teacher teaches. It is published at once
 * when the login may; otherwise it goes to the principal for approval first.
 * Design system: a gap in "Mobile coverage" (Create event); the layout follows Apply for leave.
 */
export default function NewEventScreen() {
  const router = useRouter()
  const toast = useToast()
  const options = useAudienceOptions()
  const create = useCreateEvent()
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

  const dirty = !done && Boolean(title || venue || instructions || sections.length)
  const allowLeaving = usePreventRemove(dirty && !create.isPending, ({ repeat }) => setLeaving(() => repeat))

  const data = options.data
  const needsApproval = data?.needsApprovalForFamilies ?? true
  const chosen = (data?.sections ?? []).filter((section) => sections.includes(section.key))
  const forText = chosen.length ? chosen.map((section) => classLabel(section.className, section.section)).join(', ') : 'No class chosen'
  const whenText = `${formatDayKey(date, { weekday: 'short' })}${allDay ? '' : ` · ${formatTime(start)}`}`

  const submit = async () => {
    const problems: typeof errors = {}
    if (!title.trim()) problems.title = 'Enter a title, such as "PTM for Class 7-A"'
    if (!sections.length) problems.classes = 'Choose at least one class whose families should see it'
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
            options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
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
      nav={<NavBar title="New event" back={{ label: 'Calendar', onPress: () => router.back() }} />}
      actionBar={
        data && data.sections.length ? (
          <ActionBar
            icon={CalendarPlus}
            summary={title.trim() || 'New event'}
            detail={`${whenText} · ${chosen.length ? forText : 'choose classes'}`}
            label={create.isPending ? 'Sending…' : needsApproval ? 'Send for approval' : 'Publish event'}
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
            title="Discard this event?"
            message="It hasn't been sent yet."
            actions={[{ label: 'Discard event', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {options.isPending ? (
        <CardSkeleton rows={4} />
      ) : options.isError ? (
        <LoadFailed what="Your classes" error={options.error} onRetry={options.refetch} />
      ) : !data?.sections.length ? (
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
            <Callout tone="danger" title="The event wasn't sent">
              {errors.form}
            </Callout>
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
              { title: 'Families reply', value: REPLIES.find((entry) => entry.value === reply)?.label, onPress: () => setSheet('reply') },
            ]}
          />

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
            options={data.sections.map((section) => ({
              value: section.key,
              label: classLabel(section.className, section.section),
              meta: `${section.students} ${section.students === 1 ? 'student' : 'students'}`,
            }))}
          />

          <MobileTextField
            label="What families should know (optional)"
            hint="What to bring, where to come, who to meet."
            value={instructions}
            onChangeText={setInstructions}
            multiline
            maxLength={4000}
          />
        </>
      )}
    </MobileScreen>
  )
}
