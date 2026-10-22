import React, { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, CalendarPlus, Library, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Badge, Banner, Button, Card, CardToolbar, Checkbox, DataTable, Dialog, EmptyState, Entity, FileField, FilterBar, Menu, Page, RadioGroup,
  Select, Sheet, StatCard, Switch, TextArea, TextField, formatDayKey,
} from '@/components/ui'
import type { DataTableColumn, MenuItem } from '@/components/ui'
import { useAudienceOptions, useCancelRule, useImportRules, useSaveRule, useSchoolDays } from '@/hooks/useCalendar'
import { usePermissions } from '@/hooks/usePermissions'
import calendarService, { apiMessage, type RuleInput, type SchoolDayRule } from '@/services/calendarService'
import { NATIONAL_HOLIDAYS, OBSERVANCE_DAYS, dateInSession } from '@/components/calendar/dayLibrary'
import '@/components/calendar/calendar.css'

type Kind = SchoolDayRule['kind']

const KIND_LABELS: Record<Kind, string> = {
  holiday: 'Holiday',
  vacation: 'Vacation',
  closure: 'Closure or mode change',
  half_day: 'Half day',
  weekly_off: 'Weekly day off',
  working_day: 'Extra working day',
}
const KIND_HINTS: Record<Kind, string> = {
  holiday: 'A day the school is closed, e.g. Diwali.',
  vacation: 'Several days off, e.g. summer vacation.',
  closure: 'A sudden closure or online classes, e.g. a pollution or rain order. Can cover only some classes.',
  half_day: 'School ends early.',
  weekly_off: 'A weekday that is always off, or some weeks of the month (2nd and 4th Saturday).',
  working_day: 'Opens a day that would otherwise be off, e.g. a compensatory Saturday.',
}
const CATEGORY_OPTIONS = [
  { value: 'national', label: 'National' },
  { value: 'state', label: 'State' },
  { value: 'school', label: 'School' },
  { value: 'religious', label: 'Religious or local' },
  { value: 'other', label: 'Other' },
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

type FormState = {
  kind: Kind
  title: string
  startDate: string
  endDate: string
  category: SchoolDayRule['category']
  weekday: number
  weeks: number[]
  scope: 'school' | 'classes'
  classes: string[]
  sections: string[]
  mode: 'closed' | 'online' | 'hybrid'
  halfDayEndTime: string
  authority: string
  orderNo: string
  reason: string
  tentative: boolean
  announce: boolean
  announceFamilies: boolean
  announceStaff: boolean
  announceEmail: boolean
  note: string
}

const blank = (kind: Kind = 'holiday'): FormState => ({
  kind,
  title: '',
  startDate: '',
  endDate: '',
  category: 'school',
  weekday: 6,
  weeks: [2, 4],
  scope: 'school',
  classes: [],
  sections: [],
  mode: 'closed',
  halfDayEndTime: '12:30',
  authority: '',
  orderNo: '',
  reason: '',
  tentative: false,
  announce: kind === 'closure',
  announceFamilies: true,
  announceStaff: true,
  announceEmail: kind === 'closure',
  note: '',
})

const fromRule = (rule: SchoolDayRule): FormState => ({
  ...blank(rule.kind),
  kind: rule.kind,
  title: rule.title || '',
  startDate: rule.startDate,
  endDate: rule.kind === 'weekly_off' || rule.endDate === rule.startDate ? '' : rule.endDate,
  category: rule.category,
  weekday: rule.weekly?.weekday ?? 6,
  weeks: rule.weekly?.weeksOfMonth || [],
  scope: rule.appliesTo?.scope || 'school',
  classes: rule.appliesTo?.classes || [],
  sections: rule.appliesTo?.sections || [],
  mode: rule.mode || 'closed',
  halfDayEndTime: rule.halfDayEndTime || '12:30',
  authority: rule.authority || '',
  orderNo: rule.orderNo || '',
  reason: rule.reason || '',
  tentative: Boolean(rule.tentative),
  announce: false,
})

const toInput = (form: FormState): RuleInput => ({
  kind: form.kind,
  title: form.title.trim(),
  startDate: form.startDate,
  endDate: form.kind === 'weekly_off' ? undefined : form.endDate || form.startDate,
  category: form.category,
  weekly: form.kind === 'weekly_off' ? { weekday: form.weekday, weeksOfMonth: form.weeks } : undefined,
  appliesTo: { scope: form.scope, classes: form.scope === 'classes' ? form.classes : [], sections: form.scope === 'classes' ? form.sections : [] },
  mode: form.mode,
  halfDayEndTime: form.kind === 'half_day' ? form.halfDayEndTime : undefined,
  authority: form.authority.trim(),
  orderNo: form.orderNo.trim(),
  reason: form.reason.trim(),
  tentative: form.tentative,
  announce: form.announce && form.kind !== 'weekly_off'
    ? { families: form.announceFamilies, staff: form.announceStaff, email: form.announceEmail, note: form.note.trim() }
    : null,
})

const weeklyText = (rule: { weekly?: { weekday: number; weeksOfMonth: number[] } }) => {
  const day = WEEKDAYS[rule.weekly?.weekday ?? 0]
  const weeks = rule.weekly?.weeksOfMonth || []
  return weeks.length ? `${weeks.map((w) => ORDINALS[w - 1]).join(' and ')} ${day} of the month` : `Every ${day}`
}

const whenText = (rule: SchoolDayRule) => {
  if (rule.kind === 'weekly_off') return `${weeklyText(rule)}, from ${formatDayKey(rule.startDate, { year: true })}`
  return rule.endDate && rule.endDate !== rule.startDate
    ? `${formatDayKey(rule.startDate, { weekday: 'short' })} – ${formatDayKey(rule.endDate, { weekday: 'short', year: true })}`
    : formatDayKey(rule.startDate, { weekday: 'short', year: true })
}

const forText = (rule: SchoolDayRule) => (rule.appliesTo?.scope === 'classes'
  ? [...(rule.appliesTo.classes || []).map((c) => `Class ${c}`), ...(rule.appliesTo.sections || []).map((s) => s.replace('|', '-'))].join(', ')
  : 'Whole school')

/** Reads "date,name" or "date,end date,name" lines (YYYY-MM-DD or DD-MM-YYYY), skipping a header. */
const parseCsv = (text: string): { rules: RuleInput[]; skipped: number } => {
  const toKey = (value: string) => {
    const v = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
  }
  let skipped = 0
  const rules: RuleInput[] = []
  text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    const start = toKey(cells[0] || '')
    if (!start) { skipped += 1; return }
    const maybeEnd = toKey(cells[1] || '')
    const name = (maybeEnd ? cells.slice(2) : cells.slice(1)).join(', ').trim()
    rules.push({ kind: maybeEnd && maybeEnd !== start ? 'vacation' : 'holiday', title: name || 'Holiday', startDate: start, endDate: maybeEnd || start, category: 'school' })
  })
  return { rules, skipped }
}

const RuleSheet: React.FC<{ open: boolean; rule: SchoolDayRule | null; kind?: Kind; onClose: () => void }> = ({ open, rule, kind, onClose }) => {
  const [form, setForm] = useState<FormState>(blank())
  const [error, setError] = useState<Record<string, string>>({})
  const save = useSaveRule()
  const { data: options } = useAudienceOptions(open)
  const { can } = usePermissions()
  const canAnnounce = can(['clndr.events.publish_wide', 'clndr.events.manage'])
  React.useEffect(() => {
    if (open) {
      setForm(rule ? fromRule(rule) : blank(kind))
      setError({})
    }
  }, [open, rule, kind])
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const submit = async () => {
    const next: Record<string, string> = {}
    if (!form.startDate) next.startDate = form.kind === 'weekly_off' ? 'Choose when this pattern starts' : 'Choose the date'
    if (form.endDate && form.endDate < form.startDate) next.endDate = "It can't end before it starts"
    if (form.scope === 'classes' && !form.classes.length && !form.sections.length) next.scope = 'Choose the classes'
    if (form.kind === 'half_day' && !form.halfDayEndTime) next.halfDayEndTime = 'Set when school ends'
    setError(next)
    if (Object.keys(next).length) return
    try {
      const result = await save.mutateAsync({ id: rule?.id, input: toInput(form) })
      toast.success(result && 'eventId' in result && result.eventId ? 'Saved and announced' : 'Saved')
      onClose()
    } catch (e) {
      toast.error(apiMessage(e, 'Could not save. Try again.'))
    }
  }
  const sections = options?.sections || []
  const classes = options?.classes || []
  return (
    <Sheet
      open={open}
      onClose={onClose}
      icon={CalendarDays}
      size="lg"
      title={rule ? `Edit ${KIND_LABELS[rule.kind].toLowerCase()}` : 'Add a school day'}
      description={KIND_HINTS[form.kind]}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{form.announce ? 'Save and announce' : 'Save'}</Button>
        </>
      )}
    >
      <div className="cb-stack">
        {!rule ? (
          <Select label="What kind of day" value={form.kind} options={(Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} onChange={(e) => set({ ...blank(e.target.value as Kind) })} />
        ) : null}
        <div className="cb-form-grid">
          <TextField
            label="Name"
            className="is-wide"
            value={form.title}
            maxLength={120}
            placeholder={{ holiday: 'e.g. Diwali', vacation: 'e.g. Summer vacation', closure: 'e.g. GRAP Stage III: classes online', half_day: 'e.g. Half day for PTM', weekly_off: 'e.g. 2nd and 4th Saturday', working_day: 'e.g. Compensatory working day' }[form.kind]}
            onChange={(e) => set({ title: e.target.value })}
          />
          {form.kind === 'weekly_off' ? (
            <>
              <Select label="Day" value={String(form.weekday)} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} onChange={(e) => set({ weekday: Number(e.target.value) })} />
              <TextField label="Starts from" type="date" value={form.startDate} error={error.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              <div className="is-wide cl-weekdays" role="group" aria-label="Which weeks of the month">
                <span className="cb-muted">Only these weeks (leave empty for every week):</span>
                {ORDINALS.map((label, i) => (
                  <Checkbox key={label} label={label} checked={form.weeks.includes(i + 1)} onChange={(on) => set({ weeks: on ? [...form.weeks, i + 1].sort() : form.weeks.filter((w) => w !== i + 1) })} />
                ))}
              </div>
            </>
          ) : (
            <>
              <TextField label={form.kind === 'vacation' || form.kind === 'closure' ? 'From' : 'Date'} type="date" required value={form.startDate} error={error.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              <TextField label="Until (for several days)" type="date" min={form.startDate} value={form.endDate} error={error.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </>
          )}
          {form.kind === 'holiday' || form.kind === 'vacation' ? (
            <Select label="Type of holiday" value={form.category} options={CATEGORY_OPTIONS} onChange={(e) => set({ category: e.target.value as FormState['category'] })} />
          ) : null}
          {form.kind === 'closure' ? (
            <Select
              label="What happens"
              value={form.mode}
              options={[{ value: 'closed', label: 'School closed' }, { value: 'online', label: 'Classes online' }, { value: 'hybrid', label: 'Classes hybrid (parents choose)' }]}
              onChange={(e) => set({ mode: e.target.value as FormState['mode'] })}
            />
          ) : null}
          {form.kind === 'half_day' ? (
            <TextField label="School ends at" type="time" value={form.halfDayEndTime} error={error.halfDayEndTime} onChange={(e) => set({ halfDayEndTime: e.target.value })} />
          ) : null}
          {form.kind !== 'weekly_off' ? (
            <Switch label="Date may change" description="For holidays that depend on the moon, or orders not yet final." checked={form.tentative} onChange={(tentative) => set({ tentative })} />
          ) : null}
        </div>

        {form.kind !== 'working_day' ? (
          <section className="cb-form-section">
            <h4 className="cb-form-section__title">Who it applies to</h4>
            <RadioGroup
              value={form.scope}
              orientation="horizontal"
              onChange={(value) => set({ scope: value as FormState['scope'] })}
              options={[{ value: 'school', label: 'Whole school' }, { value: 'classes', label: 'Only some classes' }]}
            />
            {form.scope === 'classes' ? (
              <>
                <div className="cl-choices" role="group" aria-label="Whole classes">
                  {classes.map((c) => (
                    <Checkbox key={c} label={`Class ${c}`} checked={form.classes.includes(c)} onChange={(on) => set({ classes: on ? [...form.classes, c] : form.classes.filter((x) => x !== c) })} />
                  ))}
                </div>
                <details>
                  <summary className="cb-link">Choose single sections instead</summary>
                  <div className="cl-choices" role="group" aria-label="Sections">
                    {sections.map((s) => (
                      <Checkbox key={s.key} label={`${s.className}-${s.section}`} checked={form.sections.includes(s.key)} onChange={(on) => set({ sections: on ? [...form.sections, s.key] : form.sections.filter((x) => x !== s.key) })} />
                    ))}
                  </div>
                </details>
                {error.scope ? <p className="cb-field__error" role="alert">{error.scope}</p> : null}
              </>
            ) : null}
          </section>
        ) : null}

        {form.kind === 'closure' || form.kind === 'holiday' || form.kind === 'vacation' ? (
          <div className="cb-form-grid">
            <TextField label="Ordered by (optional)" value={form.authority} maxLength={120} placeholder="e.g. Directorate of Education" onChange={(e) => set({ authority: e.target.value })} />
            <TextField label="Order or circular no. (optional)" value={form.orderNo} maxLength={80} onChange={(e) => set({ orderNo: e.target.value })} />
          </div>
        ) : null}
        <TextArea label="Note (optional)" rows={2} value={form.reason} maxLength={500} onChange={(e) => set({ reason: e.target.value })} />

        {form.kind !== 'weekly_off' && canAnnounce && !rule?.eventId ? (
          <section className="cb-form-section">
            <h4 className="cb-form-section__title">Tell people</h4>
            <Switch label="Announce on the calendar and notify" checked={form.announce} onChange={(announce) => set({ announce })} />
            {form.announce ? (
              <div className="cl-checks">
                <Checkbox label={form.scope === 'classes' ? 'Families of these classes' : 'All families'} checked={form.announceFamilies} onChange={(announceFamilies) => set({ announceFamilies })} />
                <Checkbox label="All staff" checked={form.announceStaff} onChange={(announceStaff) => set({ announceStaff })} />
                <Checkbox label="Also send an email" checked={form.announceEmail} onChange={(announceEmail) => set({ announceEmail })} />
                <TextArea label="Message (optional)" rows={2} value={form.note} maxLength={2000} placeholder="e.g. Classes resume on Monday. Homework is on the class page." onChange={(e) => set({ note: e.target.value })} />
              </div>
            ) : null}
          </section>
        ) : null}
        {rule?.eventId ? <Banner tone="info" title="Already announced">If you change the dates, everyone who was told hears about the change.</Banner> : null}
      </div>
    </Sheet>
  )
}

const ImportDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{ rules: RuleInput[]; skipped: number } | null>(null)
  const importRules = useImportRules()
  React.useEffect(() => { if (open) { setFile(null); setParsed(null) } }, [open])
  const choose = async (next: File | null) => {
    setFile(next)
    setParsed(next ? parseCsv(await next.text()) : null)
  }
  const confirm = async () => {
    if (!parsed?.rules.length) return
    try {
      const result = await importRules.mutateAsync(parsed.rules)
      toast.success(`${result.created} ${result.created === 1 ? 'day' : 'days'} added`)
      onClose()
    } catch (e) {
      toast.error(apiMessage(e, 'Could not import the list.'))
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Import a holiday list"
      description="A CSV file with one holiday per line: date, name. For vacations: start date, end date, name. Dates as 2026-11-08 or 08-11-2026."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" loading={importRules.isPending} disabled={!parsed?.rules.length} onClick={confirm}>
            {parsed?.rules.length ? `Add ${parsed.rules.length} ${parsed.rules.length === 1 ? 'day' : 'days'}` : 'Add days'}
          </Button>
        </>
      )}
    >
      <div className="cb-stack">
        <FileField label="Holiday list" accept=".csv,text/csv,text/plain" file={file} onChange={choose} />
        {parsed ? (
          <p className="cb-muted">
            {parsed.rules.length} found{parsed.skipped ? `, ${parsed.skipped} ${parsed.skipped === 1 ? 'line' : 'lines'} skipped (no date)` : ''}.
            {parsed.rules.slice(0, 3).map((r) => ` ${formatDayKey(r.startDate as string)} ${r.title}`).join(';')}{parsed.rules.length > 3 ? '…' : ''}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

/** Fixed-date observances added to the staff calendar, quietly (no notifications). */
const ObservanceDialog: React.FC<{ open: boolean; onClose: () => void; sessionStart: string }> = ({ open, onClose, sessionStart }) => {
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  React.useEffect(() => { if (open) setChosen(OBSERVANCE_DAYS.map((d) => d.title)) }, [open])
  const add = async () => {
    setBusy(true)
    let added = 0
    // eslint-disable-next-line no-restricted-syntax
    for (const day of OBSERVANCE_DAYS.filter((d) => chosen.includes(d.title))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await calendarService.create({
          title: day.title,
          category: 'celebration',
          allDay: true,
          startDate: dateInSession(sessionStart, day.month, day.day),
          visibility: 'all_staff',
          segments: [{ label: 'All staff', personType: 'staff', scopes: [{ type: 'all', value: '' }], exclude: [], role: 'fyi', instructions: '', notify: 'silent', email: false, reminders: [] }],
          publish: true,
        })
        added += 1
      } catch (error) {
        toast.error(apiMessage(error, `Could not add ${day.title}.`))
      }
    }
    setBusy(false)
    void queryClient.invalidateQueries({ queryKey: ['calendar'] })
    if (added) toast.success(`${added} ${added === 1 ? 'day' : 'days'} added to the staff calendar. Edit one to add instructions for families.`)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Add observance days"
      description="They go on the staff calendar without any notification. Open one later to add instructions for families."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} disabled={!chosen.length} onClick={add}>Add {chosen.length} {chosen.length === 1 ? 'day' : 'days'}</Button>
        </>
      )}
    >
      <div className="cl-checks">
        {OBSERVANCE_DAYS.map((day) => (
          <Checkbox
            key={day.title}
            label={`${day.title} · ${formatDayKey(dateInSession(sessionStart, day.month, day.day), { weekday: 'short', year: true })}`}
            checked={chosen.includes(day.title)}
            onChange={(on) => setChosen((list) => (on ? [...list, day.title] : list.filter((t) => t !== day.title)))}
          />
        ))}
      </div>
    </Dialog>
  )
}

const SchoolDays: React.FC = () => {
  const [showCancelled, setShowCancelled] = useState(false)
  const { data, isLoading } = useSchoolDays({ all: showCancelled })
  const [filter, setFilter] = useState<'all' | Kind>('all')
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<{ open: boolean; rule: SchoolDayRule | null; kind?: Kind }>({ open: false, rule: null })
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState<SchoolDayRule | null>(null)
  const [observances, setObservances] = useState(false)
  const cancelRule = useCancelRule()
  const importRules = useImportRules()
  const { can } = usePermissions()
  const canAnnounce = can(['clndr.events.publish_wide', 'clndr.events.manage'])

  const addNationalHolidays = async () => {
    if (!data) return
    const have = new Set(data.rules.filter((r) => r.status === 'active').map((r) => r.startDate))
    const missing = NATIONAL_HOLIDAYS
      .map((h) => ({ kind: 'holiday' as const, title: h.title, startDate: dateInSession(data.from, h.month, h.day), category: 'national' as const }))
      .filter((h) => !have.has(h.startDate))
      .map((h) => ({ ...h, endDate: h.startDate }))
    if (!missing.length) {
      toast('National holidays are already in the list')
      return
    }
    try {
      await importRules.mutateAsync(missing)
      toast.success(`${missing.map((h) => h.title).join(', ')} added`)
    } catch (error) {
      toast.error(apiMessage(error, 'Could not add the national holidays.'))
    }
  }

  const rules = data?.rules || []
  const weeklyOffs = rules.filter((r) => r.kind === 'weekly_off' && r.status === 'active')
  const shown = useMemo(() => rules
    .filter((r) => r.kind !== 'weekly_off')
    .filter((r) => filter === 'all' || r.kind === filter)
    .filter((r) => !search.trim() || (r.title || '').toLowerCase().includes(search.trim().toLowerCase())), [rules, filter, search])
  const upcoming = rules.filter((r) => r.kind !== 'weekly_off' && r.status === 'active' && r.endDate >= (data?.today || ''))
  const nextOff = upcoming.filter((r) => ['holiday', 'vacation', 'closure'].includes(r.kind)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  const remove = async () => {
    if (!removing) return
    try {
      await cancelRule.mutateAsync({ id: removing.id })
      toast.success(removing.eventId ? 'Removed. People who were told hear it is a working day again.' : 'Removed')
      setRemoving(null)
    } catch (e) {
      toast.error(apiMessage(e, 'Could not remove it.'))
    }
  }

  const menuFor = (rule: SchoolDayRule): MenuItem[] => [
    { label: 'Edit', onSelect: () => setSheet({ open: true, rule }) },
    ...(rule.status === 'active' ? [{ divider: true } as MenuItem, { label: 'Remove', tone: 'danger', onSelect: () => setRemoving(rule) } as MenuItem] : []),
  ]

  const columns: DataTableColumn<SchoolDayRule>[] = [
    { key: 'name', header: 'Day', mobile: 'title', render: (r) => <Entity primary={r.title || KIND_LABELS[r.kind]} secondary={KIND_LABELS[r.kind]} /> },
    { key: 'when', header: 'When', mobile: 'subtitle', render: whenText },
    { key: 'for', header: 'For', mobile: 'hidden', render: forText },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (r) => (r.status === 'cancelled'
        ? <Badge tone="neutral">Removed</Badge>
        : r.tentative ? <Badge tone="warning">May change</Badge>
          : r.eventId ? <Badge tone="success">Announced</Badge> : <Badge tone="info">Planned</Badge>),
    },
    { key: 'menu', header: '', headerLabel: 'Actions', interactive: true, width: '48px', render: (r) => <Menu items={menuFor(r)} label={`Actions for ${r.title || KIND_LABELS[r.kind]}`} /> },
  ]

  return (
    <Page>
      <div className="cb-stack">
        <div className="cb-stats">
          <StatCard label="Working days this session" value={data ? data.summary.working : '—'} hint={data ? `of ${data.summary.days} days, ${formatDayKey(data.from, { year: true })} to ${formatDayKey(data.to, { year: true })}` : undefined} />
          <StatCard label="Days off this session" value={data ? data.summary.off : '—'} hint="Weekly offs, holidays, vacations and closures" />
          <StatCard label="Next day off" value={nextOff ? formatDayKey(nextOff.startDate, { weekday: 'short' }) : '—'} hint={nextOff?.title || 'Nothing planned'} />
        </div>

        <Card
          title="Weekly days off"
          subtitle={data?.usingDefaultSunday ? 'Sunday is off unless you set a pattern here.' : undefined}
          action={<Button size="sm" variant="tertiary" onClick={() => setSheet({ open: true, rule: null, kind: 'weekly_off' })}>Add a weekly day off</Button>}
        >
          {weeklyOffs.length ? (
            <ul className="cl-files">
              {weeklyOffs.map((rule) => (
                <li key={rule.id} className="cl-dayline">
                  <span className="cb-strong">{rule.title || weeklyText(rule)}</span>
                  <span className="cb-muted">{weeklyText(rule)}{rule.appliesTo?.scope === 'classes' ? ` · ${forText(rule)}` : ''}</span>
                  <Menu items={menuFor(rule)} label={`Actions for ${rule.title || weeklyText(rule)}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="cl-rules-note">Every Sunday. Add a pattern if your school also closes on Saturdays, or only on some of them.</p>
          )}
        </Card>

        <Card flush>
          <CardToolbar>
            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: 'Search days' }}
              chips={[
                { id: 'all', label: 'All', active: filter === 'all' },
                { id: 'holiday', label: 'Holidays', active: filter === 'holiday' },
                { id: 'vacation', label: 'Vacations', active: filter === 'vacation' },
                { id: 'closure', label: 'Closures', active: filter === 'closure' },
                { id: 'half_day', label: 'Half days', active: filter === 'half_day' },
                { id: 'working_day', label: 'Extra working days', active: filter === 'working_day' },
              ]}
              onChipClick={(id) => setFilter(id as 'all' | Kind)}
              actions={(
                <div className="cl-toolbar__actions">
                  <Checkbox label="Show removed" checked={showCancelled} onChange={setShowCancelled} />
                  <Menu
                    label="Add from the library"
                    items={[
                      { label: 'National holidays', hint: '26 Jan, 15 Aug, 2 Oct', onSelect: () => { void addNationalHolidays() } },
                      ...(canAnnounce ? [{ label: 'Observance days', hint: "Teachers' Day, Constitution Day…", onSelect: () => setObservances(true) }] : []),
                    ]}
                    trigger={(props) => <Button {...props} icon={Library}>Add from library</Button>}
                  />
                  <Button icon={Upload} onClick={() => setImporting(true)}>Import list</Button>
                  <Button variant="primary" icon={CalendarPlus} onClick={() => setSheet({ open: true, rule: null })}>Add day</Button>
                </div>
              )}
            />
          </CardToolbar>
          <DataTable
            columns={columns}
            rows={shown}
            getRowKey={(r) => r.id}
            loading={isLoading}
            loadingLabel="Loading school days"
            onRowClick={(rule) => setSheet({ open: true, rule })}
            empty={search || filter !== 'all'
              ? <EmptyState compact title="No days match" body="Try another filter." />
              : <EmptyState compact title="No holidays added for this session" body="Add them one by one or import your school's list." action={<Button size="sm" onClick={() => setImporting(true)}>Import list</Button>} />}
          />
        </Card>
      </div>

      <RuleSheet open={sheet.open} rule={sheet.rule} kind={sheet.kind} onClose={() => setSheet({ open: false, rule: null })} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      {data ? <ObservanceDialog open={observances} onClose={() => setObservances(false)} sessionStart={data.from} /> : null}
      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.title || 'this day'}?`}
        description={removing?.eventId ? 'It becomes an ordinary working day. Everyone who was told about it gets a cancellation.' : 'It becomes an ordinary working day.'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Keep it</Button>
            <Button variant="danger" loading={cancelRule.isPending} onClick={remove}>Remove</Button>
          </>
        )}
      />
    </Page>
  )
}

export default SchoolDays
