import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PortalChild, PortalHome, PortalSection } from './portalService'

const CHILD_KEY = 'cb-portal-child'

interface PortalContextValue {
  home: PortalHome
  child: PortalChild | null
  setChildId: (id: string) => void
  isParent: boolean
  has: (section: PortalSection) => boolean
}

const PortalContext = createContext<PortalContextValue | null>(null)

const readStoredChild = () => {
  try {
    return window.localStorage.getItem(CHILD_KEY)
  } catch {
    return null
  }
}

/** Which child a parent is looking at, and which portal sections the school has turned on. */
export const PortalProvider: React.FC<{ home: PortalHome; children: React.ReactNode }> = ({ home, children }) => {
  const [childId, setChildIdState] = useState<string | null>(readStoredChild)

  useEffect(() => {
    if (!home.students.some((child) => child.studentId === childId)) {
      setChildIdState(home.students[0]?.studentId || null)
    }
  }, [home.students, childId])

  const value = useMemo<PortalContextValue>(() => ({
    home,
    child: home.students.find((entry) => entry.studentId === childId) || home.students[0] || null,
    setChildId: (id: string) => {
      setChildIdState(id)
      try {
        window.localStorage.setItem(CHILD_KEY, id)
      } catch {
        // Remembering the choice is a convenience only.
      }
    },
    isParent: home.kind === 'parent',
    has: (section) => home.sections.includes(section),
  }), [home, childId])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export const usePortal = (): PortalContextValue => {
  const value = useContext(PortalContext)
  if (!value) throw new Error('usePortal must be used inside PortalProvider')
  return value
}
