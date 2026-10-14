import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectUser } from '../redux/slices/authSlice'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import { getFirstEnabledPath, isCoreAllowedPath, isFeatureEnabledForPath } from '../constants/featureAccess'

const ProtectedRoute: React.FC = () => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const user = useSelector(selectUser)
  const location = useLocation()
  const { hasSession } = useAcademicSession()

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  // If no academic session selected, redirect to session selector
  if (!hasSession) {
    return <Navigate to="/select-session" replace />
  }

  const accessMode = user?.billing?.accessMode
  if (accessMode === 'core_only' && !isCoreAllowedPath(location.pathname)) {
    return <Navigate to="/billing?reason=core-only" replace />
  }

  const featureAllowed = isFeatureEnabledForPath(location.pathname, user?.featureToggles)
  if (!featureAllowed) {
    const fallbackPath = getFirstEnabledPath(user?.featureToggles)
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

  return <Outlet />
}

export default ProtectedRoute
