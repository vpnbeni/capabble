import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const STORAGE_KEY = 'capabble-academic-session'

interface AcademicSessionContextType {
  /** Currently selected session label, e.g. "2025-2026" */
  currentSession: string | null
  /** Set the active session and persist to localStorage */
  setSession: (label: string) => void
  /** Clear the selected session (e.g. on logout) */
  clearSession: () => void
  /** Whether a session has been selected */
  hasSession: boolean
}

const AcademicSessionContext = createContext<AcademicSessionContextType>({
  currentSession: null,
  setSession: () => {},
  clearSession: () => {},
  hasSession: false,
})

export const AcademicSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentSession, setCurrentSession] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) || null
  })
  const queryClient = useQueryClient()

  const setSession = useCallback((label: string) => {
    localStorage.setItem(STORAGE_KEY, label)
    setCurrentSession(label)
    // Invalidate all queries so they re-fetch with the new session header
    queryClient.invalidateQueries()
  }, [queryClient])

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setCurrentSession(null)
    queryClient.clear()
  }, [queryClient])

  // If user logs out (token removed), also clear session
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'token' && !e.newValue) {
        clearSession()
      }
      if (e.key === STORAGE_KEY) {
        setCurrentSession(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [clearSession])

  return (
    <AcademicSessionContext.Provider
      value={{
        currentSession,
        setSession,
        clearSession,
        hasSession: Boolean(currentSession),
      }}
    >
      {children}
    </AcademicSessionContext.Provider>
  )
}

export const useAcademicSession = () => useContext(AcademicSessionContext)

/**
 * Utility to get the current session label from localStorage
 * (used by the API interceptor which doesn't have access to React context).
 */
export const getAcademicSessionHeader = (): string | null => {
  return localStorage.getItem(STORAGE_KEY)
}

export default AcademicSessionContext
