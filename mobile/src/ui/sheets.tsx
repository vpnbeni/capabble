import { ChevronRight, X, type LucideIcon } from 'lucide-react-native'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, size, space } from '@/theme/tokens'

import { haptic } from './haptics'
import { KeyboardRevealProvider, useKeyboardAwareScroll } from './keyboard'
import { PressScale, useReduceMotion } from './motion'
import { Icon } from './primitives'
import { Text } from './Text'

/**
 * Keeps an overlay mounted while it animates out, and drives its 0 → 1 progress:
 * a spring in (damping ≈ 0.85, ~400ms), 200ms out; a plain fade under Reduce Motion.
 */
function usePresence(open: boolean) {
  const reduceMotion = useReduceMotion()
  const [progress] = useState(() => new Animated.Value(0))
  const [wasOpen, setWasOpen] = useState(open)
  const [closing, setClosing] = useState(false)
  // Closing starts in the render that sees `open` turn false, so the overlay stays mounted to animate out.
  if (open !== wasOpen) {
    setWasOpen(open)
    setClosing(!open)
  }

  useEffect(() => {
    if (open) {
      const animation = reduceMotion
        ? Animated.timing(progress, { toValue: 1, duration: 150, useNativeDriver: true })
        : Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 26, stiffness: 260, mass: 1 })
      animation.start()
    } else {
      Animated.timing(progress, { toValue: 0, duration: reduceMotion ? 150 : 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setClosing(false)
      })
    }
  }, [open, reduceMotion, progress])

  return { mounted: open || closing, progress, reduceMotion }
}

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  /** Names the task: "Apply for leave". */
  title: string
  description?: string
  /** medium (about half the screen, drags up to large) or large. */
  detent?: 'medium' | 'large'
  /** Full-width 50px buttons, stacked, the one filled button on top. */
  footer?: ReactNode
  children?: ReactNode
}

/**
 * The phone's sheet: a grabber, 24px top corners, a medium or large detent, over `scrim`.
 * Drag the top up for large, down to step back or close; the scrim and Android back close it.
 * Toasts never come from inside a sheet: show the result in the sheet.
 */
export function BottomSheet({ open, onClose, title, description, detent = 'medium', footer, children }: BottomSheetProps) {
  const { colors, shadows } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const { mounted, progress, reduceMotion } = usePresence(open)
  const [current, setCurrent] = useState(detent)
  // With the keyboard open the sheet sits on top of it, and the focused field scrolls into view above the footer.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const [footerHeight, setFooterHeight] = useState(0)
  const { cover, onScroll, reveal } = useKeyboardAwareScroll(scrollRef, footer ? footerHeight : 0)
  const room = screenHeight - insets.top - 10 - cover
  const [drag] = useState(() => new Animated.Value(0))
  // Each time the sheet opens it starts at its own detent.
  const [openedAt, setOpenedAt] = useState(open)
  if (open !== openedAt) {
    setOpenedAt(open)
    if (open) setCurrent(detent)
  }

  // Kept in a ref so the responder, created once, always sees the current detent and onClose.
  const state = useRef({ current, onClose })
  useLayoutEffect(() => {
    state.current = { current, onClose }
  })

  // The responder is created once and reads the ref only inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderMove: (_, gesture) => drag.setValue(Math.max(gesture.dy, -80)),
      onPanResponderRelease: (_, gesture) => {
        const { current: detentNow, onClose: close } = state.current
        const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
        if (gesture.dy < -40 && detentNow === 'medium') {
          haptic.light()
          setCurrent('large')
          drag.setValue(0)
        } else if (gesture.dy > 80 || gesture.vy > 1.2) {
          if (detentNow === 'large' && gesture.dy < 240) {
            haptic.light()
            setCurrent('medium')
            drag.setValue(0)
          } else {
            close()
            settle()
          }
        } else settle()
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  )

  if (!mounted) return null

  const translateY = reduceMotion
    ? drag
    : Animated.add(
        progress.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }),
        drag,
      )

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingBottom: cover }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors['surface-raised'],
              boxShadow: shadows['shadow-overlay'],
              paddingBottom: cover ? 0 : insets.bottom,
              transform: [{ translateY }],
              opacity: reduceMotion ? progress : 1,
            },
            current === 'large' ? { height: room } : { maxHeight: Math.min(screenHeight * 0.64, room) },
          ]}
        >
          <View {...pan.panHandlers}>
            <View style={[styles.grabber, { backgroundColor: colors['border-strong'] }]} />
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text variant="m-section" accessibilityRole="header">
                  {title}
                </Text>
                {description ? (
                  <Text variant="body" tone="muted" style={{ fontSize: 15, lineHeight: 22, marginTop: 2 }}>
                    {description}
                  </Text>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={7} style={[styles.close, { backgroundColor: colors['fill-control'] }]}>
                <X size={16} color={colors['ink-muted']} strokeWidth={2.25} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={scrollRef}
            style={current === 'large' ? { flex: 1 } : { flexShrink: 1 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={onScroll}
          >
            <KeyboardRevealProvider value={reveal}>{children}</KeyboardRevealProvider>
          </ScrollView>
          {footer ? (
            <View style={styles.foot} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

export type SheetAction = { label: string; icon?: LucideIcon; tone?: 'default' | 'danger'; onSelect: () => void }

type ActionSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  message?: string
  /** 2–6 actions; a destructive one is `danger` and goes last. */
  actions: SheetAction[]
  cancelLabel?: string
}

/** 2–6 actions on one thing, with Cancel set apart: the phone's replacement for the "…" Menu. */
export function ActionSheet({ open, onClose, title, message, actions, cancelLabel = 'Cancel' }: ActionSheetProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const { mounted, progress, reduceMotion } = usePresence(open)
  if (!mounted) return null

  const button = (label: string, onPress: () => void, options: { icon?: LucideIcon; danger?: boolean; bold?: boolean; first?: boolean }) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: pressed ? colors['surface-hover'] : colors['surface-raised'] },
        !options.first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors['border-strong'] },
      ]}
    >
      {options.icon ? <Icon icon={options.icon} size={20} color={options.danger ? colors['danger-ink'] : colors['accent-strong']} /> : null}
      <Text
        variant="body-lg"
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 19, lineHeight: 24, fontFamily: fontFamily[options.bold ? 600 : 400], color: options.danger ? colors['danger-ink'] : colors['accent-strong'] }}
      >
        {label}
      </Text>
    </Pressable>
  )

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingHorizontal: space['space-2'], paddingBottom: insets.bottom + space['space-2'] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
          <Pressable accessibilityLabel={cancelLabel} onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            gap: space['space-2'],
            opacity: reduceMotion ? progress : 1,
            transform: reduceMotion ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [screenHeight / 2, 0] }) }],
          }}
        >
          <View style={styles.group}>
            {title || message ? (
              <View style={[styles.actionHead, { backgroundColor: colors['surface-raised'], borderBottomColor: colors['border-strong'] }]}>
                {title ? (
                  <Text variant="label" tone="muted" style={{ fontFamily: fontFamily[600], textAlign: 'center' }}>
                    {title}
                  </Text>
                ) : null}
                {message ? (
                  <Text variant="small" tone="muted" style={{ textAlign: 'center', marginTop: 2 }}>
                    {message}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {actions.map((action, index) =>
              button(
                action.label,
                () => {
                  onClose()
                  action.onSelect()
                },
                { icon: action.icon, danger: action.tone === 'danger', first: index === 0 },
              ),
            )}
          </View>
          <View style={styles.group}>{button(cancelLabel, onClose, { bold: true, first: true })}</View>
        </Animated.View>
      </View>
    </Modal>
  )
}

type ActionBarProps = {
  /** Usually an amount or a count: "₹12,400", "32 of 34 marked". */
  summary: string
  detail?: string
  /** The verb: "Pay now", "Submit", "Send request". */
  label: string
  icon?: LucideIcon
  onPress: () => void
}

/**
 * The floating bar with the screen's one main action. MobileScreen places it 12px above the tab bar.
 * Hide it when there's nothing to do; never show it disabled. Fire `haptic.success()` when the action completes.
 */
export function ActionBar({ summary, detail, label, icon, onPress }: ActionBarProps) {
  const { colors, shadows } = useTheme()
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={[summary, detail, label].filter(Boolean).join(', ')}
      scale={0.98}
      onPress={onPress}
      style={[styles.bar, { backgroundColor: colors['accent-strong'], boxShadow: shadows['shadow-float'] }]}
      pressedStyle={{ backgroundColor: colors['accent-strong-hover'] }}
    >
      {icon ? (
        <View style={[styles.barIcon, { backgroundColor: colors['on-accent'] }]}>
          <Icon icon={icon} size={20} color={colors['accent-strong']} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="m-nav-title" numeric numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: colors['on-accent'], fontFamily: fontFamily[700] }}>
          {summary}
        </Text>
        {detail ? (
          <Text variant="label" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: colors['on-accent'], opacity: 0.92 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.barCta}>
        <Text variant="m-headline" maxFontSizeMultiplier={1.3} style={{ color: colors['on-accent'] }}>
          {label}
        </Text>
        <Icon icon={ChevronRight} size={18} color={colors['on-accent']} />
      </View>
    </PressScale>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius['radius-2xl'], borderTopRightRadius: radius['radius-2xl'] },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space['space-3'], paddingTop: space['space-3'], paddingRight: space['space-4'], paddingBottom: space['space-2'], paddingLeft: space['space-5'] },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  body: { paddingTop: space['space-2'], paddingHorizontal: space['space-5'], paddingBottom: space['space-4'], gap: space['space-4'] },
  foot: { gap: space['space-2'], paddingTop: space['space-3'], paddingHorizontal: space['space-5'], paddingBottom: space['space-4'] },
  group: { borderRadius: 14, overflow: 'hidden' },
  actionHead: { paddingVertical: 14, paddingHorizontal: space['space-4'], borderBottomWidth: StyleSheet.hairlineWidth },
  action: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space['space-2'] },
  bar: {
    height: size['action-bar-height'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingLeft: space['space-4'],
    paddingRight: space['space-3'],
    borderRadius: radius['radius-xl'],
  },
  barIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  barCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
})
