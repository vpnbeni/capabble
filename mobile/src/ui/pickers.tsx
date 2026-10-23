import { Check, ChevronDown } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { formatTime } from '@/lib/format'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space } from '@/theme/tokens'

import { ListRow } from './layout'
import { Sheet } from './overlays'
import { Icon } from './primitives'
import { Text } from './Text'

type Option = { value: string; label: string; meta?: string }

type SelectFieldProps = {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  error?: string | null
  disabled?: boolean
}

/** A labelled field that opens a sheet listing the options (the phone's Select). One choice, no free text. */
export function SelectField({ label, options, value, onChange, placeholder = 'Choose', hint, error, disabled }: SelectFieldProps) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <View style={{ gap: space['space-1'] + 2 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { backgroundColor: disabled ? colors['surface-sunken'] : colors.surface, borderColor: error ? colors['danger-solid'] : colors['border-control'] },
          error && { borderWidth: 2 },
        ]}
      >
        <Text variant="body-lg" tone={selected ? 'ink' : 'subtle'} numberOfLines={1} style={{ flex: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon icon={ChevronDown} size={16} />
      </Pressable>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ marginHorizontal: -space['space-4'] }}>
          {options.map((option, index) => (
            <ListRow
              key={option.value}
              primary={option.label}
              secondary={option.meta}
              lines={2}
              divider={index < options.length - 1}
              trailing={option.value === value ? <Icon icon={Check} size={20} color={colors['accent-strong']} /> : <View style={{ width: 20 }} />}
              onPress={() => {
                onChange(option.value)
                setOpen(false)
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  )
}

export type Slot = { start: string; end: string; open: boolean }

/** Times from a fixed set. Taken slots stay visible, struck through, so the day's shape is clear. */
export function SlotPicker({
  label,
  slots,
  value,
  onChange,
  emptyText,
  hint,
}: {
  label: string
  slots: Slot[]
  value: string
  onChange: (start: string) => void
  emptyText: string
  hint?: string
}) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space['space-1'] + 2 }}>
      <Text variant="label">{label}</Text>
      {slots.length === 0 ? (
        <Text variant="body" tone="muted">
          {emptyText}
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" style={styles.slots}>
          {slots.map((slot) => {
            const selected = slot.start === value
            return (
              <Pressable
                key={slot.start}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: !slot.open }}
                accessibilityLabel={`${formatTime(slot.start)}${slot.open ? '' : ', taken'}`}
                disabled={!slot.open}
                onPress={() => onChange(slot.start)}
                style={[
                  styles.slot,
                  selected
                    ? { backgroundColor: colors['accent-soft'], borderColor: colors['accent-strong'] }
                    : { backgroundColor: slot.open ? colors.surface : colors['surface-sunken'], borderColor: slot.open ? colors['border-control'] : colors.border },
                ]}
              >
                <Text
                  variant="label"
                  numeric
                  style={[
                    { color: selected ? colors['accent-soft-ink'] : slot.open ? colors.ink : colors['ink-disabled'] },
                    !slot.open && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {formatTime(slot.start)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
      {hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    minHeight: size['control-lg'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-2'],
    paddingHorizontal: space['space-3'],
    borderWidth: 1,
    borderRadius: radius['radius-sm'],
  },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] },
  slot: {
    minWidth: 88,
    minHeight: size['control-lg'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['space-3'],
    borderWidth: 1,
    borderRadius: radius['radius-sm'],
  },
})
