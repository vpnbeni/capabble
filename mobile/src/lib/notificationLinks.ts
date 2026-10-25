import type { UserKind } from '@/services/authService'

/**
 * The app screen for a staff notification's website link, or null when the app has no screen
 * for it (the notifications list then offers the website page instead).
 */
export function staffRouteFor(link: string): string | null {
  const [path, query = ''] = String(link || '').split('?')
  const params = new URLSearchParams(query)
  const clean = path.replace(/\/+$/, '') || '/'
  if (clean === '/calendar') {
    const event = params.get('event')
    const date = params.get('date')
    return event ? `/calendar?event=${encodeURIComponent(event)}${date ? `&date=${encodeURIComponent(date)}` : ''}` : '/calendar'
  }
  // A teacher's event waiting for the principal opens Approvals; a decision on one's own event, the calendar.
  if (clean === '/calendar/events') return params.get('status') === 'pending_approval' ? '/approvals' : '/calendar'
  if (clean.startsWith('/appnt')) return '/meetings'
  if (clean === '/timetable' || clean.startsWith('/time-table')) return '/timetable'
  if (clean.startsWith('/attnd/student')) return '/registers'
  if (clean === '/' || clean === '/dashboard' || clean === '/home') return '/'
  return null
}

/**
 * The screen to open for a notification. The API stores the website's link
 * (`/portal/fees`, `/portal/calendar?event=…`); this maps it to the app's routes.
 * Anything unknown opens Home.
 */
export function appRouteFor(link: string, kind: UserKind): string {
  if (kind === 'staff') return staffRouteFor(link) ?? '/'
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
    case 'homework':
    case 'transport':
    case 'profile':
      return `/${section}`
    case 'appointments':
      return '/meetings'
    default:
      return '/'
  }
}
