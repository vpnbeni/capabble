import { usePortalCalendar, usePortalEvent, useRespondToEvent } from '@/portal/queries'
import { useSession } from '@/session/SessionProvider'
import { useStaffCalendar, useStaffEvent, useStaffRespond } from '@/staff/queries'

// The calendar screens and the item sheet are shared by families and staff; the data comes from
// /portal/calendar for families and /calendar/me for staff (same shapes). Both hooks always run
// (rules of hooks); only the one for this login is enabled.

const useIsStaff = () => {
  const session = useSession()
  return session.status === 'signedIn' && session.user.kind === 'staff'
}

export function useCalendarRange(from: string, to: string, enabled = true) {
  const staff = useIsStaff()
  const family = usePortalCalendar(from, to, enabled && !staff)
  const mine = useStaffCalendar(from, to, enabled && staff)
  return staff ? mine : family
}

export function useCalendarEvent(id?: string | null) {
  const staff = useIsStaff()
  const family = usePortalEvent(staff ? null : id)
  const mine = useStaffEvent(id, staff)
  return staff ? mine : family
}

export function useCalendarReply() {
  const staff = useIsStaff()
  const family = useRespondToEvent()
  const mine = useStaffRespond()
  return staff ? mine : family
}
