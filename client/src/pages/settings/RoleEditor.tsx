import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Copy, ShieldCheck, Trash2 } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Select,
  TextArea,
  TextField,
  type MenuItem,
} from '@/components/ui'
import { useDeleteRole, usePermissionCatalog, useRoles, useSaveRole } from '@/hooks/useUserAdmin'
import { usePermissions } from '@/hooks/usePermissions'
import { getAccessibleModules } from '@/constants/featureAccess'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import type { PermissionGrant, PermissionScope } from '@/types/auth'
import { errorMessage } from '@/components/access/AccessUi'
import '@/components/access/access.css'

// Catalog modules that map to a client module id for the "turned on" check.
const CLIENT_MODULE: Record<string, string> = {
  stdnt: 'stdnt', staaf: 'staaf', attnd: 'attnd', timetable: 'timetable', acdmc: 'acdmc',
  exam: 'exmcl', actvt: 'actvt', mdcl: 'mdcl', trnst: 'trnst', asets: 'asets', cpitl: 'cpitl',
}

type Grants = Map<string, PermissionScope>

/** View a built-in role, or create/edit a school role as a permission matrix. */
const RoleEditor: React.FC = () => {
  const { roleKey = 'new' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const { can } = usePermissions()
  const canManage = can('core.users.manage')
  const { data: roles = [], isLoading } = useRoles()
  const { data: catalog } = usePermissionCatalog()
  const saveRole = useSaveRole()
  const deleteRole = useDeleteRole()

  const isNew = roleKey === 'new'
  const role = roles.find((entry) => entry.key === decodeURIComponent(roleKey))
  const copyFrom = isNew ? roles.find((entry) => entry.key === params.get('from')) : undefined
  const readOnly = !canManage || Boolean(role?.isSystem)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [grants, setGrants] = useState<Grants>(new Map())
  const [nameError, setNameError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showAllModules, setShowAllModules] = useState(false)

  useEffect(() => {
    const source = role || copyFrom
    if (!source && !isNew) return
    setName(role ? role.name : copyFrom ? `${copyFrom.name} (copy)` : '')
    setDescription(source?.description || '')
    setGrants(new Map((source?.permissions || []).filter((grant) => grant.key !== '*').map((grant) => [grant.key, grant.scope])))
  }, [role, copyFrom, isNew])

  const activeModules = useMemo(() => getAccessibleModules(user?.featureToggles), [user?.featureToggles])
  const modules = useMemo(() => {
    if (!catalog) return []
    return catalog.modules
      .map((module) => ({ ...module, resources: catalog.resources.filter((resource) => resource.module === module.key) }))
      .filter((module) => module.resources.length > 0)
      .filter((module) => showAllModules || module.key === 'core' || activeModules.has(CLIENT_MODULE[module.key]))
  }, [catalog, activeModules, showAllModules])

  if (isLoading || !catalog) return <Page><Card><EmptyState title="Loading role" compact /></Card></Page>
  if (!isNew && !role) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Role not found"
            action={<Button variant="secondary" onClick={() => navigate('/settings/roles')}>Back to roles</Button>}
          />
        </Card>
      </Page>
    )
  }

  const isAdministrator = role?.permissions.some((grant) => grant.key === '*')

  const toggle = (key: string, checked: boolean) => {
    setGrants((prev) => {
      const next = new Map(prev)
      if (checked) next.set(key, next.get(key) || 'all')
      else next.delete(key)
      return next
    })
  }

  const setResourceScope = (resourceKey: string, scope: PermissionScope) => {
    setGrants((prev) => {
      const next = new Map(prev)
      next.forEach((_, key) => {
        if (key.startsWith(`${resourceKey}.`)) next.set(key, scope)
      })
      return next
    })
  }

  const submit = async () => {
    if (!name.trim()) {
      setNameError('Give the role a name')
      return
    }
    const permissions: PermissionGrant[] = [...grants.entries()].map(([key, scope]) => ({ key, scope }))
    try {
      const saved = await saveRole.mutateAsync({
        id: role?._id,
        payload: { name: name.trim(), description: description.trim(), basedOn: copyFrom?.key, permissions },
      })
      toast.success(role ? 'Role saved' : 'Role created')
      if (!role) navigate(`/settings/roles/${encodeURIComponent(saved.key)}`, { replace: true })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the role.'))
    }
  }

  const menuItems: MenuItem[] = [
    ...(role ? [{ label: 'Copy as a new role', icon: Copy, onSelect: () => navigate(`/settings/roles/new?from=${encodeURIComponent(role.key)}`) }] : []),
    ...(role && !role.isSystem && canManage ? [{ divider: true } as const, { label: 'Delete role', icon: Trash2, tone: 'danger' as const, onSelect: () => setDeleteOpen(true) }] : []),
  ]

  const actionLabel = (action: string) => catalog.actionLabels[action] || action

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title={role ? role.name : 'New role'}
          subtitle={role?.isSystem ? 'Built-in role. Copy it to change what it allows.' : 'Tick what people with this role can do.'}
          action={
            <div className="cb-card-actions">
              {!readOnly ? <Button variant="primary" size="sm" loading={saveRole.isPending} onClick={submit}>{role ? 'Save role' : 'Create role'}</Button> : null}
              {menuItems.length ? <Menu items={menuItems} label="Role actions" /> : null}
            </div>
          }
        >
          {readOnly ? (
            <p className="cb-muted">{role?.description}</p>
          ) : (
            <div className="cb-form-grid">
              <TextField
                label="Role name"
                value={name}
                error={nameError || undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError(null)
                }}
              />
              <TextArea
                label="Description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="is-wide"
              />
            </div>
          )}
        </Card>

        {isAdministrator ? (
          <Banner tone="info" title="Full access">
            Administrators can open every module, manage logins and roles, and change billing.
          </Banner>
        ) : (
          <Card
            flush
            title="What this role can do"
            subtitle="“Own classes only” limits teachers to the sections they teach."
            action={
              <Checkbox
                label="Show modules that are turned off"
                checked={showAllModules}
                onChange={setShowAllModules}
              />
            }
          >
            <div className="cb-app ua-matrix">
              {modules.map((module) => (
                <section key={module.key} className="ua-matrix__module" aria-labelledby={`module-${module.key}`}>
                  <h3 id={`module-${module.key}`} className="ua-matrix__title">{module.label}</h3>
                  {module.resources.map((resource) => {
                    const held = resource.actions.filter((action) => grants.has(`${resource.key}.${action}`))
                    const scope = held.length ? grants.get(`${resource.key}.${held[0]}`) || 'all' : 'all'
                    return (
                      <div key={resource.key} className="ua-matrix__row">
                        <div className="ua-matrix__label">{resource.label}</div>
                        <div className="ua-matrix__actions" role="group" aria-label={resource.label}>
                          {resource.actions.map((action) => (
                            <Checkbox
                              key={action}
                              label={actionLabel(action)}
                              checked={grants.has(`${resource.key}.${action}`)}
                              disabled={readOnly}
                              onChange={(checked) => toggle(`${resource.key}.${action}`, checked)}
                            />
                          ))}
                        </div>
                        <div className="ua-matrix__scope">
                          {resource.scopable && held.length > 0 ? (
                            <Select
                              aria-label={`${resource.label}: which classes`}
                              size="sm"
                              disabled={readOnly}
                              value={scope}
                              options={[
                                { value: 'all', label: 'All classes' },
                                { value: 'assigned', label: 'Own classes only' },
                              ]}
                              onChange={(event) => setResourceScope(resource.key, event.target.value as PermissionScope)}
                            />
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </section>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        tone="danger"
        title={`Delete the ${role?.name} role?`}
        description={role?.userCount
          ? `${role.userCount} login${role.userCount === 1 ? ' has' : 's have'} this role. Give them another role first.`
          : 'Nobody has this role. This can’t be undone.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={Boolean(role?.userCount)}
              loading={deleteRole.isPending}
              onClick={async () => {
                try {
                  await deleteRole.mutateAsync(role?._id || '')
                  toast.success('Role deleted')
                  navigate('/settings/roles', { replace: true })
                } catch (error) {
                  toast.error(errorMessage(error, 'Could not delete the role.'))
                }
              }}
            >
              Delete role
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default RoleEditor
