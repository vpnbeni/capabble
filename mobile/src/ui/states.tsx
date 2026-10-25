import { Bell, Check, CircleAlert, CircleCheck, Info, Inbox, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react-native'
import { useEffect, type ReactNode } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, radius, space, type Tone } from '@/theme/tokens'

import { haptic } from './haptics'
import { Icon } from './primitives'
import { Text } from './Text'

const TONE_ICON: Record<Tone, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, neutral: Info }

type CalloutProps = {
  tone?: Tone
  title: string
  icon?: LucideIcon
  action?: { label: string; onPress: () => void }
  children?: ReactNode
}

/**
 * An inline message that stays true until fixed: a deadline, a problem, being offline.
 * It sits where the problem is. Results of what the person just did are a Toast instead.
 */
export function Callout({ tone = 'info', title, icon, action, children }: CalloutProps) {
  const { colors } = useTheme()
  const ink = colors[`${tone}-ink`]
  return (
    <View accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined} style={[styles.callout, { backgroundColor: colors[`${tone}-soft`] }]}>
      <View style={{ marginTop: 1 }}>
        <Icon icon={icon ?? TONE_ICON[tone]} size={18} color={ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" style={{ color: ink, fontFamily: fontFamily[600], fontSize: 15, lineHeight: 20 }}>
          {title}
        </Text>
        {children ? <Text variant="body">{children}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={{ alignSelf: 'center', paddingLeft: 4 }}>
          <Text variant="body" style={{ color: ink, fontFamily: fontFamily[600], fontSize: 15, textDecorationLine: 'underline' }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export type StatusKind = 'success' | 'error' | 'empty' | 'offline' | 'permission'

type StatusViewProps = {
  kind: StatusKind
  /** Past tense for success ("Payment received"); a fact for empty ("No notices yet"). */
  title: string
  body?: string
  /** The amount or result, for success. */
  value?: string
  icon?: LucideIcon
  /** A DetailList: receipt no., date, mode. */
  details?: ReactNode
  /** Full-width large MobileButtons, the filled one first. */
  actions?: ReactNode
  /** Inside a card. */
  compact?: boolean
}

const STATUS: Record<StatusKind, { icon: LucideIcon; ground: string; ink: string }> = {
  success: { icon: Check, ground: 'success-solid', ink: 'surface' },
  error: { icon: CircleAlert, ground: 'danger-soft', ink: 'danger-ink' },
  empty: { icon: Inbox, ground: 'surface-sunken', ink: 'ink-muted' },
  offline: { icon: WifiOff, ground: 'surface-sunken', ink: 'ink-muted' },
  permission: { icon: Bell, ground: 'accent-soft', ink: 'accent-soft-ink' },
}

/** A whole-screen or whole-card state: success, error, empty, offline, or a permission to ask for. */
export function StatusView({ kind, title, body, value, icon, details, actions, compact }: StatusViewProps) {
  const { colors } = useTheme()
  const look = STATUS[kind]
  const mark = compact ? 52 : kind === 'success' ? 88 : 72
  const ground = colors[look.ground as keyof typeof colors]
  const ink = colors[look.ink as keyof typeof colors]

  // The success haptic is the celebration: no confetti.
  useEffect(() => {
    if (kind === 'success' && !compact) haptic.success()
  }, [kind, compact])

  return (
    <View style={[styles.status, compact && styles.statusCompact]} accessibilityLiveRegion="polite">
      <View
        style={[
          { width: mark, height: mark, borderRadius: mark / 2, backgroundColor: ground, alignItems: 'center', justifyContent: 'center', marginBottom: compact ? space['space-3'] : space['space-4'] },
          kind === 'success' && !compact && { boxShadow: `0 0 0 10px ${colors['success-soft']}`, marginBottom: space['space-6'] },
        ]}
      >
        <Icon icon={icon ?? look.icon} size={compact ? 24 : kind === 'success' ? 44 : 32} color={ink} />
      </View>
      {value ? (
        <Text variant="m-hero" numeric style={{ marginBottom: 4, textAlign: 'center' }}>
          {value}
        </Text>
      ) : null}
      <Text variant={compact ? 'm-headline' : 'm-section'} accessibilityRole="header" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" style={styles.statusBody}>
          {body}
        </Text>
      ) : null}
      {details ? <View style={[styles.statusWide, { alignItems: 'stretch' }]}>{details}</View> : null}
      {actions ? <View style={[styles.statusWide, styles.statusActions]}>{actions}</View> : null}
    </View>
  )
}

type NotificationBannerProps = {
  /** Names the child or the thing, ≤ 40 characters: "Aarav's bus is 5 min away". */
  title: string
  /** The one detail that matters, ≤ 110 characters. */
  body: string
  time: string
  /** The app icon; default is the school accent square with a bell. */
  appIcon?: number | { uri: string }
  onPress?: () => void
}

/** How a push looks, and the banner shown for 4 seconds while the app is open. */
export function NotificationBanner({ title, body, time, appIcon, onPress }: NotificationBannerProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}. ${body}. ${time}`}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.notif, { backgroundColor: colors['material-chrome'], boxShadow: '0 8px 28px rgba(17,19,20,0.16)' }]}
    >
      <View style={[styles.notifApp, { backgroundColor: colors['accent-strong'] }]}>
        {appIcon ? <Image source={appIcon} style={{ width: 38, height: 38 }} /> : <Icon icon={Bell} size={20} color={colors['on-accent']} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.notifLine}>
          <Text variant="body" numberOfLines={1} style={{ flex: 1, fontFamily: fontFamily[600], fontSize: 15 }}>
            {title}
          </Text>
          <Text variant="label" tone="muted" style={{ fontFamily: fontFamily[400], lineHeight: 20 }}>
            {time}
          </Text>
        </View>
        <Text variant="body" numberOfLines={2} style={{ fontSize: 15 }}>
          {body}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  callout: { flexDirection: 'row', alignItems: 'flex-start', gap: space['space-3'], paddingVertical: 14, paddingHorizontal: space['space-4'], borderRadius: radius['radius-xl'] },
  status: { alignItems: 'center', paddingVertical: space['space-8'], paddingHorizontal: space['space-6'] },
  statusCompact: { paddingVertical: space['space-6'], paddingHorizontal: space['space-4'] },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space['space-2'] },
  statusBody: { marginTop: 6, maxWidth: 300, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  statusWide: { alignSelf: 'stretch', alignItems: 'center', marginTop: space['space-6'] },
  notif: { flexDirection: 'row', gap: 10, paddingVertical: space['space-3'], paddingHorizontal: 14, borderRadius: 22 },
  notifApp: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  notifLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space['space-2'] },
})
