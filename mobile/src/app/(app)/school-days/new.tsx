import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { CalendarOff } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ClosureMode, DayKind, HolidayCategory, RuleInput, SchoolDayRule } from '@/services/schoolDaysService'
import { useAudienceOptions } from '@/staff/queries'
import { useCreateRule, useSchoolDays, useUpdateRule } from '@/staff/schoolDayQueries'
import { CATEGORY_LABELS, KIND_HINTS, KIND_LABELS, ruleDates } from '@/staff/schoolDayUi'
import { useStaff } from '@/staff/useStaff'
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
  Switch,
  haptic,
  useToast,
} from '@/ui'

type Kind = Exclude<DayKind, 'weekly_off'>
const KINDS: Kind[] = ['holiday', 'closure', 'vacation', 'half_day', 'working_day']
const MODES: { value: ClosureMode; label: string }[] = [
  { value: 'closed', label: 'School closed' },
  { value: 'online', label: 'Classes online' },
  { value: 'hybrid', label: 'Classes hybrid (parents choose)' },
]
const PLACEHOLDER: Record<Kind, string> = {
  holiday: 'Diwali',
  vacation: 'Winter vacation',
  closure: 'Rain order: school closed',
  half_day: 'Half day for PTM',
  working_day: 'Compensatory working day',
}
// Half days end between 10 am and 2 pm.
const END_TIMES = Array.from({ length: 9 }, (_, index) => {
  const minutes = 10 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`
})

type Form = {
  kind: Kind
  title: string
  startDate: string
  endDate: string
  category: HolidayCategory
  mode: ClosureMode
  halfDayEndTime: string
  scope: 'school' | 'classes'
  classes: string[]
  sections: string[]
  reason: string
}
type Sheet = 'kind' | 'start' | 'end' | 'category' | 'mode' | 'ends' | 'for' | null

const blank = (today: string): Form => ({
  kind: 'holiday',
  title: '',
  startDate: dayKeyAdd(today, 1),
  endDate: dayKeyAdd(today, 1),
  category: 'school',
  mode: 'closed',
  halfDayEndTime: '12:30',
  scope: 'school',
  classes: [],
  sections: [],
  reason: '',
})

const fromRule = (rule: SchoolDayRule): Form => ({
  kind: rule.kind === 'weekly_off' ? 'holiday' : rule.kind,
  title: rule.title ?? '',
  startDate: rule.startDate,
  endDate: rule.endDate,
  category: rule.category ?? 'school',
  mode: rule.mode ?? 'closed',
  halfDayEndTime: rule.halfDayEndTime || '12:30',
  scope: rule.appliesTo?.scope ?? 'school',
  classes: rule.appliesTo?.classes ?? [],
  sections: rule.appliesTo?.sections ?? [],
  reason: rule.reason ?? '',
})

const spans = (kind: Kind) => kind === 'vacation' || kind === 'closure'

const toInput = (form: Form): RuleInput => ({
  kind: form.kind,
  title: form.title.trim(),
  startDate: form.startDate,
  endDate: spans(form.kind) ? form.endDate : form.startDate,
  category: form.category,
  mode: form.mode,
  halfDayEndTime: form.kind === 'half_day' ? form.halfDayEndTime : null,
  appliesTo: { scope: form.scope, classes: form.scope === 'classes' ? form.classes : [], sections: form.scope === 'classes' ? form.sections : [] },
  reason: form.reason.trim(),
})

/** What changed, so an edit sends only that (the server keeps the rest). */
const changed = (before: RuleInput, after: RuleInput): RuleInput =>
  Object.fromEntries(Object.entries(after).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(before[field as keyof RuleInput]))) as RuleInput

/**
 * Add (or with `?id=` edit) a holiday, a sudden closure, a vacation, a half day or an extra
 * working day. Attendance, timetables, meetings and fee dates follow it. The principal and office
 * can tell families and staff at once: it goes on everyone's calendar with a notification.
 */
export default function SchoolDayFormScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const today = schoolToday()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const editing = Boolean(id)
  const days = useSchoolDays()
  const options = useAudienceOptions()
  const create = useCreateRule()
  const update = useUpdateRule()
  const rule = days.data?.rules.find((entry) => entry.id === id)
  const canAnnounce = staff.can('clndr.events.publish_wide') || staff.can('clndr.events.manage')

  const [edited, setForm] = useState<Form | null>(null)
  const start = editing ? (rule ? fromRule(rule) : null) : blank(today)
  const form = edited ?? start
  const [sheet, setSheet] = useState<Sheet>(null)
  const [announce, setAnnounce] = useState(true)
  const [families, setFamilies] = useState(true)
  const [staffToo, setStaffToo] = useState(true)
  const [email, setEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  const saving = create.isPending || update.isPending
  const patch = form && start ? changed(editing ? toInput(start) : {}, toInput(form)) : {}
  const dirty = !done && Boolean(edited) && (editing ? Object.keys(patch).length > 0 : true)
  const allowLeaving = usePreventRemove(dirty && !saving, ({ repeat }) => setLeaving(() => repeat))
  const set = (next: Partial<Form>) => form && setForm({ ...form, ...next })
  const announcing = !editing && canAnnounce && announce && form?.kind !== 'working_day'
  const classes = options.data?.classes ?? []

  const submit = async () => {
    if (!form) return
    if (form.scope === 'classes' && !form.classes.length && !form.sections.length) {
      haptic.error()
      setError('Choose the classes it is for, or make it for the whole school.')
      return
    }
    if (spans(form.kind) && form.endDate < form.startDate) {
      haptic.error()
      setError('The last day comes before the first. Change the dates.')
      return
    }
    setError(null)
    try {
      if (editing && id) {
        if (Object.keys(patch).length) await update.mutateAsync({ id, input: patch })
        toast('Saved')
      } else {
        const result = await create.mutateAsync({
          ...toInput(form),
          announce: announcing ? { families, staff: staffToo, email, note: form.reason.trim() } : null,
        })
        toast(result.eventId ? 'Saved and announced' : 'Saved')
      }
      haptic.success()
      setDone(true)
      allowLeaving()
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Check your connection and try again.")
    }
  }

  const sheetBody = () => {
    if (!form) return null
    switch (sheet) {
      case 'kind':
        return (
          <OptionList
            label="What kind of day"
            value={form.kind}
            onChange={(kind) => {
              set({ kind, endDate: form.startDate })
              setSheet(null)
            }}
            options={KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind], meta: KIND_HINTS[kind] }))}
          />
        )
      case 'start':
      case 'end':
        return (
          <MonthPicker
            value={sheet === 'start' ? form.startDate : form.endDate}
            today={today}
            min={sheet === 'end' ? form.startDate : undefined}
            onChange={(value) => {
              if (sheet === 'start') set({ startDate: value, endDate: form.endDate < value || !spans(form.kind) ? value : form.endDate })
              else set({ endDate: value })
              setSheet(null)
            }}
          />
        )
      case 'category':
        return (
          <OptionList
            label="Holiday type"
            value={form.category}
            onChange={(category) => {
              set({ category })
              setSheet(null)
            }}
            options={(Object.keys(CATEGORY_LABELS) as HolidayCategory[]).map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
          />
        )
      case 'mode':
        return (
          <OptionList
            label="Classes"
            value={form.mode}
            onChange={(mode) => {
              set({ mode })
              setSheet(null)
            }}
            options={MODES}
          />
        )
      case 'ends':
        return (
          <SlotPicker
            label="School ends"
            value={form.halfDayEndTime}
            slots={END_TIMES.map((time) => ({ value: time, label: formatTime(time) }))}
            onChange={(value) => {
              set({ halfDayEndTime: value })
              setSheet(null)
            }}
          />
        )
      case 'for':
        return (
          <View style={{ gap: space['space-4'] }}>
            <OptionList
              label="For"
              value={form.scope}
              onChange={(scope) => set({ scope })}
              options={[
                { value: 'school', label: 'Whole school' },
                { value: 'classes', label: 'Only some classes' },
              ]}
            />
            {form.scope === 'classes' ? (
              <OptionList
                multiple
                header="Classes"
                footer={form.sections.length ? `Also ${form.sections.length} single ${form.sections.length === 1 ? 'section' : 'sections'} chosen on the website.` : undefined}
                label="Classes"
                value={form.classes}
                onChange={(value) => set({ classes: value })}
                options={classes.map((name) => ({ value: name, label: classLabel(name) }))}
              />
            ) : null}
          </View>
        )
      default:
        return null
    }
  }

  const TITLES: Record<Exclude<Sheet, null>, string> = {
    kind: 'What kind of day',
    start: spans(form?.kind ?? 'holiday') ? 'First day' : 'Date',
    end: 'Last day',
    category: 'Holiday type',
    mode: 'Classes',
    ends: 'School ends',
    for: 'Who it is for',
  }

  return (
    <MobileScreen
      nav={<NavBar title={editing ? 'Edit day' : 'Add a day off'} back={{ label: 'School days', onPress: router.back }} />}
      actionBar={
        form && (!editing || Object.keys(patch).length) ? (
          <ActionBar
            icon={CalendarOff}
            summary={form.title.trim() || KIND_LABELS[form.kind]}
            detail={ruleDates({ ...form, endDate: spans(form.kind) ? form.endDate : form.startDate })}
            label={saving ? 'Saving…' : announcing ? 'Save and announce' : 'Save'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet ? TITLES[sheet] : ''} detent={sheet === 'for' || sheet === 'kind' ? 'large' : 'medium'}>
            {sheetBody()}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title={editing ? 'Discard your changes?' : 'Discard this day?'}
            message={editing ? 'It stays as it was.' : "It hasn't been saved."}
            actions={[{ label: editing ? 'Discard changes' : 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {days.isPending || options.isPending ? (
        <CardSkeleton rows={4} />
      ) : days.isError ? (
        <LoadFailed what="School days" error={days.error} onRetry={days.refetch} />
      ) : !form ? (
        <LoadFailed what="This day" error={new Error('It was removed, or it is from an earlier session.')} onRetry={days.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="It wasn't saved">
              {error}
            </Callout>
          ) : rule?.eventId ? (
            <Callout tone="info" title="Already announced">
              If you change the dates, everyone who was told hears about the change.
            </Callout>
          ) : null}

          <ListGroup items={[{ title: 'Kind', value: KIND_LABELS[form.kind], onPress: () => setSheet('kind') }]} footer={KIND_HINTS[form.kind]} />

          <MobileTextField label="Name" value={form.title} onChangeText={(title) => set({ title })} placeholder={PLACEHOLDER[form.kind]} maxLength={120} />

          <ListGroup
            header="When"
            items={[
              { title: spans(form.kind) ? 'First day' : 'Date', value: formatDayKey(form.startDate, { weekday: 'short' }), onPress: () => setSheet('start') },
              ...(spans(form.kind) ? [{ title: 'Last day', value: formatDayKey(form.endDate, { weekday: 'short' }), onPress: () => setSheet('end') }] : []),
              ...(form.kind === 'half_day' ? [{ title: 'School ends', value: formatTime(form.halfDayEndTime), onPress: () => setSheet('ends') }] : []),
              ...(form.kind === 'closure' ? [{ title: 'Classes', value: MODES.find((mode) => mode.value === form.mode)?.label, onPress: () => setSheet('mode') }] : []),
              ...(form.kind === 'holiday' ? [{ title: 'Holiday type', value: CATEGORY_LABELS[form.category], onPress: () => setSheet('category') }] : []),
            ]}
          />

          <ListGroup
            header="For"
            items={[
              {
                title: form.scope === 'school' ? 'Whole school' : form.classes.length ? form.classes.map((name) => classLabel(name)).join(', ') : 'Choose classes',
                lines: 2,
                onPress: () => setSheet('for'),
              },
            ]}
          />

          <MobileTextField
            label="Reason (optional)"
            hint={announcing ? 'Families and staff see it in the notification.' : 'Shown on the calendar.'}
            value={form.reason}
            onChangeText={(reason) => set({ reason })}
            multiline
            maxLength={500}
          />

          {!editing && canAnnounce && form.kind !== 'working_day' ? (
            <ListGroup
              header="Tell people"
              footer={announce ? 'It goes on their calendar with a notification.' : 'Only the calendar changes; nobody is notified.'}
              items={[
                { title: 'Announce it now', accessory: <Switch label="Announce it now" value={announce} onChange={setAnnounce} /> },
                ...(announce
                  ? [
                      { title: form.scope === 'classes' ? 'Families of these classes' : 'All families', lines: 2, accessory: <Switch label="Families" value={families} onChange={setFamilies} /> },
                      { title: 'All staff', accessory: <Switch label="All staff" value={staffToo} onChange={setStaffToo} /> },
                      { title: 'Also send an email', accessory: <Switch label="Also send an email" value={email} onChange={setEmail} /> },
                    ]
                  : []),
              ]}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
