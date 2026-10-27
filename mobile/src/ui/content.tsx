import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import { Children, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useFontScale } from './preview'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, size, space, type TileIndex, type Tone } from '@/theme/tokens'

import { PressScale } from './motion'
import { Badge, Icon } from './primitives'
import { Text } from './Text'

export type { TileIndex }

/**
 * A module's identity colour: Calendar 1, Transport 2, Fees 3, Timetable 4, Attendance 5, Results 6.
 * Tiles are identity, never status.
 */
export const MODULE_TILE = { calendar: 1, transport: 2, fees: 3, timetable: 4, attendance: 5, results: 6 } as const satisfies Record<string, TileIndex>

/** A Lucide glyph on a tinted squircle (`tile-N` ground, `tile-N-ink` glyph). */
export function Tile({ icon, tile, side, corner, glyph }: { icon: LucideIcon; tile: TileIndex; side: number; corner: number; glyph: number }) {
  const { colors } = useTheme()
  return (
    <View style={{ width: side, height: side, borderRadius: corner, backgroundColor: colors[`tile-${tile}`], alignItems: 'center', justifyContent: 'center' }}>
      <Icon icon={icon} size={glyph} color={colors[`tile-${tile}-ink`]} />
    </View>
  )
}

/** A count of things needing action, on a tile or tab. */
function CountBadge({ count, ring }: { count: number; ring?: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.count, { backgroundColor: colors['danger-strong'] }, ring && { boxShadow: `0 0 0 2px ${ring}` }]}>
      <Text variant="caption" numeric maxFontSizeMultiplier={1.3} style={{ color: colors['on-danger'], fontFamily: fontFamily[600] }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  )
}

type SectionProps = { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }

/** An `m-section` heading with an optional "See all", then its content. Sections stack 32px apart. */
export function Section({ title, action, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="m-section" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}>
            <Text variant="body" tone="accent" style={{ fontFamily: fontFamily[500], fontSize: 15 }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}

type HeroProps = {
  /** What the number is: "Due in 5 days". */
  label: string
  /** Number first: "₹12,400", "8 min", "94%". */
  value: string
  detail?: string
  meta?: string
  icon?: LucideIcon
  /** soft for everyday facts; strong for the single most urgent state; surface for a neutral fact. */
  tone?: 'soft' | 'strong' | 'surface'
  /** 0–100 */
  progress?: number
  action?: { label: string; onPress: () => void }
  /** The full sentence VoiceOver reads for the whole hero. */
  ariaLabel?: string
}

/** The one big fact at the top of a screen. One hero per screen. */
export function Hero({ label, value, detail, meta, icon, tone = 'soft', progress, action, ariaLabel }: HeroProps) {
  const { colors, shadows } = useTheme()
  const ground = { soft: colors['accent-soft'], strong: colors['accent-strong'], surface: colors.surface }[tone]
  const ink = { soft: colors['accent-soft-ink'], strong: colors['on-accent'], surface: colors.ink }[tone]
  const muted = tone === 'surface' ? colors['ink-muted'] : ink
  const fill = tone === 'surface' ? colors.accent : ink
  const track = { soft: colors.surface, strong: colors['accent-strong-hover'], surface: colors['surface-sunken'] }[tone]
  // Small phone or larger text: the meta goes under the label instead of squeezing it.
  const { width } = useWindowDimensions()
  const fontScale = useFontScale()
  const stackTop = fontScale >= 1.15 || width < 380

  return (
    <View
      accessible={!action}
      accessibilityLabel={ariaLabel ?? [label, value, detail].filter(Boolean).join(', ')}
      style={[styles.hero, { backgroundColor: ground }, tone === 'surface' && { boxShadow: shadows['shadow-card-m'] }]}
    >
      <View style={[styles.heroTop, stackTop && { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
        <View style={styles.heroLabel}>
          {icon ? <Icon icon={icon} size={16} color={ink} /> : null}
          <Text variant="body" style={{ color: ink, fontFamily: fontFamily[600] }}>
            {label}
          </Text>
        </View>
        {meta ? (
          <Text variant="label" style={{ color: ink, opacity: 0.9 }}>
            {meta}
          </Text>
        ) : null}
      </View>
      {/* Up to two lines (a holiday's or a visitor's name), shrinking to fit before anything is cut. */}
      <Text variant="m-hero" numeric numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: tone === 'surface' ? colors.ink : ink, marginTop: space['space-2'] }}>
        {value}
      </Text>
      {detail ? (
        <Text variant="body" style={{ color: muted, fontSize: 15, lineHeight: 22 }}>
          {detail}
        </Text>
      ) : null}
      {progress !== undefined ? (
        <View style={[styles.heroTrack, { backgroundColor: track }]}>
          <View style={[styles.heroFill, { width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: fill }]} />
        </View>
      ) : null}
      {action ? (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={ariaLabel ? `${ariaLabel}. ${action.label}` : action.label}
          onPress={action.onPress}
          style={[styles.heroAction, { backgroundColor: tone === 'strong' ? colors['on-accent'] : colors['accent-strong'] }]}
        >
          <Text variant="body" style={{ color: tone === 'strong' ? colors['accent-strong'] : colors['on-accent'], fontFamily: fontFamily[600], fontSize: 15 }}>
            {action.label}
          </Text>
          <Icon icon={ChevronRight} size={16} color={tone === 'strong' ? colors['accent-strong'] : colors['on-accent']} />
        </PressScale>
      ) : null}
    </View>
  )
}

export type ShortcutItem = { label: string; icon: LucideIcon; tile: TileIndex; badge?: number; onPress: () => void }

/** Tinted tiles with a noun under each: Home (up to 8) and More (every module). Four across; three at the largest text sizes. */
export function ShortcutGrid({ items, columns }: { items: ShortcutItem[]; columns?: 3 | 4 }) {
  const { colors } = useTheme()
  // Three across once the phone's text is enlarged, so every label fits on one line.
  const fontScale = useFontScale()
  const cols = columns ?? (fontScale >= 1.15 ? 3 : 4)
  const rows = Array.from({ length: Math.ceil(items.length / cols) }, (_, index) => items.slice(index * cols, index * cols + cols))

  return (
    <View style={{ gap: space['space-4'] }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: space['space-2'] }}>
          {Array.from({ length: cols }, (_, index) => {
            const item = row[index]
            if (!item) return <View key={`blank-${index}`} style={{ flex: 1 }} />
            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.badge ? `${item.label}, ${item.badge} need attention` : item.label}
                onPress={item.onPress}
                style={styles.shortcut}
              >
                {({ pressed }) => (
                  <>
                    <View style={{ transform: [{ scale: pressed ? 0.94 : 1 }] }}>
                      <Tile icon={item.icon} tile={item.tile} side={size['tile-size']} corner={radius['radius-tile']} glyph={26} />
                      {item.badge ? (
                        <View style={styles.shortcutBadge}>
                          <CountBadge count={item.badge} ring={colors.bg} />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      variant="label"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      maxFontSizeMultiplier={1.3}
                      style={{ alignSelf: 'stretch', textAlign: 'center', lineHeight: 16 }}
                    >
                      {item.label}
                    </Text>
                  </>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

/** A horizontal scroller of RailCards under a heading. Up to 10 items, then "See all". At most two rails per screen. */
export function Rail({ title, action, children }: SectionProps) {
  return (
    <Section title={title} action={action}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        contentContainerStyle={styles.rail}
        style={styles.railBleed}
      >
        {Children.toArray(children)}
      </ScrollView>
    </Section>
  )
}

type RailCardProps = {
  title: string
  /** Usually the date. */
  eyebrow?: string
  meta?: string
  icon?: LucideIcon
  tile?: TileIndex
  badge?: { label: string; tone: Tone }
  width?: number
  onPress?: () => void
}

/** One card in a Rail: borderless, shadow-card-m, radius-xl. The whole card is the target. */
export function RailCard({ title, eyebrow, meta, icon, tile = 1, badge, width = 220, onPress }: RailCardProps) {
  const { colors, shadows } = useTheme()
  return (
    <PressScale
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.railCard, { width, backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}
    >
      {icon || badge ? (
        <View style={styles.railTop}>
          {icon ? <Tile icon={icon} tile={tile} side={36} corner={10} glyph={20} /> : <View />}
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
      ) : null}
      {eyebrow ? (
        <Text variant="label" tone="muted" style={{ fontFamily: fontFamily[600] }}>
          {eyebrow}
        </Text>
      ) : null}
      <Text variant="m-headline" numberOfLines={2}>
        {title}
      </Text>
      {meta ? (
        <Text variant="m-subhead" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </PressScale>
  )
}

export type ListGroupItem = {
  title: string
  subtitle?: string
  icon?: LucideIcon
  tile?: TileIndex
  avatar?: ReactNode
  value?: string
  badge?: { label: string; tone: Tone }
  /** A control at the end, e.g. a Switch. */
  accessory?: ReactNode
  /**
   * The control's width (a `SegmentedControl`, from `useFixedColumn`); the row sizes it. When it would
   * leave the title fewer than 12 characters (a 360dp phone, larger text), the control goes under the
   * text at the full width of the row.
   */
  accessoryWidth?: number
  /** Default: shown when the row opens something (has onPress) and isn't danger. */
  chevron?: boolean
  /** 'danger' for sign out and other destructive rows, alone in their own group. */
  tone?: 'default' | 'danger'
  onPress?: () => void
  /** Lines the title may take (default 1). */
  lines?: number
}

/** The iOS inset grouped list: the app's replacement for tables and bordered cards of rows. */
export function ListGroup({ header, footer, items, children }: { header?: string; footer?: string; items?: ListGroupItem[]; children?: ReactNode }) {
  const { colors, shadows } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      {header ? (
        <Text variant="label" tone="muted" accessibilityRole="header" style={styles.groupNote}>
          {header}
        </Text>
      ) : null}
      <View style={[styles.groupCard, { backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}>
        {items?.map((item, index) => (
          <ListItem key={`${item.title}-${index}`} item={item} first={index === 0} />
        ))}
        {children}
      </View>
      {footer ? (
        <Text variant="label" tone="muted" style={[styles.groupNote, { fontFamily: fontFamily[400] }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

/** One ListGroup row: 56px (64 with a subtitle), hairline inset to the text. Also usable as a child of ListGroup. */
/**
 * Whether a row's end control leaves its title room for 12 characters (`m-headline`, about 0.55em
 * a character). Rows sit in a 16px screen gutter with 16px padding each side; a leading tile or
 * avatar takes 32 + 12.
 */
const fitsBeside = (width: number, fontScale: number, control: number, lead: boolean) => {
  const room = width - 2 * space['space-4'] - 2 * space['space-4'] - (lead ? 44 : 0) - space['space-3'] - control
  return room >= 12 * 16 * 0.55 * Math.min(Math.max(fontScale, 1), 1.6)
}

/** Whether a row's text fits on one line beside its tile, chevron and gutters. */
const fitsOneLine = (width: number, fontScale: number, text: string, lead: boolean, chevron: boolean) => {
  const room = width - 4 * space['space-4'] - (lead ? 44 : 0) - (chevron ? 30 : 0) - space['space-3']
  return text.length * 16 * 0.6 * Math.min(Math.max(fontScale, 1), 1.6) <= room
}

export function ListItem({ item, first }: { item: ListGroupItem; first?: boolean }) {
  const { colors } = useTheme()
  const { title, subtitle, icon, tile = 1, avatar, value, badge, accessory, accessoryWidth, tone = 'default', onPress, lines = 1 } = item
  const chevron = item.chevron ?? (!!onPress && tone === 'default' && !accessory)
  const leadInset = icon || avatar ? 60 : space['space-4']
  // On a small phone or with larger text the badge goes under the text, so the name isn't cut short.
  const { width } = useWindowDimensions()
  const fontScale = useFontScale()
  const badgeBelow = !!badge && (fontScale >= 1.15 || width < 380)
  // A value that won't fit beside the title ("1:30 pm to 3:00 pm" by "Wednesday") goes under it.
  const longer = subtitle && subtitle.length > title.length ? subtitle : title
  const valueBelow = !!value && !fitsOneLine(width, fontScale, `${longer}  ${value}`, !!(icon || avatar), chevron)
  const accessoryBelow = !!accessory && !!accessoryWidth && !fitsBeside(width, fontScale, accessoryWidth, !!(icon || avatar))

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, subtitle, value, badge?.label].filter(Boolean).join(', ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.item, subtitle && { minHeight: 64 }, pressed && { backgroundColor: colors['fill-pressed'] }]}
    >
      {!first ? <View style={[styles.separator, { left: leadInset, backgroundColor: colors['border-strong'] }]} /> : null}
      {icon ? <Tile icon={icon} tile={tile} side={32} corner={8} glyph={18} /> : avatar}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant={subtitle ? 'm-headline' : 'body-lg'}
          tone={tone === 'danger' ? 'danger' : 'ink'}
          numberOfLines={lines}
          style={{ lineHeight: 22 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="m-subhead" tone="muted" numberOfLines={lines > 1 ? 2 : 1}>
            {subtitle}
          </Text>
        ) : null}
        {valueBelow ? (
          <Text variant="body-lg" tone="muted" numeric numberOfLines={2}>
            {value}
          </Text>
        ) : null}
        {accessoryBelow ? <View style={{ marginTop: space['space-2'], marginBottom: space['space-1'] }}>{accessory}</View> : null}
        {badgeBelow ? (
          <View style={{ flexDirection: 'row', marginTop: space['space-1'] }}>
            <Badge label={badge.label} tone={badge.tone} />
          </View>
        ) : null}
      </View>
      {value && !valueBelow ? (
        <Text variant="body-lg" tone="muted" numeric numberOfLines={1} style={{ lineHeight: 22, flexShrink: 1, maxWidth: '60%' }}>
          {value}
        </Text>
      ) : null}
      {badge && !badgeBelow ? <Badge label={badge.label} tone={badge.tone} /> : null}
      {accessoryBelow ? null : accessoryWidth ? <View style={{ width: accessoryWidth }}>{accessory}</View> : accessory}
      {chevron ? (
        <View style={{ marginRight: -4 }}>
          <Icon icon={ChevronRight} size={18} color={colors['ink-subtle']} />
        </View>
      ) : null}
    </Pressable>
  )
}

/** A borderless mobile card (`surface`, `shadow-card-m`, `radius-xl`, 16px padding) for content that isn't a list. */
export function Surface({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const { colors, shadows } = useTheme()
  return (
    <View style={[styles.surface, padded && { padding: space['space-4'] }, { backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}>{children}</View>
  )
}

export type StatTile = { label: string; value: string; detail?: string; tone?: Tone; icon?: LucideIcon; tile?: TileIndex; onPress?: () => void }

/**
 * Two-up number tiles for a glance screen: at most four, each opening the list behind it. On a small
 * phone or with larger text they stack, one compact row each (label and detail, the number at the end).
 */
export function StatTiles({ items }: { items: StatTile[] }) {
  const { colors, shadows } = useTheme()
  const { width } = useWindowDimensions()
  const fontScale = useFontScale()
  const stacked = fontScale >= 1.15 || width < 360
  const rows = stacked ? items.slice(0, 4).map((item) => [item]) : [items.slice(0, 2), items.slice(2, 4)].filter((row) => row.length)
  const detailTone = (item: StatTile) => (item.tone && item.tone !== 'neutral' && item.tone !== 'info' ? item.tone : 'muted')

  return (
    <View style={{ gap: space['space-3'] }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: space['space-3'] }}>
          {row.map((item) => (
            <PressScale
              key={item.label}
              accessibilityRole={item.onPress ? 'button' : undefined}
              accessibilityLabel={[item.label, item.value, item.detail].filter(Boolean).join(', ')}
              disabled={!item.onPress}
              onPress={item.onPress}
              style={[stacked ? styles.statRow : styles.stat, { backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}
            >
              {stacked ? (
                <>
                  {item.icon ? <Tile icon={item.icon} tile={item.tile ?? 1} side={32} corner={8} glyph={18} /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body" tone="muted" numberOfLines={2} style={{ fontFamily: fontFamily[500] }}>
                      {item.label}
                    </Text>
                    {item.detail ? (
                      <Text variant="label" tone={detailTone(item)} numberOfLines={2}>
                        {item.detail}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="stat" numeric numberOfLines={1} style={{ fontFamily: fontFamily[700], fontSize: 24, lineHeight: 30, letterSpacing: -0.48, maxWidth: '50%' }}>
                    {item.value}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.statTop}>
                    {item.icon ? <Tile icon={item.icon} tile={item.tile ?? 1} side={28} corner={8} glyph={16} /> : null}
                    <Text variant="body" tone="muted" numberOfLines={1} style={{ flex: 1, fontFamily: fontFamily[500] }}>
                      {item.label}
                    </Text>
                  </View>
                  <Text variant="stat" numeric style={{ fontFamily: fontFamily[700], fontSize: 26, lineHeight: 32, letterSpacing: -0.52 }}>
                    {item.value}
                  </Text>
                  {item.detail ? (
                    <Text variant="label" tone={detailTone(item)}>
                      {item.detail}
                    </Text>
                  ) : null}
                </>
              )}
            </PressScale>
          ))}
          {row.length === 1 && !stacked ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  )
}

export { CountBadge }

const styles = StyleSheet.create({
  count: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  section: { gap: space['space-3'] },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: space['space-3'] },
  hero: { gap: 2, paddingTop: space['space-5'], paddingHorizontal: space['space-5'], paddingBottom: space['space-4'], borderRadius: radius['radius-xl'] },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space['space-3'] },
  heroLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  heroTrack: { height: 6, marginTop: space['space-3'], borderRadius: 3, overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 3 },
  heroAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
    marginTop: space['space-3'],
    paddingLeft: 14,
    paddingRight: space['space-3'],
    borderRadius: radius['radius-full'],
  },
  shortcut: { flex: 1, alignItems: 'center', gap: 6 },
  shortcutBadge: { position: 'absolute', top: -5, right: -5 },
  railBleed: { marginHorizontal: -space['space-4'] },
  rail: { gap: space['space-3'], paddingHorizontal: space['space-4'], paddingTop: 4, paddingBottom: space['space-3'] },
  railCard: { gap: 2, padding: space['space-4'], borderRadius: radius['radius-xl'], alignItems: 'flex-start' },
  railTop: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: space['space-3'], minHeight: 24 },
  surface: { borderRadius: radius['radius-xl'], overflow: 'hidden', gap: space['space-3'] },
  groupNote: { paddingHorizontal: space['space-4'] },
  groupCard: { borderRadius: radius['radius-xl'], overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    minHeight: size['row-m'],
    paddingVertical: space['space-2'],
    paddingHorizontal: space['space-4'],
  },
  separator: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  stat: { flex: 1, gap: 4, paddingTop: 14, paddingHorizontal: space['space-4'], paddingBottom: space['space-4'], borderRadius: radius['radius-xl'], alignItems: 'flex-start' },
  statRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space['space-3'], paddingVertical: space['space-3'], paddingHorizontal: space['space-4'], borderRadius: radius['radius-xl'] },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: space['space-2'], marginBottom: 4, alignSelf: 'stretch' },
})
