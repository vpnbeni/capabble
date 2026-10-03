import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BillingBanner from './BillingBanner'
import { AttndMatrixModeProvider } from '@/contexts/AttndMatrixModeContext'

const SIDEBAR_EXPANDED_DEFAULT = 208
const SIDEBAR_EXPANDED_MIN = 176
const SIDEBAR_EXPANDED_MAX = 420
const SIDEBAR_COLLAPSED_WIDTH = 80
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
    <AttndMatrixModeProvider>
    <div className="relative flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        expandedWidth={sidebarWidth}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        fitToContent={fitToContent}
        onContentWidthChange={handleContentWidthChange}
      />

      {/* Resize handle sits on the sidebar's right border (below sidebar z so account menus stay on top) */}
      <div
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
          className={`absolute inset-y-0 left-0 w-[3px] bg-blue-500/80 transition-opacity ${
            isResizingSidebar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        />
        <BillingBanner />

        {/* Page Content */}
        <main
          id="app-main-scroll"
          className="flex-1 overflow-x-hidden overflow-y-auto animate-page-enter"
        >
          <Outlet />
        </main>
      </div>
    </div>
    </AttndMatrixModeProvider>
  )
}

export default Layout
