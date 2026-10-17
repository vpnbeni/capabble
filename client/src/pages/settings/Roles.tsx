import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, DataTable, EmptyState, Entity, Page, type DataTableColumn } from '@/components/ui'
import { useRoles } from '@/hooks/useUserAdmin'
import { usePermissions } from '@/hooks/usePermissions'
import type { Role } from '@/services/userAdminService'

/** Settings → Roles: built-in roles plus the school's own. */
const RolesPage: React.FC = () => {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const { data: roles = [], isLoading } = useRoles()

  const columns: DataTableColumn<Role>[] = [
    {
      key: 'name',
      header: 'Role',
      mobile: 'title',
      wrap: true,
      render: (role) => <Entity primary={role.name} secondary={role.description} />,
    },
    {
      key: 'people',
      header: 'Logins',
      numeric: true,
      mobile: 'subtitle',
      render: (role) => `${role.userCount} ${role.userCount === 1 ? 'login' : 'logins'}`,
    },
    {
      key: 'type',
      header: 'Type',
      mobile: 'aside',
      render: (role) => <Badge tone="neutral" dot={false}>{role.isSystem ? 'Built-in' : 'Custom'}</Badge>,
    },
  ]

  return (
    <Page>
      <Card
        flush
        title="Roles"
        subtitle="Built-in roles can't be changed. Copy one to make your own."
        action={can('core.users.manage') ? (
          <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/settings/roles/new')}>New role</Button>
        ) : undefined}
      >
        <DataTable
          columns={columns}
          rows={roles}
          getRowKey={(role) => role.key}
          onRowClick={(role) => navigate(`/settings/roles/${encodeURIComponent(role.key)}`)}
          loading={isLoading}
          loadingLabel="Loading roles"
          empty={<EmptyState icon={ShieldCheck} title="No roles" compact />}
        />
      </Card>
    </Page>
  )
}

export default RolesPage
