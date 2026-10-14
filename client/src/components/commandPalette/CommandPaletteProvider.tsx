import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import { getTenantHeader } from '@/utils/tenantRuntime'
import { findPageForPath } from './pageIndex'
import { memoryKey, recordVisit } from './storage'

// The palette UI is split into its own chunk; only this provider and the shortcut ship in the main bundle.
const loadPalette = () => import('./CommandPalette')
const CommandPalette = lazy(loadPalette)

type CommandPaletteContextValue = {
  isOpen: boolean
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  isOpen: false,
  openPalette: () => {},
  closePalette: () => {},
  togglePalette: () => {},
})

export const useCommandPalette = () => useContext(CommandPaletteContext)

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

export const CommandPaletteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const location = useLocation()
  const user = useSelector(selectUser)
  const storageKey = memoryKey(getTenantHeader(), user?._id)

  const openPalette = useCallback(() => {
    setHasOpened(true)
    setIsOpen(true)
  }, [])
  const closePalette = useCallback(() => setIsOpen(false), [])
  const togglePalette = useCallback(() => {
    setHasOpened(true)
    setIsOpen((open) => !open)
  }, [])

  // ⌘K / Ctrl+K anywhere toggles the palette; "/" opens it when not typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        togglePalette()
        return
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPalette, togglePalette])

  // Warm the palette chunk once the app is idle so the first ⌘K opens instantly.
  useEffect(() => {
    const idle = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined
    const handle = idle ? idle(() => void loadPalette()) : window.setTimeout(() => void loadPalette(), 2000)
    return () => {
      if (idle) (window as any).cancelIdleCallback?.(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  // Count page visits for "Frequently used".
  useEffect(() => {
    const page = findPageForPath(location.pathname)
    if (page) recordVisit(storageKey, page.path)
  }, [location.pathname, storageKey])

  const value = useMemo(
    () => ({ isOpen, openPalette, closePalette, togglePalette }),
    [isOpen, openPalette, closePalette, togglePalette]
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {hasOpened ? (
        <Suspense fallback={null}>
          <CommandPalette open={isOpen} onClose={closePalette} storageKey={storageKey} />
        </Suspense>
      ) : null}
    </CommandPaletteContext.Provider>
  )
}
