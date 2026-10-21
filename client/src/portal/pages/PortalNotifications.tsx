import React from 'react'
import { Page, PageHeader } from '@/components/ui'
import NotificationsList from '@/components/notifications/NotificationsList'

/** Messages from school for this family login: attendance, fees, results, meetings, the bus. */
const PortalNotifications: React.FC = () => (
  <Page>
    <PageHeader title="Notifications" subtitle="Updates from school about your children" />
    <NotificationsList audience="portal" />
  </Page>
)

export default PortalNotifications
