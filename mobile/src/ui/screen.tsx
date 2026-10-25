import { useScrollToTop } from 'expo-router'
import { ChevronLeft, type LucideIcon } from 'lucide-react-native'
import { createContext, useContext, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, size, space } from '@/theme/tokens'

import { CountBadge } from './content'
import { haptic } from './haptics'
import { KeyboardRevealProvider, useKeyboardAwareScroll } from './keyboard'
import { Chrome } from './motion'
import { Icon } from './primitives'
import { Text } from './Text'

/** Which part of the NavBar MobileScreen is asking for: the fixed bar, or the large title that scrolls. */
const NavPart = createContext<'bar' | 'large' | null>(null)
const NavCollapsed = createContext(false)

type MobileScreenProps = {
  /** The screen's NavBar. */
  nav?: ReactNode
  /** A TabBar drawn by this screen. Screens inside the tab navigator pass `tabs` instead. */
  tabBar?: ReactNode
  /** The layout's TabBar floats over this screen: leave room for it. */
  tabs?: boolean
  /** The screen's ActionBar, floating 12px above the tab bar or the home indicator. */
  actionBar?: ReactNode
  /** A BottomSheet or ActionSheet. */
  overlay?: ReactNode
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  /** false when the body scrolls by itself (a WebView, a list): children fill the space under the bar. */
  scroll?: boolean
}

/**
 * The root of every app screen: the nav bar on top, content scrolling under translucent bars,
 * the action bar and tab bar floating at the bottom. Sections stack 32px apart with 16px gutters.
 */
export function MobileScreen({ nav, tabBar, tabs, actionBar, overlay, children, refreshing, onRefresh, scroll = true }: MobileScreenProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  useScrollToTop(scrollRef as Parameters<typeof useScrollToTop>[0])

  const hasTabs = !!tabBar || !!tabs
  const top = nav ? insets.top + size['nav-bar-height'] : insets.top
  const tabSpace = hasTabs ? size['tab-bar-height'] : 0
  const actionSpace = actionBar ? size['action-bar-height'] + space['space-3'] : 0
  // The keyboard covers the tab bar; the action bar rides above the keyboard so the submit stays reachable.
  const { cover, onScroll: trackScroll, reveal } = useKeyboardAwareScroll(scrollRef, actionSpace)
  const bottom = Math.max(insets.bottom + tabSpace + (actionBar ? size['action-bar-height'] + 36 : 24), cover + actionSpace + space['space-6'])

  return (
    <NavCollapsed.Provider value={collapsed}>
      <KeyboardRevealProvider value={reveal}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
            scrollIndicatorInsets={{ top: top - insets.top, bottom: bottom - insets.bottom }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            scrollEventThrottle={16}
            onScroll={(event) => {
              trackScroll(event)
              const next = event.nativeEvent.contentOffset.y > size['large-title-height'] - 8
              if (next !== collapsed) setCollapsed(next)
            }}
            refreshControl={
              onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors['accent-strong']} colors={[colors['accent-strong']]} progressViewOffset={top} /> : undefined
            }
          >
            {nav ? <NavPart.Provider value="large">{nav}</NavPart.Provider> : null}
            <View style={styles.body}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.root, { paddingTop: top, paddingBottom: insets.bottom + tabSpace }]}>{children}</View>
        )}
        {nav ? (
          <View style={styles.bar}>
            <NavPart.Provider value="bar">{nav}</NavPart.Provider>
          </View>
        ) : null}
        {actionBar ? <View style={[styles.action, { bottom: cover ? cover + space['space-3'] : insets.bottom + tabSpace + space['space-3'] }]}>{actionBar}</View> : null}
        {tabBar ? <View style={styles.tabs}>{tabBar}</View> : null}
        {overlay}
      </View>
      </KeyboardRevealProvider>
    </NavCollapsed.Provider>
  )
}

export type NavAction = { icon: LucideIcon; label: string; onPress: () => void; badge?: boolean }

type NavBarProps = {
  title: string
  /** A large title: a tab's root screen. Collapses into the inline bar on scroll. */
  large?: boolean
  /** Force the collapsed look; MobileScreen sets it from the scroll position. */
  collapsed?: boolean
  /** A small line above the large title. */
  eyebrow?: string
  /** The previous screen's name and how to go back ("Notices"). */
  back?: { label: string; onPress: () => void }
  /** Before the large title (Home: the school's logo tile). */
  leading?: ReactNode
  /** After the actions, e.g. the ChildSwitcher on a pushed screen. */
  trailing?: ReactNode
  /** Beside the large title (Home: the ChildSwitcher). */
  accessory?: ReactNode
  /** Up to two icon actions; the rest go in an ActionSheet. */
  actions?: NavAction[]
}

/** The iOS navigation bar: a large title on a tab's root screen, a 44px inline bar with a back button on pushed screens. */
export function NavBar({ title, large, collapsed: collapsedProp, eyebrow, back, leading, trailing, accessory, actions = [] }: NavBarProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const part = useContext(NavPart)
  const scrolled = useContext(NavCollapsed)
  const collapsed = collapsedProp ?? scrolled
  const android = Platform.OS === 'android'
  const showBarTitle = !large || collapsed

  const bar = (
    <View style={{ paddingTop: part ? insets.top : 0 }}>
      <View style={styles.navRow}>
        <View style={styles.navLead}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${back.label}`} onPress={back.onPress} hitSlop={6} style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}>
              <Icon icon={ChevronLeft} size={28} color={colors['accent-strong']} />
              {!android ? (
                <Text variant="m-nav-title" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: colors['accent-strong'], fontFamily: fontFamily[400], maxWidth: 96 }}>
                  {back.label}
                </Text>
              ) : null}
            </Pressable>
          ) : !large ? (
            leading
          ) : null}
          {android && showBarTitle ? (
            <Text variant="m-nav-title" accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, marginLeft: back ? 0 : space['space-2'] }}>
              {title}
            </Text>
          ) : null}
        </View>
        {!android && showBarTitle ? (
          <View pointerEvents="none" style={styles.navTitle}>
            <Text variant="m-nav-title" accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ textAlign: 'center' }}>
              {title}
            </Text>
          </View>
        ) : null}
        <View style={styles.navTrail}>
          {actions.slice(0, 2).map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.badge ? `${action.label}, new` : action.label}
              onPress={action.onPress}
              style={({ pressed }) => [styles.navIcon, pressed && { opacity: 0.5 }]}
            >
              <Icon icon={action.icon} size={22} color={colors['accent-strong']} />
              {action.badge ? <View style={[styles.navDot, { backgroundColor: colors['danger-solid'], boxShadow: `0 0 0 2px ${colors.bg}` }]} /> : null}
            </Pressable>
          ))}
          {trailing}
        </View>
      </View>
    </View>
  )

  const largeTitle = large ? (
    <View style={styles.large}>
      {/* The eyebrow (and the school's logo) get their own line, so a long school name never squeezes the title. */}
      {leading || eyebrow ? (
        <View style={styles.eyebrow}>
          {leading}
          {eyebrow ? (
            <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {eyebrow}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.largeRow}>
        <Text variant="m-large-title" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1 }}>
          {title}
        </Text>
        {accessory}
      </View>
    </View>
  ) : null

  if (part === 'large') return largeTitle
  const solid = large && !collapsed
  const barView = solid ? <View style={{ backgroundColor: colors.bg }}>{bar}</View> : <Chrome style={{ boxShadow: `0 0.5px 0 ${colors.border}` }}>{bar}</Chrome>
  if (part === 'bar') return barView
  return (
    <View>
      {barView}
      {largeTitle}
    </View>
  )
}

export type TabBarItem = { label: string; icon: LucideIcon; active: boolean; badge?: number; onPress: () => void }

/**
 * The app's native tab bar: 4–5 nouns, translucent, the active tab tinted (not a pill).
 * It floats over the screen; screens under it pass `tabs` to MobileScreen.
 */
export function TabBar({ items }: { items: TabBarItem[] }) {
  const { colors, shadows } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Chrome style={[styles.tabBar, { paddingBottom: insets.bottom, boxShadow: shadows['shadow-bar'] }]}>
      <View accessibilityRole="tablist" style={styles.tabRow}>
        {items.map((item) => {
          const tint = item.active ? colors['accent-strong'] : colors['ink-muted']
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: item.active }}
              accessibilityLabel={item.badge ? `${item.label}, ${item.badge} need attention` : item.label}
              onPress={() => {
                if (!item.active) haptic.selection()
                item.onPress()
              }}
              style={styles.tab}
            >
              <View>
                <item.icon size={22} color={tint} strokeWidth={item.active ? 2.25 : 1.75} />
                {item.badge ? (
                  <View style={styles.tabBadge}>
                    <CountBadge count={item.badge} />
                  </View>
                ) : null}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.3}
                style={{ color: tint, fontFamily: fontFamily[item.active ? 600 : 500], alignSelf: 'stretch', textAlign: 'center' }}
              >
                {item.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Chrome>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { gap: space['space-8'], paddingTop: space['space-2'], paddingHorizontal: space['space-4'] },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9 },
  action: { position: 'absolute', left: space['space-4'], right: space['space-4'], zIndex: 11 },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10 },
  navRow: { height: size['nav-bar-height'], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space['space-2'] },
  navLead: { flexDirection: 'row', alignItems: 'center', minWidth: 44, flexShrink: 1, zIndex: 1 },
  navTrail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, minWidth: 44, zIndex: 1 },
  navTitle: { position: 'absolute', left: 112, right: 112, top: 0, bottom: 0, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', height: 44, marginLeft: -6, paddingRight: space['space-2'] },
  navIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  navDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  large: { justifyContent: 'flex-end', gap: space['space-1'], minHeight: size['large-title-height'], paddingHorizontal: space['space-4'], paddingBottom: space['space-2'] },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space['space-2'] },
  largeRow: { flexDirection: 'row', alignItems: 'center', gap: space['space-3'] },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabRow: { flexDirection: 'row', paddingHorizontal: space['space-2'] },
  tab: { flex: 1, height: size['tab-bar-height'], alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 4 },
  tabBadge: { position: 'absolute', top: -4, left: 15 },
})
