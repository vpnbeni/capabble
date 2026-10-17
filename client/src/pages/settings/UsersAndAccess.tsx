import React, { useMemo, useState } from 'react'
import { classLabel } from '@/utils/classLabel'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, UserPlus, Users, SearchX } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Page,
  Pagination,
  Tabs,
  type DataTableColumn,
} from '@/components/ui'
import { useManagedUsers } from '@/hooks/useUserAdmin'
import { usePermissions } from '@/hooks/usePermissions'
import { useSchoolProfile } from '@/hooks/useSchoolProfile'
import type { CredentialDelivery, ManagedUser, UserListParams } from '@/services/userAdminService'
import type { UserKind } from '@/types/auth'
import { CredentialDialog, lastSignIn, LoginStatusBadge } from '@/components/access/AccessUi'
import CreateLoginSheet from '@/components/access/CreateLoginSheet'
import BulkPortalSheet from '@/components/access/BulkPortalSheet'

const TABS: Array<{ id: UserKind; label: string }> = [
  { id: 'staff', label: 'Staff' },
  { id: 'parent', label: 'Parents' },
  { id: 'student', label: 'Students' },
]

const STATUS_CHIPS = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'invited', label: 'Invited' },
  { id: 'inactive', label: 'Inactive' },
]

/** Settings → Users and access: every login at the school, by kind. */
const UsersAndAccess: React.FC = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = usePermissions()
  const canManage = can('core.users.manage')
  const { data: school } = useSchoolProfile()
  const schoolName = String(school?.name || '')

  const kind = (TABS.some((tab) => tab.id === params.get('tab')) ? params.get('tab') : 'staff') as UserKind
  const [status, setStatus] = useState<UserListParams['status']>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [created, setCreated] = useState<{ user: ManagedUser; delivery: CredentialDelivery } | null>(null)

  const query = useMemo(() => ({ kind, status, search: search.trim(), page, limit: 50 }), [kind, status, search, page])
  const { data, isLoading, isFetching } = useManagedUsers(query)
  const users = data?.users || []

  const columns: DataTableColumn<ManagedUser>[] = [
    {
      key: 'name',
      header: 'Name',
      mobile: 'title',
      render: (user) => <Entity primary={user.name || user.loginId} secondary={user.loginId} />,
    },
    ...(kind === 'staff'
      ? [{
          key: 'roles',
          header: 'Roles',
          mobile: 'subtitle' as const,
          wrap: true,
          render: (user: ManagedUser) => (user.roles.length
            ? user.roles.map((role) => <Badge key={role.key} tone="neutral" dot={false}>{role.name}</Badge>)
            : <span className="cb-muted">No role</span>),
        }]
      : kind === 'parent'
        ? [{
            key: 'children',
            header: 'Children',
            mobile: 'subtitle' as const,
            wrap: true,
            render: (user: ManagedUser) => user.linkedStudents
              .map((child) => `${child.name || child.rollNumber}${child.className ? ` (${classLabel(child.className, child.section)})` : ''}`)
              .join(', '),
          }]
        : [{
            key: 'class',
            header: 'Class',
            mobile: 'subtitle' as const,
            render: (user: ManagedUser) => {
              const child = user.linkedStudents[0]
              return classLabel(child?.className, child?.section)
            },
          }]),
    { key: 'lastLogin', header: 'Last sign-in', mobile: 'hidden', render: (user) => lastSignIn(user.lastLogin) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (user) => <LoginStatusBadge user={user} /> },
  ]

  const changeTab = (id: string) => {
    setParams({ tab: id }, { replace: true })
    setPage(1)
    setSearch('')
    setStatus('')
  }

  const hasFilters = Boolean(search.trim() || status)
  const kindLabel = TABS.find((tab) => tab.id === kind)?.label.toLowerCase() || 'logins'

  return (
    <Page>
      <div className="cb-stack">
        <Tabs items={TABS} value={kind} onChange={changeTab} label="Kind of login" />
        <Card flush>
          <CardToolbar>
            <FilterBar
              search={{ value: search, onChange: (value) => { setSearch(value); setPage(1) }, placeholder: 'Search name, email or login ID' }}
              chips={STATUS_CHIPS.map((chip) => ({ ...chip, active: chip.id === status }))}
              onChipClick={(id) => { setStatus(id as UserListParams['status']); setPage(1) }}
              actions={
                <>
                  {kind === 'staff' ? (
                    <Button variant="secondary" icon={ShieldCheck} onClick={() => navigate('/settings/roles')}>Roles</Button>
                  ) : canManage ? (
                    <Button variant="secondary" icon={Users} onClick={() => setBulkOpen(true)}>Create for a class</Button>
                  ) : null}
                  {canManage ? (
                    <Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>Create login</Button>
                  ) : null}
                </>
              }
            />
          </CardToolbar>
          <DataTable
            columns={columns}
            rows={users}
            getRowKey={(user) => user._id}
            onRowClick={(user) => navigate(`/settings/users/${user._id}`)}
            loading={isLoading || (isFetching && users.length === 0)}
            loadingLabel="Loading logins"
            empty={hasFilters ? (
              <EmptyState icon={SearchX} title="No logins match" body="Try a different name or clear the filters." compact />
            ) : (
              <EmptyState
                icon={UserPlus}
                title={`No ${kindLabel} logins yet`}
                body={kind === 'staff'
                  ? 'Create a login for each staff member and give them a role.'
                  : 'Create logins one by one, or for a whole class at once.'}
                action={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>Create login</Button> : undefined}
                compact
              />
            )}
            footer={data && data.pagination.pages > 1 ? (
              <Pagination
                page={data.pagination.page}
                pages={data.pagination.pages}
                total={data.pagination.total}
                limit={data.pagination.limit}
                onPageChange={setPage}
              />
            ) : undefined}
          />
        </Card>
      </div>

      <CreateLoginSheet
        open={creating}
        kind={kind}
        onClose={() => setCreating(false)}
        onCreated={(result) => {
          setCreating(false)
          setCreated(result)
        }}
      />
      {kind !== 'staff' ? (
        <BulkPortalSheet open={bulkOpen} kind={kind} schoolName={schoolName} onClose={() => setBulkOpen(false)} />
      ) : null}
      <CredentialDialog
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        name={created?.user.name || ''}
        loginId={created?.user.loginId || ''}
        delivery={created?.delivery || null}
        schoolName={schoolName}
      />
    </Page>
  )
}

export default UsersAndAccess
