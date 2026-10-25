import type { Href } from 'expo-router'
import { Award, Bus, CalendarClock, CalendarDays, ClipboardCheck, IdCard, Users, Wallet, type LucideIcon } from 'lucide-react-native'

import type { PortalSection } from '@/services/portalService'
import type { TileIndex } from '@/ui'

export type PortalModule = { label: string; icon: LucideIcon; tile: TileIndex; href: Href; section: PortalSection; tab?: boolean }

/**
 * The family app's places, each with its fixed identity tile (Calendar 1, Transport 2, Fees 3,
 * Timetable 4, Attendance 5, Results 6). Home shows them all; More shows the ones that aren't tabs.
 */
export const PORTAL_MODULES: PortalModule[] = [
  { label: 'Attendance', icon: ClipboardCheck, tile: 5, href: '/attendance', section: 'attendance' },
  { label: 'Timetable', icon: CalendarClock, tile: 4, href: '/timetable', section: 'timetable' },
  { label: 'Fees', icon: Wallet, tile: 3, href: '/fees', section: 'fees', tab: true },
  { label: 'Transport', icon: Bus, tile: 2, href: '/transport', section: 'transport' },
  { label: 'Results', icon: Award, tile: 6, href: '/results', section: 'results' },
  { label: 'Calendar', icon: CalendarDays, tile: 1, href: '/calendar', section: 'calendar', tab: true },
  { label: 'Meetings', icon: Users, tile: 2, href: '/meetings', section: 'appointments' },
  { label: 'Profile', icon: IdCard, tile: 1, href: '/profile', section: 'profile' },
]
