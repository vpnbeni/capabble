import { useEffect, useState } from 'react'
import { Animated, View, type DimensionValue } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'

import { useReduceMotion } from './motion'

type SkeletonProps = { width?: DimensionValue; height?: number; radius?: number; round?: boolean; lines?: number }

/**
 * A placeholder shaped like the content that's coming, never a lone spinner. A soft 1.2s shimmer,
 * off under Reduce Motion. `lines` stacks text lines (the last one shorter). First load only.
 */
export function Skeleton({ width = '100%', height = 16, radius: corner, round, lines }: SkeletonProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const [opacity] = useState(() => new Animated.Value(1))

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1)
      return
    }
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    )
    shimmer.start()
    return () => shimmer.stop()
  }, [opacity, reduceMotion])

  const block = (key: number | undefined, blockWidth: DimensionValue) => (
    <Animated.View
      key={key}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: blockWidth,
        height,
        opacity,
        borderRadius: round ? height / 2 : (corner ?? radius['radius-sm']),
        backgroundColor: colors['surface-sunken'],
      }}
    />
  )

  if (!lines || lines < 2) return block(undefined, width)
  return <View style={{ gap: space['space-2'] }}>{Array.from({ length: lines }, (_, index) => block(index, index === lines - 1 ? '60%' : width))}</View>
}
