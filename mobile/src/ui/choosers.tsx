import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, space, type TileIndex } from '@/theme/tokens'

import { ListGroup, ListItem } from './content'
import { haptic } from './haptics'
import { useReduceMotion } from './motion'
import { Avatar, Icon } from './primitives'
import { BottomSheet } from './sheets'
import { Text } from './Text'

export type ChoiceOption<V extends string = string> = {
  value: V
  label: string
  meta?: string
  icon?: LucideIcon
  tile?: TileIndex
  avatar?: ReactNode
  disabled?: boolean
}

type OptionListBase<V extends string> = {
  options: ChoiceOption<V>[]
  header?: string
  footer?: string
  /** Accessible name of the group. */
  label?: string
}

type OptionListProps<V extends string> = OptionListBase<V> &
  ({ multiple?: false; value: V | null; onChange: (value: V) => void } | { multiple: true; value: V[]; onChange: (value: V[]) => void })

/**
 * A grouped list where tapping a row chooses it: the phone's Select, RadioGroup and multi-select in one.
 * Single choice shows a check mark; `multiple` shows round check circles.
 */
export function OptionList<V extends string>(props: OptionListProps<V>) {
  const { colors } = useTheme()
  const { options, header, footer, label } = props
  const chosen = (value: V) => (props.multiple ? props.value.includes(value) : props.value === value)

  const choose = (value: V) => {
    haptic.selection()
    if (props.multiple) props.onChange(chosen(value) ? props.value.filter((entry) => entry !== value) : [...props.value, value])
    else props.onChange(value)
  }

  return (
    <View accessibilityRole={props.multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
      <ListGroup header={header} footer={footer}>
        {options.map((option, index) => {
          const on = chosen(option.value)
          const mark = props.multiple ? (
            <View style={[styles.circle, on ? { backgroundColor: colors['accent-strong'] } : { boxShadow: `inset 0 0 0 1.5px ${colors['border-control']}` }]}>
              {on ? <Check size={14} color={colors['on-accent']} strokeWidth={3} /> : null}
            </View>
          ) : on ? (
            <Icon icon={Check} size={20} color={colors['accent-strong']} />
          ) : (
            <View style={{ width: 20 }} />
          )
          return (
            <View key={option.value} accessibilityRole={props.multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: on, disabled: option.disabled }}>
              <ListItem
                first={index === 0}
                item={{
                  title: option.label,
                  subtitle: option.meta,
                  icon: option.icon,
                  tile: option.tile,
                  avatar: option.avatar,
                  accessory: mark,
                  chevron: false,
                  lines: 2,
                  onPress: option.disabled ? undefined : () => choose(option.value),
                }}
              />
            </View>
          )
        })}
      </ListGroup>
    </View>
  )
}

export type ChipItem<V extends string = string> = { id: V; label: string; count?: number; avatar?: { name: string; src?: string | null } }

/** One-tap filters above a list, scrolling sideways. Exactly one is chosen, filled with `ink` (never the accent). */
export function ChipRail<V extends string>({ items, value, onChange, label }: { items: ChipItem<V>[]; value: V; onChange: (value: V) => void; label: string }) {
  const { colors } = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} style={styles.chipBleed} contentContainerStyle={styles.chipRail}>
      {items.map((item) => {
        const active = item.id === value
        const ink = active ? colors['ink-inverse'] : colors.ink
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.count !== undefined ? `${item.label}, ${item.count}` : item.label}
            onPress={() => {
              if (active) return
              haptic.selection()
              onChange(item.id)
            }}
            style={[
              styles.chip,
              item.avatar && { paddingLeft: 4 },
              active ? { backgroundColor: colors.ink } : { backgroundColor: colors.surface, boxShadow: `inset 0 0 0 1px ${colors['border-strong']}` },
            ]}
          >
            {item.avatar ? <Avatar name={item.avatar.name} src={item.avatar.src} size={28} /> : null}
            <Text variant="body" maxFontSizeMultiplier={1.3} style={{ color: ink, fontFamily: fontFamily[500] }}>
              {item.label}
            </Text>
            {item.count !== undefined ? (
              <Text variant="body" numeric maxFontSizeMultiplier={1.3} style={{ color: ink, opacity: 0.7 }}>
                {item.count}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/**
 * The iOS segmented control: 2–4 short options that switch a view or a value at once.
 * `label` is the accessible name; put a visible label above it when the screen needs one.
 */
export function SegmentedControl<V extends string>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V; onChange: (value: V) => void; label: string }) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const segment = width ? (width - 4) / options.length : 0
  const [position] = useState(() => new Animated.Value(index))

  useEffect(() => {
    if (reduceMotion) position.setValue(index)
    else Animated.spring(position, { toValue: index, useNativeDriver: true, speed: 18, bounciness: 4 }).start()
  }, [index, reduceMotion, position])

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.segTrack, { backgroundColor: colors['fill-control'] }]}
    >
      {segment ? (
        <Animated.View
          style={[
            styles.segThumb,
            {
              width: segment,
              backgroundColor: colors['surface-raised'],
              transform: [{ translateX: Animated.multiply(position, segment) }],
            },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => {
              if (active) return
              haptic.selection()
              onChange(option.value)
            }}
            style={styles.segOption}
          >
            <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily[active ? 600 : 500], lineHeight: 18 }}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export type Slot = { value: string; label: string; taken?: boolean }

type SlotPickerProps = {
  slots: Slot[]
  value: string | null
  onChange: (value: string) => void
  label?: string
  hint?: string
  /** A sentence for a day with no free slots, naming the next day that has one. */
  emptyText?: string
}

/** Times from a fixed set, three across. Taken slots stay visible, sunken and struck through. */
export function SlotPicker({ slots, value, onChange, label, hint, emptyText }: SlotPickerProps) {
  const { colors } = useTheme()
  const rows = Array.from({ length: Math.ceil(slots.length / 3) }, (_, index) => slots.slice(index * 3, index * 3 + 3))
  const free = slots.some((slot) => !slot.taken)

  return (
    <View style={{ gap: space['space-2'] }}>
      {label ? (
        <Text variant="label" style={{ fontSize: 14, lineHeight: 20 }}>
          {label}
        </Text>
      ) : null}
      {!free && emptyText ? (
        <Text variant="body" tone="muted">
          {emptyText}
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: space['space-2'] }}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: 'row', gap: space['space-2'] }}>
            {[0, 1, 2].map((column) => {
              const slot = row[column]
              if (!slot) return <View key={column} style={{ flex: 1 }} />
              const active = slot.value === value
              return (
                <Pressable
                  key={slot.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled: slot.taken }}
                  accessibilityLabel={slot.taken ? `${slot.label}, taken` : slot.label}
                  disabled={slot.taken}
                  onPress={() => {
                    haptic.selection()
                    onChange(slot.value)
                  }}
                  style={[
                    styles.slot,
                    active
                      ? { backgroundColor: colors['accent-strong'] }
                      : slot.taken
                        ? { backgroundColor: colors['surface-sunken'] }
                        : { backgroundColor: colors.surface, boxShadow: `inset 0 0 0 1px ${colors['border-control']}` },
                  ]}
                >
                  <Text
                    variant="body"
                    numeric
                    style={[
                      { fontSize: 15, fontFamily: fontFamily[active ? 600 : 500], color: active ? colors['on-accent'] : slot.taken ? colors['ink-subtle'] : colors.ink },
                      slot.taken && { textDecorationLine: 'line-through' },
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
      {hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export type SwitcherStudent = { id: string; name: string; meta?: string; src?: string | null }

/**
 * Whose screen this is, as a pill in the nav bar; tap for a sheet of the parent's children.
 * With one child it is just the avatar, no chevron.
 */
export function ChildSwitcher({ students, value, onChange, title = 'Show details for' }: { students: SwitcherStudent[]; value: string; onChange: (id: string) => void; title?: string }) {
  const { colors, shadows } = useTheme()
  const [open, setOpen] = useState(false)
  const current = students.find((student) => student.id === value) ?? students[0]
  if (!current) return null
  if (students.length < 2) return <Avatar name={current.name} src={current.src} size={32} />

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Showing ${current.name}. Change child`}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? colors['surface-hover'] : colors.surface, boxShadow: shadows['shadow-card-m'] }]}
      >
        <Avatar name={current.name} src={current.src} size={28} />
        <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily[600], maxWidth: 110 }}>
          {current.name.split(' ')[0]}
        </Text>
        <Icon icon={ChevronDown} size={16} color={colors['ink-muted']} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <OptionList
          label={title}
          value={current.id}
          onChange={(id) => {
            onChange(id)
            setOpen(false)
          }}
          options={students.map((student) => ({
            value: student.id,
            label: student.name,
            meta: student.meta,
            avatar: <Avatar name={student.name} src={student.src} size={32} />,
          }))}
        />
      </BottomSheet>
    </>
  )
}

const styles = StyleSheet.create({
  circle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipBleed: { marginHorizontal: -space['space-4'], flexGrow: 0 },
  chipRail: { gap: space['space-2'], paddingHorizontal: space['space-4'], paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius['radius-full'] },
  segTrack: { flexDirection: 'row', padding: 2, borderRadius: 9 },
  segThumb: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 7,
    boxShadow: '0 3px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)',
  },
  segOption: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space['space-2'] },
  slot: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 4, paddingRight: 10, borderRadius: radius['radius-full'] },
})
