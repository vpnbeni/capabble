import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearAuthToken,
  fetchAuthMe,
  getAuthToken,
  loginRequest,
  setAuthToken,
  setScholRole,
} from '@/services/api'

type ScholRole = 'viewer' | 'analyst' | 'admin' | 'sales'

interface AuthContextValue {
  role: ScholRole
  setRole: (role: ScholRole) => void
  canViewRaw: boolean
  canExport: boolean
  canAddProspect: boolean
  username: string | null
  isAuthenticated: boolean
  authReady: boolean
  authRequired: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_KEY = 'schol_username'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<ScholRole>(
    (localStorage.getItem('schol_role') as ScholRole) || 'admin',
  )
  const [username, setUsername] = useState<string | null>(localStorage.getItem(USER_KEY))
  const [hasSession, setHasSession] = useState(Boolean(getAuthToken()))
  const [authReady, setAuthReady] = useState(false)
  const [authRequired, setAuthRequired] = useState(true)

  useEffect(() => {
    setScholRole(role)
  }, [role])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const existing = getAuthToken()

      if (!existing) {
        try {
          const me = await fetchAuthMe()
          if (cancelled) return
          setAuthRequired(me.auth_enabled)
          if (!me.auth_enabled) {
            setUsername(me.username)
            setRoleState((me.role as ScholRole) || 'admin')
            setHasSession(true)
          } else {
            setHasSession(false)
          }
        } catch {
          if (cancelled) return
          // Likely auth-enabled API rejecting anonymous /me
          setAuthRequired(true)
          setHasSession(false)
        } finally {
          if (!cancelled) setAuthReady(true)
        }
        return
      }

      try {
        const me = await fetchAuthMe()
        if (cancelled) return
        setAuthRequired(me.auth_enabled)
        setUsername(me.username)
        localStorage.setItem(USER_KEY, me.username)
        setRoleState((me.role as ScholRole) || 'admin')
        setHasSession(true)
        if (!me.auth_enabled) {
          clearAuthToken()
        }
      } catch {
        if (cancelled) return
        clearAuthToken()
        localStorage.removeItem(USER_KEY)
        setHasSession(false)
        setUsername(null)
        setAuthRequired(true)
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const setRole = useCallback((next: ScholRole) => {
    localStorage.setItem('schol_role', next)
    setScholRole(next)
    setRoleState(next)
  }, [])

  const login = useCallback(
    async (user: string, password: string) => {
      const res = await loginRequest(user, password)
      setAuthToken(res.token)
      localStorage.setItem(USER_KEY, res.username)
      setHasSession(true)
      setUsername(res.username)
      setRole((res.role as ScholRole) || 'admin')
      setAuthRequired(true)
    },
    [setRole],
  )

  const logout = useCallback(() => {
    clearAuthToken()
    localStorage.removeItem(USER_KEY)
    setHasSession(false)
    setUsername(null)
  }, [])

  const isAuthenticated = authRequired ? hasSession : true

  const value = useMemo(
    () => ({
      role,
      setRole,
      canViewRaw: role === 'admin' || role === 'analyst',
      canExport: role !== 'viewer',
      canAddProspect: role === 'sales' || role === 'admin',
      username,
      isAuthenticated,
      authReady,
      authRequired,
      login,
      logout,
    }),
    [role, setRole, username, isAuthenticated, authReady, authRequired, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
