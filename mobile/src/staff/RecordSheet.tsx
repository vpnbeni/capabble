import { useState } from 'react'
import { View } from 'react-native'

import { formatDayKey, schoolToday } from '@/lib/format'
import { space } from '@/theme/tokens'
import { BottomSheet, Callout, ListGroup, MobileButton, MobileTextField, MonthPicker, OptionList } from '@/ui'

/** One field of a simple record: text, a long text, a day (YYYY-MM-DD), or one of a few options. */
export type RecordField =
  | { key: string; label: string; kind: 'text' | 'long' | 'number'; placeholder?: string; required?: boolean; hint?: string }
  | { key: string; label: string; kind: 'date' }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[] }

export type RecordValues = Record<string, string>

/**
 * A sheet to add or change a simple record (an activity, a tour, a route): text fields, days from
 * a calendar and choices in lists, each opened inside the same sheet. Saving an existing record
 * hands back only the fields that changed; a new one hands back all filled fields.
 */
export function RecordSheet({
  open,
  onClose,
  title,
  fields,
  initial,
  isNew,
  saving,
  error,
  onSave,
  onRemove,
  removeLabel = 'Remove',
}: {
  open: boolean
  onClose: () => void
  title: string
  fields: RecordField[]
  initial: RecordValues
  isNew: boolean
  saving: boolean
  error: string | null
  onSave: (changes: RecordValues, all: RecordValues) => void
  onRemove?: () => void
  removeLabel?: string
}) {
  const [values, setValues] = useState<RecordValues>(initial)
  const [picking, setPicking] = useState<string | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  // Start from the record as it is each time the sheet opens.
  const [shownFor, setShownFor] = useState<RecordValues | null>(null)
  if (open && shownFor !== initial) {
    setShownFor(initial)
    setValues(initial)
    setPicking(null)
    setMissing(null)
  }

  const field = fields.find((row) => row.key === picking)
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))

  const save = () => {
    const empty = fields.find((row) => 'required' in row && row.required && !values[row.key]?.trim())
    if (empty) return setMissing(`Enter the ${empty.label.toLowerCase()}.`)
    setMissing(null)
    const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))
    const changes = isNew
      ? Object.fromEntries(Object.entries(trimmed).filter(([, value]) => value !== ''))
      : Object.fromEntries(Object.entries(trimmed).filter(([key, value]) => value !== (initial[key] ?? '').trim()))
    onSave(changes, trimmed)
  }

  const rows = fields.filter((row) => row.kind === 'date' || row.kind === 'choice')
  const texts = fields.filter((row): row is Extract<RecordField, { kind: 'text' | 'long' | 'number' }> => row.kind !== 'date' && row.kind !== 'choice')

  return (
    <BottomSheet
      open={open}
      onClose={() => (picking ? setPicking(null) : onClose())}
      title={field ? field.label : title}
      detent="large"
      footer={
        picking ? undefined : (
          <MobileButton fullWidth loading={saving} onPress={save}>
            {isNew ? 'Add' : 'Save'}
          </MobileButton>
        )
      }
    >
      {field?.kind === 'date' ? (
        <MonthPicker value={values[field.key] || schoolToday()} today={schoolToday()} onChange={(value) => (set(field.key, value), setPicking(null))} />
      ) : field?.kind === 'choice' ? (
        <OptionList label={field.label} value={values[field.key] ?? ''} onChange={(value) => (set(field.key, value), setPicking(null))} options={field.options} />
      ) : (
        <View style={{ gap: space['space-4'] }}>
          {missing || error ? (
            <Callout tone="danger" title="Not saved">
              {missing ?? error}
            </Callout>
          ) : null}
          {texts.map((row) => (
            <MobileTextField
              key={row.key}
              label={row.label}
              hint={row.hint}
              placeholder={row.placeholder}
              type={row.kind === 'number' ? 'number' : 'text'}
              multiline={row.kind === 'long'}
              value={values[row.key] ?? ''}
              onChangeText={(value: string) => set(row.key, value)}
              maxLength={row.kind === 'long' ? 4000 : 200}
            />
          ))}
          {rows.length ? (
            <ListGroup
              items={rows.map((row) => ({
                title: row.label,
                value:
                  row.kind === 'date'
                    ? values[row.key]
                      ? formatDayKey(values[row.key].slice(0, 10), { weekday: 'short' })
                      : 'Choose'
                    : row.kind === 'choice'
                      ? (row.options.find((option) => option.value === values[row.key])?.label ?? 'Choose')
                      : undefined,
                onPress: () => setPicking(row.key),
              }))}
            />
          ) : null}
          {onRemove ? <ListGroup items={[{ title: removeLabel, tone: 'danger', onPress: onRemove }]} /> : null}
        </View>
      )}
    </BottomSheet>
  )
}
