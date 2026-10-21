import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Select,
  formatRelative,
  type DataTableColumn,
} from '@/components/ui'
import { useMarkNotificationsRead, useNotificationList, useUnreadNotificationCount } from '@/hooks/useNotifications'
import type { AppNotification, NotificationAudience } from '@/services/notificationService'

const AREAS: Record<string, string> = {
  core: 'Account',
  appnt: 'Appointments',
  exmcl: 'Exams',
  cntr: 'Exam centre',
  timetable: 'Timetable',
  cpitl: 'Finance',
  attnd: 'Attendance',
  trnst: 'Transport',
  asets: 'Assets',
  billing: 'Plan and billing',
}

// What each audience can receive, in the order the filter lists them.
const AREA_OPTIONS: Record<NotificationAudience, string[]> = {
  staff: ['core', 'appnt', 'exmcl', 'cntr', 'timetable', 'cpitl', 'asets', 'billing'],
  portal: ['core', 'attnd', 'exmcl', 'cpitl', 'timetable', 'trnst', 'appnt'],
}

const areaLabel = (audience: NotificationAudience, module: string) =>
  audience === 'portal' && module === 'cpitl' ? 'Fees' : AREAS[module] || 'School'

/** Full notifications list: staff page and family portal page. */
const NotificationsList: React.FC<{ audience: NotificationAudience }> = ({ audience }) => {
  const navigate = useNavigate()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [module, setModule] = useState('')
  const { data: unread = 0 } = useUnreadNotificationCount(audience)
  const list = useNotificationList(audience, { unread: unreadOnly, module: module || undefined })
  const markRead = useMarkNotificationsRead(audience)
  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.items) || [], [list.data])

  const columns: DataTableColumn<AppNotification>[] = [
    {
      key: 'title',
      header: 'Notification',
      mobile: 'title',
      wrap: true,
      render: (row) => <Entity primary={row.readAt ? row.title : <strong>{row.title}</strong>} secondary={row.body} />,
    },
    { key: 'area', header: 'Area', mobile: 'hidden', width: 140, render: (row) => areaLabel(audience, row.module) },
    { key: 'when', header: 'When', mobile: 'subtitle', width: 130, render: (row) => formatRelative(row.createdAt) },
    {
      key: 'status',
      header: '',
      headerLabel: 'Status',
      mobile: 'aside',
      width: 80,
      render: (row) => (row.readAt ? null : <Badge tone="info">New</Badge>),
    },
  ]

  const openRow = (row: AppNotification) => {
    if (!row.readAt) markRead.mutate(row._id)
    if (row.link) navigate(row.link)
  }

  const filtered = unreadOnly || Boolean(module)
  const empty = filtered ? (
    <EmptyState
      icon={CheckCheck}
      title={unreadOnly ? 'Nothing unread' : 'No notifications here'}
      body={unreadOnly ? "You're up to date." : 'Pick another area to see more.'}
      compact
    />
  ) : (
    <EmptyState
      icon={Bell}
      title="No notifications yet"
      body={audience === 'portal'
        ? 'Attendance, fees, results and messages from school show here.'
        : 'Changes to your access, meetings, duties and other updates show here.'}
      compact
    />
  )

  return (
    <Card flush>
      <CardToolbar>
        <FilterBar
          chips={[
            { id: 'all', label: 'All', active: !unreadOnly },
            { id: 'unread', label: 'Unread', count: unread, active: unreadOnly },
          ]}
          chipsLabel="Show"
          onChipClick={(id) => setUnreadOnly(id === 'unread')}
          filters={(
            <Select
              aria-label="Area"
              size="sm"
              value={module}
              onChange={(event) => setModule(event.target.value)}
              options={[
                { value: '', label: 'All areas' },
                ...AREA_OPTIONS[audience].map((key) => ({ value: key, label: areaLabel(audience, key) })),
              ]}
            />
          )}
          actions={(
            <Button variant="secondary" size="sm" icon={CheckCheck} disabled={!unread} onClick={() => markRead.mutate(null)}>
              Mark all read
            </Button>
          )}
        />
      </CardToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row._id}
        onRowClick={openRow}
        loading={list.isLoading}
        loadingLabel="Loading notifications"
        empty={list.isError ? <EmptyState title="Notifications didn't load" body="Check your connection and refresh the page." compact /> : empty}
        footer={list.hasNextPage ? (
          <div className="cb-card-actions">
            <Button variant="tertiary" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Show older
            </Button>
          </div>
        ) : undefined}
      />
    </Card>
  )
}

export default NotificationsList
