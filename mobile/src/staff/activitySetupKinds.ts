import { formatDayKey, schoolToday } from '@/lib/format'
import type { CouncilPost, PostStatus, SetupKind, SetupRecord } from '@/services/activityService'

import type { RecordField, RecordValues } from './RecordSheet'

// House colours as the website stores them (a hex value), named for choosing.
export const HOUSE_COLOURS = [
  { value: '#d32f2f', label: 'Red' },
  { value: '#1976d2', label: 'Blue' },
  { value: '#388e3c', label: 'Green' },
  { value: '#fbc02d', label: 'Yellow' },
  { value: '#7b1fa2', label: 'Purple' },
  { value: '#f57c00', label: 'Orange' },
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((value) => ({ value, label: value }))
const year = schoolToday().slice(0, 4)

/** Each kind of record: its name on the chip, the singular, its fields and what its row shows. */
export const KINDS: Record<SetupKind, { chip: string; one: string; title: string; fields: RecordField[]; subtitle: (row: SetupRecord) => string }> = {
  houses: {
    chip: 'Houses',
    one: 'house',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Tagore House', required: true },
      { key: 'motto', label: 'Motto (optional)', kind: 'text' },
      { key: 'color', label: 'Colour', kind: 'choice', options: HOUSE_COLOURS },
    ],
    subtitle: (row) => [HOUSE_COLOURS.find((colour) => colour.value === row.color)?.label, row.motto].filter(Boolean).join(' · '),
  },
  clubs: {
    chip: 'Clubs',
    one: 'club',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Science club', required: true },
      { key: 'incharge', label: 'Teacher in charge (optional)', kind: 'text' },
      { key: 'description', label: 'What it does (optional)', kind: 'long' },
      { key: 'meetingDay', label: 'Meets on', kind: 'choice', options: DAYS },
    ],
    subtitle: (row) => [row.incharge, row.meetingDay ? `meets ${row.meetingDay}` : null].filter(Boolean).join(' · '),
  },
  sports: {
    chip: 'Sports',
    one: 'sports meet',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Annual sports meet', required: true },
      { key: 'year', label: 'Year', kind: 'number', placeholder: year },
      { key: 'venue', label: 'Venue (optional)', kind: 'text' },
      { key: 'events', label: 'Events (optional)', kind: 'long', hint: 'One per line: 100 m, long jump…' },
      { key: 'results', label: 'Results (optional)', kind: 'long', hint: 'Who won what, once it is over.' },
      { key: 'startDate', label: 'Starts', kind: 'date' },
      { key: 'endDate', label: 'Ends', kind: 'date' },
    ],
    subtitle: (row) => [row.venue, row.startDate ? formatDayKey(String(row.startDate).slice(0, 10), { year: true }) : row.year].filter(Boolean).join(' · '),
  },
  tours: {
    chip: 'Tours',
    one: 'tour',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Class 8 trip to Jaipur', required: true },
      { key: 'destination', label: 'Where to (optional)', kind: 'text' },
      { key: 'classes', label: 'Classes going (optional)', kind: 'text', placeholder: '8-A, 8-B' },
      { key: 'students', label: 'Students going (optional)', kind: 'long', hint: 'One per line.' },
      { key: 'description', label: 'Plan (optional)', kind: 'long' },
      { key: 'startDate', label: 'Leaves', kind: 'date' },
      { key: 'endDate', label: 'Returns', kind: 'date' },
    ],
    subtitle: (row) => [row.destination, row.startDate ? formatDayKey(String(row.startDate).slice(0, 10), { year: true }) : null].filter(Boolean).join(' · '),
  },
  functions: {
    chip: 'Functions',
    one: 'function',
    title: 'title',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Annual day', required: true },
      { key: 'functionType', label: 'Kind (optional)', kind: 'text', placeholder: 'Celebration, assembly…' },
      { key: 'venue', label: 'Venue (optional)', kind: 'text' },
      { key: 'incharge', label: 'In charge (optional)', kind: 'text' },
      { key: 'plan', label: 'Plan (optional)', kind: 'long' },
      { key: 'outcome', label: 'How it went (optional)', kind: 'long' },
      { key: 'date', label: 'Day', kind: 'date' },
    ],
    subtitle: (row) => [row.date ? formatDayKey(String(row.date).slice(0, 10), { year: true }) : null, row.venue, row.incharge].filter(Boolean).join(' · '),
  },
  councils: {
    chip: 'Councils',
    one: 'council',
    title: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Student council 2026-27', required: true },
      { key: 'academicYear', label: 'Year (optional)', kind: 'text', placeholder: '2026-2027' },
      { key: 'description', label: 'About (optional)', kind: 'long' },
    ],
    subtitle: (row) => [row.councilType === 'house' ? `${row.houseName || 'House'} council` : 'School council', row.academicYear].filter(Boolean).join(' · '),
  },
}

export const valuesOf = (fields: RecordField[], row?: SetupRecord): RecordValues => Object.fromEntries(fields.map((field) => [field.key, row?.[field.key] == null ? '' : String(row[field.key])]))

export const POST_STATUS: Record<PostStatus, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  open: { label: 'Taking applications', tone: 'success' },
  accepting: { label: 'Taking applications', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
}

export const POST_FIELDS: RecordField[] = [
  { key: 'title', label: 'Post', kind: 'text', placeholder: 'Head boy', required: true },
  { key: 'seats', label: 'Seats', kind: 'number', placeholder: '1' },
  { key: 'description', label: 'What it involves (optional)', kind: 'long' },
  {
    key: 'preferredGender',
    label: 'Who can apply',
    kind: 'choice',
    options: [
      { value: '', label: 'Anyone' },
      { value: 'Boy', label: 'Boys' },
      { value: 'Girl', label: 'Girls' },
    ],
  },
  { key: 'preferredClasses', label: 'Classes (optional)', kind: 'text', placeholder: '11, 12', hint: 'Leave empty for every class.' },
]

export const postValues = (post?: CouncilPost): RecordValues => ({
  title: post?.title ?? '',
  seats: String(post?.seats ?? 1),
  description: post?.description ?? '',
  preferredGender: post?.preferredGender ?? '',
  preferredClasses: (post?.preferredClasses ?? []).join(', '),
})

/** A post sheet's values as the server takes them (seats a number). */
export const postInput = (values: RecordValues) => ({ ...values, ...(values.seats !== undefined ? { seats: Math.max(1, Number(values.seats) || 1) } : {}) })
