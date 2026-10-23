import { StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, space, type Tone } from '@/theme/tokens'

import { Text } from './Text'

type Detail = { label: string; value?: string | number | null; wide?: boolean }

/**
 * A record's details as label above value. Empty values show "—". `columns={2}` pairs short
 * values side by side (dates, roll no.); `wide` gives a long one (address, email) a whole row.
 */
export function DetailList({ items, columns = 1 }: { items: Detail[]; columns?: 1 | 2 }) {
  const { colors } = useTheme()
  const rows: Detail[][] = []
  for (const item of items) {
    const last = rows[rows.length - 1]
    if (item.wide || columns === 1 || !last || last.length >= columns || last[0].wide) rows.push([item])
    else last.push(item)
  }

  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={row.map((item) => item.label).join('|')}
          style={[styles.detailRow, index < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
        >
          {row.map((item) => (
            <View key={item.label} style={styles.detail}>
              <Text variant="caption" tone="muted">
                {item.label}
              </Text>
              <Text variant="body-lg" selectable>
                {item.value === undefined || item.value === null || item.value === '' ? '—' : String(item.value)}
              </Text>
            </View>
          ))}
          {row.length < columns && !row[0].wide ? <View style={styles.detail} /> : null}
        </View>
      ))}
    </View>
  )
}

export type GridDay = {
  /** 'YYYY-MM-DD' */
  date: string
  /** Status colour; no tone = an ordinary day. */
  tone?: Tone
  /** Short word under the date, e.g. "Absent". Always given with a tone (never colour alone). */
  label?: string
  muted?: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A Monday-first month of days, each with an optional status tone and word (attendance). */
export function DayGrid({ days, today, label }: { days: GridDay[]; today?: string; label: string }) {
  const { colors } = useTheme()
  if (!days.length) return null
  const first = new Date(`${days[0].date}T00:00:00.000Z`)
  const leading = (first.getUTCDay() + 6) % 7
  // Explicit weeks of seven flexible cells: percentage widths round past 100% and wrap the 7th day.
  const cells: (GridDay | null)[] = [...Array.from({ length: leading }, () => null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return (
    <View accessibilityLabel={label}>
      <View style={styles.row}>
        {WEEKDAYS.map((day) => (
          <Text key={day} variant="caption" tone="subtle" style={styles.head}>
            {day}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.row}>
          {week.map((day, dayIndex) =>
            day ? (
              <View
                key={day.date}
                accessible
                accessibilityLabel={`${Number(day.date.slice(-2))}${day.label ? `, ${day.label}` : ''}`}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    day.tone && { backgroundColor: colors[`${day.tone}-soft`] },
                    day.date === today && { borderWidth: 2, borderColor: colors['focus-ring'] },
                  ]}
                >
                  <Text variant="label" numeric tone={day.tone ?? (day.muted ? 'subtle' : 'ink')}>
                    {Number(day.date.slice(-2))}
                  </Text>
                  {day.label ? (
                    <Text variant="caption" tone={day.tone ?? 'muted'} numberOfLines={1} style={styles.dayLabel}>
                      {day.label}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View key={`blank-${dayIndex}`} style={styles.cell} />
            ),
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  detailRow: { flexDirection: 'row', gap: space['space-4'] },
  detail: { flex: 1, paddingVertical: space['space-3'], gap: 2 },
  row: { flexDirection: 'row' },
  head: { flex: 1, textAlign: 'center', paddingBottom: space['space-2'] },
  cell: { flex: 1, aspectRatio: 0.85, padding: 2 },
  day: { flex: 1, borderRadius: radius['radius-sm'], alignItems: 'center', justifyContent: 'center', gap: 1 },
  dayLabel: { fontSize: 12, lineHeight: 14, paddingHorizontal: 1 },
})
