// Haptics confirm, they don't decorate: at most one per user action (design system: Haptics).
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

const run = (effect: () => Promise<void>) => {
  if (Platform.OS === 'web') return
  effect().catch(() => {})
}

export const haptic = {
  /** A switch, a segment, a chip, a tab, a day in the week strip. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** A sheet snapping to a detent; a swipe action crossing its threshold. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A destructive action confirmed. */
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Payment succeeded, attendance submitted, leave sent. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something failed and needs attention. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
}
