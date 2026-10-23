import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, space, type Tone } from '@/theme/tokens'

import { Icon } from './primitives'
import { Text } from './Text'

/** Inline message on a screen: tone fill, tone outline, a title and the next step. */
export function Banner({ tone = 'info', title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors[`${tone}-soft`], borderColor: colors[`${tone}-border`] }]}
    >
      <Text variant="label" tone={tone}>
        {title}
      </Text>
      {children ? (
        <Text variant="small" tone="ink">
          {children}
        </Text>
      ) : null}
    </View>
  )
}

/** Empty list or card: a fact, then the next step. Not for errors. */
export function EmptyState({ icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={styles.empty}>
      {icon ? <Icon icon={icon} size={24} color={colors['ink-subtle']} /> : null}
      <Text variant="card-title" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space['space-2'] }}>{action}</View> : null}
    </View>
  )
}

/** Shimmering placeholder that sketches the real layout while it loads. */
export function Skeleton({ width = '100%', height = 16, round }: { width?: DimensionValue; height?: number; round?: boolean }) {
  const { colors } = useTheme()
  const [opacity] = useState(() => new Animated.Value(0.5))

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        opacity,
        borderRadius: round ? height / 2 : radius['radius-sm'],
        backgroundColor: colors['surface-sunken'],
      }}
    />
  )
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius['radius-md'],
    padding: space['space-3'],
    gap: space['space-1'],
  },
  empty: {
    alignItems: 'center',
    gap: space['space-2'],
    paddingVertical: space['space-8'],
    paddingHorizontal: space['space-4'],
  },
})
