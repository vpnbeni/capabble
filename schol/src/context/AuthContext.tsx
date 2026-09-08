import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setScholRole } from '@/services/api'

type ScholRole = 'viewer' | 'analyst' | 'admin' | 'sales'

interface AuthContextValue {
  role: ScholRole
  setRole: (role: ScholRole) => void
  canViewRaw: boolean
  canExport: boolean
  canAddProspect: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<ScholRole>(
    (localStorage.getItem('schol_role') as ScholRole) || 'analyst',
  )

  useEffect(() => {
    setScholRole(role)
  }, [role])

  const value = useMemo(
    () => ({
      role,
      setRole: (next: ScholRole) => {
        localStorage.setItem('schol_role', next)
        setScholRole(next)
        setRole(next)
      },
      canViewRaw: role === 'admin' || role === 'analyst',
      canExport: role !== 'viewer',
      canAddProspect: role === 'sales' || role === 'admin',
    }),
    [role],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
