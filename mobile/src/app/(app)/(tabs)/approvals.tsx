import { ListChecks } from 'lucide-react-native'

import { ComingSoon } from '@/staff/ComingSoon'
import { MobileScreen, NavBar } from '@/ui'

/** Principal: calendar events and meeting requests waiting for a decision. */
export default function ApprovalsScreen() {
  return (
    <MobileScreen tabs nav={<NavBar large title="Approvals" />}>
      <ComingSoon
        icon={ListChecks}
        title="Approvals come in a later update"
        body="Events teachers want to send to families, and meeting requests, to approve or reject with a swipe."
        webPath="/calendar/events"
      />
    </MobileScreen>
  )
}
