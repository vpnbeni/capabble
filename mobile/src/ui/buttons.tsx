import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'

import { haptic } from './haptics'
import { PressScale, useReduceMotion } from './motion'
import { Icon } from './primitives'
import { Text } from './Text'

export type MobileButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive'

type MobileButtonProps = {
  /** filled: the one main action; tinted: a strong second; gray: neutral; plain: text; destructive: soft red. */
  variant?: MobileButtonVariant
  /** large 50px (sheet footers, form submits, status screens), medium 36px (in cards), small 28px pill (in rows). */
  size?: 'large' | 'medium' | 'small'
  icon?: LucideIcon
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  onPress?: () => void
  /** Required for icon-only buttons (no children). */
  'aria-label'?: string
  /** Starts with a verb, 1–3 words, plus the amount when money moves: "Pay ₹12,400". */
  children?: ReactNode
}

const HEIGHT = { large: 50, medium: 36, small: 28 }
const CORNER = { large: 14, medium: 10, small: radius['radius-full'] }
const PADDING = { large: 20, medium: 14, small: 10 }
const LABEL = {
  large: { fontSize: 16, lineHeight: 22 },
  medium: { fontSize: 15, lineHeight: 20 },
  small: { fontSize: 13, lineHeight: 18 },
}

/** The app's buttons in Apple's five styles. One filled button per view; on a screen with an ActionBar, the bar is the filled action. */
export function MobileButton({
  variant = 'filled',
  size = 'large',
  icon,
  fullWidth,
  loading,
  disabled,
  onPress,
  'aria-label': ariaLabel,
  children,
}: MobileButtonProps) {
  const { colors } = useTheme()
  const inactive = disabled || loading
  const iconOnly = !children
  const [fill, ink] = {
    filled: [colors['accent-strong'], colors['on-accent']],
    tinted: [colors['accent-soft'], colors['accent-soft-ink']],
    gray: [colors['fill-control'], colors.ink],
    plain: ['transparent', colors['accent-strong']],
    destructive: [colors['danger-soft'], colors['danger-ink']],
  }[variant]

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'large' ? 0 : (44 - HEIGHT[size]) / 2}
      style={[
        styles.button,
        {
          height: HEIGHT[size],
          borderRadius: iconOnly ? radius['radius-full'] : CORNER[size],
          paddingHorizontal: iconOnly ? 0 : variant === 'plain' && size !== 'small' ? space['space-2'] : PADDING[size],
          backgroundColor: fill,
        },
        iconOnly && { width: HEIGHT[size] },
        fullWidth && { alignSelf: 'stretch', width: '100%' },
        inactive && { opacity: 0.45 },
      ]}
      pressedStyle={variant === 'filled' ? { backgroundColor: colors['accent-strong-hover'] } : undefined}
    >
      {loading ? <ActivityIndicator color={ink} size="small" /> : icon ? <Icon icon={icon} size={size === 'small' ? 14 : 18} color={ink} /> : null}
      {children ? (
        <Text variant="m-headline" numberOfLines={1} maxFontSizeMultiplier={1.3} style={[LABEL[size], { color: ink }]}>
          {children}
        </Text>
      ) : null}
    </PressScale>
  )
}

/** A setting that applies at once: 51×31 track, accent-strong when on. Selection haptic. */
export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const [position] = useState(() => new Animated.Value(value ? 1 : 0))

  useEffect(() => {
    if (reduceMotion) position.setValue(value ? 1 : 0)
    else Animated.spring(position, { toValue: value ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start()
  }, [value, reduceMotion, position])

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={7}
      onPress={() => {
        haptic.selection()
        onChange(!value)
      }}
      style={disabled && { opacity: 0.45 }}
    >
      <View
        style={[
          styles.track,
          value ? { backgroundColor: colors['accent-strong'] } : { backgroundColor: colors['fill-control'], boxShadow: `inset 0 0 0 1.5px ${colors['border-control']}` },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: value ? colors['on-accent'] : colors['surface-raised'],
              transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', gap: 6 },
  track: { width: 51, height: 31, borderRadius: radius['radius-full'] },
  thumb: { position: 'absolute', top: 2, left: 2, width: 27, height: 27, borderRadius: radius['radius-full'], boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.12)' },
})
