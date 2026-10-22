import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { OverlayShell } from '@/components/ui/overlays'
import Sidebar from './Sidebar'
import Header from './Header'
import BillingBanner from './BillingBanner'
import { AttndMatrixModeProvider } from '@/contexts/AttndMatrixModeContext'
import { CommandPaletteProvider } from '@/components/commandPalette/CommandPaletteProvider'

const SIDEBAR_EXPANDED_DEFAULT = 248
const SIDEBAR_EXPANDED_MIN = 232
const SIDEBAR_EXPANDED_MAX = 420
const SIDEBAR_COLLAPSED_WIDTH = 64
const MOBILE_NAV_WIDTH = 288
const SIDEBAR_WIDTH_STORAGE_KEY = 'layout:sidebarWidth:v2'
const SIDEBAR_WIDTH_MANUAL_KEY = 'layout:sidebarWidthManual:v2'

const clampSidebarWidth = (width: number) =>
  Math.max(SIDEBAR_EXPANDED_MIN, Math.min(SIDEBAR_EXPANDED_MAX, Math.round(width)))

const Layout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_EXPANDED_DEFAULT)
  const [fitToContent, setFitToContent] = useState(true)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const resizeRafRef = useRef<number | null>(null)
  const fitToContentRef = useRef(true)
  const isSidebarCollapsedRef = useRef(false)
  const isResizingSidebarRef = useRef(false)

  fitToContentRef.current = fitToContent
  isSidebarCollapsedRef.current = isSidebarCollapsed
  isResizingSidebarRef.current = isResizingSidebar

  // Below 1024px the sidebar shows icons only, so pages keep their width on tablets.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      if (query.matches) setIsSidebarCollapsed(true)
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  // Phones get no rail at all: the header's menu button opens the full sidebar as a drawer.
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const apply = () => {
      setIsMobile(query.matches)
      if (!query.matches) setIsMobileNavOpen(false)
    }
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const manual = window.localStorage.getItem(SIDEBAR_WIDTH_MANUAL_KEY) === '1'
    if (!manual) {
      setFitToContent(true)
      return
    }

    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (Number.isFinite(stored)) {
      setFitToContent(false)
      setSidebarWidth(clampSidebarWidth(stored))
    }
  }, [])

  useEffect(() => {
    if (isSidebarCollapsed || fitToContent) return
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
    window.localStorage.setItem(SIDEBAR_WIDTH_MANUAL_KEY, '1')
  }, [sidebarWidth, isSidebarCollapsed, fitToContent])

  const handleContentWidthChange = useCallback((contentWidth: number) => {
    if (!fitToContentRef.current || isSidebarCollapsedRef.current || isResizingSidebarRef.current) {
      return
    }
    const next = clampSidebarWidth(contentWidth)
    setSidebarWidth((prev) => (prev === next ? prev : next))
  }, [])

  const handleResizeStart = () => {
    if (isSidebarCollapsed) return
    setFitToContent(false)
    setIsResizingSidebar(true)
  }

  const handleResizeDoubleClick = () => {
    if (isSidebarCollapsed) return
    window.localStorage.removeItem(SIDEBAR_WIDTH_MANUAL_KEY)
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY)
    setFitToContent(true)
  }

  useEffect(() => {
    if (!isResizingSidebar) return

    const handleMouseMove = (event: MouseEvent) => {
      if (resizeRafRef.current !== null) window.cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = window.requestAnimationFrame(() => {
        setSidebarWidth(clampSidebarWidth(event.clientX))
      })
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingSidebar])

  const currentSidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth

  return (
    <CommandPaletteProvider>
    <AttndMatrixModeProvider>
    <div className="cb-shell relative flex h-screen overflow-hidden">
      {isMobile ? (
        <OverlayShell open={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} variant="drawer">
          {(trapRef) => (
            <div ref={trapRef} className="cb-navdrawer" role="dialog" aria-modal="true" aria-label="Main menu">
              <Sidebar
                isCollapsed={false}
                expandedWidth={MOBILE_NAV_WIDTH}
                collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
              />
            </div>
          )}
        </OverlayShell>
      ) : (
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          expandedWidth={sidebarWidth}
          collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
          fitToContent={fitToContent}
          onContentWidthChange={handleContentWidthChange}
        />
      )}

      {/* Resize handle sits on the sidebar's right border (below sidebar z so account menus stay on top) */}
      {!isMobile ? <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize · Double-click to fit menu"
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeDoubleClick}
        style={{ left: currentSidebarWidth }}
        className={`group absolute inset-y-0 z-20 w-3 cursor-col-resize ${
          isSidebarCollapsed ? 'pointer-events-none' : ''
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-[3px] bg-[color:var(--accent)] transition-opacity ${
            isResizingSidebar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      </div> : null}

      {/* Main Content */}
      <div className="relative min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header
          isSidebarCollapsed={isMobile ? !isMobileNavOpen : isSidebarCollapsed}
          isMobileNav={isMobile}
          onToggleSidebar={() => (isMobile ? setIsMobileNavOpen((prev) => !prev) : setIsSidebarCollapsed((prev) => !prev))}
        />
        <BillingBanner />

        {/* Page Content */}
        <main
          id="app-main-scroll"
          className="relative flex-1 overflow-x-hidden overflow-y-auto animate-page-enter"
        >
          <Outlet />
        </main>
      </div>
    </div>
    </AttndMatrixModeProvider>
    </CommandPaletteProvider>
  )
}

export default Layout
