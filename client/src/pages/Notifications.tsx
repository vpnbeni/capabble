import React from 'react'
import { Page } from '@/components/ui'
import NotificationsList from '@/components/notifications/NotificationsList'

/** Everything the bell has shown this person (title and subtitle come from Header.tsx). */
const Notifications: React.FC = () => (
  <Page>
    <NotificationsList audience="staff" />
  </Page>
)

export default Notifications
