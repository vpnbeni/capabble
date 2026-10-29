import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { setSessionEndedHandler, setStaffSession, setTenantSlug } from '@/lib/api'
import { unregisterFromPush } from '@/lib/push'
import { storage } from '@/lib/storage'
import { authService, type School, type User } from '@/services/authService'

const SCHOOL_KEY = 'capabble.school'

type SessionState =
  | { status: 'loading'; user: null; school: School | null }
  | { status: 'signedOut'; user: null; school: School | null }
  | { status: 'signedIn'; user: User; school: School }

type Session = SessionState & {
  signIn: (school: School, identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Forget the remembered school (sign in to a different one). */
  forgetSchool: () => Promise<void>
  /** Replace the signed-in user with the server's latest copy (after a password change). */
  updateUser: (user: User) => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>({ status: 'loading', user: null, school: null })

  const endSession = useCallback(
    (school: School | null) => {
      queryClient.clear()
      setStaffSession(false)
      setState({ status: 'signedOut', user: null, school })
    },
    [queryClient],
  )

  // On launch: the OS kept the session cookies, so ask who we are.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const saved = await storage.get(SCHOOL_KEY)
      const school: School | null = saved ? JSON.parse(saved) : null
      if (!school) {
        if (!cancelled) setState({ status: 'signedOut', user: null, school: null })
        return
      }
      setTenantSlug(school.slug)
      try {
        const user = await authService.me()
        setStaffSession(user.kind === 'staff')
        if (!cancelled) setState({ status: 'signedIn', user, school })
      } catch {
        if (!cancelled) setState({ status: 'signedOut', user: null, school })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSessionEndedHandler(() => setState((current) => (current.status === 'signedIn' ? { status: 'signedOut', user: null, school: current.school } : current)))
    return () => setSessionEndedHandler(null)
  }, [])

  const signIn = useCallback(async (school: School, identifier: string, password: string) => {
    setTenantSlug(school.slug)
    const { user } = await authService.login(identifier, password)
    setStaffSession(user.kind === 'staff')
    await storage.set(SCHOOL_KEY, JSON.stringify(school))
    setState({ status: 'signedIn', user, school })
  }, [])

  const signOut = useCallback(async () => {
    const school = state.school
    // Stop pushes to this phone first, while the session can still say so.
    if (state.user) await unregisterFromPush(state.user.kind)
    try {
      await authService.logout()
    } catch {
      // Signed out locally either way; the server session ends when it expires.
    }
    endSession(school)
  }, [endSession, state.school, state.user])

  const forgetSchool = useCallback(async () => {
    await storage.remove(SCHOOL_KEY)
    setTenantSlug(null)
    setStaffSession(false)
    setState({ status: 'signedOut', user: null, school: null })
  }, [])

  const updateUser = useCallback((user: User) => {
    setState((current) => (current.status === 'signedIn' ? { ...current, user } : current))
  }, [])

  const value = useMemo(
    () => ({ ...state, signIn, signOut, forgetSchool, updateUser }) as Session,
    [state, signIn, signOut, forgetSchool, updateUser],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
