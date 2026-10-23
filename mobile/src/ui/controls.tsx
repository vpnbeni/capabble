import type { LucideIcon } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space } from '@/theme/tokens'

import { Icon } from './primitives'
import { Text } from './Text'

/** An icon-only button with a 44px touch target. `label` is required: it is what screen readers say. */
export function IconButton({ icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors['surface-hover'] }, disabled && { opacity: 0.4 }]}
    >
      <Icon icon={icon} size={20} color={colors.ink} />
    </Pressable>
  )
}

type Option<V extends string> = { value: V; label: string }

/** One of 2–4 short options that applies at once (an RSVP answer, a view). Not for switching screens. */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<V>[]
  value: V
  onChange: (value: V) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space['space-1'] + 2 }}>
      <Text variant="label">{label}</Text>
      <View accessibilityRole="radiogroup" style={[styles.track, { backgroundColor: colors['surface-sunken'] }]}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.segment,
                selected && { backgroundColor: colors.surface, borderColor: colors['border-control'], borderWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text variant="label" style={{ color: selected ? colors.ink : colors['ink-muted'] }}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Quick filters above a list (which child). The selected chip is accent-soft. Scrolls sideways when long. */
export function Chips<V extends string>({ options, value, onChange, label }: { options: Option<V>[]; value: V; onChange: (value: V) => void; label: string }) {
  const { colors } = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: colors['accent-soft'], borderColor: colors['accent-soft'] }
                : { backgroundColor: colors.surface, borderColor: colors['border-control'] },
            ]}
          >
            <Text variant="label" style={{ color: selected ? colors['accent-soft-ink'] : colors.ink }}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  iconButton: {
    width: size['control-lg'],
    height: size['control-lg'],
    borderRadius: radius['radius-full'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flexDirection: 'row', padding: 2, borderRadius: radius['radius-md'] },
  segment: {
    flex: 1,
    minHeight: size['control-lg'] - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius['radius-sm'],
  },
  chips: { gap: space['space-2'] },
  chip: {
    minHeight: 36,
    paddingHorizontal: space['space-3'],
    borderRadius: radius['radius-full'],
    borderWidth: 1,
    justifyContent: 'center',
  },
})
