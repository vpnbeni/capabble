import sessionService from '@/services/sessionService'
import type { User } from '@/types/auth'

/** Where a signed-in user belongs: the family portal, the password screen or the school panel. */
export const landingPathFor = (user: User | null | undefined, hasSession: boolean): string => {
  if (!user) return '/login'
  if (user.mustChangePassword) return '/change-password'
  if (user.kind === 'parent' || user.kind === 'student') return '/portal'
  return hasSession ? '/home' : '/select-session'
}

/**
 * Staff work inside an academic session. Pick the school's current one so a
 * fresh sign-in lands straight in the panel; fall back to the session picker.
 */
export const enterStaffPanel = async (setSession: (label: string) => void): Promise<string> => {
  try {
    const available = await sessionService.getAvailableSessions()
    const fallbackCurrent = available?.data?.find((session) => session.isCurrent)?.label || null
    const currentLabel = available?.meta?.currentLabel || fallbackCurrent
    if (currentLabel) {
      await sessionService.createSession(currentLabel)
      setSession(currentLabel)
      return '/home'
    }
  } catch (error) {
    console.warn('Unable to auto-select current academic session:', error)
  }
  return '/select-session'
}
