import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space, type Tone } from '@/theme/tokens'

import { Text } from './Text'

export const ICON_STROKE = 1.75

/** A Lucide glyph at the system stroke, in the given colour (default: ink-muted). */
export function Icon({ icon: Glyph, size: glyphSize = 16, color }: { icon: LucideIcon; size?: number; color?: string }) {
  const { colors } = useTheme()
  return <Glyph size={glyphSize} color={color ?? colors['ink-muted']} strokeWidth={ICON_STROKE} />
}

type ButtonProps = {
  /** Starts with a verb and says the outcome: "Sign in", "Pay ₹12,400". */
  label: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
}

/** One primary per screen. Height is `control-lg` (44px): the minimum touch target. */
export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, fullWidth }: ButtonProps) {
  const { colors } = useTheme()
  const inactive = disabled || loading

  const fill = {
    primary: [colors['accent-strong'], colors['accent-strong-hover']],
    danger: [colors['danger-strong'], colors['danger-strong']],
    secondary: [colors.surface, colors['surface-hover']],
    tertiary: ['transparent', colors['surface-hover']],
  }[variant]
  const ink = {
    primary: colors['on-accent'],
    danger: colors['on-danger'],
    secondary: colors.ink,
    tertiary: colors['accent-strong'],
  }[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? fill[1] : fill[0] },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors['border-control'] },
        fullWidth && { alignSelf: 'stretch' },
        inactive && { opacity: 0.55 },
      ]}
    >
      {loading ? <ActivityIndicator color={ink} size="small" /> : icon ? <Icon icon={icon} color={ink} /> : null}
      <Text variant="body-lg" style={{ color: ink, fontFamily: 'Inter_500Medium' }}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A short status: one to three words, a tone and a dot. Categories pass `dot={false}`. */
export function Badge({ label, tone = 'neutral', dot = true }: { label: string; tone?: Tone; dot?: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.badge, { backgroundColor: colors[`${tone}-soft`] }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: colors[`${tone}-solid`] }]} /> : null}
      <Text variant="caption" tone={tone}>
        {label}
      </Text>
    </View>
  )
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

/** A person's photo or initials; `square` for a school logo (always on a white tile). */
export function Avatar({ name, src, size: side = 40, square }: { name: string; src?: string | null; size?: number; square?: boolean }) {
  const { colors } = useTheme()
  const shape: ViewStyle = {
    width: side,
    height: side,
    borderRadius: square ? radius['radius-sm'] : side / 2,
    backgroundColor: square ? '#FFFFFF' : colors['accent-soft'],
    borderWidth: square ? StyleSheet.hairlineWidth : 0,
    borderColor: colors.border,
  }
  return (
    <View style={[styles.avatar, shape]} accessibilityLabel={name}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: side, height: side }} resizeMode={square ? 'contain' : 'cover'} />
      ) : (
        <Text variant={side >= 40 ? 'label' : 'caption'} style={{ color: colors['accent-soft-ink'] }}>
          {initials(name)}
        </Text>
      )}
    </View>
  )
}

type CardProps = {
  title?: string
  subtitle?: string
  action?: ReactNode
  children?: ReactNode
  /** No body padding: the body is a list of ListRows. */
  flush?: boolean
}

/** The basic container: surface, hairline border, radius-lg. No nested cards. */
export function Card({ title, subtitle, action, children, flush }: CardProps) {
  const { colors, scheme } = useTheme()
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        scheme === 'light' && [styles.cardShadow, { shadowColor: colors.ink }],
      ]}
    >
      {title ? (
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="card-title">{title}</Text>
            {subtitle ? (
              <Text variant="small" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      <View style={flush ? undefined : [styles.cardBody, !title && { paddingTop: space['space-4'] }]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: size['control-lg'],
    paddingHorizontal: space['space-4'],
    borderRadius: radius['radius-sm'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['space-2'],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space['space-1'] + 2,
    paddingHorizontal: space['space-2'],
    paddingVertical: 2,
    borderRadius: radius['radius-sm'],
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius['radius-lg'], overflow: 'hidden' },
  // shadow-xs: cards get a border plus this, light theme only.
  cardShadow: {
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingHorizontal: space['space-4'],
    paddingTop: space['space-4'],
    paddingBottom: space['space-2'],
  },
  cardBody: { padding: space['space-4'], paddingTop: space['space-2'] },
})
