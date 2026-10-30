import type { Login } from '@/services/usersService'

/** Same words as the website's Users and access. */
export const loginBadge = (login: Login) =>
  !login.isActive
    ? { label: 'Turned off', tone: 'neutral' as const }
    : login.lockedUntil
      ? { label: 'Locked', tone: 'danger' as const }
      : login.invitePending
        ? { label: 'Invite sent', tone: 'warning' as const }
        : undefined
