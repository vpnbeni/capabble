import type { LucideIcon } from 'lucide-react-native'
import { Image, StyleSheet, View, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, space, type Tone } from '@/theme/tokens'

import { Text } from './Text'

export const ICON_STROKE = 1.75

/** A Lucide glyph at the system stroke, in the given colour (default: ink-muted). */
export function Icon({ icon: Glyph, size: glyphSize = 16, color }: { icon: LucideIcon; size?: number; color?: string }) {
  const { colors } = useTheme()
  return <Glyph size={glyphSize} color={color ?? colors['ink-muted']} strokeWidth={ICON_STROKE} />
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

const styles = StyleSheet.create({
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
})
