import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, space, type Tone } from '@/theme/tokens'

import { haptic } from './haptics'
import { useReduceMotion } from './motion'
import { Badge, Icon } from './primitives'
import { Text } from './Text'

/**
 * Fixed columns (times in `Agenda` and `Timeline`, a row's `SegmentedControl`) keep rows lined up.
 * They grow with the phone's text size, capped at 1.3× like chrome labels, so "12:00 pm" or
 * "Present" never wraps onto two lines.
 */
const TIME_SCALE_CAP = 1.3
export const useFixedColumn = (base: number) => {
  const { fontScale } = useWindowDimensions()
  return Math.ceil(base * Math.min(Math.max(fontScale, 1), TIME_SCALE_CAP))
}
const useTimeColumn = useFixedColumn

export type WeekDay = {
  /** 'YYYY-MM-DD' */
  date: string
  /** "Mon" */
  weekday: string
  /** 7 */
  day: number
  today?: boolean
  /** The school is off. */
  off?: boolean
  /** Up to three colours (each item's chart colour). */
  dots?: string[]
}

type WeekStripProps = {
  days: WeekDay[]
  value: string
  onChange: (date: string) => void
  /** Swiping the strip asks for the previous (-1) or next (1) week. */
  onWeekChange?: (step: -1 | 1) => void
  label?: string
}

/** Seven days across the top of the calendar or timetable, with dots for what's on. */
export function WeekStrip({ days, value, onChange, onWeekChange, label = 'Choose a day' }: WeekStripProps) {
  const { colors } = useTheme()
  const swipe = useRef(onWeekChange)
  useLayoutEffect(() => {
    swipe.current = onWeekChange
  })
  // The responder is created once and reads the ref only inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => !!swipe.current && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > 50) {
          haptic.selection()
          swipe.current?.(gesture.dx < 0 ? 1 : -1)
        }
      },
    }),
  )

  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.week} {...pan.panHandlers}>
      {days.map((day) => {
        const active = day.date === value
        const numberColor = active ? colors['on-accent'] : day.today ? colors['accent-strong'] : day.off ? colors['ink-subtle'] : colors.ink
        return (
          <Pressable
            key={day.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${day.weekday} ${day.day}${day.today ? ', today' : ''}${day.off ? ', school off' : ''}${day.dots?.length ? `, ${day.dots.length} on` : ''}`}
            onPress={() => {
              if (active) return
              haptic.selection()
              onChange(day.date)
            }}
            style={[styles.weekDay, active && { backgroundColor: colors['accent-strong'] }]}
          >
            <Text variant="caption" maxFontSizeMultiplier={1.3} style={{ color: active ? colors['on-accent'] : colors['ink-muted'] }}>
              {day.weekday}
            </Text>
            <Text variant="section-title" numeric maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily[600], lineHeight: 24, color: numberColor }}>
              {day.day}
            </Text>
            <View style={styles.dots}>
              {(day.dots ?? []).slice(0, 3).map((dot, index) => (
                <View key={index} style={[styles.dot, { backgroundColor: active ? colors['on-accent'] : dot }]} />
              ))}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

export type AgendaItem = {
  time: string
  end?: string
  title: string
  meta?: string
  /** The item's chart colour. */
  color: string
  /** When the family owes a reply: { label: 'Reply by 24 Oct', tone: 'warning' }. */
  badge?: { label: string; tone: Tone }
  onPress?: () => void
}

export type AgendaDay = { label: string; off?: string; items: AgendaItem[] }

/** What's on, grouped by day ("Today", "Tomorrow", then dates): the calendar's phone view. */
export function Agenda({ groups, empty }: { groups: AgendaDay[]; empty?: ReactNode }) {
  const { colors, shadows } = useTheme()
  const timeWidth = useTimeColumn(68)
  if (!groups.length) return <>{empty}</>
  return (
    <View style={{ gap: space['space-6'] }}>
      {groups.map((group) => (
        <View key={group.label} style={{ gap: space['space-2'] }}>
          <View style={styles.agendaHead}>
            <Text variant="m-nav-title" accessibilityRole="header" style={{ fontFamily: fontFamily[700] }}>
              {group.label}
            </Text>
            {group.off ? (
              <Text variant="label" tone="muted">
                {group.off}
              </Text>
            ) : null}
          </View>
          {group.items.length ? (
            <View style={[styles.agendaCard, { backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}>
              {group.items.map((item, index) => (
                <Pressable
                  key={`${item.time}-${item.title}-${index}`}
                  accessibilityRole={item.onPress ? 'button' : undefined}
                  accessibilityLabel={[item.time, item.end && `to ${item.end}`, item.title, item.meta, item.badge?.label].filter(Boolean).join(', ')}
                  disabled={!item.onPress}
                  onPress={item.onPress}
                  style={({ pressed }) => [styles.agendaItem, pressed && { backgroundColor: colors['fill-pressed'] }]}
                >
                  {index > 0 ? (
                    <View style={[styles.agendaRule, { left: space['space-4'] + timeWidth + space['space-3'] * 2 + 4, backgroundColor: colors['border-strong'] }]} />
                  ) : null}
                  <View style={{ width: timeWidth }}>
                    <Text variant="body" numeric numberOfLines={1} maxFontSizeMultiplier={TIME_SCALE_CAP} style={{ fontFamily: fontFamily[600] }}>
                      {item.time}
                    </Text>
                    {item.end ? (
                      <Text variant="body" tone="muted" numeric numberOfLines={1} maxFontSizeMultiplier={TIME_SCALE_CAP}>
                        {item.end}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.agendaBar, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="m-headline" numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.meta ? (
                      <Text variant="m-subhead" tone="muted" numberOfLines={1}>
                        {item.meta}
                      </Text>
                    ) : null}
                    {item.badge ? <Badge label={item.badge.label} tone={item.badge.tone} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

export type TimelineItem = { time: string; title: string; detail?: string; state: 'done' | 'current' | 'upcoming'; badge?: { label: string; tone: Tone } }

/** Steps down a line (a bus's stops, a day's periods) with the current step ringed. `compact` for a day's periods. */
export function Timeline({ items, compact }: { items: TimelineItem[]; compact?: boolean }) {
  const { colors } = useTheme()
  const timeWidth = useTimeColumn(64)
  return (
    <View>
      {items.map((item, index) => {
        const first = index === 0
        const last = index === items.length - 1
        const current = item.state === 'current'
        const done = item.state === 'done'
        const node = current ? 20 : 16
        return (
          <View
            key={`${item.time}-${item.title}`}
            accessible
            accessibilityLabel={`${item.time}, ${item.title}${item.detail ? `, ${item.detail}` : ''}, ${current ? 'now' : done ? 'done' : 'upcoming'}${item.badge ? `, ${item.badge.label}` : ''}`}
            style={styles.tlItem}
          >
            <Text variant="body" numeric numberOfLines={1} maxFontSizeMultiplier={TIME_SCALE_CAP} style={[styles.tlTime, { width: timeWidth, color: current ? colors['accent-strong'] : colors['ink-muted'], fontFamily: fontFamily[current ? 600 : 500] }]}>
              {item.time}
            </Text>
            <View style={styles.tlRail}>
              <View style={[styles.tlLine, { top: first ? 10 : 0, bottom: last ? undefined : 0, height: last ? 10 : undefined, backgroundColor: done ? colors.accent : colors['border-strong'] }]} />
              <View
                style={[
                  styles.tlNode,
                  { width: node, height: node, borderRadius: node / 2, marginTop: current ? 0 : 2 },
                  done || current ? { backgroundColor: colors['accent-strong'] } : { backgroundColor: colors.surface, boxShadow: `inset 0 0 0 2px ${colors['border-control']}` },
                  current && { boxShadow: `0 0 0 5px ${colors['accent-soft']}` },
                ]}
              >
                {done ? <Check size={10} color={colors['on-accent']} strokeWidth={3} /> : null}
              </View>
            </View>
            <View style={[styles.tlBody, { paddingBottom: last ? 0 : compact ? 12 : 20 }]}>
              <View style={styles.tlTitle}>
                <Text variant="m-headline" style={{ fontFamily: fontFamily[item.state === 'upcoming' ? 500 : 600] }}>
                  {item.title}
                </Text>
                {item.badge ? <Badge label={item.badge.label} tone={item.badge.tone} /> : null}
              </View>
              {item.detail ? (
                <Text variant="m-subhead" tone="muted">
                  {item.detail}
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

export type DayMark = { tone: Tone; label: string; short: string }

type DayGridProps = {
  year: number
  /** 1–12 */
  month: number
  /** Only days that differ from normal: { '2026-10-07': { tone: 'danger', label: 'Absent', short: 'A' } }. */
  marks: Record<string, DayMark>
  /** 'YYYY-MM-DD'; days after it are muted. */
  today?: string
  title?: string
  /** Names every tone shown. */
  legend?: { tone: Tone; label: string }[]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (value: number) => String(value).padStart(2, '0')

/** A Monday-first month for attendance: only days that differ from normal get a tone, always with a letter. */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type MonthPickerProps = {
  /** 'YYYY-MM-DD' or null. */
  value: string | null
  onChange: (date: string) => void
  /** The school's today ('YYYY-MM-DD'): ringed. */
  today?: string
  /** Days before this can't be picked. */
  min?: string
  label?: string
}

/**
 * A month to pick one day from, with the previous and next month a tap away. Lives in a
 * `BottomSheet` opened from a date row ("Date · Mon 2 Nov"). The chosen day is `accent-strong`
 * (as in `WeekStrip`), today is ringed, days before `min` are dimmed and can't be picked.
 */
export function MonthPicker({ value, onChange, today, min, label = 'Choose a date' }: MonthPickerProps) {
  const { colors } = useTheme()
  const start = value ?? today ?? new Date().toISOString().slice(0, 10)
  const [shown, setShown] = useState(() => ({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) }))
  const { year, month } = shown
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const cells: (number | null)[] = [...Array.from({ length: leading }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
  const step = (delta: number) => {
    haptic.selection()
    setShown(({ year: y, month: m }) => {
      const next = m + delta
      return next < 1 ? { year: y - 1, month: 12 } : next > 12 ? { year: y + 1, month: 1 } : { year: y, month: next }
    })
  }
  const lastOfPrevious = `${month === 1 ? year - 1 : year}-${pad(month === 1 ? 12 : month - 1)}-31`

  return (
    <View accessibilityLabel={label} style={{ gap: 10 }}>
      <View style={styles.pickerHead}>
        <Text variant="m-headline" accessibilityRole="header" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {`${MONTH_NAMES[month - 1]} ${year}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            disabled={!!min && lastOfPrevious < min}
            onPress={() => step(-1)}
            style={({ pressed }) => [styles.pickerArrow, pressed && { backgroundColor: colors['fill-pressed'] }, !!min && lastOfPrevious < min && { opacity: 0.35 }]}
          >
            <Icon icon={ChevronLeft} size={22} color={colors['accent-strong']} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => step(1)}
            style={({ pressed }) => [styles.pickerArrow, pressed && { backgroundColor: colors['fill-pressed'] }]}
          >
            <Icon icon={ChevronRight} size={22} color={colors['accent-strong']} />
          </Pressable>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <View style={styles.gridRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} variant="caption" tone="subtle" maxFontSizeMultiplier={1.3} style={styles.gridHead}>
              {day}
            </Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.gridRow}>
            {week.map((day, dayIndex) => {
              if (!day) return <View key={`blank-${dayIndex}`} style={styles.gridCell} />
              const date = `${year}-${pad(month)}-${pad(day)}`
              const chosen = date === value
              const blocked = !!min && date < min
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${MONTH_NAMES[month - 1]}${date === today ? ', today' : ''}`}
                  accessibilityState={{ selected: chosen, disabled: blocked }}
                  disabled={blocked}
                  onPress={() => {
                    haptic.selection()
                    onChange(date)
                  }}
                  style={({ pressed }) => [
                    styles.gridCell,
                    styles.gridDay,
                    pressed && !chosen && { backgroundColor: colors['fill-pressed'] },
                    chosen && { backgroundColor: colors['accent-strong'] },
                    !chosen && date === today && { boxShadow: `inset 0 0 0 2px ${colors['accent-strong']}` },
                  ]}
                >
                  <Text
                    variant="body"
                    numeric
                    maxFontSizeMultiplier={1.3}
                    style={{ fontFamily: fontFamily[chosen ? 600 : 500], lineHeight: 18, color: chosen ? colors['on-accent'] : blocked ? colors['ink-subtle'] : colors.ink }}
                  >
                    {day}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

export function DayGrid({ year, month, marks, today, title, legend }: DayGridProps) {
  const { colors } = useTheme()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const cells: (number | null)[] = [...Array.from({ length: leading }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return (
    <View style={{ gap: 10 }}>
      {title ? (
        <Text variant="m-headline" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={{ gap: 4 }}>
        <View style={styles.gridRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} variant="caption" tone="subtle" maxFontSizeMultiplier={1.3} style={styles.gridHead}>
              {day}
            </Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.gridRow}>
            {week.map((day, dayIndex) => {
              if (!day) return <View key={`blank-${dayIndex}`} style={styles.gridCell} />
              const date = `${year}-${pad(month)}-${pad(day)}`
              const mark = marks[date]
              const future = !!today && date > today
              return (
                <View
                  key={date}
                  accessible
                  accessibilityLabel={`${day}${mark ? `, ${mark.label}` : ''}${date === today ? ', today' : ''}`}
                  style={[
                    styles.gridCell,
                    styles.gridDay,
                    mark && { backgroundColor: colors[`${mark.tone}-soft`] },
                    date === today && { boxShadow: `inset 0 0 0 2px ${colors['accent-strong']}` },
                  ]}
                >
                  <Text
                    variant="body"
                    numeric
                    maxFontSizeMultiplier={1.3}
                    style={{ fontFamily: fontFamily[500], lineHeight: 18, color: mark ? colors[`${mark.tone}-ink`] : future ? colors['ink-subtle'] : colors.ink }}
                  >
                    {day}
                  </Text>
                  {mark ? (
                    <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily[700], fontSize: 10, lineHeight: 12, letterSpacing: 0.2, color: colors[`${mark.tone}-ink`] }}>
                      {mark.short}
                    </Text>
                  ) : null}
                </View>
              )
            })}
          </View>
        ))}
      </View>
      {legend?.length ? (
        <View style={styles.legend}>
          {legend.map((entry) => (
            <View key={entry.label} style={styles.legendItem}>
              <View style={[styles.legendKey, { backgroundColor: colors[`${entry.tone}-solid`] }]} />
              <Text variant="label" tone="muted" style={{ fontFamily: fontFamily[400] }}>
                {entry.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

type ProgressRingProps = {
  /** 0–100 */
  value: number
  /** The number inside; default "{value}%". */
  label?: string
  /** What the number is: "this term". */
  sublabel?: string
  size?: number
  stroke?: number
  /** A status tone when the number has a threshold (attendance under 75% is danger); default accent. */
  tone?: Tone
  ariaLabel?: string
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** A percentage as a ring with the number inside. Always pair it with the plain fact beside it. */
export function ProgressRing({ value, label, sublabel, size = 112, stroke = 10, tone, ariaLabel }: ProgressRingProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const share = Math.min(100, Math.max(0, value)) / 100
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const [progress] = useState(() => new Animated.Value(reduceMotion ? share : 0))

  useEffect(() => {
    if (reduceMotion) progress.setValue(share)
    else Animated.timing(progress, { toValue: share, duration: 600, useNativeDriver: false }).start()
  }, [share, reduceMotion, progress])

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={ariaLabel ?? `${label ?? `${Math.round(value)}%`}${sublabel ? ` ${sublabel}` : ''}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors['surface-sunken']} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone ? colors[`${tone}-solid`] : colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text numeric maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily[700], fontSize: Math.round(size * 0.24), lineHeight: Math.round(size * 0.27), letterSpacing: -0.5, color: colors.ink }}>
          {label ?? `${Math.round(value)}%`}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="muted" maxFontSizeMultiplier={1.3}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, alignItems: 'center', gap: 2, paddingTop: space['space-2'], paddingBottom: 6, borderRadius: 14 },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  agendaHead: { flexDirection: 'row', alignItems: 'baseline', gap: space['space-2'] },
  agendaCard: { borderRadius: radius['radius-xl'], overflow: 'hidden' },
  agendaItem: { flexDirection: 'row', alignItems: 'center', gap: space['space-3'], minHeight: 64, paddingVertical: 10, paddingHorizontal: space['space-4'] },
  agendaRule: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  agendaBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  tlItem: { flexDirection: 'row', gap: 10 },
  tlTime: { paddingTop: 1, textAlign: 'right' },
  tlRail: { width: 24, alignItems: 'center' },
  tlLine: { position: 'absolute', width: 2 },
  tlNode: { alignItems: 'center', justifyContent: 'center' },
  tlBody: { flex: 1, minWidth: 0 },
  tlTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space['space-2'] },
  gridRow: { flexDirection: 'row', gap: 4 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space['space-2'] },
  pickerArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  gridHead: { flex: 1, textAlign: 'center', paddingBottom: 2 },
  gridCell: { flex: 1, aspectRatio: 1 },
  gridDay: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space['space-4'], rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendKey: { width: 12, height: 12, borderRadius: 4 },
  ringInner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})
