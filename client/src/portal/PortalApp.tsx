import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { School } from 'lucide-react'
import { Card, EmptyState, Page } from '@/components/ui'
import Loader from '@/components/common/Loader'
import { usePortalHome } from './usePortal'
import { PortalProvider, usePortal } from './PortalContext'
import PortalLayout from './PortalLayout'
import PortalOverview from './pages/PortalOverview'
import PortalAttendance from './pages/PortalAttendance'
import PortalTimetable from './pages/PortalTimetable'
import PortalResults from './pages/PortalResults'
import PortalFees from './pages/PortalFees'
import { PortalNoticeDetail, PortalNotices } from './pages/PortalNotices'
import PortalTransport from './pages/PortalTransport'
import PortalAppointments from './pages/PortalAppointments'
import PortalProfile from './pages/PortalProfile'
import PortalAccount from './pages/PortalAccount'
import type { PortalSection } from './portalService'

const Guard: React.FC<{ section: PortalSection; children: React.ReactElement }> = ({ section, children }) => {
  const { has } = usePortal()
  return has(section) ? children : <Navigate to="/portal" replace />
}

/** The parent / student portal, loaded only for portal logins. */
const PortalApp: React.FC = () => {
  const { data: home, isLoading, isError } = usePortalHome()

  if (isLoading) {
    return <Loader size="lg" fullScreen />
  }
  if (isError || !home) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={School}
            title="The portal didn't load"
            body="Check your connection and refresh the page. If it keeps happening, contact the school office."
          />
        </Card>
      </Page>
    )
  }

  return (
    <PortalProvider home={home}>
      <Routes>
        <Route element={<PortalLayout />}>
          <Route index element={<PortalOverview />} />
          <Route path="attendance" element={<Guard section="attendance"><PortalAttendance /></Guard>} />
          <Route path="timetable" element={<Guard section="timetable"><PortalTimetable /></Guard>} />
          <Route path="results" element={<Guard section="results"><PortalResults /></Guard>} />
          <Route path="fees" element={<Guard section="fees"><PortalFees /></Guard>} />
          <Route path="notices" element={<Guard section="notices"><PortalNotices /></Guard>} />
          <Route path="notices/:id" element={<Guard section="notices"><PortalNoticeDetail /></Guard>} />
          <Route path="transport" element={<Guard section="transport"><PortalTransport /></Guard>} />
          <Route path="appointments" element={<Guard section="appointments"><PortalAppointments /></Guard>} />
          <Route path="profile" element={<PortalProfile />} />
          <Route path="account" element={<PortalAccount />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
      </Routes>
    </PortalProvider>
  )
}

export default PortalApp
