import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectAuth } from '@/redux/slices/authSlice'

/** Guards the family portal: parent and student logins only. Staff go back to the panel. */
const PortalRoute: React.FC = () => {
  const { isAuthenticated, user } = useSelector(selectAuth)
  const location = useLocation()

  if (!isAuthenticated || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (user.kind !== 'parent' && user.kind !== 'student') return <Navigate to="/home" replace />

  return <Outlet />
}

export default PortalRoute
