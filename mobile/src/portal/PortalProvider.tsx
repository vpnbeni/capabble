import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { storage } from '@/lib/storage'
import type { PortalChild, PortalHome, PortalSection } from '@/services/portalService'
import { useSession } from '@/session/SessionProvider'

import { usePortalHome } from './queries'

const CHILD_KEY = 'capabble.child'

type Portal = {
  /** null while loading, for staff, or when it failed to load. */
  home: PortalHome | null
  homeQuery: ReturnType<typeof usePortalHome>
  /** The child a parent is looking at (a student's own record for students). */
  child: PortalChild | null
  setChildId: (id: string) => void
  isParent: boolean
  /** Whether the school has turned this section on for this login. */
  has: (section: PortalSection) => boolean
}

const PortalContext = createContext<Portal | null>(null)

/** Family logins: the portal home, which child is selected and which sections are on. Mirrors client/src/portal/PortalContext.tsx. */
export function PortalProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const isFamily = session.status === 'signedIn' && session.user.kind !== 'staff'
  const homeQuery = usePortalHome(isFamily)
  const home = homeQuery.data ?? null
  const [childId, setChildIdState] = useState<string | null>(null)

  useEffect(() => {
    storage.get(CHILD_KEY).then((saved) => {
      if (saved) setChildIdState((current) => current ?? saved)
    })
  }, [])

  const setChildId = useCallback((id: string) => {
    setChildIdState(id)
    storage.set(CHILD_KEY, id)
  }, [])

  const value = useMemo<Portal>(
    () => ({
      home,
      homeQuery,
      child: home?.students.find((entry) => entry.studentId === childId) ?? home?.students[0] ?? null,
      setChildId,
      isParent: home?.kind === 'parent',
      has: (section) => Boolean(home?.sections.includes(section)),
    }),
    [home, homeQuery, childId, setChildId],
  )

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export const usePortal = () => {
  const portal = useContext(PortalContext)
  if (!portal) throw new Error('usePortal must be used inside PortalProvider')
  return portal
}
