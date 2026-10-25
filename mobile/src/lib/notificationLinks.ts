import type { UserKind } from '@/services/authService'

/**
 * The screen to open for a notification. The API stores the website's link
 * (`/portal/fees`, `/portal/calendar?event=…`); this maps it to the app's routes.
 * Staff have only Home in the app so far. Anything unknown opens Home.
 */
export function appRouteFor(link: string, kind: UserKind): string {
  if (kind === 'staff') return '/'
  const [path, query = ''] = String(link || '').split('?')
  const parts = path.replace(/^\/+|\/+$/g, '').split('/')
  if (parts[0] !== 'portal') return '/'
  const [, section, id] = parts
  switch (section) {
    case 'fees':
    case 'notices':
      return id && section === 'notices' ? `/notice/${encodeURIComponent(id)}` : `/${section}`
    case 'calendar': {
      const event = new URLSearchParams(query).get('event')
      return event ? `/calendar?event=${encodeURIComponent(event)}` : '/calendar'
    }
    case 'attendance':
    case 'results':
    case 'timetable':
    case 'transport':
    case 'profile':
      return `/${section}`
    case 'appointments':
      return '/meetings'
    default:
      return '/'
  }
}
