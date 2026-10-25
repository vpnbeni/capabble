import type { LucideIcon } from 'lucide-react-native'
import { useLayoutEffect, useRef, useState } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, space } from '@/theme/tokens'

import { haptic } from './haptics'
import { useReduceMotion } from './motion'
import { Icon } from './primitives'
import { Text } from './Text'

export type SwipeAction = { label: string; icon?: LucideIcon; tone?: 'accent' | 'neutral' | 'danger'; onPress: () => void }

type SwipeRowProps = {
  title: string
  subtitle?: string
  /** A time or date, top right. */
  meta?: string
  unread?: boolean
  /** Up to two; the destructive one last (rightmost). Each must also be on the detail screen. */
  actions?: SwipeAction[]
  defaultRevealed?: boolean
  onPress?: () => void
  /** Hairline above the row (all but the first in a card). */
  divider?: boolean
}

const ACTION_WIDTH = 66
const GAP = 6
const TRAY_PAD = 8

/**
 * A list row that reveals up to two actions when swiped left (Mail-style). The text narrows to make
 * room; past halfway the actions snap open; tapping the row closes them. Put rows in a ListGroup.
 */
export function SwipeRow({ title, subtitle, meta, unread, actions = [], defaultRevealed, onPress, divider }: SwipeRowProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const shown = actions.slice(0, 2)
  const full = shown.length ? shown.length * ACTION_WIDTH + (shown.length - 1) * GAP + TRAY_PAD : 0
  const [open, setOpen] = useState(!!defaultRevealed && full > 0)
  const [width] = useState(() => new Animated.Value(open ? full : 0))
  const drag = useRef({ start: 0, past: false })

  const snap = (next: boolean) => {
    setOpen(next)
    const toValue = next ? full : 0
    if (reduceMotion) width.setValue(toValue)
    else Animated.spring(width, { toValue, useNativeDriver: false, speed: 18, bounciness: 3 }).start()
  }

  const state = useRef({ open, full, snap })
  useLayoutEffect(() => {
    state.current = { open, full, snap }
  })

  // The responder is created once and reads the ref only inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => state.current.full > 0 && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => {
        drag.current = { start: state.current.open ? state.current.full : 0, past: state.current.open }
      },
      onPanResponderMove: (_, gesture) => {
        const { full: max } = state.current
        const next = Math.min(max + 24, Math.max(0, drag.current.start - gesture.dx))
        width.setValue(next)
        const past = next > max / 2
        if (past !== drag.current.past) {
          drag.current.past = past
          if (past) haptic.light()
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const { full: max, snap: settle } = state.current
        settle(drag.current.start - gesture.dx > max / 2 || gesture.vx < -0.8)
      },
      onPanResponderTerminate: () => state.current.snap(state.current.open),
    }),
  )

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[unread ? 'Unread' : null, title, subtitle, meta].filter(Boolean).join(', ')}
      accessibilityActions={[...(onPress ? [{ name: 'activate' }] : []), ...shown.map((action) => ({ name: action.label, label: action.label }))]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') onPress?.()
        else shown.find((action) => action.label === event.nativeEvent.actionName)?.onPress()
      }}
      style={[styles.row, { backgroundColor: colors.surface }]}
    >
      {divider ? <View style={[styles.rule, { backgroundColor: colors['border-strong'] }]} /> : null}
      <Pressable
        onPress={() => (open ? snap(false) : onPress?.())}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: colors['fill-pressed'] }]}
      >
        <View style={[styles.unread, { backgroundColor: unread ? colors.accent : 'transparent' }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.line}>
            <Text variant="m-headline" numberOfLines={1} style={{ flex: 1 }}>
              {title}
            </Text>
            {meta ? (
              <Text variant="m-subhead" tone="subtle" numeric numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {subtitle ? (
            <Text variant="m-subhead" tone="muted" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {full ? (
        <Animated.View style={[styles.actions, { width }]}>
          <View style={[styles.tray, { width: full }]}>
            {shown.map((action) => {
              const tone = action.tone ?? 'neutral'
              const ground = tone === 'accent' ? colors['accent-soft'] : colors[`${tone}-soft`]
              const ink = tone === 'accent' ? colors['accent-soft-ink'] : colors[`${tone}-ink`]
              return (
                <Pressable
                  key={action.label}
                  importantForAccessibility="no"
                  accessibilityElementsHidden
                  onPress={() => {
                    snap(false)
                    action.onPress()
                  }}
                  style={({ pressed }) => [styles.action, { backgroundColor: ground }, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  {action.icon ? <Icon icon={action.icon} size={20} color={ink} /> : null}
                  <Text variant="label" maxFontSizeMultiplier={1.3} style={{ color: ink, fontFamily: fontFamily[600], lineHeight: 16 }}>
                    {action.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rule: { position: 'absolute', top: 0, left: 28, right: 0, height: StyleSheet.hairlineWidth, zIndex: 1 },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space['space-2'], paddingVertical: space['space-3'], paddingLeft: 10, paddingRight: space['space-4'] },
  unread: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space['space-2'] },
  actions: { overflow: 'hidden', alignItems: 'flex-end' },
  tray: { flex: 1, flexDirection: 'row', gap: GAP, paddingVertical: space['space-2'], paddingRight: TRAY_PAD },
  action: { width: ACTION_WIDTH, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
})
