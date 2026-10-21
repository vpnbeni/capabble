import React from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectUser } from '../redux/slices/authSlice'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import { getFirstEnabledPath, isCoreAllowedPath, isFeatureEnabledForPath } from '../constants/featureAccess'
import { usePermissions } from '@/hooks/usePermissions'
import { Button, Card, EmptyState, Page } from '@/components/ui'
import { Lock } from 'lucide-react'

// Pages a school without a plan can open: choosing it, billing, and who can sign in.
const SETUP_ALLOWED = ['/get-started', '/billing', '/settings/users', '/settings/roles', '/account-settings']

/** Guards the school (staff) panel. Parents and students are sent to the portal. */
const ProtectedRoute: React.FC = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const user = useSelector(selectUser)
  const location = useLocation()
  const navigate = useNavigate()
  const { hasSession } = useAcademicSession()
  const { access, isPortal } = usePermissions()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (isPortal) {
    return <Navigate to="/portal" replace />
  }

  if (user?.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  // If no academic session selected, redirect to session selector
  if (!hasSession) {
    return <Navigate to="/select-session" replace />
  }

  const accessMode = user?.billing?.accessMode
  // No plan yet: the school opts in to its trial before anything else.
  if (accessMode === 'setup_required' && !SETUP_ALLOWED.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))) {
    return <Navigate to="/get-started" replace />
  }
  if (accessMode === 'core_only' && !isCoreAllowedPath(location.pathname)) {
    return <Navigate to="/billing?reason=core-only" replace />
  }

  // School has the page turned on?
  if (!isFeatureEnabledForPath(location.pathname, user?.featureToggles)) {
    const fallbackPath = getFirstEnabledPath(access)
    if (fallbackPath && fallbackPath !== location.pathname) {
      return <Navigate to={fallbackPath} replace />
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Page disabled by admin</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Your platform administrator has disabled this page for your tenant.
          </p>
        </div>
      </div>
    )
  }

  // The user's role allows it? (The server enforces this too; this avoids a page of errors.)
  if (!isFeatureEnabledForPath(location.pathname, access)) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Lock}
            title="You don't have access to this page"
            body="Your role doesn't include it. Ask your school administrator if you need it."
            action={<Button variant="secondary" onClick={() => navigate('/home')}>Go to home</Button>}
          />
        </Card>
      </Page>
    )
  }

  return <Outlet />
}

export default ProtectedRoute
