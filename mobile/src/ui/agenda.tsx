import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { dayKeyAdd, formatDayKey, formatTime } from '@/lib/format'
import { useTheme } from '@/theme/ThemeProvider'
import { size, space } from '@/theme/tokens'

import { Text } from './Text'

export type AgendaEntry = {
  id: string
  title: string
  startTime?: string | null
  /** Chart colour 1–6; always shown next to the item's own words. */
  category: 1 | 2 | 3 | 4 | 5 | 6
  /** Short note after the title: "For Aarav · Tentative". */
  note?: string
  /** Second line: venue, detail. */
  meta?: string
  muted?: boolean
}

export type AgendaGroup = {
  date: string
  off?: boolean
  /** "Diwali", "Vacation" for a day without school. */
  dayLabel?: string
  entries: AgendaEntry[]
}

/** Items grouped by day with "Today" / "Tomorrow" headings: the calendar's phone view. */
export function AgendaList({
  groups,
  today,
  onEntryPress,
  empty,
}: {
  groups: AgendaGroup[]
  today: string
  onEntryPress?: (entry: AgendaEntry) => void
  empty?: ReactNode
}) {
  const { colors } = useTheme()
  if (!groups.length) return <>{empty}</>

  const heading = (date: string) =>
    date === today ? 'Today' : date === dayKeyAdd(today, 1) ? 'Tomorrow' : formatDayKey(date, { weekday: 'short' })

  return (
    <View>
      {groups.map((group, groupIndex) => (
        <View key={group.date} style={[groupIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <View style={[styles.dayHead, group.off && { backgroundColor: colors['surface-sunken'] }]}>
            <Text variant="label" tone={group.date === today ? 'accent' : 'ink'} accessibilityRole="header">
              {heading(group.date)}
            </Text>
            {group.dayLabel ? (
              <Text variant="small" tone="muted">
                {group.dayLabel}
              </Text>
            ) : null}
          </View>
          {group.entries.map((entry) => (
            <Pressable
              key={`${group.date}:${entry.id}`}
              accessibilityRole={onEntryPress ? 'button' : undefined}
              disabled={!onEntryPress}
              onPress={() => onEntryPress?.(entry)}
              style={({ pressed }) => [styles.entry, pressed && { backgroundColor: colors['surface-hover'] }]}
            >
              <Text variant="small" tone="muted" numeric style={styles.time}>
                {entry.startTime ? formatTime(entry.startTime) : 'All day'}
              </Text>
              <View style={[styles.dot, { backgroundColor: colors[`chart-${entry.category}`] }]} />
              <View style={{ flex: 1 }}>
                <Text
                  variant="body-lg"
                  tone={entry.muted ? 'muted' : 'ink'}
                  style={entry.muted && { textDecorationLine: 'line-through' }}
                >
                  {entry.title}
                </Text>
                {entry.note || entry.meta ? (
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {[entry.note, entry.meta].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space['space-2'],
    paddingHorizontal: space['space-4'],
    paddingVertical: space['space-2'],
  },
  entry: {
    minHeight: size['row-comfortable'],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['space-3'],
    paddingHorizontal: space['space-4'],
    paddingVertical: space['space-3'],
  },
  time: { width: 64, paddingTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
})
