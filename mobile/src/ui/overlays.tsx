import { X } from 'lucide-react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space, type Tone } from '@/theme/tokens'

import { IconButton } from './controls'
import { Text } from './Text'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  /** Buttons pinned under the scrolling body. */
  footer?: ReactNode
}

/**
 * A bottom sheet for details and short forms that shouldn't leave the screen (a calendar item,
 * a fee breakdown). Closes on the backdrop, the close button and Android back.
 */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const { colors, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    // No fade on web: react-native-web never finishes it when the screen under it is hidden (a tab switch).
    <Modal visible={open} transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(25,27,28,0.4)' }]}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            { backgroundColor: colors['surface-raised'], paddingBottom: Math.max(insets.bottom, space['space-4']) },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors['border-strong'] }]} />
          <View style={styles.header}>
            <View style={{ flex: 1, gap: space['space-1'] }}>
              <Text variant="section-title" accessibilityRole="header">
                {title}
              </Text>
              {description ? (
                <Text variant="body" tone="muted">
                  {description}
                </Text>
              ) : null}
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  )
}

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** 'danger' for a destructive decision; its confirm button is the danger variant. */
  tone?: 'default' | 'danger'
  children?: ReactNode
  /** Buttons, the confirming one last. */
  footer: ReactNode
}

/** A decision in the middle of the screen (cancel a meeting). Up to 4 fields; anything bigger is a Sheet or a screen. */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const { colors, scheme } = useTheme()
  return (
    <Modal visible={open} transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.center}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(25,27,28,0.4)' }]}
        />
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors['surface-raised'] }]}>
          <View style={{ gap: space['space-1'] }}>
            <Text variant="card-title" accessibilityRole="header">
              {title}
            </Text>
            {description ? (
              <Text variant="body" tone="muted">
                {description}
              </Text>
            ) : null}
          </View>
          {children}
          <View style={styles.dialogFooter}>{footer}</View>
        </View>
      </View>
    </Modal>
  )
}

type Toast = { id: number; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

/** Brief confirmation above the tab bar. Errors that need action belong in a Banner instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string, tone: Tone = 'success') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ id: Date.now(), message, tone })
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toastWrap, { bottom: insets.bottom + size['bottom-nav-height'] + space['space-3'] }]}
        >
          <View style={[styles.toast, { backgroundColor: colors.ink }]}>
            <View style={[styles.toastDot, { backgroundColor: colors[`${toast.tone}-solid`] }]} />
            <Text variant="body" style={{ color: colors['ink-inverse'], flexShrink: 1 }}>
              {toast.message}
            </Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    maxHeight: '90%',
    borderTopLeftRadius: radius['radius-lg'],
    borderTopRightRadius: radius['radius-lg'],
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: space['space-2'] },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['space-2'],
    paddingLeft: space['space-4'],
    paddingRight: space['space-2'],
    paddingTop: space['space-2'],
  },
  body: { padding: space['space-4'], gap: space['space-4'] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: space['space-2'],
    paddingHorizontal: space['space-4'],
    paddingTop: space['space-3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, justifyContent: 'center', padding: space['space-4'] },
  dialog: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: radius['radius-lg'],
    padding: space['space-5'],
    gap: space['space-4'],
  },
  dialogFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space['space-2'] },
  toastWrap: { position: 'absolute', left: space['space-4'], right: space['space-4'], alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-2'],
    paddingHorizontal: space['space-4'],
    paddingVertical: space['space-3'],
    borderRadius: radius['radius-md'],
    maxWidth: 480,
  },
  toastDot: { width: 8, height: 8, borderRadius: 4 },
})
