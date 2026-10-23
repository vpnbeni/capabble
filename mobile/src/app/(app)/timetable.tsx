import { useRouter } from 'expo-router'
import { CalendarDays } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { classLabel, formatTime } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalTimetable } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { useTheme } from '@/theme/ThemeProvider'
import { size, space } from '@/theme/tokens'
import { Card, Chips, EmptyState, Screen, Text } from '@/ui'

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const shortDay = (name: string) => name.charAt(0) + name.slice(1, 3).toLowerCase()
const longDay = (name: string) => name.charAt(0) + name.slice(1).toLowerCase()
/** Bell labels are often typed in capitals ("LUNCH"); the design system has no all-caps text. */
const sentenceCase = (value: string) => (value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLowerCase() : value)

/** The class's published timetable, one day at a time (the phone view of the week grid). */
export default function TimetableScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { child } = usePortal()
  const timetable = usePortalTimetable(child?.studentId)
  const data = timetable.data
  const todayName = DAY_NAMES[new Date().getDay()]
  const [picked, setPicked] = useState<string | null>(null)
  const dayName = picked ?? (data?.days.some((day) => day.name === todayName) ? todayName : data?.days[0]?.name) ?? ''
  const day = data?.days.find((entry) => entry.name === dayName)

  return (
    <Screen title="Timetable" onBack={router.back} headerAction={<ChildSwitcher />} refreshing={timetable.isRefetching} onRefresh={timetable.refetch}>
      {!child ? (
        <NoChild />
      ) : timetable.isPending ? (
        <CardSkeleton rows={5} />
      ) : timetable.isError ? (
        <LoadFailed what="The timetable" error={timetable.error} onRetry={timetable.refetch} />
      ) : !data ? (
        <Card>
          <EmptyState icon={CalendarDays} title="The timetable isn't published yet" body="It will show here once the school publishes it." />
        </Card>
      ) : (
        <>
          <Chips
            label="Day"
            value={dayName}
            onChange={setPicked}
            options={data.days.map((entry) => ({ value: entry.name, label: entry.name === todayName ? 'Today' : shortDay(entry.name) }))}
          />
          <Card
            title={longDay(dayName)}
            subtitle={`${classLabel(data.className, data.section)}${data.classTeacher ? ` · Class teacher ${data.classTeacher}` : ''}`}
            flush
          >
            {data.periods.map((period, index) => {
              const slot = day?.slots[index]
              const isBreak = period.isBreak || slot?.isBreak
              return (
                <View
                  key={period.id}
                  style={[
                    styles.row,
                    isBreak && { backgroundColor: colors['surface-sunken'] },
                    index < data.periods.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={styles.time}>
                    <Text variant="small" tone="muted" numeric>
                      {formatTime(period.startTime)}
                    </Text>
                    {isBreak ? null : (
                      <Text variant="caption" tone="subtle">
                        {sentenceCase(period.label)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    {isBreak ? (
                      <Text variant="body-lg" tone="muted">
                        {period.label ? sentenceCase(period.label) : 'Break'}
                      </Text>
                    ) : (
                      <>
                        <Text variant="body-lg">{slot?.subject || '—'}</Text>
                        {slot?.teacher ? (
                          <Text variant="small" tone="muted">
                            {slot.teacher}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              )
            })}
          </Card>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: size['row-comfortable'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingHorizontal: space['space-4'],
    paddingVertical: space['space-2'],
  },
  time: { width: 72 },
})
