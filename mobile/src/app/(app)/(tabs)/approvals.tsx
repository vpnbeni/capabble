import { ListChecks } from 'lucide-react-native'
import { useState } from 'react'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { ApprovalList, useApprovals } from '@/staff/approvals'
import { ChipRail, MobileScreen, NavBar, StatusView, Surface, useToast } from '@/ui'

type Filter = 'all' | 'event' | 'meeting'

/** Principal: every event and meeting request waiting for a decision, swipe to approve or reject. */
export default function ApprovalsScreen() {
  const toast = useToast()
  const approvals = useApprovals()
  const [filter, setFilter] = useState<Filter>('all')
  const events = approvals.items.filter((item) => item.kind === 'event').length
  const meetings = approvals.items.length - events
  const shown = approvals.items.filter((item) => filter === 'all' || item.kind === filter)

  return (
    <MobileScreen tabs refreshing={approvals.isRefetching} onRefresh={approvals.refetch} nav={<NavBar large title="Approvals" />}>
      {events && meetings ? (
        <ChipRail
          label="Show"
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: approvals.items.length },
            { id: 'event', label: 'Events', count: events },
            { id: 'meeting', label: 'Meetings', count: meetings },
          ]}
        />
      ) : null}
      {approvals.isPending ? (
        <CardSkeleton rows={3} />
      ) : approvals.error && !approvals.items.length ? (
        <LoadFailed what="Approvals" error={approvals.error} onRetry={approvals.refetch} />
      ) : shown.length ? (
        <ApprovalList items={shown} onDone={(message, tone) => toast(message, tone)} />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={ListChecks} title="Nothing waiting for you" body="Events from teachers and meeting requests show here to approve." />
        </Surface>
      )}
    </MobileScreen>
  )
}
