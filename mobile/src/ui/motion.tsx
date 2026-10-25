import { BlurView } from 'expo-blur'
import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'

/** True while the person has Reduce Motion on: swap slides and scales for short cross-fades. */
export function useReduceMotion() {
  return useAccessibilitySetting('reduceMotionChanged', readReduceMotion)
}

/** True while Reduce Transparency is on (iOS): bars become solid `surface`. */
export function useReduceTransparency() {
  return useAccessibilitySetting('reduceTransparencyChanged', readReduceTransparency)
}

// Each setting exists only on some platforms (Reduce Transparency is iOS only): read false elsewhere.
const readReduceMotion = () => AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false)
const readReduceTransparency = () =>
  Platform.OS === 'ios' ? AccessibilityInfo.isReduceTransparencyEnabled() : Promise.resolve(false)

function useAccessibilitySetting(event: 'reduceMotionChanged' | 'reduceTransparencyChanged', read: () => Promise<boolean>) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    read().then(setOn).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener(event, setOn)
    return () => subscription.remove()
  }, [event, read])
  return on
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type PressScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  /** 0.97 for cards and bars, 0.94 for shortcut tiles. */
  scale?: number
  style?: StyleProp<ViewStyle>
  /** Fill while pressed, under the content (default: none). */
  pressedStyle?: StyleProp<ViewStyle>
  children: ReactNode
}

/** Responds under the finger: scales down at once, springs back (design system: Motion). */
export function PressScale({ scale = 0.97, style, pressedStyle, children, onPressIn, onPressOut, ...props }: PressScaleProps) {
  const reduceMotion = useReduceMotion()
  const [value] = useState(() => new Animated.Value(1))
  const [pressed, setPressed] = useState(false)

  return (
    <AnimatedPressable
      {...props}
      style={[style, pressed && pressedStyle, { transform: [{ scale: value }] }]}
      onPressIn={(event) => {
        setPressed(true)
        if (!reduceMotion) Animated.timing(value, { toValue: scale, duration: 100, useNativeDriver: true }).start()
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        setPressed(false)
        if (!reduceMotion) Animated.spring(value, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()
        onPressOut?.(event)
      }}
    >
      {children}
    </AnimatedPressable>
  )
}

/**
 * The bars' material: `material-chrome` with a 20px blur, so content scrolls under them.
 * Solid `surface` under Reduce Transparency, and on Android, where blur is costly.
 */
export function Chrome({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const { colors, scheme } = useTheme()
  const reduceTransparency = useReduceTransparency()
  if (reduceTransparency || Platform.OS === 'android') {
    return <View style={[style, { backgroundColor: colors.surface }]}>{children}</View>
  }
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <BlurView intensity={40} tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors['material-chrome'] }]} />
      {children}
    </View>
  )
}
