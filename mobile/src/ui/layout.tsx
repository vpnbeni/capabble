import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/ThemeProvider'
import { size, space } from '@/theme/tokens'

import { IconButton } from './controls'
import { Icon } from './primitives'
import { Text } from './Text'

type ScreenProps = {
  /** Screen title (section-title, 18/26) in the 56px header. */
  title?: string
  /** Leading header content, e.g. the school's logo. */
  leading?: ReactNode
  /** A back button before the title, for screens pushed on top of the tabs. */
  onBack?: () => void
  headerAction?: ReactNode
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  /** false when the body scrolls by itself (a WebView): children fill the screen instead. */
  scroll?: boolean
}

/** Root of every screen: bg ground, 56px header, a scrolling stack with 16px gutters and 24px between cards. */
export function Screen({ title, leading, onBack, headerAction, children, refreshing, onRefresh, scroll = true }: ScreenProps) {
  const { colors } = useTheme()
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      {title ? (
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }, onBack && { paddingLeft: space['space-1'] }]}>
          {onBack ? <IconButton icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
          {leading}
          <Text variant="section-title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Text>
          {headerAction}
        </View>
      ) : null}
      {!scroll ? <View style={styles.root}>{children}</View> : (
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors['accent-strong']} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      )}
    </SafeAreaView>
  )
}

type ListRowProps = {
  primary: string
  secondary?: string
  leading?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
  /** Draw the hairline under the row (all but the last row in a card). */
  divider?: boolean
  tone?: 'default' | 'danger'
  /** Lines the primary text may take before it is cut (default 1; 3 for titles like a notice's). */
  lines?: number
}

/** A 52px list row (row-comfortable). The whole row is the touch target; rows that open something get a chevron. */
export function ListRow({ primary, secondary, leading, trailing, onPress, divider, tone = 'default', lines = 1 }: ListRowProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors['surface-hover'] },
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="body-lg" tone={tone === 'danger' ? 'danger' : 'ink'} numberOfLines={lines}>
          {primary}
        </Text>
        {secondary ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress && tone === 'default' ? <Icon icon={ChevronRight} size={16} color={colors['ink-subtle']} /> : null)}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: size['header-height'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingHorizontal: space['space-4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: { padding: space['space-4'], gap: space['space-6'], paddingBottom: space['space-12'] },
  row: {
    minHeight: size['row-comfortable'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingHorizontal: space['space-4'],
    paddingVertical: space['space-2'],
  },
})
