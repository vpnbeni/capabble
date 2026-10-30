import { useRouter } from 'expo-router'
import { Bell } from 'lucide-react-native'

import type { NavAction } from '@/ui'

import { useUnreadCount } from './queries'

/** The bell for Today (staff) or Home (families): opens Notifications, with a dot while any are unread. */
export function useBell(): NavAction {
  const router = useRouter()
  const unread = useUnreadCount()
  const count = unread.data?.unread ?? 0
  return {
    icon: Bell,
    label: count ? `Notifications, ${count} unread` : 'Notifications',
    badge: count > 0,
    onPress: () => router.push('/notifications'),
  }
}
