import type { LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space } from '@/theme/tokens'

import { Icon } from './primitives'
import { Text } from './Text'

export type BottomNavItem = {
  key: string
  label: string
  icon: LucideIcon
  active: boolean
  onPress: () => void
  /** Unread or action-needed count only. */
  badge?: number
}

/**
 * The companion tab bar: 4–5 destinations, 64px plus the safe area. The active tab gets
 * an accent-soft pill behind its 22px icon and an accent-strong label.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { paddingBottom: insets.bottom, backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
          accessibilityLabel={item.badge ? `${item.label}, ${item.badge} new` : item.label}
          onPress={item.onPress}
          style={styles.tab}
        >
          <View style={[styles.pill, item.active && { backgroundColor: colors['accent-soft'] }]}>
            <Icon icon={item.icon} size={22} color={item.active ? colors['accent-soft-ink'] : colors['ink-muted']} />
            {item.badge ? (
              <View style={[styles.badge, { backgroundColor: colors['danger-solid'], borderColor: colors.surface }]}>
                <Text variant="caption" style={{ color: colors['on-danger'], fontSize: 12, lineHeight: 14 }} numeric>
                  {item.badge > 99 ? '99+' : item.badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" style={{ color: item.active ? colors['accent-strong'] : colors['ink-muted'] }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    height: size['bottom-nav-height'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['space-1'],
  },
  pill: {
    width: 56,
    height: 30,
    borderRadius: radius['radius-full'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 6,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
  },
})
