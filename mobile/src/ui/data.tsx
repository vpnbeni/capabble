import { StyleSheet, View } from 'react-native'

import { fontFamily, space } from '@/theme/tokens'

import { Text } from './Text'

type Detail = { label: string; value?: string | number | null; wide?: boolean; numeric?: boolean }

/**
 * A record's facts, label above value. Missing values show "—". `columns={2}` pairs short values
 * (Class · Roll no.); `wide` gives a long one (address, instructions) its own row.
 */
export function DetailList({ items, columns = 1 }: { items: Detail[]; columns?: 1 | 2 }) {
  const rows: Detail[][] = []
  for (const item of items) {
    const last = rows[rows.length - 1]
    if (item.wide || columns === 1 || !last || last.length >= columns || last[0].wide) rows.push([item])
    else last.push(item)
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.map((item) => item.label).join('|')} style={styles.row}>
          {row.map((item) => (
            <View key={item.label} style={styles.detail}>
              <Text variant="label" tone="muted">
                {item.label}
              </Text>
              <Text variant="body-lg" numeric={item.numeric} selectable style={{ lineHeight: 22, marginTop: 2, fontFamily: fontFamily[400] }}>
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

const styles = StyleSheet.create({
  list: { gap: space['space-4'] },
  row: { flexDirection: 'row', gap: space['space-4'] },
  detail: { flex: 1, minWidth: 0 },
})
